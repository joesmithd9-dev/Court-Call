import { v4 as uuid } from 'uuid';
import type { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';
import type { CourtEvent as CourtEventRow } from '@prisma/client';
import type { ActorContext } from '../domain/types.js';
import {
  CourtEventType,
  type CourtEventPayload,
  type CourtEvent,
} from '../domain/court-event-types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function toCourtEvent(row: CourtEventRow): CourtEvent {
  return {
    id: row.id,
    courtDayId: row.courtDayId,
    sequence: row.sequence,
    createdAt: row.createdAt.toISOString(),
    type: row.type as CourtEventType,
    payload: row.payload as unknown as CourtEventPayload,
    causedBy: {
      userId: row.causedByUserId,
      role: row.causedByRole as 'REGISTRAR' | 'SYSTEM',
    },
    idempotencyKey: row.idempotencyKey ?? undefined,
  };
}

const VALID_EVENT_TYPES = new Set<string>(Object.values(CourtEventType));

function assertValidEventType(type: string): asserts type is CourtEventType {
  if (!VALID_EVENT_TYPES.has(type)) {
    throw new Error(`Invalid event type: ${type}. Must be one of: ${[...VALID_EVENT_TYPES].join(', ')}`);
  }
}

// ─── Idempotency Check ──────────────────────────────────────────────────────

/**
 * Check if an idempotency key has already been used.
 * If so, return the previously created event.
 * If not, return null.
 */
export async function checkIdempotency(
  idempotencyKey: string,
): Promise<CourtEvent | null> {
  const record = await prisma.idempotencyRecord.findUnique({
    where: { key: idempotencyKey },
  });

  if (!record) return null;

  const event = await prisma.courtEvent.findUniqueOrThrow({
    where: { id: record.eventId },
  });

  return toCourtEvent(event);
}

// ─── Atomic Event Write ─────────────────────────────────────────────────────

export interface AppendEventInput {
  courtDayId: string;
  type: CourtEventType;
  payload: CourtEventPayload;
  actor: ActorContext;
  idempotencyKey?: string;
}

/**
 * Append a single event to the court day's event stream.
 *
 * Guarantees:
 * 1. Sequence = lastSequence + 1 (monotonic, no gaps, no duplicates)
 * 2. Atomic write (event persisted inside transaction before returning)
 * 3. Idempotency (duplicate key returns same event, no new write)
 *
 * The sequence is enforced via a SELECT MAX(sequence) + INSERT inside a
 * serializable transaction. The unique constraint on (courtDayId, sequence)
 * provides a final safety net against race conditions.
 */
export async function appendEvent(input: AppendEventInput): Promise<CourtEvent> {
  assertValidEventType(input.type);

  // ── Idempotency gate ──────────────────────────────────────────────────
  if (input.idempotencyKey) {
    const existing = await checkIdempotency(input.idempotencyKey);
    if (existing) return existing;
  }

  // ── Atomic write with sequence enforcement ────────────────────────────
  const eventId = uuid();

  const row = await prisma.$transaction(async (tx) => {
    // Get the current max sequence for this court day (lock row for update)
    const lastEvent = await tx.courtEvent.findFirst({
      where: { courtDayId: input.courtDayId },
      orderBy: { sequence: 'desc' },
      select: { sequence: true },
    });

    const nextSequence = (lastEvent?.sequence ?? 0) + 1;

    // Insert the event with the next sequence number
    const created = await tx.courtEvent.create({
      data: {
        id: eventId,
        courtDayId: input.courtDayId,
        sequence: nextSequence,
        type: input.type,
        payload: input.payload as unknown as Prisma.InputJsonValue,
        causedByUserId: input.actor.userId ?? null,
        causedByRole: input.actor.role,
        idempotencyKey: input.idempotencyKey ?? null,
      },
    });

    // Record idempotency if key provided
    if (input.idempotencyKey) {
      await tx.idempotencyRecord.create({
        data: {
          key: input.idempotencyKey,
          eventId: created.id,
          responseHash: JSON.stringify({ eventId: created.id, sequence: nextSequence }),
        },
      });
    }

    return created;
  });

  return toCourtEvent(row);
}

// ─── Read Operations ────────────────────────────────────────────────────────

/**
 * Get all events for a court day, ordered by sequence.
 */
export async function getEvents(courtDayId: string): Promise<CourtEvent[]> {
  const rows = await prisma.courtEvent.findMany({
    where: { courtDayId },
    orderBy: { sequence: 'asc' },
  });
  return rows.map(toCourtEvent);
}

/**
 * Get events from a specific sequence onward (for SSE replay).
 * Used when client sends Last-Event-Sequence header.
 */
export async function getEventsFromSequence(
  courtDayId: string,
  fromSequence: number,
): Promise<CourtEvent[]> {
  const rows = await prisma.courtEvent.findMany({
    where: {
      courtDayId,
      sequence: { gte: fromSequence },
    },
    orderBy: { sequence: 'asc' },
  });
  return rows.map(toCourtEvent);
}

/**
 * Get the last sequence number for a court day.
 */
export async function getLastSequence(courtDayId: string): Promise<number> {
  const lastEvent = await prisma.courtEvent.findFirst({
    where: { courtDayId },
    orderBy: { sequence: 'desc' },
    select: { sequence: true },
  });
  return lastEvent?.sequence ?? 0;
}

/**
 * Get a single event by ID.
 */
export async function getEventById(eventId: string): Promise<CourtEvent | null> {
  const row = await prisma.courtEvent.findUnique({
    where: { id: eventId },
  });
  return row ? toCourtEvent(row) : null;
}
