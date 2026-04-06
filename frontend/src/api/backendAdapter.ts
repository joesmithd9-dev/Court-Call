/**
 * Backend Adapter
 *
 * Transforms the original Fastify backend response shapes into the frontend's
 * internal type contract. This is the single translation boundary between
 * the two systems.
 *
 * Original backend uses:
 *   - Uppercase enums (WAITING, HEARING, CALLING, etc.)
 *   - { banner, listItems, activeItem, nextCallableItems } snapshot shape
 *   - queuePosition, estimatedDurationMinutes, adjournedUntil, partiesShort
 *   - { success, eventId, eventType } command responses
 *   - Named SSE events (event: ITEM_STARTED)
 *
 * Frontend expects:
 *   - Lowercase enums (pending, hearing, calling, etc.)
 *   - { status, cases, currentCaseId, judgeName, ... } flat snapshot
 *   - position, estimatedMinutes, adjournedToTime, caseTitlePublic
 *   - Full CourtDay snapshot from mutations
 *   - Default message SSE events with { id, sequence, type, data }
 */

import type { CourtDay, CourtCase, CaseStatus, CourtDayStatus } from '../types';

// ---- Backend response types (what the original Fastify backend returns) ----

interface BackendListItem {
  id: string;
  queuePosition: number;
  caseName: string;
  caseReference: string;
  partiesShort: string | null;
  status: string; // WAITING, HEARING, etc.
  estimatedDurationMinutes: number | null;
  predictedStartTime: string | null;
  predictedEndTime: string | null;
  actualStartTime: string | null;
  actualEndTime: string | null;
  calledAt: string | null;
  notBeforeTime: string | null;
  adjournedUntil: string | null;
  directionCode: string | null;
  outcomeCode: string | null;
  publicNote: string | null;
  isPriority: boolean;
  // Registrar-only
  internalNote?: string | null;
  stoodDownAt?: string | null;
  restoredAt?: string | null;
  isHiddenFromPublic?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

interface BackendBanner {
  status: string;
  sessionStatus: string;
  sessionMessage: string | null;
  judgeName: string;
  registrarName: string;
  roseAt: string | null;
  expectedResumeAt: string | null;
  resumedAt: string | null;
  startedAt: string | null;
  endedAt?: string | null;
}

interface BackendProjection {
  id: string;
  courtId: string;
  date: string;
  banner: BackendBanner;
  activeItem: BackendListItem | null;
  nextCallableItems: BackendListItem[];
  listItems: BackendListItem[];
}

interface BackendCommandResult {
  success: boolean;
  eventId: string;
  eventType: string;
}

interface BackendSSEEnvelope {
  eventId: string;
  eventType: string;
  courtDayId: string;
  version: number;
  payload: Record<string, unknown>;
}

// ---- Status mapping ----

const STATUS_MAP: Record<string, CaseStatus> = {
  WAITING: 'pending',
  CALLING: 'calling',
  HEARING: 'hearing',
  LET_STAND: 'stood_down',
  NOT_BEFORE: 'not_before',
  STOOD_DOWN: 'stood_down',
  ADJOURNED: 'adjourned',
  PART_HEARD: 'adjourned',
  CONCLUDED: 'concluded',
  SETTLED: 'concluded',
  REMOVED: 'vacated',
};

const SESSION_STATUS_MAP: Record<string, CourtDayStatus> = {
  BEFORE_SITTING: 'scheduled',
  LIVE: 'live',
  JUDGE_RISING_SHORT: 'judge_rose',
  AT_LUNCH: 'at_lunch',
  ADJOURNED_PART_HEARD: 'adjourned',
  FINISHED: 'ended',
};

// ---- Adapters ----

function adaptListItem(item: BackendListItem, courtDayId: string): CourtCase {
  const status = STATUS_MAP[item.status] ?? 'pending';
  return {
    id: item.id,
    courtDayId,
    position: item.queuePosition,
    caseName: item.caseName,
    caseTitleFull: item.caseName + (item.caseReference ? ` [${item.caseReference}]` : ''),
    caseTitlePublic: item.partiesShort ?? item.caseName,
    caseNumber: item.caseReference || undefined,
    status,
    scheduledTime: undefined,
    startedAt: item.actualStartTime ?? undefined,
    estimatedMinutes: item.estimatedDurationMinutes ?? undefined,
    predictedStartTime: item.predictedStartTime ?? undefined,
    notBeforeTime: item.notBeforeTime ?? undefined,
    adjournedToTime: item.adjournedUntil ?? undefined,
    note: item.publicNote ?? item.internalNote ?? undefined,
    createdAt: item.createdAt ?? new Date().toISOString(),
    updatedAt: item.updatedAt ?? new Date().toISOString(),
  };
}

export function adaptProjection(proj: BackendProjection): CourtDay {
  const sessionStatus = SESSION_STATUS_MAP[proj.banner.sessionStatus] ?? 'scheduled';
  const currentCaseId = proj.activeItem?.id ?? undefined;

  return {
    id: proj.id,
    courtName: `Court`, // courtId doesn't carry a name — would need a court lookup
    courtRoom: undefined,
    judgeName: proj.banner.judgeName,
    date: proj.date,
    status: sessionStatus,
    statusMessage: proj.banner.sessionMessage ?? undefined,
    resumeTime: proj.banner.expectedResumeAt ?? undefined,
    currentCaseId,
    lastSequence: 0, // original backend doesn't expose this; SSE uses version field
    cases: proj.listItems.map((item) => adaptListItem(item, proj.id)),
    createdAt: proj.banner.startedAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Adapt a backend command result. Since the original backend returns
 * { success, eventId, eventType } instead of a snapshot, the caller
 * must refetch the snapshot after mutation.
 */
export function isCommandResult(data: unknown): data is BackendCommandResult {
  return (
    typeof data === 'object' &&
    data !== null &&
    'success' in data &&
    'eventId' in data
  );
}

export function getEventIdFromCommandResult(result: BackendCommandResult): string {
  return result.eventId;
}

/**
 * Adapt a backend SSE envelope (named event with {eventType, version, payload})
 * into the frontend's SSEEvent shape ({id, sequence, type, data, timestamp}).
 */
export function adaptSSEEnvelope(envelope: BackendSSEEnvelope) {
  const eventTypeMap: Record<string, string> = {
    COURT_DAY_STARTED: 'court_day_updated',
    COURT_DAY_CLOSED: 'court_day_updated',
    SESSION_RESUMED: 'court_day_updated',
    JUDGE_ROSE: 'court_day_updated',
    ITEM_CREATED: 'case_added',
    ITEM_CALLED: 'case_updated',
    ITEM_STARTED: 'case_updated',
    ITEM_COMPLETED: 'case_updated',
    ITEM_ADJOURNED: 'case_updated',
    ITEM_LET_STAND: 'case_updated',
    ITEM_STOOD_DOWN: 'case_updated',
    ITEM_RESTORED: 'case_updated',
    ITEM_NOT_BEFORE_SET: 'case_updated',
    ITEM_ESTIMATE_CHANGED: 'case_updated',
    ITEM_NOTE_UPDATED: 'case_updated',
    ITEM_REORDERED: 'case_reordered',
    ITEM_REMOVED: 'case_removed',
  };

  return {
    id: envelope.eventId,
    sequence: envelope.version,
    type: eventTypeMap[envelope.eventType] ?? 'court_day_updated',
    timestamp: new Date().toISOString(),
  };
}
