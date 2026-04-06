import { CourtEventType } from '../domain/court-event-types.js';
import type {
  CourtEvent,
  CaseStartedPayload,
  CaseCompletedPayload,
  UndoAppliedPayload,
  ProjectedCase,
  CourtDayLiveStatus,
} from '../domain/court-event-types.js';

/**
 * Event validation layer (MANDATORY).
 *
 * Before writing any event, the validator checks business invariants
 * derived from the current projection. This prevents invalid state
 * transitions at the event level.
 */

export class EventValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EventValidationError';
  }
}

interface ValidationContext {
  courtDayStatus: CourtDayLiveStatus;
  cases: ProjectedCase[];
  events: CourtEvent[];
}

/**
 * Validate an event before it is written to the store.
 * Throws EventValidationError if the event violates invariants.
 */
export function validateEvent(
  type: CourtEventType,
  payload: Record<string, unknown>,
  ctx: ValidationContext,
): void {
  // ── Court status lock: No CASE_* events when court is ROSE ──────────
  if (type.startsWith('CASE_') && ctx.courtDayStatus === 'ROSE') {
    throw new EventValidationError(
      `Cannot process ${type}: court is currently ROSE. Resume court first.`,
    );
  }

  // ── Court status lock: No events when court is CLOSED ──────────────
  if (ctx.courtDayStatus === 'CLOSED' && type !== 'UNDO_APPLIED') {
    throw new EventValidationError(
      `Cannot process ${type}: court day is CLOSED.`,
    );
  }

  switch (type) {
    case CourtEventType.CASE_STARTED:
      validateCaseStarted(payload as unknown as CaseStartedPayload, ctx);
      break;

    case CourtEventType.CASE_COMPLETED:
      validateCaseCompleted(payload as unknown as CaseCompletedPayload, ctx);
      break;

    case CourtEventType.CASE_ADJOURNED:
      validateCaseActive(payload as { caseId: string }, ctx, 'CASE_ADJOURNED');
      break;

    case CourtEventType.CASE_NOT_BEFORE_SET:
      validateCaseExists(payload as { caseId: string }, ctx, 'CASE_NOT_BEFORE_SET');
      break;

    case CourtEventType.CASE_DELAY_ADDED:
      validateCaseExists(payload as { caseId: string }, ctx, 'CASE_DELAY_ADDED');
      break;

    case CourtEventType.COURT_ROSE:
      validateCourtRose(ctx);
      break;

    case CourtEventType.COURT_RESUMED:
      validateCourtResumed(ctx);
      break;

    case CourtEventType.UNDO_APPLIED:
      validateUndo(payload as unknown as UndoAppliedPayload, ctx);
      break;
  }
}

// ─── Per-Type Validators ────────────────────────────────────────────────────

function validateCaseStarted(
  payload: CaseStartedPayload,
  ctx: ValidationContext,
): void {
  // Single active case invariant: activeCases.length <= 1
  const activeCases = ctx.cases.filter((c) => c.status === 'ACTIVE' && !c.undone);
  if (activeCases.length > 0) {
    throw new EventValidationError(
      `Cannot start case ${payload.caseId}: another case is already ACTIVE (${activeCases[0].id}). Complete or adjourn it first.`,
    );
  }

  // Case must exist and be in a startable state
  const targetCase = ctx.cases.find((c) => c.id === payload.caseId);
  if (targetCase && targetCase.status === 'COMPLETED') {
    throw new EventValidationError(
      `Cannot start case ${payload.caseId}: case is already COMPLETED.`,
    );
  }
  if (targetCase && targetCase.status === 'ADJOURNED') {
    throw new EventValidationError(
      `Cannot start case ${payload.caseId}: case is ADJOURNED.`,
    );
  }
}

function validateCaseCompleted(
  payload: CaseCompletedPayload,
  ctx: ValidationContext,
): void {
  // Case must be ACTIVE to complete
  const targetCase = ctx.cases.find((c) => c.id === payload.caseId);
  if (!targetCase || targetCase.status !== 'ACTIVE' || targetCase.undone) {
    throw new EventValidationError(
      `Cannot complete case ${payload.caseId}: case is not ACTIVE.`,
    );
  }
}

function validateCaseActive(
  payload: { caseId: string },
  ctx: ValidationContext,
  eventType: string,
): void {
  const targetCase = ctx.cases.find((c) => c.id === payload.caseId);
  if (!targetCase || targetCase.status !== 'ACTIVE' || targetCase.undone) {
    throw new EventValidationError(
      `Cannot process ${eventType} for case ${payload.caseId}: case is not ACTIVE.`,
    );
  }
}

function validateCaseExists(
  payload: { caseId: string },
  ctx: ValidationContext,
  eventType: string,
): void {
  const targetCase = ctx.cases.find((c) => c.id === payload.caseId);
  if (targetCase && (targetCase.status === 'COMPLETED' || targetCase.status === 'ADJOURNED') && !targetCase.undone) {
    throw new EventValidationError(
      `Cannot process ${eventType} for case ${payload.caseId}: case is in terminal state ${targetCase.status}.`,
    );
  }
}

function validateCourtRose(ctx: ValidationContext): void {
  if (ctx.courtDayStatus === 'ROSE') {
    throw new EventValidationError('Court has already risen. Cannot rise again.');
  }
  if (ctx.courtDayStatus === 'CLOSED') {
    throw new EventValidationError('Court day is CLOSED. Cannot rise.');
  }
}

function validateCourtResumed(ctx: ValidationContext): void {
  if (ctx.courtDayStatus !== 'ROSE') {
    throw new EventValidationError(
      `Cannot resume court: current status is ${ctx.courtDayStatus}, expected ROSE.`,
    );
  }
}

function validateUndo(
  payload: UndoAppliedPayload,
  ctx: ValidationContext,
): void {
  // Target event must exist
  const targetEvent = ctx.events.find((e) => e.id === payload.targetEventId);
  if (!targetEvent) {
    throw new EventValidationError(
      `Cannot undo: target event ${payload.targetEventId} not found.`,
    );
  }

  // Target event must not already be undone
  const alreadyUndone = ctx.events.some(
    (e) =>
      e.type === CourtEventType.UNDO_APPLIED &&
      (e.payload as UndoAppliedPayload).targetEventId === payload.targetEventId,
  );
  if (alreadyUndone) {
    throw new EventValidationError(
      `Cannot undo: event ${payload.targetEventId} has already been undone.`,
    );
  }

  // Reversed event type must match target
  if (targetEvent.type !== payload.reversedEventType) {
    throw new EventValidationError(
      `Cannot undo: reversedEventType ${payload.reversedEventType} does not match target event type ${targetEvent.type}.`,
    );
  }
}
