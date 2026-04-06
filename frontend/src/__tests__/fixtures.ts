import type { CourtDay, CourtCase, SSEEvent, SSEEventType } from '../types';

let caseIdCounter = 0;
let eventIdCounter = 0;

export function resetCounters() {
  caseIdCounter = 0;
  eventIdCounter = 0;
}

export function makeCase(overrides: Partial<CourtCase> = {}): CourtCase {
  caseIdCounter++;
  const id = overrides.id ?? `case-${caseIdCounter}`;
  return {
    id,
    courtDayId: 'cd-1',
    position: caseIdCounter,
    caseName: `Case ${caseIdCounter}`,
    caseTitleFull: `Smith v Jones (No. ${caseIdCounter})`,
    caseTitlePublic: `S v J (No. ${caseIdCounter})`,
    status: 'pending',
    createdAt: '2026-04-06T08:00:00Z',
    updatedAt: '2026-04-06T08:00:00Z',
    ...overrides,
  };
}

export function makeCourtDay(overrides: Partial<CourtDay> = {}): CourtDay {
  return {
    id: 'cd-1',
    courtName: 'Supreme Court — Court 1',
    courtRoom: '1A',
    judgeName: 'Justice Smith',
    date: '2026-04-06',
    status: 'live',
    lastSequence: 0,
    cases: [],
    createdAt: '2026-04-06T08:00:00Z',
    updatedAt: '2026-04-06T08:00:00Z',
    ...overrides,
  };
}

export function makeSSEEvent(
  type: SSEEventType,
  sequence: number,
  data: SSEEvent['data'] = {}
): SSEEvent {
  eventIdCounter++;
  return {
    id: `evt-${eventIdCounter}`,
    sequence,
    type,
    data,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Build a realistic court day with N cases.
 * First case is in hearing, rest are pending.
 */
export function makeLiveCourtDay(caseCount: number): CourtDay {
  resetCounters();
  const cases: CourtCase[] = [];
  for (let i = 0; i < caseCount; i++) {
    cases.push(
      makeCase({
        position: i + 1,
        status: i === 0 ? 'hearing' : 'pending',
        startedAt: i === 0 ? '2026-04-06T10:00:00Z' : undefined,
        estimatedMinutes: i === 0 ? 30 : undefined,
        scheduledTime: `2026-04-06T${10 + i}:00:00Z`,
      })
    );
  }
  return makeCourtDay({
    status: 'live',
    currentCaseId: cases[0].id,
    cases,
    lastSequence: 10,
  });
}
