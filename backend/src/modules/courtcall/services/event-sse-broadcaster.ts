import type { FastifyReply } from 'fastify';
import type { CourtEvent } from '../domain/court-event-types.js';

/**
 * SSE Broadcaster for the canonical CourtEvent stream.
 *
 * Rules (per spec):
 * - Events ordered by sequence
 * - No batching
 * - No gaps
 * - Immediate flush after write
 *
 * Reconnect support:
 * - Client sends Last-Event-Sequence header
 * - Server replays from that sequence + 1 onward
 */

interface EventSubscriber {
  id: string;
  reply: FastifyReply;
}

const subscribers = new Map<string, EventSubscriber[]>();
let subscriberCounter = 0;

// ─── Subscriber Management ──────────────────────────────────────────────────

export function subscribeToEvents(
  courtDayId: string,
  reply: FastifyReply,
): () => void {
  const id = `evt_sub_${++subscriberCounter}`;
  const list = subscribers.get(courtDayId) ?? [];
  list.push({ id, reply });
  subscribers.set(courtDayId, list);
  return () => removeSubscriber(courtDayId, id);
}

function removeSubscriber(courtDayId: string, subscriberId: string): void {
  const list = subscribers.get(courtDayId);
  if (!list) return;
  const filtered = list.filter((s) => s.id !== subscriberId);
  if (filtered.length === 0) {
    subscribers.delete(courtDayId);
  } else {
    subscribers.set(courtDayId, filtered);
  }
}

function isAlive(reply: FastifyReply): boolean {
  return !reply.raw.destroyed && !reply.raw.writableEnded;
}

// ─── Publish ────────────────────────────────────────────────────────────────

/**
 * Broadcast a CourtEvent to all subscribers of the given court day.
 *
 * SSE format per spec:
 * {
 *   "id": "event-id",
 *   "sequence": 42,
 *   "type": "CASE_STARTED",
 *   "payload": {...},
 *   "createdAt": "...",
 *   "idempotencyKey": "..."
 * }
 */
export function publishCourtEvent(courtDayId: string, event: CourtEvent): void {
  const subs = subscribers.get(courtDayId) ?? [];
  if (subs.length === 0) return;

  const ssePayload: Record<string, unknown> = {
    id: event.id,
    sequence: event.sequence,
    type: event.type,
    payload: event.payload,
    createdAt: event.createdAt,
  };
  if (event.idempotencyKey) {
    ssePayload.idempotencyKey = event.idempotencyKey;
  }

  const data = JSON.stringify(ssePayload);
  const dead: string[] = [];

  for (const sub of subs) {
    if (isAlive(sub.reply)) {
      try {
        // Use sequence as the SSE event ID for reconnect support
        sub.reply.raw.write(`id: ${event.sequence}\nevent: court-event\ndata: ${data}\n\n`);
      } catch {
        dead.push(sub.id);
      }
    } else {
      dead.push(sub.id);
    }
  }

  // Lazy cleanup
  for (const id of dead) removeSubscriber(courtDayId, id);
}

/**
 * Send a heartbeat comment to all event stream subscribers for a court day.
 */
export function sendEventHeartbeat(courtDayId: string): void {
  const subs = subscribers.get(courtDayId) ?? [];
  const dead: string[] = [];

  for (const sub of subs) {
    if (isAlive(sub.reply)) {
      try {
        sub.reply.raw.write(': heartbeat\n\n');
      } catch {
        dead.push(sub.id);
      }
    } else {
      dead.push(sub.id);
    }
  }

  for (const id of dead) removeSubscriber(courtDayId, id);
}

/**
 * Get active subscriber count for a court day's event stream.
 */
export function getEventSubscriberCount(courtDayId: string): number {
  return (subscribers.get(courtDayId) ?? []).filter((s) => isAlive(s.reply)).length;
}
