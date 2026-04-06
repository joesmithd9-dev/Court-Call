import { appendCourtDayEvent, appendListEvent } from './event-store.js';
import { publishCourtEvent } from './event-sse-broadcaster.js';
import { CourtEventType, type CourtEventPayload } from '../domain/court-event-types.js';
import type { ActorContext } from '../domain/types.js';

/**
 * Event Bridge — connects existing command handlers to the canonical event stream.
 *
 * When existing service operations execute, this bridge emits the corresponding
 * canonical event to the event SSE stream. Fire-and-forget safe.
 */

async function emitCanonical(params: {
  courtDayId: string;
  type: CourtEventType;
  payload: CourtEventPayload;
  actor: ActorContext;
}): Promise<void> {
  try {
    publishCourtEvent(params.courtDayId, {
      id: `bridge_${Date.now()}`,
      courtDayId: params.courtDayId,
      sequence: 0, // bridge events use the existing sequence from the main event
      createdAt: new Date().toISOString(),
      type: params.type,
      payload: params.payload,
      causedBy: {
        userId: params.actor.userId ?? null,
        role: params.actor.role === 'SYSTEM' ? 'SYSTEM' : 'REGISTRAR',
      },
    });
  } catch (err) {
    console.warn(`[event-bridge] Failed to emit canonical ${params.type}:`, err);
  }
}

export function bridgeCaseStarted(courtDayId: string, caseId: string, actor: ActorContext): void {
  void emitCanonical({ courtDayId, type: CourtEventType.CASE_STARTED, payload: { caseId }, actor });
}

export function bridgeCaseCompleted(courtDayId: string, caseId: string, outcomeCode: string | undefined, actor: ActorContext): void {
  void emitCanonical({ courtDayId, type: CourtEventType.CASE_COMPLETED, payload: { caseId, ...(outcomeCode ? { outcomeCode } : {}) }, actor });
}

export function bridgeCaseAdjourned(courtDayId: string, caseId: string, adjournedTo: string, actor: ActorContext): void {
  void emitCanonical({ courtDayId, type: CourtEventType.CASE_ADJOURNED, payload: { caseId, adjournedTo }, actor });
}

export function bridgeCaseNotBeforeSet(courtDayId: string, caseId: string, notBefore: string, actor: ActorContext): void {
  void emitCanonical({ courtDayId, type: CourtEventType.CASE_NOT_BEFORE_SET, payload: { caseId, notBefore }, actor });
}

export function bridgeCaseDelayAdded(courtDayId: string, caseId: string, minutes: number, actor: ActorContext): void {
  void emitCanonical({ courtDayId, type: CourtEventType.CASE_DELAY_ADDED, payload: { caseId, minutes }, actor });
}

export function bridgeCourtRose(courtDayId: string, actor: ActorContext): void {
  void emitCanonical({ courtDayId, type: CourtEventType.COURT_ROSE, payload: {}, actor });
}

export function bridgeCourtResumed(courtDayId: string, actor: ActorContext): void {
  void emitCanonical({ courtDayId, type: CourtEventType.COURT_RESUMED, payload: {}, actor });
}
