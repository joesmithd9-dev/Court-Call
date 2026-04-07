import { create } from 'zustand';
import type { CourtDay, CourtCase, SSEEvent, LastAction } from '../types';

interface CourtDayState {
  courtDay: CourtDay | null;
  lastSequence: number;
  loading: boolean;
  error: string | null;
  connected: boolean;
  lastAction: LastAction | null;
  eventsPaused: boolean;         // (A) Pause SSE event processing during reconnect
  criticalError: string | null;  // Multiple-active-case guardrail
  toast: string | null;          // Micro-toast confirmation

  replaceSnapshot: (cd: CourtDay) => void;
  setLoading: (v: boolean) => void;
  setError: (e: string | null) => void;
  setConnected: (v: boolean) => void;
  setEventsPaused: (v: boolean) => void;
  handleSSEEvent: (event: SSEEvent) => void;
  setLastAction: (action: LastAction | null) => void;
  clearLastAction: () => void;
  showToast: (message: string) => void;
}

export const useCourtDayStore = create<CourtDayState>((set, get) => ({
  courtDay: null,
  lastSequence: -1,
  loading: true,
  error: null,
  connected: false,
  lastAction: null,
  eventsPaused: false,
  criticalError: null,
  toast: null,

  // (A) Snapshot replacement with stale-guard
  replaceSnapshot: (cd) => {
    const { lastSequence } = get();
    const snapshotSeq = cd.lastSequence ?? -1;

    // Reject stale snapshot — if our local state is ahead, ignore
    if (snapshotSeq < lastSequence) return;

    // Guardrail: check for multiple hearing cases
    const hearingCases = cd.cases.filter((c) => c.status === 'hearing');
    const criticalError =
      hearingCases.length > 1
        ? `CRITICAL: ${hearingCases.length} cases in HEARING state simultaneously`
        : null;

    set({
      courtDay: cd,
      lastSequence: snapshotSeq,
      loading: false,
      error: null,
      criticalError,
    });
  },

  setLoading: (v) => set({ loading: v }),
  setError: (e) => set({ error: e, loading: false }),
  setConnected: (v) => set({ connected: v }),
  setEventsPaused: (v) => set({ eventsPaused: v }),

  setLastAction: (action) => set({ lastAction: action }),
  clearLastAction: () => set({ lastAction: null }),

  showToast: (message) => {
    set({ toast: message });
    setTimeout(() => {
      // Only clear if this is still the same toast
      if (get().toast === message) set({ toast: null });
    }, 1500);
  },

  // Sequenced event handler — rejects out-of-order, duplicates, and paused state
  handleSSEEvent: (event) => {
    const { courtDay: cd, lastSequence, eventsPaused } = get();
    if (!cd) return;

    // (A) Drop events while snapshot replacement is in progress
    if (eventsPaused) return;

    // Enforce monotonic ordering
    if (event.sequence <= lastSequence) return;

    let nextCd: CourtDay = cd;

    switch (event.type) {
      case 'court_day_updated': {
        nextCd = {
          ...cd,
          ...event.data,
          cases: event.data.cases ?? cd.cases,
        };
        break;
      }
      case 'case_updated': {
        if (!event.data.case) return;
        const updated = event.data.case;
        nextCd = {
          ...cd,
          ...stripCases(event.data),
          cases: cd.cases.map((c) =>
            c.id === updated.id ? { ...c, ...updated } : c
          ),
        };
        break;
      }
      case 'case_reordered': {
        if (!event.data.cases) return;
        nextCd = { ...cd, cases: event.data.cases };
        break;
      }
      case 'case_added': {
        if (!event.data.case) return;
        nextCd = { ...cd, cases: [...cd.cases, event.data.case] };
        break;
      }
      case 'case_removed': {
        if (!event.data.case) return;
        nextCd = {
          ...cd,
          cases: cd.cases.filter((c) => c.id !== event.data.case!.id),
        };
        break;
      }
      case 'heartbeat':
        set({ lastSequence: event.sequence });
        return;
    }

    // Guardrail: check for multiple hearing cases after applying event
    const hearingCases = nextCd.cases.filter((c) => c.status === 'hearing');
    const criticalError =
      hearingCases.length > 1
        ? `CRITICAL: ${hearingCases.length} cases in HEARING state simultaneously`
        : null;

    set({
      courtDay: nextCd,
      lastSequence: event.sequence,
      criticalError,
    });
  },
}));

function stripCases(data: SSEEvent['data']): Partial<CourtDay> {
  const { case: _c, cases: _cs, ...rest } = data;
  return rest as Partial<CourtDay>;
}

// ---- 6.5: Case title helpers ----
export function getCaseTitle(c: CourtCase, view: 'public' | 'registrar'): string {
  if (view === 'registrar') {
    return c.caseTitleFull || c.caseName || 'Case';
  }
  return c.caseTitlePublic || 'Case';
}

// ---- Derived selectors ----
export function selectCurrentCase(cd: CourtDay | null): CourtCase | undefined {
  if (!cd?.currentCaseId) return undefined;
  return cd.cases.find((c) => c.id === cd.currentCaseId);
}

export function selectUpcomingCases(cd: CourtDay | null): CourtCase[] {
  if (!cd) return [];
  return cd.cases
    .filter(
      (c) =>
        c.id !== cd.currentCaseId &&
        (c.status === 'pending' ||
          c.status === 'calling' ||
          c.status === 'not_before' ||
          c.status === 'stood_down')
    )
    .sort((a, b) => a.position - b.position);
}

export function selectAllCasesSorted(cd: CourtDay | null): CourtCase[] {
  if (!cd) return [];
  return [...cd.cases].sort((a, b) => a.position - b.position);
}
