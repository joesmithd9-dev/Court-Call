import type { CourtDay, ListItem } from '@prisma/client';
import { prisma } from './prisma.js';
import { buildEnvelope } from './event-envelope-service.js';
import { publish } from './sse-broadcaster.js';
import { ListItemStatus, CourtSessionStatus, CourtDayStatus, ActorRole } from '../domain/enums.js';
import { CourtDayEventType } from '../domain/event-types.js';
import { isTerminalStatus } from '../domain/transition-rules.js';

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * Default estimated duration in minutes when a ListItem has no explicit
 * estimate. 15 minutes is a reasonable courtroom default for a directions
 * hearing or short mention. Centralised here so it can be tuned in one place.
 */
const DEFAULT_ESTIMATE_MINUTES = 15;

// ─── Item classification helpers ─────────────────────────────────────────────

/**
 * Returns true if the item is the currently active matter (on the bench).
 * HEARING is definitively active. CALLING is treated as imminently active —
 * the matter has been called but counsel may not yet be at the bar table.
 */
export function isActiveItem(item: ListItem): boolean {
  const s = item.status as ListItemStatus;
  return s === ListItemStatus.HEARING || s === ListItemStatus.CALLING;
}

/**
 * Returns true if the item is eligible for the next-callable queue right now.
 *
 * Eligible statuses:
 * - WAITING: standard queue member
 * - NOT_BEFORE: eligible only once the not-before time has passed
 * - PART_HEARD: remains on today's list and can be re-called
 *
 * NOT eligible (deferred or out of queue):
 * - LET_STAND: held back by judicial direction until explicitly restored
 * - STOOD_DOWN: off the callable queue until restored
 * - CALLING / HEARING: already active
 * - Terminal statuses: done for the day
 */
export function isEligibleNow(item: ListItem, asOf: Date): boolean {
  const s = item.status as ListItemStatus;
  if (s === ListItemStatus.WAITING) return true;
  if (s === ListItemStatus.PART_HEARD) return true;
  if (s === ListItemStatus.NOT_BEFORE) {
    return !isBlockedByNotBefore(item, asOf);
  }
  return false;
}

/**
 * Returns true if the item has a NOT_BEFORE constraint that has not yet been
 * reached relative to the given reference time.
 */
export function isBlockedByNotBefore(item: ListItem, asOf: Date): boolean {
  if ((item.status as ListItemStatus) !== ListItemStatus.NOT_BEFORE) return false;
  if (!item.notBeforeTime) return false; // no time constraint → not blocked
  return asOf < item.notBeforeTime;
}

/**
 * Returns true if the item is deferred — still on today's list but not in
 * the immediate callable queue.
 *
 * Rule for LET_STAND: excluded from the projection queue until the registrar
 * explicitly restores it to WAITING or calls it directly. "Let stand" is a
 * judicial direction meaning "we'll come back to it" — the matter remains
 * visible on the list but does not consume queue time or shift predictions.
 *
 * Rule for STOOD_DOWN: excluded from projection until restored.
 */
export function isDeferred(item: ListItem): boolean {
  const s = item.status as ListItemStatus;
  return s === ListItemStatus.LET_STAND || s === ListItemStatus.STOOD_DOWN;
}

/**
 * Returns true if the item is completed for today — terminal status.
 */
export function isCompletedForToday(item: ListItem): boolean {
  return isTerminalStatus(item.status as ListItemStatus);
}

// ─── Duration helpers ────────────────────────────────────────────────────────

function durationMs(item: ListItem): number {
  return (item.estimatedDurationMinutes ?? DEFAULT_ESTIMATE_MINUTES) * 60_000;
}

// ─── Pause-aware cursor logic ────────────────────────────────────────────────

/**
 * Determine whether the court session is currently paused (judge risen,
 * at lunch, adjourned part-heard).
 */
function isSessionPaused(courtDay: CourtDay): boolean {
  const ss = courtDay.sessionStatus as CourtSessionStatus;
  return (
    ss === CourtSessionStatus.JUDGE_RISING_SHORT ||
    ss === CourtSessionStatus.AT_LUNCH ||
    ss === CourtSessionStatus.ADJOURNED_PART_HEARD
  );
}

/**
 * Determine the base cursor time from which predictions start.
 *
 * Handles remaining-duration-on-pause:
 *
 * When the judge rises mid-hearing, the active item has partially consumed
 * its estimate. We must project the *remaining* duration from the resume
 * time, not the full estimate again. Elapsed time is computed as:
 *   elapsed = roseAt - actualStartTime
 *   remaining = estimatedDuration - elapsed  (clamped to ≥ 0)
 *
 * The cursor for downstream items is then: resumeAnchor + remaining.
 */
function determineBaseCursor(
  courtDay: CourtDay,
  items: ListItem[],
  now: Date,
): { cursor: Date | null; activeItemRemainingMs: number | null } {
  const status = courtDay.status as CourtDayStatus;

  // Court not yet live or already closed — no live predictions
  if (status === CourtDayStatus.SCHEDULED || status === CourtDayStatus.CLOSED) {
    return { cursor: null, activeItemRemainingMs: null };
  }

  const activeHearing = items.find(
    (i) => (i.status as ListItemStatus) === ListItemStatus.HEARING,
  );

  // ── Court is paused ──────────────────────────────────────────────────
  if (isSessionPaused(courtDay)) {
    // Anchor: the later of expectedResumeAt and now
    const resumeAnchor = courtDay.expectedResumeAt && courtDay.expectedResumeAt > now
      ? courtDay.expectedResumeAt
      : now;

    if (activeHearing) {
      // Compute remaining duration for the active hearing across the pause.
      // elapsed = time between hearing start and when judge rose
      const start = activeHearing.actualStartTime ?? now;
      const roseAt = courtDay.roseAt ?? now;
      const elapsedMs = Math.max(0, roseAt.getTime() - start.getTime());
      const totalMs = durationMs(activeHearing);
      const remainingMs = Math.max(0, totalMs - elapsedMs);

      return {
        cursor: new Date(resumeAnchor.getTime() + remainingMs),
        activeItemRemainingMs: remainingMs,
      };
    }

    // No active hearing during pause — cursor is the resume anchor
    return { cursor: resumeAnchor, activeItemRemainingMs: null };
  }

  // ── Court is LIVE and session is LIVE ────────────────────────────────
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

  // Nothing active, court is live
  return { cursor: now, activeItemRemainingMs: null };
}

// ─── Core projection algorithm ───────────────────────────────────────────────

export interface RecalcResult {
  currentItemId: string | null;
  nextCallableItemId: string | null;
  affectedListItemIds: string[];
  projectedItems: number;
  skippedItems: number;
  deferredItems: number;
  frozenProjections: boolean;
}

/**
 * Recompute predicted start/end times for all projectable items on a court day.
 *
 * ALGORITHM — single-pass with time-slot insertion for NOT_BEFORE:
 *
 * 1. Load court day and all items ordered by queuePosition.
 * 2. Determine the base cursor (pause-aware, remaining-duration-aware).
 * 3. Partition items into buckets:
 *    - active: HEARING / CALLING — anchor to actual times
 *    - eligible: WAITING, PART_HEARD, unblocked NOT_BEFORE — project in queue order
 *    - blocked: NOT_BEFORE with future notBeforeTime — held for time-slot insertion
 *    - deferred: LET_STAND, STOOD_DOWN — null out predictions
 *    - terminal: CONCLUDED, SETTLED, ADJOURNED, REMOVED — null out predictions
 * 4. Build a "projected timeline" by iterating eligible items in queuePosition
 *    order. After each item is projected, check if any blocked NOT_BEFORE items
 *    have become eligible (cursor ≥ notBeforeTime). If so, insert them at the
 *    current cursor position before continuing.
 * 5. After the main pass, any remaining blocked items are projected at their
 *    notBeforeTime (they're all in the future — append in time order).
 * 6. Persist changes (minimal writes), emit projections_recomputed event.
 */
export async function recomputePredictionsForCourtDay(
  courtDayId: string,
): Promise<RecalcResult> {
  const now = new Date();

  // Step 1: Load data
  const courtDay = await prisma.courtDay.findUniqueOrThrow({
    where: { id: courtDayId },
  });
  const items = await prisma.listItem.findMany({
    where: { courtDayId },
    orderBy: { queuePosition: 'asc' },
  });

  if (items.length === 0) {
    return {
      currentItemId: null,
      nextCallableItemId: null,
      affectedListItemIds: [],
      projectedItems: 0,
      skippedItems: 0,
      deferredItems: 0,
      frozenProjections: false,
    };
  }

  // Step 2: Determine base cursor
  const { cursor: baseCursor, activeItemRemainingMs } = determineBaseCursor(courtDay, items, now);

  // Step 3: Partition
  const updates: Array<{
    id: string;
    predictedStartTime: Date | null;
    predictedEndTime: Date | null;
  }> = [];

  let cursor = baseCursor;
  let currentItemId: string | null = null;
  let nextCallableItemId: string | null = null;
  let projectedCount = 0;
  let skippedCount = 0;
  let deferredCount = 0;

  // Blocked NOT_BEFORE items, sorted by notBeforeTime for time-slot insertion.
  // We collect them up front so we can drain them during the main pass.
  const blockedNotBefore: ListItem[] = [];
  const eligibleQueue: ListItem[] = [];
  let activeHandled = false;

  for (const item of items) {
    const s = item.status as ListItemStatus;

    // Terminal → clear predictions
    if (isCompletedForToday(item)) {
      updates.push({ id: item.id, predictedStartTime: null, predictedEndTime: null });
      skippedCount++;
      continue;
    }

    // Deferred → clear predictions
    if (isDeferred(item)) {
      updates.push({ id: item.id, predictedStartTime: null, predictedEndTime: null });
      deferredCount++;
      continue;
    }

    // Active → anchor
    if (isActiveItem(item)) {
      if (!activeHandled) {
        currentItemId = item.id;
        activeHandled = true;
      }

      const dur = durationMs(item);

      if (s === ListItemStatus.HEARING) {
        const start = item.actualStartTime ?? now;

        if (isSessionPaused(courtDay) && activeItemRemainingMs !== null && currentItemId === item.id) {
          // Court is paused mid-hearing. Show predictions anchored to resume.
          // predictedStart stays as actualStartTime (it already started).
          // predictedEnd = resumeAnchor + remaining (which IS the cursor).
          updates.push({
            id: item.id,
            predictedStartTime: start,
            predictedEndTime: cursor, // cursor already = resumeAnchor + remaining
          });
        } else {
          const end = new Date(start.getTime() + dur);
          updates.push({
            id: item.id,
            predictedStartTime: start,
            predictedEndTime: end,
          });
          // Advance cursor if this active item's end is later
          if (cursor !== null && currentItemId === item.id) {
            cursor = end > cursor ? end : cursor;
          }
        }
      } else {
        // CALLING: imminent start
        updates.push({
          id: item.id,
          predictedStartTime: cursor,
          predictedEndTime: cursor ? new Date(cursor.getTime() + dur) : null,
        });
        if (cursor) {
          cursor = new Date(cursor.getTime() + dur);
        }
      }
      projectedCount++;
      continue;
    }

    // Blocked NOT_BEFORE → collect for time-slot insertion
    if (s === ListItemStatus.NOT_BEFORE && isBlockedByNotBefore(item, now)) {
      blockedNotBefore.push(item);
      continue;
    }

    // Eligible → queue for projection
    eligibleQueue.push(item);
  }

  // Sort blocked items by notBeforeTime ascending for correct insertion order
  blockedNotBefore.sort((a, b) => {
    const aTime = a.notBeforeTime?.getTime() ?? 0;
    const bTime = b.notBeforeTime?.getTime() ?? 0;
    return aTime - bTime;
  });

  // ── Step 4: Single-pass projection with time-slot insertion ────────
  //
  // Walk through eligible items in queue order. After projecting each one
  // and advancing the cursor, check if any blocked NOT_BEFORE items have
  // become unblocked (cursor >= notBeforeTime). If so, insert them at the
  // current cursor position, advance cursor, then continue.
  //
  // Example:
  //   cursor = 10:00
  //   A (10m) → projected 10:00–10:10, cursor = 10:10
  //   B NOT_BEFORE 10:30 → still blocked, skip
  //   C (5m) → projected 10:10–10:15, cursor = 10:15
  //   D (30m) → projected 10:15–10:45, cursor = 10:45
  //     → drain: B is now unblocked (10:45 ≥ 10:30), project B at 10:45
  //   E (10m) → projected 10:55–11:05

  let blockedIdx = 0; // pointer into sorted blockedNotBefore

  function drainUnblockedItems(): void {
    if (cursor === null) return;
    let c: Date = cursor;
    while (blockedIdx < blockedNotBefore.length) {
      const blocked = blockedNotBefore[blockedIdx];
      const notBeforeMs = blocked.notBeforeTime!.getTime();
      if (c.getTime() >= notBeforeMs) {
        // Cursor has passed this item's constraint — project it now
        const dur = durationMs(blocked);
        const start = new Date(c.getTime());
        const end = new Date(c.getTime() + dur);
        updates.push({ id: blocked.id, predictedStartTime: start, predictedEndTime: end });
        projectedCount++;
        deferredCount++;
        if (nextCallableItemId === null) {
          nextCallableItemId = blocked.id;
        }
        c = end;
        blockedIdx++;
      } else {
        break; // remaining blocked items have later notBeforeTime
      }
    }
    cursor = c;
  }

  for (const item of eligibleQueue) {
    if (cursor === null) {
      updates.push({ id: item.id, predictedStartTime: null, predictedEndTime: null });
      skippedCount++;
      continue;
    }

    const dur = durationMs(item);
    const start = new Date(cursor.getTime());
    const end = new Date(cursor.getTime() + dur);

    updates.push({ id: item.id, predictedStartTime: start, predictedEndTime: end });
    projectedCount++;

    if (nextCallableItemId === null) {
      nextCallableItemId = item.id;
    }

    cursor = end;

    // After advancing cursor, check if any blocked NOT_BEFORE items
    // have become eligible for insertion at this point in the timeline
    drainUnblockedItems();
  }

  // Step 5: Remaining blocked items — all have notBeforeTime in the future
  // relative to where the cursor ended up. Project each at its notBeforeTime.
  while (blockedIdx < blockedNotBefore.length) {
    const blocked = blockedNotBefore[blockedIdx];
    blockedIdx++;

    if (cursor === null) {
      updates.push({ id: blocked.id, predictedStartTime: null, predictedEndTime: null });
      skippedCount++;
      continue;
    }

    const dur = durationMs(blocked);
    const notBefore = blocked.notBeforeTime!;
    // Start at the later of cursor and notBeforeTime
    const start = cursor.getTime() > notBefore.getTime() ? cursor : notBefore;
    const end = new Date(start.getTime() + dur);

    updates.push({ id: blocked.id, predictedStartTime: start, predictedEndTime: end });
    projectedCount++;
    deferredCount++;

    if (nextCallableItemId === null) {
      nextCallableItemId = blocked.id;
    }

    cursor = end;
  }

  // Step 6: Persist — only update rows where values actually changed
  const affectedIds: string[] = [];
  const itemMap = new Map(items.map((i) => [i.id, i]));

  await prisma.$transaction(async (tx) => {
    for (const u of updates) {
      const existing = itemMap.get(u.id)!;
      const startChanged = !timesEqual(existing.predictedStartTime, u.predictedStartTime);
      const endChanged = !timesEqual(existing.predictedEndTime, u.predictedEndTime);

      if (startChanged || endChanged) {
        await tx.listItem.update({
          where: { id: u.id },
          data: {
            predictedStartTime: u.predictedStartTime,
            predictedEndTime: u.predictedEndTime,
          },
        });
        affectedIds.push(u.id);
      }
    }

    // Step 7: Write append-only event if anything changed
    if (affectedIds.length > 0) {
      await tx.courtDayUpdate.create({
        data: {
          courtDayId,
          eventType: CourtDayEventType.PROJECTIONS_RECOMPUTED,
          actorRole: ActorRole.SYSTEM,
          payloadJson: {
            affectedListItemIds: affectedIds,
            currentItemId,
            nextCallableItemId,
            projectedItems: projectedCount,
            frozenProjections: cursor === null,
          },
        },
      });
    }
  });

  // Broadcast SSE event if projections changed
  if (affectedIds.length > 0) {
    const envelope = buildEnvelope({
      eventId: `recalc_${courtDayId}_${now.getTime()}`,
      eventType: CourtDayEventType.PROJECTIONS_RECOMPUTED,
      aggregateType: 'courtday',
      aggregateId: courtDayId,
      courtDayId,
      occurredAt: now,
      actor: { role: ActorRole.SYSTEM },
      payload: {
        affectedListItemIds: affectedIds,
        currentItemId,
        nextCallableItemId,
        projectedItems: projectedCount,
        frozenProjections: cursor === null,
      },
    });
    publish(envelope);
  }

  return {
    currentItemId,
    nextCallableItemId,
    affectedListItemIds: affectedIds,
    projectedItems: projectedCount,
    skippedItems: skippedCount,
    deferredItems: deferredCount,
    frozenProjections: baseCursor === null,
  };
}

// ─── Utility ─────────────────────────────────────────────────────────────────

/**
 * Compare two nullable Date values for equality (within 1-second tolerance
 * to avoid spurious updates from millisecond drift in serial operations).
 */
function timesEqual(a: Date | null, b: Date | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return Math.abs(a.getTime() - b.getTime()) < 1000;
}
