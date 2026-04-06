import type { CourtCallEventEnvelope, ActorContext } from '../domain/types.js';

/**
 * Build a canonical event envelope for SSE broadcast.
 *
 * The sequence is now sourced from the database (CourtDay.lastSequence)
 * rather than an in-memory counter, ensuring consistency across restarts
 * and multi-process deployments.
 */
export function buildEnvelope(params: {
  eventId: string;
  eventType: string;
  aggregateType: 'courtday' | 'listitem';
  aggregateId: string;
  courtDayId: string;
  occurredAt: Date;
  sequence: number;
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
    sequence: params.sequence,
    actor: {
      userId: params.actor.userId,
      role: params.actor.role,
    },
    payload: params.payload,
  };
}
