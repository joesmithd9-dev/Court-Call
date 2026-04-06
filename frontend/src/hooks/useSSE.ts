import { useEffect, useRef, useCallback } from 'react';
import type { SSEEvent } from '../types';
import { adaptSSEEnvelope } from '../api/backendAdapter';

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;

/**
 * Known named event types from the original Fastify backend.
 * We register explicit listeners for these so they aren't silently dropped.
 */
const NAMED_EVENT_TYPES = [
  'connected',
  'COURT_DAY_STARTED', 'COURT_DAY_CLOSED', 'SESSION_RESUMED', 'JUDGE_ROSE',
  'ITEM_CREATED', 'ITEM_CALLED', 'ITEM_STARTED', 'ITEM_COMPLETED',
  'ITEM_ADJOURNED', 'ITEM_LET_STAND', 'ITEM_STOOD_DOWN', 'ITEM_RESTORED',
  'ITEM_NOT_BEFORE_SET', 'ITEM_ESTIMATE_CHANGED', 'ITEM_NOTE_UPDATED',
  'ITEM_REORDERED', 'ITEM_REMOVED', 'ITEM_DIRECTION_SET', 'ITEM_OUTCOME_SET',
];

interface UseSSEOptions {
  url: string;
  onEvent: (event: SSEEvent) => void;
  onReconnect: () => Promise<void> | void;
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

    // Handle default 'message' events (Express backend sends these)
    es.onmessage = (e) => {
      try {
        const event: SSEEvent = JSON.parse(e.data);
        onEventRef.current(event);
      } catch {
        // ignore malformed
      }
    };

    // Handle named events from original Fastify backend
    // These are sent as `event: ITEM_STARTED\ndata: {...}\n\n`
    // EventSource only fires onmessage for events WITHOUT a name.
    // Named events require explicit addEventListener.
    const namedHandler = (e: MessageEvent) => {
      if (e.type === 'connected') return; // skip connection ack

      try {
        const raw = JSON.parse(e.data);

        // Original backend envelope: { eventId, eventType, courtDayId, version, payload }
        if ('eventType' in raw && 'version' in raw) {
          const adapted = adaptSSEEnvelope(raw);
          // For named events, trigger a full refetch since we can't easily
          // construct the full case object from the event payload alone.
          // The onReconnect handler will fetch a fresh snapshot.
          onEventRef.current({
            ...adapted,
            type: adapted.type as SSEEvent['type'],
            data: {},
          });
          return;
        }

        // Already in frontend shape
        onEventRef.current(raw as SSEEvent);
      } catch {
        // ignore malformed
      }
    };

    for (const eventType of NAMED_EVENT_TYPES) {
      es.addEventListener(eventType, namedHandler as EventListener);
    }

    es.onerror = () => {
      es.close();
      esRef.current = null;

      const delay = Math.min(
        RECONNECT_BASE_MS * Math.pow(2, retryRef.current),
        RECONNECT_MAX_MS
      );
      retryRef.current += 1;

      reconnectTimerRef.current = setTimeout(async () => {
        await onReconnectRef.current();
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
