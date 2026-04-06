import { describe, it, expect, beforeEach } from 'vitest';
import { makeCourtDay, makeCase, resetCounters } from './fixtures';
import {
  deriveCourtStatus,
  deriveActiveCase,
  deriveNextUp,
  deriveQueue,
  deriveConcluded,
  deriveFullList,
  deriveUndoState,
  deriveMeta,
} from '../viewModel/courtDayViewModel';

beforeEach(() => resetCounters());

// ========================================
// Court status derivation
// ========================================

describe('deriveCourtStatus', () => {
  it('returns LIVE for live status', () => {
    const cd = makeCourtDay({ status: 'live' });
    const v = deriveCourtStatus(cd);
    expect(v.label).toBe('LIVE');
    expect(v.isLive).toBe(true);
    expect(v.isPaused).toBe(false);
    expect(v.isEnded).toBe(false);
  });

  it('returns JUDGE ROSE with resume time message', () => {
    const cd = makeCourtDay({ status: 'judge_rose', resumeTime: '2026-04-06T14:15:00Z' });
    const v = deriveCourtStatus(cd);
    expect(v.label).toBe('JUDGE ROSE');
    expect(v.isPaused).toBe(true);
    expect(v.message).toMatch(/^Back at \d{2}:\d{2}$/);
  });

  it('uses explicit statusMessage over derived', () => {
    const cd = makeCourtDay({
      status: 'judge_rose',
      statusMessage: 'Custom message',
      resumeTime: '2026-04-06T14:15:00Z',
    });
    const v = deriveCourtStatus(cd);
    expect(v.message).toBe('Custom message');
  });

  it('marks ended correctly', () => {
    const v = deriveCourtStatus(makeCourtDay({ status: 'ended' }));
    expect(v.isEnded).toBe(true);
    expect(v.isLive).toBe(false);
  });
});

// ========================================
// Active case derivation
// ========================================

describe('deriveActiveCase', () => {
  it('returns null when no currentCaseId', () => {
    const cd = makeCourtDay({ currentCaseId: undefined, cases: [makeCase()] });
    expect(deriveActiveCase(cd, 'registrar')).toBeNull();
  });

  it('returns active case with registrar title', () => {
    const c = makeCase({ id: 'a', caseTitleFull: 'Full Name', caseTitlePublic: 'Public Name', status: 'hearing' });
    const cd = makeCourtDay({ currentCaseId: 'a', cases: [c] });
    const v = deriveActiveCase(cd, 'registrar')!;
    expect(v.title).toBe('Full Name');
    expect(v.statusLabel).toBe('Hearing');
  });

  it('returns active case with public title', () => {
    const c = makeCase({ id: 'a', caseTitleFull: 'Full Name', caseTitlePublic: 'Public Name' });
    const cd = makeCourtDay({ currentCaseId: 'a', cases: [c] });
    const v = deriveActiveCase(cd, 'public')!;
    expect(v.title).toBe('Public Name');
  });

  it('judge view uses full title', () => {
    const c = makeCase({ id: 'a', caseTitleFull: 'Full Name', caseTitlePublic: 'Public Name' });
    const cd = makeCourtDay({ currentCaseId: 'a', cases: [c] });
    const v = deriveActiveCase(cd, 'judge')!;
    expect(v.title).toBe('Full Name');
  });
});

// ========================================
// Queue derivation
// ========================================

describe('deriveQueue', () => {
  it('excludes current case, concluded, and vacated', () => {
    const cases = [
      makeCase({ id: 'current', status: 'hearing', position: 1 }),
      makeCase({ id: 'a', status: 'pending', position: 2 }),
      makeCase({ id: 'b', status: 'concluded', position: 3 }),
      makeCase({ id: 'c', status: 'vacated', position: 4 }),
      makeCase({ id: 'd', status: 'not_before', position: 5 }),
    ];
    const cd = makeCourtDay({ currentCaseId: 'current', cases });
    const q = deriveQueue(cd, 'registrar');
    expect(q.map((i) => i.id)).toEqual(['a', 'd']);
  });

  it('marks NOT_BEFORE items', () => {
    const cases = [
      makeCase({ id: 'a', status: 'not_before', position: 1, notBeforeTime: '2026-04-06T14:00:00Z' }),
    ];
    const cd = makeCourtDay({ cases });
    const q = deriveQueue(cd, 'registrar');
    expect(q[0].isNotBefore).toBe(true);
    expect(q[0].timeLabel).toMatch(/Not before/);
  });

  it('marks adjourned items', () => {
    const cases = [
      makeCase({ id: 'a', status: 'adjourned', position: 1, adjournedToTime: '2026-04-06T14:30:00Z' }),
    ];
    const cd = makeCourtDay({ cases });
    const q = deriveQueue(cd, 'registrar');
    expect(q[0].isAdjourned).toBe(true);
    expect(q[0].timeLabel).toMatch(/Adj/);
  });
});

// ========================================
// Next up
// ========================================

describe('deriveNextUp', () => {
  it('returns top N pending/calling/not_before/stood_down', () => {
    const cases = [
      makeCase({ id: 'current', status: 'hearing', position: 1 }),
      makeCase({ id: 'a', status: 'pending', position: 2 }),
      makeCase({ id: 'b', status: 'pending', position: 3 }),
      makeCase({ id: 'c', status: 'pending', position: 4 }),
      makeCase({ id: 'd', status: 'pending', position: 5 }),
    ];
    const cd = makeCourtDay({ currentCaseId: 'current', cases });
    const next = deriveNextUp(cd, 'registrar', 2);
    expect(next).toHaveLength(2);
    expect(next[0].id).toBe('a');
    expect(next[1].id).toBe('b');
  });
});

// ========================================
// Concluded
// ========================================

describe('deriveConcluded', () => {
  it('returns only concluded/vacated', () => {
    const cases = [
      makeCase({ id: 'a', status: 'concluded', position: 1 }),
      makeCase({ id: 'b', status: 'pending', position: 2 }),
      makeCase({ id: 'c', status: 'vacated', position: 3 }),
    ];
    const cd = makeCourtDay({ cases });
    const c = deriveConcluded(cd, 'registrar');
    expect(c.map((i) => i.id)).toEqual(['a', 'c']);
  });
});

// ========================================
// Full list
// ========================================

describe('deriveFullList', () => {
  it('returns all cases sorted by position', () => {
    const cases = [
      makeCase({ position: 3 }),
      makeCase({ position: 1 }),
      makeCase({ position: 2 }),
    ];
    const cd = makeCourtDay({ cases });
    const list = deriveFullList(cd, 'registrar');
    expect(list.map((i) => i.position)).toEqual([1, 2, 3]);
  });
});

// ========================================
// Undo state
// ========================================

describe('deriveUndoState', () => {
  it('returns unavailable for null', () => {
    expect(deriveUndoState(null).available).toBe(false);
  });

  it('returns available for recent action', () => {
    const v = deriveUndoState({
      eventId: 'e1',
      actionType: 'done',
      caseId: 'c1',
      timestamp: Date.now() - 3000,
    });
    expect(v.available).toBe(true);
    expect(v.remainingMs).toBeGreaterThan(0);
    expect(v.label).toMatch(/Undo/);
  });

  it('returns unavailable for expired action', () => {
    const v = deriveUndoState({
      eventId: 'e1',
      actionType: 'done',
      caseId: 'c1',
      timestamp: Date.now() - 11000,
    });
    expect(v.available).toBe(false);
  });
});

// ========================================
// Meta
// ========================================

describe('deriveMeta', () => {
  it('projects metadata correctly', () => {
    const cd = makeCourtDay({
      courtName: 'Supreme Court',
      courtRoom: '3B',
      judgeName: 'Justice Doe',
    });
    const m = deriveMeta(cd, true, 50, null);
    expect(m.courtName).toBe('Supreme Court');
    expect(m.courtRoom).toBe('3B');
    expect(m.judgeName).toBe('Justice Doe');
    expect(m.connected).toBe(true);
    expect(m.lastSequence).toBe(50);
    expect(m.criticalError).toBeNull();
  });

  it('passes through critical error', () => {
    const cd = makeCourtDay();
    const m = deriveMeta(cd, false, 0, 'CRITICAL: something');
    expect(m.criticalError).toBe('CRITICAL: something');
    expect(m.connected).toBe(false);
  });
});
