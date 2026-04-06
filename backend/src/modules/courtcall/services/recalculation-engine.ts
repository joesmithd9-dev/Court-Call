import type { CourtDay, ListItem } from '@prisma/client';
import { prisma } from './prisma.js';
import { buildEnvelope } from './event-envelope-service.js';
import { publish } from './sse-broadcaster.js';
import { ListItemStatus, CourtDayStatus, ActorRole } from '../domain/enums.js';
import { CourtDayEventType } from '../domain/event-types.js';
import { isTerminalStatus } from '../domain/transition-rules.js';

/**
 * Default estimated duration in minutes when a ListItem has no explicit estimate.
 */
const DEFAULT_ESTIMATE_MINUTES = 15;

// ─── Item classification helpers ─────────────────────────────────────────────

export function isActiveItem(item: ListItem): boolean {
  const s = item.status as ListItemStatus;
  return s === ListItemStatus.HEARING || s === ListItemStatus.CALLING;
}

export function isEligibleNow(item: ListItem, asOf: Date): boolean {
  const s = item.status as ListItemStatus;
  if (s === ListItemStatus.WAITING) return true;
  if (s === ListItemStatus.PART_HEARD) return true;
  if (s === ListItemStatus.NOT_BEFORE) {
    return !isBlockedByNotBefore(item, asOf);
  }
  return false;
}

export function isBlockedByNotBefore(item: ListItem, asOf: Date): boolean {
  if ((item.status as ListItemStatus) !== ListItemStatus.NOT_BEFORE) return false;
  if (!item.notBeforeTime) return false;
  return asOf < item.notBeforeTime;
}

export function isDeferred(item: ListItem): boolean {
  const s = item.status as ListItemStatus;
  return s === ListItemStatus.LET_STAND || s === ListItemStatus.STOOD_DOWN;
}

export function isCompletedForToday(item: ListItem): boolean {
  return isTerminalStatus(item.status as ListItemStatus);
}

// ─── Duration helpers ────────────────────────────────────────────────────────

function durationMs(item: ListItem): number {
  return (item.estimatedDurationMinutes ?? DEFAULT_ESTIMATE_MINUTES) * 60_000;
}

// ─── Pause-aware cursor logic ────────────────────────────────────────────────

function isSessionPaused(courtDay: CourtDay): boolean {
  const s = courtDay.status as CourtDayStatus;
  return (
    s === CourtDayStatus.JUDGE_ROSE ||
    s === CourtDayStatus.AT_LUNCH ||
    s === CourtDayStatus.PAUSED
  );
}

function determineBaseCursor(
  courtDay: CourtDay,
  items: ListItem[],
  now: Date,
): { cursor: Date | null; activeItemRemainingMs: number | null } {
  const status = courtDay.status as CourtDayStatus;

  if (status === CourtDayStatus.SETUP || status === CourtDayStatus.CONCLUDED) {
    return { cursor: null, activeItemRemainingMs: null };
  }

  const activeHearing = items.find(
    (i) => (i.status as ListItemStatus) === ListItemStatus.HEARING,
  );

  if (isSessionPaused(courtDay)) {
    const resumeAnchor = courtDay.resumesAt && courtDay.resumesAt > now
      ? courtDay.resumesAt
      : now;

    if (activeHearing) {
      const start = activeHearing.actualStartTime ?? now;
      const roseAt = courtDay.judgeRoseAt ?? now;
      const elapsedMs = Math.max(0, roseAt.getTime() - start.getTime());
      const totalMs = durationMs(activeHearing);
      const remainingMs = Math.max(0, totalMs - elapsedMs);

      return {
        cursor: new Date(resumeAnchor.getTime() + remainingMs),
        activeItemRemainingMs: remainingMs,
      };
    }

    return { cursor: resumeAnchor, activeItemRemainingMs: null };
  }

  if (activeHearing) {
    const start = activeHearing.actualStartTime ?? now;
    const endTime = new Date(start.getTime() + durationMs(activeHearing));
    return { cursor: endTime, activeItemRemainingMs: null };
  }

  const activeCalling = items.find(
    (i) => (i.status as ListItemStatus) === ListItemStatus.CALLING,
  );
  if (activeCalling) {
    return { cursor: now, activeItemRemainingMs: null };
  }

  return { cursor: now, activeItemRemainingMs: null };
}

// ─── Projection result ─────────────────────────────────────────────────────

export interface PredictedTiming {
  listItemId: string;
  predictedStartTime: Date | null;
  predictedEndTime: Date | null;
}

export interface RecalcResult {
  currentItemId: string | null;
  nextCallableItemId: string | null;
  predictions: PredictedTiming[];
  projectedItems: number;
  skippedItems: number;
  deferredItems: number;
  frozenProjections: boolean;
}

/**
 * Compute predicted start/end times for all projectable items on a court day.
 *
 * Unlike the previous version, predictions are computed in-memory and returned
 * (not persisted to ListItem rows, which no longer have prediction fields).
 * The predictions are broadcast via SSE for client consumption.
 */
export async function recomputePredictionsForCourtDay(
  courtDayId: string,
): Promise<RecalcResult> {
  const now = new Date();

  const courtDay = await prisma.courtDay.findUniqueOrThrow({
    where: { id: courtDayId },
  });
  const items = await prisma.listItem.findMany({
    where: { courtDayId },
    orderBy: { position: 'asc' },
  });

  if (items.length === 0) {
    return {
      currentItemId: null,
      nextCallableItemId: null,
      predictions: [],
      projectedItems: 0,
      skippedItems: 0,
      deferredItems: 0,
      frozenProjections: false,
    };
  }

  const { cursor: baseCursor } = determineBaseCursor(courtDay, items, now);

  const predictions: PredictedTiming[] = [];
  let cursor = baseCursor;
  let currentItemId: string | null = null;
  let nextCallableItemId: string | null = null;
  let projectedCount = 0;
  let skippedCount = 0;
  let deferredCount = 0;

  const blockedNotBefore: ListItem[] = [];
  const eligibleQueue: ListItem[] = [];

  for (const item of items) {
    const s = item.status as ListItemStatus;

    if (isCompletedForToday(item)) {
      predictions.push({ listItemId: item.id, predictedStartTime: null, predictedEndTime: null });
      skippedCount++;
      continue;
    }

    if (isDeferred(item)) {
      predictions.push({ listItemId: item.id, predictedStartTime: null, predictedEndTime: null });
      deferredCount++;
      continue;
    }

    if (isActiveItem(item)) {
      if (!currentItemId) currentItemId = item.id;

      if (s === ListItemStatus.HEARING) {
        const start = item.actualStartTime ?? now;
        const end = new Date(start.getTime() + durationMs(item));
        predictions.push({ listItemId: item.id, predictedStartTime: start, predictedEndTime: end });
        if (cursor && currentItemId === item.id) {
          cursor = end > cursor ? end : cursor;
        }
      } else {
        predictions.push({
          listItemId: item.id,
          predictedStartTime: cursor,
          predictedEndTime: cursor ? new Date(cursor.getTime() + durationMs(item)) : null,
        });
        if (cursor) cursor = new Date(cursor.getTime() + durationMs(item));
      }
      projectedCount++;
      continue;
    }

    if (s === ListItemStatus.NOT_BEFORE && isBlockedByNotBefore(item, now)) {
      blockedNotBefore.push(item);
      continue;
    }

    eligibleQueue.push(item);
  }

  blockedNotBefore.sort((a, b) => {
    const aTime = a.notBeforeTime?.getTime() ?? 0;
    const bTime = b.notBeforeTime?.getTime() ?? 0;
    return aTime - bTime;
  });

  let blockedIdx = 0;

  function drainUnblocked(): void {
    if (cursor === null) return;
    let c: Date = cursor;
    while (blockedIdx < blockedNotBefore.length) {
      const blocked = blockedNotBefore[blockedIdx];
      if (c.getTime() >= blocked.notBeforeTime!.getTime()) {
        const dur = durationMs(blocked);
        predictions.push({
          listItemId: blocked.id,
          predictedStartTime: new Date(c.getTime()),
          predictedEndTime: new Date(c.getTime() + dur),
        });
        projectedCount++;
        if (!nextCallableItemId) nextCallableItemId = blocked.id;
        c = new Date(c.getTime() + dur);
        blockedIdx++;
      } else {
        break;
      }
    }
    cursor = c;
  }

  for (const item of eligibleQueue) {
    if (cursor === null) {
      predictions.push({ listItemId: item.id, predictedStartTime: null, predictedEndTime: null });
      skippedCount++;
      continue;
    }

    const dur = durationMs(item);
    predictions.push({
      listItemId: item.id,
      predictedStartTime: new Date(cursor.getTime()),
      predictedEndTime: new Date(cursor.getTime() + dur),
    });
    projectedCount++;
    if (!nextCallableItemId) nextCallableItemId = item.id;
    cursor = new Date(cursor.getTime() + dur);
    drainUnblocked();
  }

  while (blockedIdx < blockedNotBefore.length) {
    const blocked = blockedNotBefore[blockedIdx];
    blockedIdx++;
    if (cursor === null) {
      predictions.push({ listItemId: blocked.id, predictedStartTime: null, predictedEndTime: null });
      skippedCount++;
      continue;
    }
    const dur = durationMs(blocked);
    const start = cursor.getTime() > blocked.notBeforeTime!.getTime() ? cursor : blocked.notBeforeTime!;
    predictions.push({
      listItemId: blocked.id,
      predictedStartTime: start,
      predictedEndTime: new Date(start.getTime() + dur),
    });
    projectedCount++;
    if (!nextCallableItemId) nextCallableItemId = blocked.id;
    cursor = new Date(start.getTime() + dur);
  }

  // Broadcast predictions via SSE (no DB write since fields removed from ListItem)
  const envelope = buildEnvelope({
    eventId: `recalc_${courtDayId}_${now.getTime()}`,
    eventType: 'courtday.projections_recomputed',
    aggregateType: 'courtday',
    aggregateId: courtDayId,
    courtDayId,
    occurredAt: now,
    sequence: courtDay.lastSequence,
    actor: { role: ActorRole.SYSTEM },
    payload: {
      currentItemId,
      nextCallableItemId,
      projectedItems: projectedCount,
      frozenProjections: baseCursor === null,
      predictions: predictions
        .filter((p) => p.predictedStartTime !== null)
        .map((p) => ({
          listItemId: p.listItemId,
          predictedStartTime: p.predictedStartTime?.toISOString() ?? null,
          predictedEndTime: p.predictedEndTime?.toISOString() ?? null,
        })),
    },
  });
  publish(envelope);

  return {
    currentItemId,
    nextCallableItemId,
    predictions,
    projectedItems: projectedCount,
    skippedItems: skippedCount,
    deferredItems: deferredCount,
    frozenProjections: baseCursor === null,
  };
}
