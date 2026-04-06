import { useEffect, useCallback } from 'react';
import { useCourtDayStore } from '../stores/courtDayStore';
import { useSSE } from './useSSE';
import { getSSEUrl } from '../api/client';
import type { CourtDay } from '../types';

interface Options {
  courtDayId: string;
  fetchFn: (id: string) => Promise<CourtDay>;
}

export function useCourtDayLoader({ courtDayId, fetchFn }: Options) {
  const { setCourtDay, setLoading, setError, setConnected, handleSSEEvent } =
    useCourtDayStore();

  const loadSnapshot = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchFn(courtDayId);
      setCourtDay(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    }
  }, [courtDayId, fetchFn, setCourtDay, setLoading, setError]);

  useEffect(() => {
    loadSnapshot();
  }, [loadSnapshot]);

  useSSE({
    url: getSSEUrl(courtDayId),
    onEvent: (event) => {
      setConnected(true);
      handleSSEEvent(event);
    },
    onReconnect: () => {
      setConnected(false);
      loadSnapshot();
    },
  });
}
