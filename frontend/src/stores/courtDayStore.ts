import { create } from 'zustand';
import type { CourtDay, CourtCase, SSEEvent } from '../types';

interface CourtDayState {
  courtDay: CourtDay | null;
  loading: boolean;
  error: string | null;
  connected: boolean;

  setCourtDay: (cd: CourtDay) => void;
  setLoading: (v: boolean) => void;
  setError: (e: string | null) => void;
  setConnected: (v: boolean) => void;
  handleSSEEvent: (event: SSEEvent) => void;
}

export const useCourtDayStore = create<CourtDayState>((set, get) => ({
  courtDay: null,
  loading: true,
  error: null,
  connected: false,

  setCourtDay: (cd) => set({ courtDay: cd, loading: false, error: null }),
  setLoading: (v) => set({ loading: v }),
  setError: (e) => set({ error: e, loading: false }),
  setConnected: (v) => set({ connected: v }),

  handleSSEEvent: (event) => {
    const cd = get().courtDay;
    if (!cd) return;

    switch (event.type) {
      case 'court_day_updated': {
        set({
          courtDay: {
            ...cd,
            ...event.data,
            cases: event.data.cases ?? cd.cases,
          },
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
            cases: cd.cases.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)),
          },
        });
        break;
      }
      case 'case_reordered': {
        if (event.data.cases) {
          set({ courtDay: { ...cd, cases: event.data.cases } });
        }
        break;
      }
      case 'case_added': {
        if (event.data.case) {
          set({ courtDay: { ...cd, cases: [...cd.cases, event.data.case] } });
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
          });
        }
        break;
      }
      case 'heartbeat':
        break;
    }
  },
}));

function stripCases(data: SSEEvent['data']): Partial<CourtDay> {
  const { case: _c, cases: _cs, ...rest } = data;
  return rest as Partial<CourtDay>;
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
        (c.status === 'pending' || c.status === 'calling' || c.status === 'not_before' || c.status === 'stood_down')
    )
    .sort((a, b) => a.position - b.position);
}

export function selectAllCasesSorted(cd: CourtDay | null): CourtCase[] {
  if (!cd) return [];
  return [...cd.cases].sort((a, b) => a.position - b.position);
}
