/**
 * Canonical event types for the CourtCall event contract (LOCKED SPEC).
 *
 * These map to the canonical event types used in the spec.
 * The event store uses ListUpdate and CourtDayUpdate tables with
 * sequence numbers sourced from CourtDay.lastSequence.
 */

export const CourtEventType = {
  CASE_STARTED: 'CASE_STARTED',
  CASE_COMPLETED: 'CASE_COMPLETED',
  CASE_ADJOURNED: 'CASE_ADJOURNED',
  CASE_NOT_BEFORE_SET: 'CASE_NOT_BEFORE_SET',
  CASE_DELAY_ADDED: 'CASE_DELAY_ADDED',
  COURT_ROSE: 'COURT_ROSE',
  COURT_RESUMED: 'COURT_RESUMED',
  UNDO_APPLIED: 'UNDO_APPLIED',
} as const;
export type CourtEventType = (typeof CourtEventType)[keyof typeof CourtEventType];

// ─── Payload Definitions ──────────────────────────────────────────────────────

export interface CaseStartedPayload {
  caseId: string;
}

export interface CaseCompletedPayload {
  caseId: string;
  outcomeCode?: string;
}

export interface CaseAdjournedPayload {
  caseId: string;
  adjournedTo: string;
}

export interface CaseNotBeforeSetPayload {
  caseId: string;
  notBefore: string;
}

export interface CaseDelayAddedPayload {
  caseId: string;
  minutes: number;
}

export type CourtRosePayload = Record<string, never>;
export type CourtResumedPayload = Record<string, never>;

export interface UndoAppliedPayload {
  targetEventId: string;
  reversedEventType: CourtEventType;
}

export type CourtEventPayload =
  | CaseStartedPayload
  | CaseCompletedPayload
  | CaseAdjournedPayload
  | CaseNotBeforeSetPayload
  | CaseDelayAddedPayload
  | CourtRosePayload
  | CourtResumedPayload
  | UndoAppliedPayload;

// ─── Unified Event Record ─────────────────────────────────────────────────────

export interface CourtEvent {
  id: string;
  courtDayId: string;
  sequence: number;
  createdAt: string;
  type: CourtEventType;
  payload: CourtEventPayload;
  causedBy: {
    userId: string | null;
    role: 'REGISTRAR' | 'SYSTEM';
  };
  idempotencyKey?: string;
}

// ─── Projection Types ─────────────────────────────────────────────────────────

export type CourtDayLiveStatus = 'LIVE' | 'ROSE' | 'CLOSED';

export interface ProjectedCourtDay {
  id: string;
  status: CourtDayLiveStatus;
  lastSequence: number;
  judgeName: string;
  courtroom: string;
}

export interface ProjectedCase {
  id: string;
  status: 'WAITING' | 'ACTIVE' | 'COMPLETED' | 'ADJOURNED' | 'NOT_BEFORE';
  outcomeCode?: string;
  notBefore?: string;
  adjournedTo?: string;
  delayMinutes: number;
  undone: boolean;
}

export interface CourtDaySnapshot {
  courtDay: ProjectedCourtDay;
  cases: ProjectedCase[];
  serverTime: string;
}
