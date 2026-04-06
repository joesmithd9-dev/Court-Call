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
  const {
    replaceSnapshot,
    setLoading,
    setError,
    setConnected,
    setEventsPaused,
    handleSSEEvent,
  } = useCourtDayStore();

  const loadSnapshot = useCallback(async () => {
    try {
      setLoading(true);
      const snapshot = await fetchFn(courtDayId);
      replaceSnapshot(snapshot);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    }
  }, [courtDayId, fetchFn, replaceSnapshot, setLoading, setError]);

  useEffect(() => {
    loadSnapshot();
  }, [loadSnapshot]);

  useSSE({
    url: getSSEUrl(courtDayId),
    onEvent: (event) => {
      setConnected(true);
      handleSSEEvent(event);
    },
    // (A) On reconnect: pause events → fetch snapshot → replace → unpause
    // This eliminates the race where an SSE event arrives between
    // snapshot fetch and snapshot application, causing state reversion.
    onReconnect: async () => {
      setConnected(false);
      setEventsPaused(true);
      try {
        const snapshot = await fetchFn(courtDayId);
        replaceSnapshot(snapshot);
      } catch {
        // snapshot fetch failed — will retry on next reconnect
      } finally {
        setEventsPaused(false);
      }
    },
  });
}
