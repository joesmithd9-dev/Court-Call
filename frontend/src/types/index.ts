// ---- Case statuses ----
export type CaseStatus =
  | 'pending'
  | 'calling'
  | 'hearing'
  | 'adjourned'
  | 'stood_down'
  | 'not_before'
  | 'concluded'
  | 'vacated';

// ---- Court day statuses ----
export type CourtDayStatus =
  | 'scheduled'
  | 'live'
  | 'judge_rose'
  | 'at_lunch'
  | 'adjourned'
  | 'ended';

// ---- Domain models ----
export interface CourtCase {
  id: string;
  courtDayId: string;
  position: number;
  caseName: string;
  caseNumber?: string;
  status: CaseStatus;
  scheduledTime?: string;
  startedAt?: string;
  estimatedMinutes?: number;
  predictedStartTime?: string;
  notBeforeTime?: string;
  adjournedToTime?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CourtDay {
  id: string;
  courtName: string;
  courtRoom?: string;
  judgeName: string;
  date: string;
  status: CourtDayStatus;
  statusMessage?: string; // e.g. "Back at 14:15"
  resumeTime?: string;
  currentCaseId?: string;
  cases: CourtCase[];
  createdAt: string;
  updatedAt: string;
}

// ---- SSE event envelope ----
export type SSEEventType =
  | 'court_day_updated'
  | 'case_updated'
  | 'case_reordered'
  | 'case_added'
  | 'case_removed'
  | 'heartbeat';

export interface SSEEvent {
  type: SSEEventType;
  data: Partial<CourtDay> & {
    case?: CourtCase;
    cases?: CourtCase[];
  };
  timestamp: string;
}

// ---- Registrar action payloads ----
export interface UpdateCasePayload {
  status?: CaseStatus;
  estimatedMinutes?: number;
  notBeforeTime?: string;
  adjournedToTime?: string;
  note?: string;
}

export interface UpdateCourtDayPayload {
  status?: CourtDayStatus;
  statusMessage?: string;
  resumeTime?: string;
  currentCaseId?: string;
}

export interface ReorderPayload {
  caseId: string;
  newPosition: number;
}
