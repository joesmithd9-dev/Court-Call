import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as courtEventService from '../services/court-event-service.js';
import { getEventsFromSequence } from '../services/event-store.js';
import { subscribeToEvents, sendEventHeartbeat } from '../services/event-sse-broadcaster.js';
import { CourtEventType } from '../domain/court-event-types.js';
import type { ActorContext } from '../domain/types.js';

const HEARTBEAT_INTERVAL_MS = 30_000;

// ─── Zod Schemas for Event Commands ─────────────────────────────────────────

const CaseStartedSchema = z.object({
  caseId: z.string().uuid(),
});

const CaseCompletedSchema = z.object({
  caseId: z.string().uuid(),
  outcomeCode: z.string().max(100).optional(),
});

const CaseAdjournedSchema = z.object({
  caseId: z.string().uuid(),
  adjournedTo: z.string().datetime(),
});

const CaseNotBeforeSetSchema = z.object({
  caseId: z.string().uuid(),
  notBefore: z.string().datetime(),
});

const CaseDelayAddedSchema = z.object({
  caseId: z.string().uuid(),
  minutes: z.number().int().min(1).max(480),
});

const UndoSchema = z.object({
  targetEventId: z.string().uuid(),
});

// ─── Helper ─────────────────────────────────────────────────────────────────

function extractActor(headers: Record<string, string | string[] | undefined>): ActorContext {
  return {
    userId: (headers['x-actor-user-id'] as string) ?? undefined,
    displayName: (headers['x-actor-display-name'] as string) ?? undefined,
    role: ((headers['x-actor-role'] as string)?.toUpperCase() === 'SYSTEM' ? 'SYSTEM' : 'REGISTRAR') as ActorContext['role'],
  };
}

function getIdempotencyKey(headers: Record<string, string | string[] | undefined>): string | undefined {
  return (headers['idempotency-key'] as string) ?? undefined;
}

// ─── Routes ─────────────────────────────────────────────────────────────────

export async function eventRoutes(app: FastifyInstance): Promise<void> {
  // ─── Snapshot endpoint (spec §7) ──────────────────────────────────────
  // GET /court-days/:id/snapshot
  app.get<{ Params: { id: string } }>(
    '/v1/court-days/:id/snapshot',
    async (request) => {
      return courtEventService.getSnapshot(request.params.id);
    },
  );

  // ─── SSE Event Stream (spec §8) ──────────────────────────────────────
  // GET /court-days/:id/events
  app.get<{ Params: { id: string } }>(
    '/v1/court-days/:id/events',
    async (request, reply) => {
      const courtDayId = request.params.id;

      // Set SSE headers
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
            const ssePayload: Record<string, unknown> = {
              id: event.id,
              sequence: event.sequence,
              type: event.type,
              payload: event.payload,
              createdAt: event.createdAt,
            };
            if (event.idempotencyKey) {
              ssePayload.idempotencyKey = event.idempotencyKey;
            }
            reply.raw.write(
              `id: ${event.sequence}\nevent: court-event\ndata: ${JSON.stringify(ssePayload)}\n\n`,
            );
          }
        }
      }

      // Send initial connection event
      reply.raw.write(
        `event: connected\ndata: ${JSON.stringify({ courtDayId })}\n\n`,
      );

      // Subscribe to live events
      const unsubscribe = subscribeToEvents(courtDayId, reply);

      // Heartbeat
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

      // Cleanup on disconnect
      request.raw.on('close', () => {
        clearInterval(heartbeatTimer);
        unsubscribe();
      });

      await reply;
    },
  );

  // ─── Event History ────────────────────────────────────────────────────
  // GET /court-days/:id/events/history
  app.get<{ Params: { id: string } }>(
    '/v1/court-days/:id/events/history',
    async (request) => {
      const events = await courtEventService.getEventHistory(request.params.id);
      return { events, count: events.length };
    },
  );

  // ─── CASE_STARTED ─────────────────────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    '/v1/court-days/:id/events/case-started',
    async (request, reply) => {
      const payload = CaseStartedSchema.parse(request.body);
      const actor = extractActor(request.headers);
      const event = await courtEventService.emitEvent({
        courtDayId: request.params.id,
        type: CourtEventType.CASE_STARTED,
        payload,
        actor,
        idempotencyKey: getIdempotencyKey(request.headers),
      });
      reply.status(201);
      return { eventId: event.id, sequence: event.sequence, type: event.type };
    },
  );

  // ─── CASE_COMPLETED ───────────────────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    '/v1/court-days/:id/events/case-completed',
    async (request, reply) => {
      const payload = CaseCompletedSchema.parse(request.body);
      const actor = extractActor(request.headers);
      const event = await courtEventService.emitEvent({
        courtDayId: request.params.id,
        type: CourtEventType.CASE_COMPLETED,
        payload,
        actor,
        idempotencyKey: getIdempotencyKey(request.headers),
      });
      reply.status(201);
      return { eventId: event.id, sequence: event.sequence, type: event.type };
    },
  );

  // ─── CASE_ADJOURNED ───────────────────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    '/v1/court-days/:id/events/case-adjourned',
    async (request, reply) => {
      const payload = CaseAdjournedSchema.parse(request.body);
      const actor = extractActor(request.headers);
      const event = await courtEventService.emitEvent({
        courtDayId: request.params.id,
        type: CourtEventType.CASE_ADJOURNED,
        payload,
        actor,
        idempotencyKey: getIdempotencyKey(request.headers),
      });
      reply.status(201);
      return { eventId: event.id, sequence: event.sequence, type: event.type };
    },
  );

  // ─── CASE_NOT_BEFORE_SET ──────────────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    '/v1/court-days/:id/events/case-not-before-set',
    async (request, reply) => {
      const payload = CaseNotBeforeSetSchema.parse(request.body);
      const actor = extractActor(request.headers);
      const event = await courtEventService.emitEvent({
        courtDayId: request.params.id,
        type: CourtEventType.CASE_NOT_BEFORE_SET,
        payload,
        actor,
        idempotencyKey: getIdempotencyKey(request.headers),
      });
      reply.status(201);
      return { eventId: event.id, sequence: event.sequence, type: event.type };
    },
  );

  // ─── CASE_DELAY_ADDED ─────────────────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    '/v1/court-days/:id/events/case-delay-added',
    async (request, reply) => {
      const payload = CaseDelayAddedSchema.parse(request.body);
      const actor = extractActor(request.headers);
      const event = await courtEventService.emitEvent({
        courtDayId: request.params.id,
        type: CourtEventType.CASE_DELAY_ADDED,
        payload,
        actor,
        idempotencyKey: getIdempotencyKey(request.headers),
      });
      reply.status(201);
      return { eventId: event.id, sequence: event.sequence, type: event.type };
    },
  );

  // ─── COURT_ROSE ───────────────────────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    '/v1/court-days/:id/events/court-rose',
    async (request, reply) => {
      const actor = extractActor(request.headers);
      const event = await courtEventService.emitEvent({
        courtDayId: request.params.id,
        type: CourtEventType.COURT_ROSE,
        payload: {},
        actor,
        idempotencyKey: getIdempotencyKey(request.headers),
      });
      reply.status(201);
      return { eventId: event.id, sequence: event.sequence, type: event.type };
    },
  );

  // ─── COURT_RESUMED ────────────────────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    '/v1/court-days/:id/events/court-resumed',
    async (request, reply) => {
      const actor = extractActor(request.headers);
      const event = await courtEventService.emitEvent({
        courtDayId: request.params.id,
        type: CourtEventType.COURT_RESUMED,
        payload: {},
        actor,
        idempotencyKey: getIdempotencyKey(request.headers),
      });
      reply.status(201);
      return { eventId: event.id, sequence: event.sequence, type: event.type };
    },
  );

  // ─── UNDO_APPLIED ────────────────────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    '/v1/court-days/:id/events/undo',
    async (request, reply) => {
      const input = UndoSchema.parse(request.body);
      const actor = extractActor(request.headers);
      const event = await courtEventService.undoEvent({
        courtDayId: request.params.id,
        targetEventId: input.targetEventId,
        actor,
        idempotencyKey: getIdempotencyKey(request.headers),
      });
      reply.status(201);
      return { eventId: event.id, sequence: event.sequence, type: event.type };
    },
  );
}
