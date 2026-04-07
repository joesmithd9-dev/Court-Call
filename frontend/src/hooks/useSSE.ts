import { useEffect, useRef, useCallback } from 'react';
import type { SSEEvent } from '../types';

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;

interface UseSSEOptions {
  url: string;
  onEvent: (event: SSEEvent) => void;
  onReconnect: () => Promise<void> | void;
  enabled?: boolean;
}

const NAMED_BACKEND_EVENTS = [
  'courtday.created',
  'courtday.live_started',
  'courtday.judge_rose',
  'courtday.resumed',
  'courtday.closed',
  'courtday.projections_recomputed',
  'courtday.list_resequenced',
  'listitem.created',
  'listitem.called',
  'listitem.started',
  'listitem.estimate_extended',
  'listitem.not_before_set',
  'listitem.adjourned',
  'listitem.let_stand',
  'listitem.stood_down',
  'listitem.restored',
  'listitem.direction_recorded',
  'listitem.note_updated',
  'listitem.outcome_recorded',
  'listitem.completed',
  'listitem.reordered',
  'listitem.removed',
  'listitem.undo_applied',
] as const;

function normaliseIncomingEvent(raw: unknown): SSEEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;

  if (
    typeof record.sequence === 'number' &&
    typeof record.type === 'string' &&
    typeof record.timestamp === 'string'
  ) {
    return {
      id: String(record.id ?? crypto.randomUUID()),
      sequence: record.sequence,
      type: record.type as SSEEvent['type'],
      data: (record.data as SSEEvent['data']) ?? {},
      timestamp: record.timestamp,
    };
  }

  if (typeof record.version === 'number') {
    return {
      id: (record.eventId as string) ?? crypto.randomUUID(),
      sequence: record.version,
      type: 'court_day_updated',
      data: {},
      timestamp: (record.occurredAt as string) ?? new Date().toISOString(),
    };
  }

  return null;
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

    const handleIncoming = (e: MessageEvent<string>) => {
      try {
        const parsed = JSON.parse(e.data);
        const event = normaliseIncomingEvent(parsed);
        if (event) {
          onEventRef.current(event);
        }
      } catch {
        // ignore malformed events
      }
    };
    es.onmessage = handleIncoming;
    for (const eventName of NAMED_BACKEND_EVENTS) {
      es.addEventListener(eventName, handleIncoming as EventListener);
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
        // 6.2: Reconnect fetches fresh snapshot before reopening stream
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
