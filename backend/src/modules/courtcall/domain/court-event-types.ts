/**
 * Canonical event types for the CourtCall event contract (LOCKED SPEC).
 *
 * This is a CLOSED SET. No dynamic types. No extensions without migration.
 * Every event in the CourtEvent table must be one of these types.
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

// ─── Payload Definitions (Deterministic) ──────────────────────────────────────

export interface CaseStartedPayload {
  caseId: string;
}

export interface CaseCompletedPayload {
  caseId: string;
  outcomeCode?: string;
}

export interface CaseAdjournedPayload {
  caseId: string;
  adjournedTo: string; // ISO datetime
}

export interface CaseNotBeforeSetPayload {
  caseId: string;
  notBefore: string; // ISO datetime
}

export interface CaseDelayAddedPayload {
  caseId: string;
  minutes: number;
}

// COURT_ROSE and COURT_RESUMED have empty payloads
export type CourtRosePayload = Record<string, never>;
export type CourtResumedPayload = Record<string, never>;

export interface UndoAppliedPayload {
  targetEventId: string;
  reversedEventType: CourtEventType;
}

// Union of all event payloads
export type CourtEventPayload =
  | CaseStartedPayload
  | CaseCompletedPayload
  | CaseAdjournedPayload
  | CaseNotBeforeSetPayload
  | CaseDelayAddedPayload
  | CourtRosePayload
  | CourtResumedPayload
  | UndoAppliedPayload;

// ─── CourtEvent Structure (Canonical) ─────────────────────────────────────────

export interface CourtEvent {
  id: string;
  courtDayId: string;
  sequence: number;
  createdAt: string; // ISO timestamp (server time)
  type: CourtEventType;
  payload: CourtEventPayload;
  causedBy: {
    userId: string | null;
    role: 'REGISTRAR' | 'SYSTEM';
  };
  idempotencyKey?: string;
}

// ─── Court Status for Projection ──────────────────────────────────────────────

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
  serverTime: string; // ISO (MANDATORY)
}
