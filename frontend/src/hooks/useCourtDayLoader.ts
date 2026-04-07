import { useEffect, useCallback, useRef } from 'react';
import { useCourtDayStore } from '../stores/courtDayStore';
import { useSSE } from './useSSE';
import { getSSEUrl } from '../api/client';
import type { CourtDay } from '../types';

interface Options {
  courtDayId: string;
  fetchFn: (id: string) => Promise<CourtDay>;
  streamMode?: 'public' | 'registrar';
}

export function useCourtDayLoader({ courtDayId, fetchFn, streamMode = 'public' }: Options) {
  const {
    replaceSnapshot,
    setLoading,
    setError,
    setConnected,
    setEventsPaused,
  } = useCourtDayStore();
  const refreshInFlightRef = useRef(false);

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
    url: getSSEUrl(courtDayId, streamMode),
    onEvent: async (event) => {
      setConnected(true);
      const { lastSequence } = useCourtDayStore.getState();
      if (event.sequence <= lastSequence) return;
      if (refreshInFlightRef.current) return;

      refreshInFlightRef.current = true;
      setEventsPaused(true);
      try {
        const snapshot = await fetchFn(courtDayId);
        replaceSnapshot(snapshot);
      } catch {
        // keep old state and retry on next event/reconnect
      } finally {
        setEventsPaused(false);
        refreshInFlightRef.current = false;
      }
    },
    // (A) On reconnect: pause events → fetch snapshot → replace → unpause
    // This eliminates the race where an SSE event arrives between
    // snapshot fetch and snapshot application, causing state reversion.
    onReconnect: async () => {
      setConnected(false);
      if (refreshInFlightRef.current) return;
      refreshInFlightRef.current = true;
      setEventsPaused(true);
      try {
        const snapshot = await fetchFn(courtDayId);
        replaceSnapshot(snapshot);
      } catch {
        // snapshot fetch failed — will retry on next reconnect
      } finally {
        setEventsPaused(false);
        refreshInFlightRef.current = false;
      }
    },
  });
}
