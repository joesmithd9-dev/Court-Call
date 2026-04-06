import type { CourtCallEventEnvelope, ActorContext } from '../domain/types.js';

/**
 * In-memory monotonic version counter per court day.
 *
 * Each court day stream has its own version sequence. Clients use the version
 * field to detect gaps (missed events) and trigger a full snapshot refetch.
 *
 * For a clustered deployment, this should migrate to a Redis INCR or a
 * database sequence. For single-process MVP this is sufficient and correct.
 */
const versionCounters = new Map<string, number>();

function nextVersion(courtDayId: string): number {
  const current = versionCounters.get(courtDayId) ?? 0;
  const next = current + 1;
  versionCounters.set(courtDayId, next);
  return next;
}

/** Reset version counter — useful for tests. */
export function resetVersionCounter(courtDayId: string): void {
  versionCounters.delete(courtDayId);
}

/**
 * Build a canonical event envelope for SSE broadcast.
 */
export function buildEnvelope(params: {
  eventId: string;
  eventType: string;
  aggregateType: 'courtday' | 'listitem';
  aggregateId: string;
  courtDayId: string;
  occurredAt: Date;
  actor: ActorContext;
  payload: Record<string, unknown>;
}): CourtCallEventEnvelope {
  return {
    eventId: params.eventId,
    eventType: params.eventType,
    aggregateType: params.aggregateType,
    aggregateId: params.aggregateId,
    courtDayId: params.courtDayId,
    occurredAt: params.occurredAt.toISOString(),
    actor: {
      userId: params.actor.userId,
      displayName: params.actor.displayName,
      role: params.actor.role,
    },
    version: nextVersion(params.courtDayId),
    payload: params.payload,
  };
}
