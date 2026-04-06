# Build Notes — Phase: Tests + View Model + Registrar + Judge UI

## What Was Added

### 1. Test Suite (Phase 1)
- **Vitest** installed and configured (node environment for pure logic tests)
- **77 tests across 5 files**, all passing
- `courtDayStore.test.ts` — snapshot replacement, stale guard, SSE sequencing, event types, pause/resume, guardrails, undo state
- `selectors.test.ts` — getCaseTitle, selectCurrentCase, selectUpcomingCases, selectAllCasesSorted
- `edgeCases.test.ts` — 8 named scenarios: +5→adjourn→undo, active replacement, NOT_BEFORE insertion, pause/resume duration, reconnect race, sequential replay, repeated undo, stale snapshot
- `viewModel.test.ts` — all view model projections (court status, active case, queue, next up, concluded, undo, meta)
- `time.test.ts` — formatTime, relativeMinutes, minutesFromNow
- `fixtures.ts` — shared test data factories
- `TEST_PLAN.md` — coverage summary and gap analysis

### 2. Shared View Model (Phase 2)
- `viewModel/courtDayViewModel.ts` — pure projection functions:
  - `deriveCourtStatus()` — status label, flags (isLive/isPaused/isEnded), resume message
  - `deriveActiveCase()` — current case with view-appropriate title
  - `deriveQueue()` / `deriveNextUp()` — upcoming items with NOT_BEFORE/adjourned markers
  - `deriveConcluded()` — finished items
  - `deriveFullList()` — all cases sorted by position
  - `deriveUndoState()` — undo availability with countdown
  - `deriveMeta()` — header info, connection status, critical errors
- `viewModel/useCourtDayView.ts` — React hook wiring store → view model, memoized

### 3. Registrar UI (Phase 3)
- `pages/RegistrarScreen.tsx` — rewritten to consume shared view model
- Phone-first one-screen design: header → status → active card → quick actions → next up → full list → global controls
- All action handlers preserved (addTime, done, adjourn, letStand, undo, startNext, judgeRose, resume, endDay, atLunch, inline case actions, notes)
- Tap-protected buttons (500ms lock with opacity feedback)
- Undo with live countdown
- Micro-toast confirmations
- Critical error banner for invariant violations
- Bottom sheets for adjourn/not-before time picking

### 4. Judge UI (Phase 4)
- `pages/JudgeScreen.tsx` — new read-first surface
- Route: `/judge/:courtDayId`
- Larger typography, calmer visual density
- Dominant current matter card
- Next 5 items visible
- NOT_BEFORE items have left border accent
- Remaining queue and concluded sections
- No action controls (read-only)
- Uses `view='judge'` which maps to full (registrar-level) titles

### 5. Route Addition
- `App.tsx` updated with `/judge/:courtDayId` route

## Backend/Frontend Contract

No contract changes. Existing expectations unchanged:
- `lastSequence` in snapshot responses
- `lastEventId` in mutation responses (for undo targeting)
- SSE events carry `id` and `sequence`
- `POST /undo` accepts `{ targetEventId }`
- `Idempotency-Key` header on mutations
- `caseTitleFull` / `caseTitlePublic` on case objects

## Remaining Risks

1. **No React component render tests** — jsdom incompatibility with current Node; deferred to when happy-dom or browser-based testing is set up
2. **No E2E tests** — requires running backend; Playwright recommended
3. **Judge UI is read-only** — if judicial actions are needed, they require product + permission design
4. **Undo relies on backend `lastEventId`** — if backend doesn't include this field yet, undo will fall back to sequence-based ID (`seq-N`)
5. **SSE reconnect during high-throughput** — tested in unit tests but not under real load

## Next Recommended Step

Backend event contract audit:
1. Verify `lastEventId` is returned in mutation responses
2. Verify `POST /undo` with `targetEventId` produces compensating event
3. Verify SSE `Last-Event-ID` header support for replay
4. E2E smoke test: full court day session (09:30–16:30)
