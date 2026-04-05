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
 * Priority order:
 * 1. If court is paused and has an expectedResumeAt, use that as the cursor.
 *    All downstream items won't start until the court resumes.
 * 2. If court is paused with no expectedResumeAt, predictions are frozen —
 *    we return null to signal "cannot project".
 * 3. If there is an active HEARING item with actualStartTime, cursor is
 *    actualStartTime + estimatedDuration (i.e. when it's expected to finish).
 * 4. If there is a CALLING item, cursor is now (it's about to start).
 * 5. Otherwise, cursor is now (court is live, nothing active).
 * 6. If court is SCHEDULED or CLOSED, cursor is startedAt or null.
 */
function determineBaseCursor(
  courtDay: CourtDay,
  items: ListItem[],
  now: Date,
): Date | null {
  const status = courtDay.status as CourtDayStatus;

  // Court not yet live or already closed — no live predictions
  if (status === CourtDayStatus.SCHEDULED) return null;
  if (status === CourtDayStatus.CLOSED) return null;

  // Court is paused
  if (isSessionPaused(courtDay)) {
    if (courtDay.expectedResumeAt) {
      // Use the later of expectedResumeAt and now — if expectedResumeAt is in
      // the past but court hasn't formally resumed, we still anchor to now.
      return courtDay.expectedResumeAt > now ? courtDay.expectedResumeAt : now;
    }
    // No resume time known — we can still project relative to "now" but
    // everything is shifted. Use now as a conservative baseline; the
    // registrar will update expectedResumeAt when they know.
    return now;
  }

  // Court is LIVE and session is LIVE — check for active items
  const activeHearing = items.find(
    (i) => (i.status as ListItemStatus) === ListItemStatus.HEARING,
  );
  if (activeHearing) {
    const start = activeHearing.actualStartTime ?? now;
    const durationMs =
      (activeHearing.estimatedDurationMinutes ?? DEFAULT_ESTIMATE_MINUTES) * 60_000;
    return new Date(start.getTime() + durationMs);
  }

  const activeCalling = items.find(
    (i) => (i.status as ListItemStatus) === ListItemStatus.CALLING,
  );
  if (activeCalling) {
    // Item is being called — its hearing hasn't started yet.
    // Cursor stays at now; the calling item's own prediction is "now".
    return now;
  }

  // Nothing active, court is live
  return now;
}

// ─── Core projection algorithm ───────────────────────────────────────────────

/**
 * Result of a recalculation pass.
 */
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
 * Algorithm:
 *
 * 1. Load court day and all items ordered by queuePosition.
 * 2. Determine the base cursor time (see determineBaseCursor).
 * 3. Classify items:
 *    - Active (HEARING/CALLING): anchor predictions to actual times.
 *    - Eligible (WAITING, NOT_BEFORE that's past, PART_HEARD): project.
 *    - Blocked NOT_BEFORE: skip in queue order, defer to later pass.
 *    - Deferred (LET_STAND, STOOD_DOWN): exclude from projection, null out.
 *    - Terminal: null out predictions, skip.
 * 4. First pass: iterate by queuePosition. For each eligible item, set
 *    predictedStartTime = cursor, predictedEndTime = cursor + duration,
 *    then advance cursor. For blocked NOT_BEFORE items, collect them in a
 *    deferred bucket.
 * 5. Second pass: for each deferred NOT_BEFORE item, check if the cursor
 *    has advanced past its notBeforeTime. If so, project it at that point
 *    and advance cursor. If not, project it at notBeforeTime.
 * 6. Persist changes in a single transaction, only updating rows where
 *    predicted times actually changed.
 * 7. Emit courtday.projections_recomputed event.
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
  const baseCursor = determineBaseCursor(courtDay, items, now);

  // Step 3 & 4: Classify and project
  const updates: Array<{
    id: string;
    predictedStartTime: Date | null;
    predictedEndTime: Date | null;
  }> = [];

  let cursor = baseCursor; // null means "frozen — cannot project"
  let currentItemId: string | null = null;
  let nextCallableItemId: string | null = null;
  let projectedCount = 0;
  let skippedCount = 0;
  let deferredCount = 0;

  // Deferred NOT_BEFORE items that were skipped in the main pass
  const deferredNotBefore: ListItem[] = [];

  // Handle multi-active anomaly: if multiple items are HEARING, treat only
  // the first by queuePosition as the "real" active item and log a warning.
  let activeHandled = false;

  for (const item of items) {
    const s = item.status as ListItemStatus;

    // ── Terminal items: clear predictions ──
    if (isCompletedForToday(item)) {
      updates.push({ id: item.id, predictedStartTime: null, predictedEndTime: null });
      skippedCount++;
      continue;
    }

    // ── Deferred items (LET_STAND, STOOD_DOWN): clear predictions ──
    if (isDeferred(item)) {
      updates.push({ id: item.id, predictedStartTime: null, predictedEndTime: null });
      deferredCount++;
      continue;
    }

    // ── Active items (HEARING, CALLING) ──
    if (isActiveItem(item)) {
      if (!activeHandled) {
        currentItemId = item.id;
        activeHandled = true;
      }
      // Anchor the active item's predictions to its actual times
      const duration = (item.estimatedDurationMinutes ?? DEFAULT_ESTIMATE_MINUTES) * 60_000;
      if (s === ListItemStatus.HEARING) {
        const start = item.actualStartTime ?? now;
        const end = new Date(start.getTime() + duration);
        updates.push({
          id: item.id,
          predictedStartTime: start,
          predictedEndTime: end,
        });
        // Multiple HEARING items: only the first advances the cursor
        if (currentItemId === item.id && cursor !== null) {
          cursor = end > cursor ? end : cursor;
        }
      } else {
        // CALLING: will start imminently
        updates.push({
          id: item.id,
          predictedStartTime: cursor,
          predictedEndTime: cursor ? new Date(cursor.getTime() + duration) : null,
        });
        if (cursor) {
          cursor = new Date(cursor.getTime() + duration);
        }
      }
      projectedCount++;
      continue;
    }

    // ── Blocked NOT_BEFORE: skip for now, defer to second pass ──
    if (s === ListItemStatus.NOT_BEFORE && isBlockedByNotBefore(item, now)) {
      deferredNotBefore.push(item);
      continue;
    }

    // ── Eligible items (WAITING, PART_HEARD, unblocked NOT_BEFORE) ──
    if (cursor === null) {
      // Projections frozen — clear predictions
      updates.push({ id: item.id, predictedStartTime: null, predictedEndTime: null });
      skippedCount++;
      continue;
    }

    const duration = (item.estimatedDurationMinutes ?? DEFAULT_ESTIMATE_MINUTES) * 60_000;
    const start = new Date(cursor.getTime());
    const end = new Date(cursor.getTime() + duration);

    updates.push({ id: item.id, predictedStartTime: start, predictedEndTime: end });
    projectedCount++;

    if (nextCallableItemId === null && !isActiveItem(item)) {
      nextCallableItemId = item.id;
    }

    cursor = end;
  }

  // Step 5: Second pass — deferred NOT_BEFORE items
  // These items are blocked right now but may become eligible as the cursor
  // advances. Sort them by notBeforeTime to project in chronological order.
  deferredNotBefore.sort((a, b) => {
    const aTime = a.notBeforeTime?.getTime() ?? 0;
    const bTime = b.notBeforeTime?.getTime() ?? 0;
    return aTime - bTime;
  });

  for (const item of deferredNotBefore) {
    if (cursor === null) {
      updates.push({ id: item.id, predictedStartTime: null, predictedEndTime: null });
      skippedCount++;
      continue;
    }

    const duration = (item.estimatedDurationMinutes ?? DEFAULT_ESTIMATE_MINUTES) * 60_000;
    // The item cannot start before its notBeforeTime. If the cursor has
    // already passed that point, use the cursor; otherwise use notBeforeTime.
    const notBefore = item.notBeforeTime!;
    const start = cursor > notBefore ? cursor : notBefore;
    const end = new Date(start.getTime() + duration);

    updates.push({ id: item.id, predictedStartTime: start, predictedEndTime: end });
    projectedCount++;
    deferredCount++;

    if (nextCallableItemId === null && !currentItemId) {
      nextCallableItemId = item.id;
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

  // Step 7b: Broadcast SSE event if projections changed
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
