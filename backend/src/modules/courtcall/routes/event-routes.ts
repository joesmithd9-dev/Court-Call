import type { FastifyInstance } from 'fastify';
import * as courtEventService from '../services/court-event-service.js';
import { getEventsFromSequence } from '../services/event-store.js';
import { subscribeToEvents } from '../services/event-sse-broadcaster.js';
import type { ActorContext } from '../domain/types.js';

const HEARTBEAT_INTERVAL_MS = 30_000;

function extractActor(headers: Record<string, string | string[] | undefined>): ActorContext {
  return {
    userId: (headers['x-actor-user-id'] as string) ?? undefined,
    role: ((headers['x-actor-role'] as string)?.toUpperCase() === 'SYSTEM' ? 'SYSTEM' : 'REGISTRAR') as ActorContext['role'],
  };
}

export async function eventRoutes(app: FastifyInstance): Promise<void> {
  // ─── Snapshot endpoint (spec §7) ──────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    '/v1/court-days/:id/snapshot',
    async (request) => {
      return courtEventService.getSnapshot(request.params.id);
    },
  );

  // ─── SSE Event Stream (spec §8) ──────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    '/v1/court-days/:id/events',
    async (request, reply) => {
      const courtDayId = request.params.id;

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      // Reconnect support: replay from last sequence
      const lastSeqHeader = request.headers['last-event-sequence'] as string | undefined;
      if (lastSeqHeader) {
        const fromSequence = parseInt(lastSeqHeader, 10) + 1;
        if (!isNaN(fromSequence) && fromSequence > 0) {
          const missedEvents = await getEventsFromSequence(courtDayId, fromSequence);
          for (const event of missedEvents) {
            const ssePayload = {
              id: event.id,
              sequence: event.sequence,
              eventType: event.eventType,
              timestamp: event.timestamp.toISOString(),
              idempotencyKey: event.idempotencyKey,
            };
            reply.raw.write(
              `id: ${event.sequence}\nevent: court-event\ndata: ${JSON.stringify(ssePayload)}\n\n`,
            );
          }
        }
      }

      reply.raw.write(
        `event: connected\ndata: ${JSON.stringify({ courtDayId })}\n\n`,
      );

      const unsubscribe = subscribeToEvents(courtDayId, reply);

      const heartbeatTimer = setInterval(() => {
        try {
          if (!reply.raw.destroyed && !reply.raw.writableEnded) {
            reply.raw.write(': heartbeat\n\n');
          } else {
            clearInterval(heartbeatTimer);
          }
        } catch {
          clearInterval(heartbeatTimer);
        }
      }, HEARTBEAT_INTERVAL_MS);

      request.raw.on('close', () => {
        clearInterval(heartbeatTimer);
        unsubscribe();
      });

      await reply;
    },
  );

  // ─── Event History ────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    '/v1/court-days/:id/events/history',
    async (request) => {
      const events = await courtEventService.getEventHistory(request.params.id);
      return { events, count: events.length };
    },
  );
}
