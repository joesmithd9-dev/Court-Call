import { appendEvent } from './event-store.js';
import { publishCourtEvent } from './event-sse-broadcaster.js';
import { CourtEventType, type CourtEventPayload } from '../domain/court-event-types.js';
import type { ActorContext } from '../domain/types.js';

/**
 * Event Bridge — connects existing command handlers to the canonical event store.
 *
 * When existing service operations execute (e.g. list-item-service.startItem),
 * this bridge emits the corresponding canonical CourtEvent alongside the
 * existing audit log entry. This ensures dual-write consistency during the
 * migration period, and the canonical event store becomes the source of truth.
 *
 * Each bridge function is fire-and-forget safe — if the canonical event fails
 * to write (e.g. duplicate idempotency key), it logs a warning but does not
 * break the existing flow.
 */

async function emitCanonical(params: {
  courtDayId: string;
  type: CourtEventType;
  payload: CourtEventPayload;
  actor: ActorContext;
  idempotencyKey?: string;
}): Promise<void> {
  try {
    const event = await appendEvent({
      courtDayId: params.courtDayId,
      type: params.type,
      payload: params.payload,
      actor: params.actor,
      idempotencyKey: params.idempotencyKey,
    });
    publishCourtEvent(params.courtDayId, event);
  } catch (err) {
    // Log but don't break the existing flow
    console.warn(`[event-bridge] Failed to emit canonical ${params.type}:`, err);
  }
}

// ─── Bridge Functions ───────────────────────────────────────────────────────

/**
 * Bridge: listitem.started → CASE_STARTED
 */
export function bridgeCaseStarted(
  courtDayId: string,
  caseId: string,
  actor: ActorContext,
): void {
  void emitCanonical({
    courtDayId,
    type: CourtEventType.CASE_STARTED,
    payload: { caseId },
    actor,
  });
}

/**
 * Bridge: listitem.completed → CASE_COMPLETED
 */
export function bridgeCaseCompleted(
  courtDayId: string,
  caseId: string,
  outcomeCode: string | undefined,
  actor: ActorContext,
): void {
  void emitCanonical({
    courtDayId,
    type: CourtEventType.CASE_COMPLETED,
    payload: { caseId, ...(outcomeCode ? { outcomeCode } : {}) },
    actor,
  });
}

/**
 * Bridge: listitem.adjourned → CASE_ADJOURNED
 */
export function bridgeCaseAdjourned(
  courtDayId: string,
  caseId: string,
  adjournedTo: string,
  actor: ActorContext,
): void {
  void emitCanonical({
    courtDayId,
    type: CourtEventType.CASE_ADJOURNED,
    payload: { caseId, adjournedTo },
    actor,
  });
}

/**
 * Bridge: listitem.not_before_set → CASE_NOT_BEFORE_SET
 */
export function bridgeCaseNotBeforeSet(
  courtDayId: string,
  caseId: string,
  notBefore: string,
  actor: ActorContext,
): void {
  void emitCanonical({
    courtDayId,
    type: CourtEventType.CASE_NOT_BEFORE_SET,
    payload: { caseId, notBefore },
    actor,
  });
}

/**
 * Bridge: listitem.estimate_extended → CASE_DELAY_ADDED
 */
export function bridgeCaseDelayAdded(
  courtDayId: string,
  caseId: string,
  minutes: number,
  actor: ActorContext,
): void {
  void emitCanonical({
    courtDayId,
    type: CourtEventType.CASE_DELAY_ADDED,
    payload: { caseId, minutes },
    actor,
  });
}

/**
 * Bridge: courtday.judge_rose → COURT_ROSE
 */
export function bridgeCourtRose(
  courtDayId: string,
  actor: ActorContext,
): void {
  void emitCanonical({
    courtDayId,
    type: CourtEventType.COURT_ROSE,
    payload: {},
    actor,
  });
}

/**
 * Bridge: courtday.resumed → COURT_RESUMED
 */
export function bridgeCourtResumed(
  courtDayId: string,
  actor: ActorContext,
): void {
  void emitCanonical({
    courtDayId,
    type: CourtEventType.COURT_RESUMED,
    payload: {},
    actor,
  });
}
