import { prisma } from './prisma.js';
import { appendEvent, getEvents, getLastSequence } from './event-store.js';
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

/**
 * Court Event Service — the main command interface for the canonical event system.
 *
 * All mutating operations go through this service, which:
 * 1. Loads current events
 * 2. Builds projection
 * 3. Validates the new event against invariants
 * 4. Appends the event atomically
 * 5. Broadcasts via SSE
 */

// ─── Command: Emit a validated event ────────────────────────────────────────

export interface EmitEventInput {
  courtDayId: string;
  type: CourtEventType;
  payload: CourtEventPayload;
  actor: ActorContext;
  idempotencyKey?: string;
}

/**
 * Validate and emit a single event to the court day event stream.
 * Returns the persisted event with its assigned sequence number.
 */
export async function emitEvent(input: EmitEventInput): Promise<CourtEvent> {
  // Load all existing events for projection
  const events = await getEvents(input.courtDayId);
  const projection = buildProjection(events);

  // Validate against current state
  validateEvent(input.type, input.payload as unknown as Record<string, unknown>, {
    courtDayStatus: projection.courtDayStatus,
    cases: [...projection.cases.values()],
    events,
  });

  // Append atomically
  const event = await appendEvent({
    courtDayId: input.courtDayId,
    type: input.type,
    payload: input.payload,
    actor: input.actor,
    idempotencyKey: input.idempotencyKey,
  });

  // Broadcast to SSE subscribers
  publishCourtEvent(input.courtDayId, event);

  return event;
}

// ─── Command: Undo ──────────────────────────────────────────────────────────

export interface UndoInput {
  courtDayId: string;
  targetEventId: string;
  actor: ActorContext;
  idempotencyKey?: string;
}

/**
 * Undo a previously emitted event by emitting a compensating UNDO_APPLIED event.
 *
 * Per spec:
 * - Undo NEVER deletes or rewrites history
 * - Undo emits a compensating event
 * - The projection engine applies inverse logic when rebuilding state
 */
export async function undoEvent(input: UndoInput): Promise<CourtEvent> {
  // Load the target event to get its type
  const events = await getEvents(input.courtDayId);
  const targetEvent = events.find((e) => e.id === input.targetEventId);

  if (!targetEvent) {
    throw new EventValidationError(
      `Cannot undo: target event ${input.targetEventId} not found in court day ${input.courtDayId}.`,
    );
  }

  const undoPayload: UndoAppliedPayload = {
    targetEventId: input.targetEventId,
    reversedEventType: targetEvent.type,
  };

  return emitEvent({
    courtDayId: input.courtDayId,
    type: CourtEventType.UNDO_APPLIED,
    payload: undoPayload,
    actor: input.actor,
    idempotencyKey: input.idempotencyKey,
  });
}

// ─── Query: Snapshot ────────────────────────────────────────────────────────

/**
 * Build a full court day snapshot from events.
 *
 * Response shape per spec:
 * {
 *   courtDay: { id, status, lastSequence, judgeName, courtroom },
 *   cases: CourtCase[],
 *   serverTime: string
 * }
 *
 * Guarantees:
 * - Snapshot reflects ALL events up to lastSequence
 * - Fully consistent
 * - No partial state
 */
export async function getSnapshot(courtDayId: string): Promise<CourtDaySnapshot> {
  // Load court day metadata from DB
  const courtDay = await prisma.courtDay.findUniqueOrThrow({
    where: { id: courtDayId },
    include: { court: { select: { room: true } } },
  });

  // Load and project all events
  const events = await getEvents(courtDayId);
  const projection = buildProjection(events);

  const cases: ProjectedCase[] = [...projection.cases.values()];

  return {
    courtDay: {
      id: courtDayId,
      status: projection.courtDayStatus,
      lastSequence: projection.lastSequence,
      judgeName: courtDay.judgeName,
      courtroom: courtDay.court.room,
    },
    cases,
    serverTime: new Date().toISOString(),
  };
}

// ─── Query: Event History ───────────────────────────────────────────────────

/**
 * Get the full event history for a court day.
 */
export async function getEventHistory(courtDayId: string): Promise<CourtEvent[]> {
  return getEvents(courtDayId);
}

// ─── Re-exports for convenience ─────────────────────────────────────────────

export { getEventsFromSequence, getLastSequence } from './event-store.js';
export { EventValidationError } from './event-validator.js';
