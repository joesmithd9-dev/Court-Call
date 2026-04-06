import type { ActorRole } from './enums.js';

/**
 * Canonical SSE event envelope.
 *
 * Every outbound event — whether court-wide or per-item — is wrapped in this
 * shape before being serialised and pushed over the SSE stream.
 */
export interface CourtCallEventEnvelope {
  eventId: string;
  eventType: string;
  aggregateType: 'courtday' | 'listitem';
  aggregateId: string;
  courtDayId: string;
  occurredAt: string;
  sequence: number;
  actor: {
    userId?: string;
    role: ActorRole;
  };
  payload: Record<string, unknown>;
}

/** Actor context passed through every command handler. */
export interface ActorContext {
  userId?: string;
  role: ActorRole;
}
