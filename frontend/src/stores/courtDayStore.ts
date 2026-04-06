import { create } from 'zustand';
import type { CourtDay, CourtCase, SSEEvent, LastAction } from '../types';

interface CourtDayState {
  courtDay: CourtDay | null;
  lastSequence: number;       // 6.1: event ordering watermark
  loading: boolean;
  error: string | null;
  connected: boolean;
  lastAction: LastAction | null; // 6.3: undo capability

  // Snapshot replacement (6.2)
  replaceSnapshot: (cd: CourtDay) => void;
  setLoading: (v: boolean) => void;
  setError: (e: string | null) => void;
  setConnected: (v: boolean) => void;

  // SSE event handling with sequencing (6.1)
  handleSSEEvent: (event: SSEEvent) => void;

  // 6.3: Undo
  setLastAction: (action: LastAction | null) => void;
  clearLastAction: () => void;
}

export const useCourtDayStore = create<CourtDayState>((set, get) => ({
  courtDay: null,
  lastSequence: -1,
  loading: true,
  error: null,
  connected: false,
  lastAction: null,

  // 6.2: Full snapshot replacement — no merging, no preserving stale state
  replaceSnapshot: (cd) =>
    set({
      courtDay: cd,
      lastSequence: cd.lastSequence ?? -1,
      loading: false,
      error: null,
    }),

  setLoading: (v) => set({ loading: v }),
  setError: (e) => set({ error: e, loading: false }),
  setConnected: (v) => set({ connected: v }),

  // 6.3
  setLastAction: (action) => set({ lastAction: action }),
  clearLastAction: () => set({ lastAction: null }),

  // 6.1: Sequenced event handler — rejects out-of-order and duplicate events
  handleSSEEvent: (event) => {
    const { courtDay: cd, lastSequence } = get();
    if (!cd) return;

    // 6.1: Enforce monotonic ordering
    if (event.sequence <= lastSequence) return;

    switch (event.type) {
      case 'court_day_updated': {
        set({
          courtDay: {
            ...cd,
            ...event.data,
            cases: event.data.cases ?? cd.cases,
          },
          lastSequence: event.sequence,
        });
        break;
      }
      case 'case_updated': {
        if (!event.data.case) break;
        const updated = event.data.case;
        set({
          courtDay: {
            ...cd,
            ...stripCases(event.data),
            cases: cd.cases.map((c) =>
              c.id === updated.id ? { ...c, ...updated } : c
            ),
          },
          lastSequence: event.sequence,
        });
        break;
      }
      case 'case_reordered': {
        if (event.data.cases) {
          set({
            courtDay: { ...cd, cases: event.data.cases },
            lastSequence: event.sequence,
          });
        }
        break;
      }
      case 'case_added': {
        if (event.data.case) {
          set({
            courtDay: { ...cd, cases: [...cd.cases, event.data.case] },
            lastSequence: event.sequence,
          });
        }
        break;
      }
      case 'case_removed': {
        if (event.data.case) {
          set({
            courtDay: {
              ...cd,
              cases: cd.cases.filter((c) => c.id !== event.data.case!.id),
            },
            lastSequence: event.sequence,
          });
        }
        break;
      }
      case 'heartbeat':
        // Update sequence but no state change
        set({ lastSequence: event.sequence });
        break;
    }
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
