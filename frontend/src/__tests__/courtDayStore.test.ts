import { describe, it, expect, beforeEach } from 'vitest';
import { useCourtDayStore } from '../stores/courtDayStore';
import { makeCourtDay, makeCase, makeSSEEvent, makeLiveCourtDay, resetCounters } from './fixtures';

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
// A. Snapshot replacement + stale guard
// ========================================

describe('replaceSnapshot', () => {
  it('replaces state from null', () => {
    const cd = makeLiveCourtDay(3);
    getState().replaceSnapshot(cd);
    expect(getState().courtDay).toBe(cd);
    expect(getState().lastSequence).toBe(10);
    expect(getState().loading).toBe(false);
  });

  it('rejects stale snapshot (lower sequence than current)', () => {
    const cd1 = makeCourtDay({ lastSequence: 20, cases: [makeCase()] });
    getState().replaceSnapshot(cd1);
    expect(getState().lastSequence).toBe(20);

    // Stale snapshot with lower sequence
    const cd2 = makeCourtDay({ lastSequence: 15, cases: [makeCase()] });
    getState().replaceSnapshot(cd2);

    // State should NOT have changed
    expect(getState().lastSequence).toBe(20);
    expect(getState().courtDay).toBe(cd1);
  });

  it('accepts snapshot with equal sequence', () => {
    const cd1 = makeCourtDay({ lastSequence: 20, cases: [makeCase()] });
    getState().replaceSnapshot(cd1);

    const cd2 = makeCourtDay({ lastSequence: 20, cases: [makeCase(), makeCase()] });
    getState().replaceSnapshot(cd2);

    // Equal sequence should be accepted (fresh snapshot from same point)
    expect(getState().courtDay).toBe(cd2);
  });

  it('accepts snapshot with higher sequence', () => {
    const cd1 = makeCourtDay({ lastSequence: 20, cases: [] });
    getState().replaceSnapshot(cd1);

    const cd2 = makeCourtDay({ lastSequence: 25, cases: [makeCase()] });
    getState().replaceSnapshot(cd2);

    expect(getState().lastSequence).toBe(25);
    expect(getState().courtDay).toBe(cd2);
  });

  it('detects multiple hearing cases (critical error)', () => {
    const cd = makeCourtDay({
      lastSequence: 5,
      cases: [
        makeCase({ status: 'hearing' }),
        makeCase({ status: 'hearing' }),
      ],
    });
    getState().replaceSnapshot(cd);
    expect(getState().criticalError).toMatch(/CRITICAL/);
    expect(getState().criticalError).toMatch(/2 cases/);
  });

  it('clears critical error when invariant is satisfied', () => {
    // First set a critical error
    const cd1 = makeCourtDay({
      lastSequence: 5,
      cases: [makeCase({ status: 'hearing' }), makeCase({ status: 'hearing' })],
    });
    getState().replaceSnapshot(cd1);
    expect(getState().criticalError).not.toBeNull();

    // Now replace with valid state
    const cd2 = makeCourtDay({
      lastSequence: 10,
      cases: [makeCase({ status: 'hearing' }), makeCase({ status: 'pending' })],
    });
    getState().replaceSnapshot(cd2);
    expect(getState().criticalError).toBeNull();
  });
});

// ========================================
// B. SSE Event sequencing
// ========================================

describe('handleSSEEvent — sequencing', () => {
  beforeEach(() => {
    const cd = makeLiveCourtDay(3);
    getState().replaceSnapshot(cd);
  });

  it('applies event with sequence > lastSequence', () => {
    const evt = makeSSEEvent('court_day_updated', 11, { status: 'judge_rose' });
    getState().handleSSEEvent(evt);
    expect(getState().courtDay!.status).toBe('judge_rose');
    expect(getState().lastSequence).toBe(11);
  });

  it('rejects event with sequence === lastSequence (duplicate)', () => {
    const evt = makeSSEEvent('court_day_updated', 10, { status: 'ended' });
    getState().handleSSEEvent(evt);
    expect(getState().courtDay!.status).toBe('live'); // unchanged
    expect(getState().lastSequence).toBe(10);
  });

  it('rejects event with sequence < lastSequence (out of order)', () => {
    const evt = makeSSEEvent('court_day_updated', 5, { status: 'ended' });
    getState().handleSSEEvent(evt);
    expect(getState().courtDay!.status).toBe('live'); // unchanged
  });

  it('applies sequential events in order', () => {
    getState().handleSSEEvent(makeSSEEvent('court_day_updated', 11, { status: 'judge_rose' }));
    getState().handleSSEEvent(makeSSEEvent('court_day_updated', 12, { status: 'live' }));
    expect(getState().courtDay!.status).toBe('live');
    expect(getState().lastSequence).toBe(12);
  });

  it('handles gap in sequence (events 11, 15 — applies both)', () => {
    getState().handleSSEEvent(makeSSEEvent('court_day_updated', 11, { status: 'judge_rose' }));
    getState().handleSSEEvent(makeSSEEvent('court_day_updated', 15, { status: 'at_lunch' }));
    expect(getState().courtDay!.status).toBe('at_lunch');
    expect(getState().lastSequence).toBe(15);
  });

  it('drops events when eventsPaused is true', () => {
    getState().setEventsPaused(true);
    getState().handleSSEEvent(makeSSEEvent('court_day_updated', 11, { status: 'ended' }));
    expect(getState().courtDay!.status).toBe('live'); // unchanged
    expect(getState().lastSequence).toBe(10); // unchanged
  });

  it('resumes processing after eventsPaused cleared', () => {
    getState().setEventsPaused(true);
    getState().handleSSEEvent(makeSSEEvent('court_day_updated', 11, { status: 'ended' }));
    getState().setEventsPaused(false);
    getState().handleSSEEvent(makeSSEEvent('court_day_updated', 12, { status: 'judge_rose' }));
    expect(getState().courtDay!.status).toBe('judge_rose');
    expect(getState().lastSequence).toBe(12);
  });

  it('ignores events when courtDay is null', () => {
    reset();
    getState().handleSSEEvent(makeSSEEvent('court_day_updated', 1, { status: 'ended' }));
    expect(getState().courtDay).toBeNull();
  });
});

// ========================================
// C. SSE Event types
// ========================================

describe('handleSSEEvent — event types', () => {
  beforeEach(() => {
    const cd = makeLiveCourtDay(3);
    getState().replaceSnapshot(cd);
  });

  it('court_day_updated: updates top-level fields', () => {
    getState().handleSSEEvent(
      makeSSEEvent('court_day_updated', 11, { statusMessage: 'Back at 14:15' })
    );
    expect(getState().courtDay!.statusMessage).toBe('Back at 14:15');
    // Cases unchanged
    expect(getState().courtDay!.cases).toHaveLength(3);
  });

  it('case_updated: updates matching case', () => {
    const caseId = getState().courtDay!.cases[1].id;
    getState().handleSSEEvent(
      makeSSEEvent('case_updated', 11, {
        case: { ...getState().courtDay!.cases[1], status: 'calling', note: 'Calling now' },
      })
    );
    const updated = getState().courtDay!.cases.find((c) => c.id === caseId)!;
    expect(updated.status).toBe('calling');
    expect(updated.note).toBe('Calling now');
  });

  it('case_updated: ignores if no case in data', () => {
    const before = getState().courtDay;
    getState().handleSSEEvent(makeSSEEvent('case_updated', 11, {}));
    expect(getState().courtDay).toBe(before);
    expect(getState().lastSequence).toBe(10); // NOT advanced — returns early
  });

  it('case_added: appends new case', () => {
    const newCase = makeCase({ id: 'new-case', position: 4, status: 'pending' });
    getState().handleSSEEvent(makeSSEEvent('case_added', 11, { case: newCase }));
    expect(getState().courtDay!.cases).toHaveLength(4);
    expect(getState().courtDay!.cases[3].id).toBe('new-case');
  });

  it('case_removed: removes case', () => {
    const removedId = getState().courtDay!.cases[2].id;
    getState().handleSSEEvent(
      makeSSEEvent('case_removed', 11, { case: { id: removedId } as any })
    );
    expect(getState().courtDay!.cases).toHaveLength(2);
    expect(getState().courtDay!.cases.find((c) => c.id === removedId)).toBeUndefined();
  });

  it('case_reordered: replaces entire case array', () => {
    const reordered = [...getState().courtDay!.cases].reverse();
    getState().handleSSEEvent(makeSSEEvent('case_reordered', 11, { cases: reordered }));
    expect(getState().courtDay!.cases[0].id).toBe(reordered[0].id);
  });

  it('heartbeat: advances sequence without changing state', () => {
    const before = getState().courtDay;
    getState().handleSSEEvent(makeSSEEvent('heartbeat', 11, {}));
    expect(getState().courtDay).toBe(before); // reference equality
    expect(getState().lastSequence).toBe(11);
  });
});

// ========================================
// D. Critical error guardrail on SSE events
// ========================================

describe('handleSSEEvent — guardrails', () => {
  it('sets critical error when event produces multiple hearing cases', () => {
    const cd = makeCourtDay({
      lastSequence: 10,
      currentCaseId: 'c1',
      cases: [
        makeCase({ id: 'c1', status: 'hearing' }),
        makeCase({ id: 'c2', status: 'pending' }),
      ],
    });
    getState().replaceSnapshot(cd);

    // Event makes c2 also hearing — should trigger guardrail
    getState().handleSSEEvent(
      makeSSEEvent('case_updated', 11, {
        case: { ...cd.cases[1], status: 'hearing' },
      })
    );
    expect(getState().criticalError).toMatch(/CRITICAL/);
  });

  it('clears critical error when resolved via event', () => {
    const cd = makeCourtDay({
      lastSequence: 10,
      cases: [
        makeCase({ id: 'c1', status: 'hearing' }),
        makeCase({ id: 'c2', status: 'hearing' }),
      ],
    });
    getState().replaceSnapshot(cd);
    expect(getState().criticalError).not.toBeNull();

    // Fix: c2 concluded
    getState().handleSSEEvent(
      makeSSEEvent('case_updated', 11, {
        case: { ...cd.cases[1], status: 'concluded' },
      })
    );
    expect(getState().criticalError).toBeNull();
  });
});

// ========================================
// E. Undo state management
// ========================================

describe('undo state', () => {
  it('sets and clears lastAction', () => {
    getState().setLastAction({
      eventId: 'evt-1',
      actionType: 'done',
      caseId: 'c1',
      timestamp: Date.now(),
    });
    expect(getState().lastAction).not.toBeNull();
    expect(getState().lastAction!.eventId).toBe('evt-1');

    getState().clearLastAction();
    expect(getState().lastAction).toBeNull();
  });
});
