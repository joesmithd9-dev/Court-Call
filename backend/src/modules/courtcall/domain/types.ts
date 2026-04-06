import type { ActorRole } from './enums.js';

/**
 * Canonical SSE event envelope.
 *
 * Every outbound event — whether court-wide or per-item — is wrapped in this
 * shape before being serialised and pushed over the SSE stream.
 *
 * - eventId maps to the persisted update record id where possible.
 * - version is a monotonically increasing integer per court day stream,
 *   maintained in-memory by the broadcaster. Clients use it to detect gaps
 *   and trigger a full snapshot refetch when needed.
 * - occurredAt is an ISO-8601 string.
 */
export interface CourtCallEventEnvelope {
  eventId: string;
  eventType: string;
  aggregateType: 'courtday' | 'listitem';
  aggregateId: string;
  courtDayId: string;
  occurredAt: string;
  actor: {
    userId?: string;
    displayName?: string;
    role: ActorRole;
  };
  version: number;
  payload: Record<string, unknown>;
}

/** Actor context passed through every command handler. */
export interface ActorContext {
  userId?: string;
  displayName?: string;
  role: ActorRole;
}
