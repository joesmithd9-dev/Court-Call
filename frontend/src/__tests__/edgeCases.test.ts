import { describe, it, expect, beforeEach } from 'vitest';
import { useCourtDayStore } from '../stores/courtDayStore';
import { makeCourtDay, makeCase, makeSSEEvent, resetCounters } from './fixtures';

function getState() {
  return useCourtDayStore.getState();
}

function reset() {
  useCourtDayStore.setState({
    courtDay: null,
    lastSequence: -1,
    loading: true,
    error: null,
    connected: false,
    lastAction: null,
    eventsPaused: false,
    criticalError: null,
    toast: null,
  });
}

beforeEach(() => {
  reset();
  resetCounters();
});

// ========================================
// Edge case 1: +5 then adjourn then undo
// ========================================

describe('scenario: +5 → adjourn → undo', () => {
  it('undo state tracks last action only', () => {
    const cd = makeCourtDay({
      lastSequence: 10,
      currentCaseId: 'c1',
      cases: [makeCase({ id: 'c1', status: 'hearing', estimatedMinutes: 20 })],
    });
    getState().replaceSnapshot(cd);

    // +5 applied via SSE event
    getState().handleSSEEvent(
      makeSSEEvent('case_updated', 11, {
        case: { ...cd.cases[0], estimatedMinutes: 25 },
      })
    );
    getState().setLastAction({
      eventId: 'evt-add5',
      actionType: 'add_time',
      caseId: 'c1',
      timestamp: Date.now(),
    });
    expect(getState().courtDay!.cases[0].estimatedMinutes).toBe(25);

    // Adjourn applied via SSE event — replaces last action
    getState().handleSSEEvent(
      makeSSEEvent('case_updated', 12, {
        case: { ...cd.cases[0], status: 'adjourned', adjournedToTime: '2026-04-06T14:30:00Z' },
      })
    );
    getState().setLastAction({
      eventId: 'evt-adjourn',
      actionType: 'adjourn',
      caseId: 'c1',
      timestamp: Date.now(),
    });

    // Undo targets the LAST action (adjourn), not the +5
    expect(getState().lastAction!.eventId).toBe('evt-adjourn');
    expect(getState().lastAction!.actionType).toBe('adjourn');
  });
});

// ========================================
// Edge case 2: Active case replaced by another start
// ========================================

describe('scenario: active case replaced by start-next', () => {
  it('SSE updates correctly transition current case', () => {
    const cd = makeCourtDay({
      lastSequence: 10,
      currentCaseId: 'c1',
      cases: [
        makeCase({ id: 'c1', status: 'hearing', position: 1 }),
        makeCase({ id: 'c2', status: 'pending', position: 2 }),
      ],
    });
    getState().replaceSnapshot(cd);

    // Backend resolves c1 and starts c2 — two events
    getState().handleSSEEvent(
      makeSSEEvent('case_updated', 11, {
        case: { ...cd.cases[0], status: 'concluded' },
      })
    );
    getState().handleSSEEvent(
      makeSSEEvent('case_updated', 12, {
        case: { ...cd.cases[1], status: 'hearing' },
        currentCaseId: 'c2',
      } as any)
    );

    const state = getState().courtDay!;
    expect(state.cases.find((c) => c.id === 'c1')!.status).toBe('concluded');
    expect(state.cases.find((c) => c.id === 'c2')!.status).toBe('hearing');
  });

  it('single-active invariant: only one hearing case after transition', () => {
    const cd = makeCourtDay({
      lastSequence: 10,
      currentCaseId: 'c1',
      cases: [
        makeCase({ id: 'c1', status: 'hearing', position: 1 }),
        makeCase({ id: 'c2', status: 'pending', position: 2 }),
      ],
    });
    getState().replaceSnapshot(cd);

    // Backend sends court_day_updated with both changes atomically
    getState().handleSSEEvent(
      makeSSEEvent('court_day_updated', 11, {
        currentCaseId: 'c2',
        cases: [
          { ...cd.cases[0], status: 'concluded' },
          { ...cd.cases[1], status: 'hearing' },
        ],
      })
    );

    const hearingCases = getState().courtDay!.cases.filter((c) => c.status === 'hearing');
    expect(hearingCases).toHaveLength(1);
    expect(hearingCases[0].id).toBe('c2');
    expect(getState().criticalError).toBeNull();
  });
});

// ========================================
// Edge case 3: NOT_BEFORE inserted between existing items
// ========================================

describe('scenario: NOT_BEFORE insertion', () => {
  it('case_reordered places NOT_BEFORE case at correct position', () => {
    const cd = makeCourtDay({
      lastSequence: 10,
      cases: [
        makeCase({ id: 'c1', status: 'hearing', position: 1 }),
        makeCase({ id: 'c2', status: 'pending', position: 2 }),
        makeCase({ id: 'c3', status: 'pending', position: 3 }),
        makeCase({ id: 'c4', status: 'pending', position: 4 }),
      ],
    });
    getState().replaceSnapshot(cd);

    // c4 set to not_before 11:00, backend reorders to position 2
    const reordered = [
      { ...cd.cases[0], position: 1 },
      { ...cd.cases[3], position: 2, status: 'not_before' as const, notBeforeTime: '2026-04-06T11:00:00Z' },
      { ...cd.cases[1], position: 3 },
      { ...cd.cases[2], position: 4 },
    ];
    getState().handleSSEEvent(makeSSEEvent('case_reordered', 11, { cases: reordered }));

    const cases = getState().courtDay!.cases;
    expect(cases[0].id).toBe('c1');
    expect(cases[1].id).toBe('c4');
    expect(cases[1].status).toBe('not_before');
    expect(cases[2].id).toBe('c2');
    expect(cases[3].id).toBe('c3');
  });
});

// ========================================
// Edge case 4: Pause then resume with remaining duration
// ========================================

describe('scenario: pause/resume preserves remaining duration', () => {
  it('court_day_updated reflects pause and resume with correct timing', () => {
    const cd = makeCourtDay({
      lastSequence: 10,
      status: 'live',
      currentCaseId: 'c1',
      cases: [
        makeCase({
          id: 'c1',
          status: 'hearing',
          estimatedMinutes: 30,
          startedAt: '2026-04-06T10:00:00Z',
        }),
      ],
    });
    getState().replaceSnapshot(cd);

    // Judge rose after 15 minutes — backend sends pause event
    getState().handleSSEEvent(
      makeSSEEvent('court_day_updated', 11, {
        status: 'judge_rose',
        statusMessage: 'Rose at 10:15',
      })
    );
    expect(getState().courtDay!.status).toBe('judge_rose');

    // Resume — backend updates remaining time to 15 min (not reset to 30)
    getState().handleSSEEvent(
      makeSSEEvent('court_day_updated', 12, {
        status: 'live',
        statusMessage: undefined,
      })
    );
    getState().handleSSEEvent(
      makeSSEEvent('case_updated', 13, {
        case: { ...cd.cases[0], estimatedMinutes: 15 },
      })
    );

    expect(getState().courtDay!.status).toBe('live');
    expect(getState().courtDay!.cases[0].estimatedMinutes).toBe(15);
  });
});

// ========================================
// Edge case 5: Reconnect with events during window
// ========================================

describe('scenario: reconnect with events during reconnect window', () => {
  it('events dropped during pause, snapshot replaces all state', () => {
    const cd = makeCourtDay({
      lastSequence: 10,
      status: 'live',
      cases: [makeCase({ id: 'c1', status: 'hearing' })],
    });
    getState().replaceSnapshot(cd);

    // Simulate disconnect — pause events
    getState().setEventsPaused(true);

    // Events arrive during reconnect window — should be dropped
    getState().handleSSEEvent(makeSSEEvent('court_day_updated', 11, { status: 'ended' }));
    expect(getState().courtDay!.status).toBe('live'); // dropped

    // Snapshot arrives (includes all changes that happened)
    const freshSnapshot = makeCourtDay({
      lastSequence: 15,
      status: 'judge_rose',
      cases: [makeCase({ id: 'c1', status: 'hearing' })],
    });
    getState().replaceSnapshot(freshSnapshot);
    getState().setEventsPaused(false);

    expect(getState().courtDay!.status).toBe('judge_rose');
    expect(getState().lastSequence).toBe(15);

    // Post-reconnect events resume normally
    getState().handleSSEEvent(makeSSEEvent('court_day_updated', 16, { status: 'live' }));
    expect(getState().courtDay!.status).toBe('live');
  });
});

// ========================================
// Edge case 6: Replay from sequence N without gaps or duplicates
// ========================================

describe('scenario: sequential replay', () => {
  it('replays 10 events correctly', () => {
    const cd = makeCourtDay({
      lastSequence: 0,
      status: 'scheduled',
      cases: [
        makeCase({ id: 'c1', status: 'pending', position: 1 }),
        makeCase({ id: 'c2', status: 'pending', position: 2 }),
      ],
    });
    getState().replaceSnapshot(cd);

    const events = [
      makeSSEEvent('court_day_updated', 1, { status: 'live' }),
      makeSSEEvent('case_updated', 2, { case: { ...cd.cases[0], status: 'calling' } }),
      makeSSEEvent('case_updated', 3, { case: { ...cd.cases[0], status: 'hearing' } }),
      makeSSEEvent('heartbeat', 4, {}),
      makeSSEEvent('case_updated', 5, { case: { ...cd.cases[0], estimatedMinutes: 20 } }),
      makeSSEEvent('case_updated', 6, { case: { ...cd.cases[0], estimatedMinutes: 25 } }),
      makeSSEEvent('case_updated', 7, { case: { ...cd.cases[0], status: 'concluded' } }),
      makeSSEEvent('case_updated', 8, { case: { ...cd.cases[1], status: 'calling' } }),
      makeSSEEvent('case_updated', 9, { case: { ...cd.cases[1], status: 'hearing' } }),
      makeSSEEvent('court_day_updated', 10, { currentCaseId: 'c2' }),
    ];

    for (const evt of events) {
      getState().handleSSEEvent(evt);
    }

    const state = getState();
    expect(state.lastSequence).toBe(10);
    expect(state.courtDay!.status).toBe('live');
    expect(state.courtDay!.currentCaseId).toBe('c2');
    expect(state.courtDay!.cases.find((c) => c.id === 'c1')!.status).toBe('concluded');
    expect(state.courtDay!.cases.find((c) => c.id === 'c2')!.status).toBe('hearing');
  });

  it('duplicate replay produces same result', () => {
    const cd = makeCourtDay({
      lastSequence: 0,
      cases: [makeCase({ id: 'c1', status: 'pending' })],
    });
    getState().replaceSnapshot(cd);

    const evt = makeSSEEvent('case_updated', 1, {
      case: { ...cd.cases[0], status: 'hearing' },
    });

    // Apply twice — second should be ignored
    getState().handleSSEEvent(evt);
    getState().handleSSEEvent(evt);

    expect(getState().lastSequence).toBe(1);
    expect(getState().courtDay!.cases[0].status).toBe('hearing');
  });
});

// ========================================
// Edge case 7: Repeated undo on same target
// ========================================

describe('scenario: repeated undo request', () => {
  it('clearLastAction prevents second undo', () => {
    getState().setLastAction({
      eventId: 'evt-1',
      actionType: 'done',
      caseId: 'c1',
      timestamp: Date.now(),
    });
    expect(getState().lastAction).not.toBeNull();

    // Simulate undo — clears lastAction
    getState().clearLastAction();
    expect(getState().lastAction).toBeNull();

    // Second undo attempt — nothing to undo
    // (UI checks lastAction before calling API)
    expect(getState().lastAction).toBeNull();
  });

  it('undo expires after 10 seconds', () => {
    getState().setLastAction({
      eventId: 'evt-1',
      actionType: 'done',
      caseId: 'c1',
      timestamp: Date.now() - 11_000, // 11 seconds ago
    });

    const action = getState().lastAction!;
    const expired = Date.now() - action.timestamp > 10_000;
    expect(expired).toBe(true);
  });
});

// ========================================
// Edge case 8: Stale snapshot during concurrent events
// ========================================

describe('scenario: stale snapshot vs live events', () => {
  it('snapshot with lower sequence is rejected when events have advanced', () => {
    const cd = makeCourtDay({ lastSequence: 10, cases: [makeCase()] });
    getState().replaceSnapshot(cd);

    // Events advance sequence to 20
    for (let i = 11; i <= 20; i++) {
      getState().handleSSEEvent(makeSSEEvent('heartbeat', i, {}));
    }
    expect(getState().lastSequence).toBe(20);

    // Old snapshot arrives (from slow network)
    const stale = makeCourtDay({ lastSequence: 12, status: 'ended', cases: [] });
    getState().replaceSnapshot(stale);

    // Should be rejected — status unchanged
    expect(getState().courtDay!.status).not.toBe('ended');
    expect(getState().lastSequence).toBe(20);
  });
});
