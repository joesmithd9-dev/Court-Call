import type { CourtCallEventEnvelope, ActorContext } from '../domain/types.js';

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
  version: number;
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
    version: params.version,
    payload: params.payload,
  };
}
