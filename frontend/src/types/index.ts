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

// ---- Matter types ----
export type MatterType =
  | 'mention'
  | 'bail'
  | 'hearing'
  | 'consent'
  | 'directions'
  | 'sentence'
  | 'application'
  | 'review'
  | 'other';

// ---- Domain models ----
export interface CourtCase {
  id: string;
  courtDayId: string;
  position: number;
  caseName: string;           // deprecated — use caseTitleFull / caseTitlePublic
  caseTitleFull: string;      // 6.5: full party names (registrar only)
  caseTitlePublic: string;    // 6.5: privacy-safe title (public view)
  caseNumber?: string;
  matterType?: MatterType;    // e.g. mention, bail, hearing, consent
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

// ---- Snapshot includes its own sequence ----
export interface CourtDay {
  id: string;
  courtName: string;
  courtRoom?: string;
  judgeName: string;
  date: string;
  status: CourtDayStatus;
  statusMessage?: string;
  resumeTime?: string;
  currentCaseId?: string;
  lastSequence: number;       // 6.1: monotonic event sequence watermark
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
  id: string;                 // unique event id
  sequence: number;           // monotonic per courtDay
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

// ---- Undo: event-based, not payload-based ----
export interface LastAction {
  eventId: string;            // (B) The backend event ID to reverse
  actionType: string;
  caseId: string;
  timestamp: number;
}
