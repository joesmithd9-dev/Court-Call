import { useMemo } from 'react';
import { useCourtDayStore } from '../stores/courtDayStore';
import type { ViewContext } from './courtDayViewModel';
import {
  deriveCourtStatus,
  deriveActiveCase,
  deriveNextUp,
  deriveQueue,
  deriveConcluded,
  deriveFullList,
  deriveUndoState,
  deriveMeta,
  deriveTimeBandGroups,
  deriveMatterTypeGroups,
  deriveGapFillerMatters,
} from './courtDayViewModel';

/**
 * Hook that projects canonical store state into display-ready view model.
 * Shared between Registrar, Judge, and Public surfaces.
 */
export function useCourtDayView(view: ViewContext) {
  const { courtDay, connected, lastSequence, lastAction, criticalError, loading, error, toast } =
    useCourtDayStore();

  return useMemo(() => {
    if (!courtDay) {
      return {
        ready: false as const,
        loading,
        error,
      };
    }

    return {
      ready: true as const,
      loading: false,
      error: null,
      meta: deriveMeta(courtDay, connected, lastSequence, criticalError),
      courtStatus: deriveCourtStatus(courtDay),
      activeCase: deriveActiveCase(courtDay, view),
      nextUp: deriveNextUp(courtDay, view, view === 'judge' ? 5 : 3),
      queue: deriveQueue(courtDay, view),
      concluded: deriveConcluded(courtDay, view),
      fullList: deriveFullList(courtDay, view),
      undo: deriveUndoState(lastAction),
      // Judge grouping projections
      timeBands: deriveTimeBandGroups(courtDay, view),
      matterTypeGroups: deriveMatterTypeGroups(courtDay, view),
      getGapFillerMatters: (maxMinutes: number) => deriveGapFillerMatters(courtDay, view, maxMinutes),
      toast,
      courtDay,
    };
  }, [courtDay, connected, lastSequence, lastAction, criticalError, loading, error, toast, view]);
}
