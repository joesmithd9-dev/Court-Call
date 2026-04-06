import { CourtEventType } from '../domain/court-event-types.js';
import type {
  CourtEvent,
  CourtDayLiveStatus,
  ProjectedCase,
  CaseStartedPayload,
  CaseCompletedPayload,
  CaseAdjournedPayload,
  CaseNotBeforeSetPayload,
  CaseDelayAddedPayload,
  UndoAppliedPayload,
} from '../domain/court-event-types.js';

/**
 * Projection Engine (State Builder)
 *
 * Rule: State = pure function of events
 *   state = events.reduce(reducer, initialState)
 *
 * Required Invariants:
 *   (A) Single Active Case: activeCases.length <= 1
 *   (B) Time Monotonicity: predicted times never decrease
 *   (C) Court Status Lock: If court.status === 'ROSE', no CASE_* events allowed
 */

// ─── Projection State ───────────────────────────────────────────────────────

export interface ProjectionState {
  courtDayStatus: CourtDayLiveStatus;
  lastSequence: number;
  cases: Map<string, ProjectedCase>;
  undoneEventIds: Set<string>;
}

function initialState(): ProjectionState {
  return {
    courtDayStatus: 'LIVE',
    lastSequence: 0,
    cases: new Map(),
    undoneEventIds: new Set(),
  };
}

// ─── Ensure Case Exists ─────────────────────────────────────────────────────

function ensureCase(state: ProjectionState, caseId: string): ProjectedCase {
  let c = state.cases.get(caseId);
  if (!c) {
    c = {
      id: caseId,
      status: 'WAITING',
      delayMinutes: 0,
      undone: false,
    };
    state.cases.set(caseId, c);
  }
  return c;
}

// ─── Reducer ────────────────────────────────────────────────────────────────

function applyEvent(state: ProjectionState, event: CourtEvent): ProjectionState {
  state.lastSequence = event.sequence;

  switch (event.type) {
    case CourtEventType.CASE_STARTED: {
      const payload = event.payload as CaseStartedPayload;
      const c = ensureCase(state, payload.caseId);
      c.status = 'ACTIVE';
      c.undone = false;
      break;
    }

    case CourtEventType.CASE_COMPLETED: {
      const payload = event.payload as CaseCompletedPayload;
      const c = ensureCase(state, payload.caseId);
      c.status = 'COMPLETED';
      c.outcomeCode = payload.outcomeCode;
      break;
    }

    case CourtEventType.CASE_ADJOURNED: {
      const payload = event.payload as CaseAdjournedPayload;
      const c = ensureCase(state, payload.caseId);
      c.status = 'ADJOURNED';
      c.adjournedTo = payload.adjournedTo;
      break;
    }

    case CourtEventType.CASE_NOT_BEFORE_SET: {
      const payload = event.payload as CaseNotBeforeSetPayload;
      const c = ensureCase(state, payload.caseId);
      c.status = 'NOT_BEFORE';
      c.notBefore = payload.notBefore;
      break;
    }

    case CourtEventType.CASE_DELAY_ADDED: {
      const payload = event.payload as CaseDelayAddedPayload;
      const c = ensureCase(state, payload.caseId);
      c.delayMinutes += payload.minutes;
      break;
    }

    case CourtEventType.COURT_ROSE: {
      state.courtDayStatus = 'ROSE';
      break;
    }

    case CourtEventType.COURT_RESUMED: {
      state.courtDayStatus = 'LIVE';
      break;
    }

    case CourtEventType.UNDO_APPLIED: {
      const payload = event.payload as UndoAppliedPayload;
      state.undoneEventIds.add(payload.targetEventId);
      break;
    }
  }

  return state;
}

/**
 * Apply UNDO_APPLIED events by rebuilding state from scratch,
 * skipping any events that have been undone.
 *
 * This is the correct implementation per the spec:
 *   "Projection engine must: Locate E1, Apply inverse logic, Continue forward"
 *
 * We achieve this by replaying all events, skipping undone ones.
 */
function buildWithUndos(events: CourtEvent[]): ProjectionState {
  // First pass: collect all undone event IDs
  const undoneIds = new Set<string>();
  for (const event of events) {
    if (event.type === CourtEventType.UNDO_APPLIED) {
      const payload = event.payload as UndoAppliedPayload;
      undoneIds.add(payload.targetEventId);
    }
  }

  // Second pass: replay all events, skipping undone ones (but always apply UNDO_APPLIED)
  let state = initialState();
  for (const event of events) {
    if (undoneIds.has(event.id) && event.type !== CourtEventType.UNDO_APPLIED) {
      // This event has been undone — skip it
      state.lastSequence = event.sequence;
      continue;
    }
    state = applyEvent(state, event);
  }

  state.undoneEventIds = undoneIds;
  return state;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Build projection state from a list of events.
 * State = pure function of events.
 *
 * events MUST be sorted by sequence (ascending).
 */
export function buildProjection(events: CourtEvent[]): ProjectionState {
  return buildWithUndos(events);
}

/**
 * Get the current court day status from projection.
 */
export function getCourtDayStatus(events: CourtEvent[]): CourtDayLiveStatus {
  return buildProjection(events).courtDayStatus;
}

/**
 * Get all projected cases from events.
 */
export function getProjectedCases(events: CourtEvent[]): ProjectedCase[] {
  const state = buildProjection(events);
  return [...state.cases.values()];
}

/**
 * Get active cases (should be at most 1 per invariant).
 */
export function getActiveCases(events: CourtEvent[]): ProjectedCase[] {
  return getProjectedCases(events).filter(
    (c) => c.status === 'ACTIVE' && !c.undone,
  );
}
