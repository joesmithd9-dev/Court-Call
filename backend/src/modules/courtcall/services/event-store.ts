import { prisma } from './prisma.js';
import type { ActorContext } from '../domain/types.js';
import {
  CourtEventType,
  type CourtEventPayload,
  type CourtEvent,
} from '../domain/court-event-types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

const VALID_EVENT_TYPES = new Set<string>(Object.values(CourtEventType));

function assertValidEventType(type: string): asserts type is CourtEventType {
  if (!VALID_EVENT_TYPES.has(type)) {
    throw new Error(`Invalid event type: ${type}. Must be one of: ${[...VALID_EVENT_TYPES].join(', ')}`);
  }
}

// ─── Sequence Management ────────────────────────────────────────────────────

/**
 * Atomically increment CourtDay.lastSequence and return the new value.
 * This MUST be called inside the same transaction as the event insert.
 */
async function nextSequence(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  courtDayId: string,
): Promise<number> {
  const updated = await tx.courtDay.update({
    where: { id: courtDayId },
    data: { lastSequence: { increment: 1 } },
    select: { lastSequence: true },
  });
  return updated.lastSequence;
}

// ─── Idempotency Check ──────────────────────────────────────────────────────

/**
 * Check if a court day update with this idempotency key already exists.
 */
async function checkCourtDayIdempotency(key: string): Promise<{ id: string; sequence: number } | null> {
  const existing = await prisma.courtDayUpdate.findFirst({
    where: { idempotencyKey: key },
    select: { id: true, sequence: true },
  });
  return existing;
}

/**
 * Check if a list update with this idempotency key already exists.
 */
async function checkListIdempotency(key: string): Promise<{ id: string; sequence: number } | null> {
  const existing = await prisma.listUpdate.findFirst({
    where: { idempotencyKey: key },
    select: { id: true, sequence: true },
  });
  return existing;
}

// ─── Court Day Event Append ─────────────────────────────────────────────────

export interface AppendCourtDayEventInput {
  courtDayId: string;
  eventType: string;
  previousStatus?: string;
  newStatus?: string;
  publicNote?: string;
  reversedEventId?: string;
  actor: ActorContext;
  idempotencyKey?: string;
}

export interface AppendedEvent {
  id: string;
  sequence: number;
  eventType: string;
  timestamp: Date;
}

/**
 * Append a court day event with atomic sequence enforcement.
 *
 * Transaction: update CourtDay.lastSequence → +1, insert CourtDayUpdate with that sequence.
 */
export async function appendCourtDayEvent(input: AppendCourtDayEventInput): Promise<AppendedEvent> {
  // Idempotency gate
  if (input.idempotencyKey) {
    const existing = await checkCourtDayIdempotency(input.idempotencyKey);
    if (existing) return { id: existing.id, sequence: existing.sequence, eventType: input.eventType, timestamp: new Date() };
  }

  return prisma.$transaction(async (tx) => {
    const seq = await nextSequence(tx, input.courtDayId);

    const record = await tx.courtDayUpdate.create({
      data: {
        courtDayId: input.courtDayId,
        sequence: seq,
        eventType: input.eventType,
        previousStatus: input.previousStatus as any,
        newStatus: input.newStatus as any,
        publicNote: input.publicNote,
        reversedEventId: input.reversedEventId,
        updatedById: input.actor.userId ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
      },
    });

    return { id: record.id, sequence: seq, eventType: input.eventType, timestamp: record.timestamp };
  });
}

// ─── List Item Event Append ─────────────────────────────────────────────────

export interface AppendListEventInput {
  courtDayId: string;
  listItemId: string;
  eventType: string;
  previousStatus?: string;
  newStatus?: string;
  minutesAdded?: number;
  snapshotNote?: string;
  reversedEventId?: string;
  actor: ActorContext;
  idempotencyKey?: string;
}

/**
 * Append a list item event with atomic sequence enforcement.
 *
 * Transaction: update CourtDay.lastSequence → +1, insert ListUpdate with that sequence.
 */
export async function appendListEvent(input: AppendListEventInput): Promise<AppendedEvent> {
  // Idempotency gate
  if (input.idempotencyKey) {
    const existing = await checkListIdempotency(input.idempotencyKey);
    if (existing) return { id: existing.id, sequence: existing.sequence, eventType: input.eventType, timestamp: new Date() };
  }

  return prisma.$transaction(async (tx) => {
    const seq = await nextSequence(tx, input.courtDayId);

    const record = await tx.listUpdate.create({
      data: {
        courtDayId: input.courtDayId,
        sequence: seq,
        listItemId: input.listItemId,
        eventType: input.eventType,
        previousStatus: input.previousStatus as any,
        newStatus: input.newStatus as any,
        minutesAdded: input.minutesAdded,
        snapshotNote: input.snapshotNote,
        reversedEventId: input.reversedEventId,
        updatedById: input.actor.userId ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
      },
    });

    return { id: record.id, sequence: seq, eventType: input.eventType, timestamp: record.timestamp };
  });
}

// ─── Unified Event Read ─────────────────────────────────────────────────────

export interface RawEvent {
  id: string;
  courtDayId: string;
  sequence: number;
  eventType: string;
  timestamp: Date;
  updatedById: string | null;
  reversedEventId: string | null;
  idempotencyKey: string | null;
  // list-specific
  listItemId?: string;
  previousStatus?: string | null;
  newStatus?: string | null;
}

/**
 * Get all events (court day + list) for a court day, ordered by sequence.
 */
export async function getAllEvents(courtDayId: string): Promise<RawEvent[]> {
  const [courtUpdates, listUpdates] = await Promise.all([
    prisma.courtDayUpdate.findMany({
      where: { courtDayId },
      orderBy: { sequence: 'asc' },
    }),
    prisma.listUpdate.findMany({
      where: { courtDayId },
      orderBy: { sequence: 'asc' },
    }),
  ]);

  const events: RawEvent[] = [
    ...courtUpdates.map((u) => ({
      id: u.id,
      courtDayId: u.courtDayId,
      sequence: u.sequence,
      eventType: u.eventType,
      timestamp: u.timestamp,
      updatedById: u.updatedById,
      reversedEventId: u.reversedEventId,
      idempotencyKey: u.idempotencyKey,
      previousStatus: u.previousStatus,
      newStatus: u.newStatus,
    })),
    ...listUpdates.map((u) => ({
      id: u.id,
      courtDayId: u.courtDayId,
      sequence: u.sequence,
      eventType: u.eventType,
      timestamp: u.timestamp,
      updatedById: u.updatedById,
      reversedEventId: u.reversedEventId,
      idempotencyKey: u.idempotencyKey,
      listItemId: u.listItemId,
      previousStatus: u.previousStatus,
      newStatus: u.newStatus,
    })),
  ];

  return events.sort((a, b) => a.sequence - b.sequence);
}

/**
 * Get events from a specific sequence onward (for SSE replay).
 */
export async function getEventsFromSequence(
  courtDayId: string,
  fromSequence: number,
): Promise<RawEvent[]> {
  const [courtUpdates, listUpdates] = await Promise.all([
    prisma.courtDayUpdate.findMany({
      where: { courtDayId, sequence: { gte: fromSequence } },
      orderBy: { sequence: 'asc' },
    }),
    prisma.listUpdate.findMany({
      where: { courtDayId, sequence: { gte: fromSequence } },
      orderBy: { sequence: 'asc' },
    }),
  ]);

  const events: RawEvent[] = [
    ...courtUpdates.map((u) => ({
      id: u.id,
      courtDayId: u.courtDayId,
      sequence: u.sequence,
      eventType: u.eventType,
      timestamp: u.timestamp,
      updatedById: u.updatedById,
      reversedEventId: u.reversedEventId,
      idempotencyKey: u.idempotencyKey,
      previousStatus: u.previousStatus,
      newStatus: u.newStatus,
    })),
    ...listUpdates.map((u) => ({
      id: u.id,
      courtDayId: u.courtDayId,
      sequence: u.sequence,
      eventType: u.eventType,
      timestamp: u.timestamp,
      updatedById: u.updatedById,
      reversedEventId: u.reversedEventId,
      idempotencyKey: u.idempotencyKey,
      listItemId: u.listItemId,
      previousStatus: u.previousStatus,
      newStatus: u.newStatus,
    })),
  ];

  return events.sort((a, b) => a.sequence - b.sequence);
}

/**
 * Get the last sequence number for a court day.
 */
export async function getLastSequence(courtDayId: string): Promise<number> {
  const courtDay = await prisma.courtDay.findUniqueOrThrow({
    where: { id: courtDayId },
    select: { lastSequence: true },
  });
  return courtDay.lastSequence;
}
