import type { FastifyReply } from 'fastify';
import type { CourtCallEventEnvelope } from '../domain/types.js';

/**
 * SSE Broadcaster for CourtCall.
 *
 * Maintains in-memory subscriber registries for public and registrar streams,
 * keyed by courtDayId. Structured so that Redis pub/sub or a message bus can
 * replace the in-memory fanout later without changing the service interface.
 *
 * Public subscribers receive events with internalNote stripped from payloads.
 * Registrar subscribers receive the full envelope.
 */

interface Subscriber {
  id: string;
  reply: FastifyReply;
}

const publicSubscribers = new Map<string, Subscriber[]>();
const registrarSubscribers = new Map<string, Subscriber[]>();

let subscriberCounter = 0;

function addSubscriber(
  registry: Map<string, Subscriber[]>,
  courtDayId: string,
  reply: FastifyReply,
): string {
  const id = `sub_${++subscriberCounter}`;
  const list = registry.get(courtDayId) ?? [];
  list.push({ id, reply });
  registry.set(courtDayId, list);
  return id;
}

function removeSubscriber(
  registry: Map<string, Subscriber[]>,
  courtDayId: string,
  subscriberId: string,
): void {
  const list = registry.get(courtDayId);
  if (!list) return;
  const filtered = list.filter((s) => s.id !== subscriberId);
  if (filtered.length === 0) {
    registry.delete(courtDayId);
  } else {
    registry.set(courtDayId, filtered);
  }
}

function sendEvent(reply: FastifyReply, data: string, eventType: string): void {
  try {
    reply.raw.write(`event: ${eventType}\ndata: ${data}\n\n`);
  } catch {
    // Connection likely closed — will be cleaned up on next heartbeat or publish
  }
}

function isConnectionAlive(reply: FastifyReply): boolean {
  return !reply.raw.destroyed && !reply.raw.writableEnded;
}

/**
 * Strip internal-only fields from the payload for public broadcast.
 */
function sanitiseForPublic(envelope: CourtCallEventEnvelope): CourtCallEventEnvelope {
  const { internalNote, ...safePayload } = envelope.payload;
  void internalNote; // suppress unused warning
  return { ...envelope, payload: safePayload };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Subscribe a public (counsel/public) client to a court day SSE stream.
 * Returns a cleanup function to call on disconnect.
 */
export function subscribePublic(
  courtDayId: string,
  reply: FastifyReply,
): () => void {
  const subId = addSubscriber(publicSubscribers, courtDayId, reply);
  return () => removeSubscriber(publicSubscribers, courtDayId, subId);
}

/**
 * Subscribe a registrar client to a court day SSE stream.
 * Returns a cleanup function to call on disconnect.
 */
export function subscribeRegistrar(
  courtDayId: string,
  reply: FastifyReply,
): () => void {
  const subId = addSubscriber(registrarSubscribers, courtDayId, reply);
  return () => removeSubscriber(registrarSubscribers, courtDayId, subId);
}

/**
 * Broadcast an event envelope to all subscribers of the given court day.
 * Public subscribers get a sanitised payload (no internalNote).
 */
export function publishToCourtDay(
  courtDayId: string,
  envelope: CourtCallEventEnvelope,
): void {
  const publicSubs = publicSubscribers.get(courtDayId) ?? [];
  const registrarSubs = registrarSubscribers.get(courtDayId) ?? [];

  const registrarData = JSON.stringify(envelope);
  const publicData = JSON.stringify(sanitiseForPublic(envelope));

  // Fan out to registrar subscribers
  const deadRegistrar: string[] = [];
  for (const sub of registrarSubs) {
    if (isConnectionAlive(sub.reply)) {
      sendEvent(sub.reply, registrarData, envelope.eventType);
    } else {
      deadRegistrar.push(sub.id);
    }
  }

  // Fan out to public subscribers
  const deadPublic: string[] = [];
  for (const sub of publicSubs) {
    if (isConnectionAlive(sub.reply)) {
      sendEvent(sub.reply, publicData, envelope.eventType);
    } else {
      deadPublic.push(sub.id);
    }
  }

  // Lazy cleanup of dead connections
  for (const id of deadRegistrar) removeSubscriber(registrarSubscribers, courtDayId, id);
  for (const id of deadPublic) removeSubscriber(publicSubscribers, courtDayId, id);
}

/**
 * Generic publish: routes to the correct court day fanout.
 */
export function publish(envelope: CourtCallEventEnvelope): void {
  publishToCourtDay(envelope.courtDayId, envelope);
}

/**
 * Send a keepalive comment to all subscribers of a court day.
 * SSE spec: lines starting with ":" are comments, ignored by EventSource.
 */
export function sendHeartbeat(courtDayId: string): void {
  const allSubs = [
    ...(publicSubscribers.get(courtDayId) ?? []),
    ...(registrarSubscribers.get(courtDayId) ?? []),
  ];
  for (const sub of allSubs) {
    if (isConnectionAlive(sub.reply)) {
      try {
        sub.reply.raw.write(': heartbeat\n\n');
      } catch {
        // will be cleaned up on next publish
      }
    }
  }
}

/** Get active subscriber counts — useful for health/debug endpoints. */
export function getSubscriberCounts(courtDayId: string): {
  public: number;
  registrar: number;
} {
  return {
    public: (publicSubscribers.get(courtDayId) ?? []).filter((s) =>
      isConnectionAlive(s.reply),
    ).length,
    registrar: (registrarSubscribers.get(courtDayId) ?? []).filter((s) =>
      isConnectionAlive(s.reply),
    ).length,
  };
}
