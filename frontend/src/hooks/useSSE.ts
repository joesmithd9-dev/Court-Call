import { useEffect, useRef, useCallback } from 'react';
import type { SSEEvent } from '../types';

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;

interface UseSSEOptions {
  url: string;
  onEvent: (event: SSEEvent) => void;
  onReconnect: () => void;
  enabled?: boolean;
}

export function useSSE({ url, onEvent, onReconnect, enabled = true }: UseSSEOptions) {
  const esRef = useRef<EventSource | null>(null);
  const retryRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const onEventRef = useRef(onEvent);
  const onReconnectRef = useRef(onReconnect);

  onEventRef.current = onEvent;
  onReconnectRef.current = onReconnect;

  const connect = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
    }

    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => {
      retryRef.current = 0;
    };

    es.onmessage = (e) => {
      try {
        const event: SSEEvent = JSON.parse(e.data);
        onEventRef.current(event);
      } catch {
        // ignore malformed events
      }
    };

    es.onerror = () => {
      es.close();
      esRef.current = null;

      const delay = Math.min(
        RECONNECT_BASE_MS * Math.pow(2, retryRef.current),
        RECONNECT_MAX_MS
      );
      retryRef.current += 1;

      reconnectTimerRef.current = setTimeout(() => {
        onReconnectRef.current();
        connect();
      }, delay);
    };
  }, [url]);

  useEffect(() => {
    if (!enabled) return;
    connect();

    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (esRef.current) esRef.current.close();
      esRef.current = null;
    };
  }, [connect, enabled]);
}
