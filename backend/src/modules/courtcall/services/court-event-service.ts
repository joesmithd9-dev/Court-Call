import { prisma } from './prisma.js';
import { getAllEvents, getEventsFromSequence, getLastSequence } from './event-store.js';
import { buildProjection } from './projection-engine.js';
import { validateEvent, EventValidationError } from './event-validator.js';
import { publishCourtEvent } from './event-sse-broadcaster.js';
import {
  CourtEventType,
  type CourtEvent,
  type CourtEventPayload,
  type CourtDaySnapshot,
  type ProjectedCase,
  type UndoAppliedPayload,
} from '../domain/court-event-types.js';
import type { ActorContext } from '../domain/types.js';

// ─── Query: Snapshot ────────────────────────────────────────────────────────

/**
 * Build a full court day snapshot.
 *
 * Guarantees:
 * - Snapshot reflects ALL events up to lastSequence
 * - Fully consistent
 * - No partial state
 */
export async function getSnapshot(courtDayId: string): Promise<CourtDaySnapshot> {
  const courtDay = await prisma.courtDay.findUniqueOrThrow({
    where: { id: courtDayId },
    include: { court: { select: { roomLabel: true } } },
  });

  // Build canonical projection from event stream
  const rawEvents = await getAllEvents(courtDayId);

  // Map raw events to CourtEvent for projection engine
  const events: CourtEvent[] = rawEvents
    .filter((e) => Object.values(CourtEventType).includes(e.eventType as any))
    .map((e) => ({
      id: e.id,
      courtDayId: e.courtDayId,
      sequence: e.sequence,
      createdAt: e.timestamp.toISOString(),
      type: e.eventType as CourtEventType,
      payload: {} as CourtEventPayload, // payload is derived from event type context
      causedBy: { userId: e.updatedById, role: 'REGISTRAR' as const },
      idempotencyKey: e.idempotencyKey ?? undefined,
    }));

  const projection = buildProjection(events);
  const cases: ProjectedCase[] = [...projection.cases.values()];

  // Map CourtDayStatus to spec status
  let specStatus: 'LIVE' | 'ROSE' | 'CLOSED' = 'LIVE';
  if (courtDay.status === 'CONCLUDED') specStatus = 'CLOSED';
  else if (courtDay.status === 'JUDGE_ROSE' || courtDay.status === 'AT_LUNCH' || courtDay.status === 'PAUSED') specStatus = 'ROSE';

  return {
    courtDay: {
      id: courtDayId,
      status: specStatus,
      lastSequence: courtDay.lastSequence,
      judgeName: courtDay.judgeName ?? '',
      courtroom: courtDay.court.roomLabel ?? '',
    },
    cases,
    serverTime: new Date().toISOString(),
  };
}

// ─── Query: Event History ───────────────────────────────────────────────────

export async function getEventHistory(courtDayId: string) {
  return getAllEvents(courtDayId);
}

// ─── Re-exports ─────────────────────────────────────────────────────────────

export { getEventsFromSequence, getLastSequence } from './event-store.js';
export { EventValidationError } from './event-validator.js';
