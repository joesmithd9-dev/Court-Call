# CourtCall Frontend Test Plan

## Test Suite Summary

**Framework:** Vitest 4.x (node environment for pure logic tests)
**Total tests:** 58
**Files:** 4 test files + 1 fixture file

## Coverage

### A. Unit Tests — Store Reducer (`courtDayStore.test.ts`)

| Area | Tests | Status |
|------|-------|--------|
| Snapshot replacement (replaceSnapshot) | 6 | Pass |
| Stale snapshot rejection | 2 | Pass |
| SSE event sequencing (monotonic ordering) | 7 | Pass |
| SSE event type handling (all 6 types) | 8 | Pass |
| Event pause/resume during reconnect | 2 | Pass |
| Multiple-hearing guardrail (set + clear) | 2 | Pass |
| Undo state management | 2 | Pass |

### B. Unit Tests — Selectors & Read Model (`selectors.test.ts`)

| Area | Tests | Status |
|------|-------|--------|
| getCaseTitle (registrar vs public) | 6 | Pass |
| Public view never leaks full names | 1 | Pass |
| selectCurrentCase | 4 | Pass |
| selectUpcomingCases (filtering + sorting) | 3 | Pass |
| selectAllCasesSorted | 3 | Pass |

### C. Unit Tests — Time Utilities (`time.test.ts`)

| Area | Tests | Status |
|------|-------|--------|
| formatTime | 2 | Pass |
| relativeMinutes | 4 | Pass |
| minutesFromNow | 1 | Pass |

### D. Edge Case Scenarios (`edgeCases.test.ts`)

| Scenario | Tests | Status |
|----------|-------|--------|
| 1. +5 then adjourn then undo | 1 | Pass |
| 2. Active case replaced by start-next | 2 | Pass |
| 3. NOT_BEFORE inserted between items | 1 | Pass |
| 4. Pause/resume with remaining duration | 1 | Pass |
| 5. Reconnect with events during window | 1 | Pass |
| 6. Replay from sequence N (10 events) | 2 | Pass |
| 7. Repeated undo + expiry | 2 | Pass |
| 8. Stale snapshot vs concurrent events | 1 | Pass |

## What Is NOT Tested (Frontend Boundary)

These require a running backend and are outside frontend unit test scope:

- **Backend service rules:** single-active enforcement, undo-once enforcement,
  invalid transition rejection — enforced server-side
- **SSE stream delivery:** actual EventSource connection, Last-Event-Sequence replay
- **Idempotency enforcement:** server-side dedup by Idempotency-Key header
- **Persistence:** database consistency, concurrent write ordering
- **Route/API integration:** actual HTTP responses from backend endpoints

These should be covered by backend integration tests and/or end-to-end tests.

## Remaining Gaps

1. **React component rendering tests** — not yet added (would require jsdom or
   happy-dom; deferred to avoid environment compatibility issues with current
   Node/jsdom versions)
2. **API client tests** — `fetch` mock tests for client.ts (low value since
   it's a thin wrapper)
3. **End-to-end tests** — full flow with real backend (Playwright recommended)

## Running Tests

```bash
cd frontend
npx vitest run        # single run
npx vitest            # watch mode
```
