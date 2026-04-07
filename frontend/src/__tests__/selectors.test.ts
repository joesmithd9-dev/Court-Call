import { describe, it, expect, beforeEach } from 'vitest';
import {
  getCaseTitle,
  selectCurrentCase,
  selectUpcomingCases,
  selectAllCasesSorted,
} from '../stores/courtDayStore';
import { makeCourtDay, makeCase, resetCounters } from './fixtures';

beforeEach(() => {
  resetCounters();
});

// ========================================
// getCaseTitle (6.5 title separation)
// ========================================

describe('getCaseTitle', () => {
  it('returns caseTitleFull for registrar view', () => {
    const c = makeCase({ caseTitleFull: 'Smith v Jones [2026]', caseTitlePublic: 'S v J' });
    expect(getCaseTitle(c, 'registrar')).toBe('Smith v Jones [2026]');
  });

  it('returns caseTitlePublic for public view', () => {
    const c = makeCase({ caseTitleFull: 'Smith v Jones [2026]', caseTitlePublic: 'S v J' });
    expect(getCaseTitle(c, 'public')).toBe('S v J');
  });

  it('falls back to caseName if caseTitleFull missing (registrar)', () => {
    const c = makeCase({ caseTitleFull: '', caseName: 'Legacy Name' });
    expect(getCaseTitle(c, 'registrar')).toBe('Legacy Name');
  });

  it('falls back to "Case" if caseTitlePublic missing (public)', () => {
    const c = makeCase({ caseTitlePublic: '' });
    expect(getCaseTitle(c, 'public')).toBe('Case');
  });

  it('falls back to "Case" if all title fields empty (registrar)', () => {
    const c = makeCase({ caseTitleFull: '', caseName: '', caseTitlePublic: '' });
    expect(getCaseTitle(c, 'registrar')).toBe('Case');
  });

  it('public view NEVER returns caseTitleFull', () => {
    const c = makeCase({ caseTitleFull: 'PRIVATE NAME', caseTitlePublic: '' });
    const result = getCaseTitle(c, 'public');
    expect(result).not.toContain('PRIVATE');
    expect(result).toBe('Case');
  });
});

// ========================================
// selectCurrentCase
// ========================================

describe('selectCurrentCase', () => {
  it('returns current case by ID', () => {
    const cases = [makeCase({ id: 'a' }), makeCase({ id: 'b' })];
    const cd = makeCourtDay({ currentCaseId: 'b', cases });
    expect(selectCurrentCase(cd)?.id).toBe('b');
  });

  it('returns undefined if no currentCaseId', () => {
    const cd = makeCourtDay({ currentCaseId: undefined, cases: [makeCase()] });
    expect(selectCurrentCase(cd)).toBeUndefined();
  });

  it('returns undefined if currentCaseId not in cases', () => {
    const cd = makeCourtDay({ currentCaseId: 'missing', cases: [makeCase({ id: 'a' })] });
    expect(selectCurrentCase(cd)).toBeUndefined();
  });

  it('returns undefined for null courtDay', () => {
    expect(selectCurrentCase(null)).toBeUndefined();
  });
});

// ========================================
// selectUpcomingCases
// ========================================

describe('selectUpcomingCases', () => {
  it('returns pending/calling/not_before/stood_down cases excluding current', () => {
    const cases = [
      makeCase({ id: 'current', status: 'hearing', position: 1 }),
      makeCase({ id: 'a', status: 'pending', position: 2 }),
      makeCase({ id: 'b', status: 'calling', position: 3 }),
      makeCase({ id: 'c', status: 'concluded', position: 4 }),
      makeCase({ id: 'd', status: 'not_before', position: 5 }),
      makeCase({ id: 'e', status: 'stood_down', position: 6 }),
      makeCase({ id: 'f', status: 'adjourned', position: 7 }),
      makeCase({ id: 'g', status: 'vacated', position: 8 }),
    ];
    const cd = makeCourtDay({ currentCaseId: 'current', cases });
    const upcoming = selectUpcomingCases(cd);

    expect(upcoming.map((c) => c.id)).toEqual(['a', 'b', 'd', 'e']);
  });

  it('sorts by position', () => {
    const cases = [
      makeCase({ id: 'a', status: 'pending', position: 5 }),
      makeCase({ id: 'b', status: 'pending', position: 2 }),
      makeCase({ id: 'c', status: 'pending', position: 8 }),
    ];
    const cd = makeCourtDay({ cases });
    const upcoming = selectUpcomingCases(cd);
    expect(upcoming.map((c) => c.position)).toEqual([2, 5, 8]);
  });

  it('returns empty for null courtDay', () => {
    expect(selectUpcomingCases(null)).toEqual([]);
  });
});

// ========================================
// selectAllCasesSorted
// ========================================

describe('selectAllCasesSorted', () => {
  it('sorts all cases by position', () => {
    const cases = [
      makeCase({ position: 3 }),
      makeCase({ position: 1 }),
      makeCase({ position: 2 }),
    ];
    const cd = makeCourtDay({ cases });
    const sorted = selectAllCasesSorted(cd);
    expect(sorted.map((c) => c.position)).toEqual([1, 2, 3]);
  });

  it('does not mutate original array', () => {
    const cases = [makeCase({ position: 2 }), makeCase({ position: 1 })];
    const cd = makeCourtDay({ cases });
    selectAllCasesSorted(cd);
    expect(cd.cases[0].position).toBe(2); // original unchanged
  });

  it('returns empty for null', () => {
    expect(selectAllCasesSorted(null)).toEqual([]);
  });
});
