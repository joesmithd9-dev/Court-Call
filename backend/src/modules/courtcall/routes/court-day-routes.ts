import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  CreateCourtDaySchema,
  StartLiveSchema,
  JudgeRoseSchema,
  ResumeSchema,
  CloseCourtDaySchema,
} from '../dto/requests.js';
import * as courtDayService from '../services/court-day-service.js';
import * as listItemService from '../services/list-item-service.js';
import * as undoService from '../services/undo-service.js';
import * as projectionService from '../services/projection-service.js';
import type { CommandResult } from '../dto/responses.js';
import { requireActor } from './auth.js';
import {
  abortIdempotentRequest,
  beginIdempotentRequest,
  completeIdempotentRequest,
} from '../services/idempotency-service.js';

const RegistrarCourtDayPatchSchema = z.object({
  status: z
    .enum(['scheduled', 'live', 'judge_rose', 'at_lunch', 'adjourned', 'ended'])
    .optional(),
  statusMessage: z.string().max(500).optional(),
  resumeTime: z.string().datetime().optional(),
});

const ReorderCompatSchema = z.object({
  caseId: z.string().uuid(),
  newPosition: z.number().int().min(1),
});

const UndoCompatSchema = z.object({
  targetEventId: z.string().uuid(),
});

function commandResult(eventId: string, eventType: string): CommandResult {
  return { success: true, eventId, eventType };
}

function headerValue(
  headers: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const value = headers[key];
  if (Array.isArray(value)) return value[0];
  return value;
}

async function runIdempotent<T>(params: {
  scope: string;
  routeKey: string;
  idempotencyKey: string | undefined;
  run: () => Promise<T>;
}): Promise<T> {
  const begin = await beginIdempotentRequest<T>(
    params.scope,
    params.routeKey,
    params.idempotencyKey,
  );
  if (begin.replay) return begin.replay;

  try {
    const result = await params.run();
    await completeIdempotentRequest(begin.recordId, result);
    return result;
  } catch (error) {
    await abortIdempotentRequest(begin.recordId);
    throw error;
  }
}

export async function courtDayRoutes(app: FastifyInstance): Promise<void> {
  // ─── Create court day ────────────────────────────────────────────────
  app.post('/v1/court-days', async (request, reply) => {
    const input = CreateCourtDaySchema.parse(request.body);
    const actor = requireActor(request.headers);

    const response = await runIdempotent<CommandResult>({
      scope: 'global',
      routeKey: 'create-court-day',
      idempotencyKey: headerValue(request.headers, 'idempotency-key'),
      run: async () => {
        const { envelope } = await courtDayService.createCourtDay(input, actor);
        reply.status(201);
        return commandResult(envelope.eventId, envelope.eventType);
      },
    });
    return response;
  });

  // ─── Start live ──────────────────────────────────────────────────────
  app.post<{ Params: { courtDayId: string } }>(
    '/v1/court-days/:courtDayId/start-live',
    async (request, reply) => {
      const input = StartLiveSchema.parse(request.body);
      const actor = requireActor(request.headers);
      const courtDayId = request.params.courtDayId;
      const response = await runIdempotent<CommandResult>({
        scope: `courtday:${courtDayId}`,
        routeKey: 'start-live',
        idempotencyKey: headerValue(request.headers, 'idempotency-key'),
        run: async () => {
          const { envelope } = await courtDayService.startLive(courtDayId, input, actor);
          reply.status(200);
          return commandResult(envelope.eventId, envelope.eventType);
        },
      });
      return response;
    },
  );

  // ─── Judge rose ──────────────────────────────────────────────────────
  app.post<{ Params: { courtDayId: string } }>(
    '/v1/court-days/:courtDayId/judge-rose',
    async (request, reply) => {
      const input = JudgeRoseSchema.parse(request.body);
      const actor = requireActor(request.headers);
      const courtDayId = request.params.courtDayId;
      const response = await runIdempotent<CommandResult>({
        scope: `courtday:${courtDayId}`,
        routeKey: 'judge-rose',
        idempotencyKey: headerValue(request.headers, 'idempotency-key'),
        run: async () => {
          const { envelope } = await courtDayService.judgeRose(courtDayId, input, actor);
          reply.status(200);
          return commandResult(envelope.eventId, envelope.eventType);
        },
      });
      return response;
    },
  );

  // ─── Resume ──────────────────────────────────────────────────────────
  app.post<{ Params: { courtDayId: string } }>(
    '/v1/court-days/:courtDayId/resume',
    async (request, reply) => {
      const input = ResumeSchema.parse(request.body);
      const actor = requireActor(request.headers);
      const courtDayId = request.params.courtDayId;
      const response = await runIdempotent<CommandResult>({
        scope: `courtday:${courtDayId}`,
        routeKey: 'resume',
        idempotencyKey: headerValue(request.headers, 'idempotency-key'),
        run: async () => {
          const { envelope } = await courtDayService.resume(courtDayId, input, actor);
          reply.status(200);
          return commandResult(envelope.eventId, envelope.eventType);
        },
      });
      return response;
    },
  );

  // ─── Close ───────────────────────────────────────────────────────────
  app.post<{ Params: { courtDayId: string } }>(
    '/v1/court-days/:courtDayId/close',
    async (request, reply) => {
      const input = CloseCourtDaySchema.parse(request.body);
      const actor = requireActor(request.headers);
      const courtDayId = request.params.courtDayId;
      const response = await runIdempotent<CommandResult>({
        scope: `courtday:${courtDayId}`,
        routeKey: 'close',
        idempotencyKey: headerValue(request.headers, 'idempotency-key'),
        run: async () => {
          const { envelope } = await courtDayService.closeCourtDay(courtDayId, input, actor);
          reply.status(200);
          return commandResult(envelope.eventId, envelope.eventType);
        },
      });
      return response;
    },
  );

  // ─── Compatibility registrar PATCH endpoint ─────────────────────────
  app.patch<{ Params: { courtDayId: string } }>(
    '/v1/registrar/court-days/:courtDayId',
    async (request) => {
      const actor = requireActor(request.headers);
      const courtDayId = request.params.courtDayId;
      const input = RegistrarCourtDayPatchSchema.parse(request.body);

      await runIdempotent({
        scope: `courtday:${courtDayId}`,
        routeKey: 'registrar-patch-courtday',
        idempotencyKey: headerValue(request.headers, 'idempotency-key'),
        run: async () => {
          switch (input.status) {
            case 'live': {
              const current = await projectionService.getRegistrarProjection(courtDayId);
              if (current.status === 'scheduled') {
                await courtDayService.startLive(
                  courtDayId,
                  { sessionMessage: input.statusMessage },
                  actor,
                );
              } else {
                await courtDayService.resume(
                  courtDayId,
                  { sessionMessage: input.statusMessage },
                  actor,
                );
              }
              break;
            }
            case 'judge_rose':
              await courtDayService.judgeRose(
                courtDayId,
                {
                  sessionStatus: 'JUDGE_RISING_SHORT',
                  message: input.statusMessage,
                  expectedResumeAt: input.resumeTime,
                },
                actor,
              );
              break;
            case 'at_lunch':
              await courtDayService.judgeRose(
                courtDayId,
                {
                  sessionStatus: 'AT_LUNCH',
                  message: input.statusMessage,
                  expectedResumeAt: input.resumeTime,
                },
                actor,
              );
              break;
            case 'adjourned':
              await courtDayService.judgeRose(
                courtDayId,
                {
                  sessionStatus: 'ADJOURNED_PART_HEARD',
                  message: input.statusMessage,
                  expectedResumeAt: input.resumeTime,
                },
                actor,
              );
              break;
            case 'ended':
              await courtDayService.closeCourtDay(
                courtDayId,
                { sessionMessage: input.statusMessage },
                actor,
              );
              break;
            default:
              break;
          }
          return projectionService.getRegistrarProjection(courtDayId);
        },
      });

      return projectionService.getRegistrarProjection(courtDayId);
    },
  );

  // ─── Compatibility start-next endpoint ──────────────────────────────
  app.post<{ Params: { courtDayId: string } }>(
    '/v1/registrar/court-days/:courtDayId/start-next',
    async (request) => {
      const actor = requireActor(request.headers);
      const courtDayId = request.params.courtDayId;

      return runIdempotent({
        scope: `courtday:${courtDayId}`,
        routeKey: 'start-next',
        idempotencyKey: headerValue(request.headers, 'idempotency-key'),
        run: async () => {
          const current = await projectionService.getRegistrarProjection(courtDayId);
          const next = current.listItems.find((item) =>
            ['WAITING', 'PART_HEARD', 'LET_STAND', 'NOT_BEFORE'].includes(item.status),
          );
          if (!next) {
            throw new Error('No callable item available');
          }

          await listItemService.callItem(next.id, { override: false }, actor);
          await listItemService.startItem(next.id, actor);
          return projectionService.getRegistrarProjection(courtDayId);
        },
      });
    },
  );

  // ─── Compatibility reorder endpoint ──────────────────────────────────
  app.post<{ Params: { courtDayId: string } }>(
    '/v1/registrar/court-days/:courtDayId/reorder',
    async (request) => {
      const actor = requireActor(request.headers);
      const courtDayId = request.params.courtDayId;
      const input = ReorderCompatSchema.parse(request.body);

      await runIdempotent({
        scope: `courtday:${courtDayId}`,
        routeKey: 'reorder-compat',
        idempotencyKey: headerValue(request.headers, 'idempotency-key'),
        run: async () => {
          await listItemService.reorderItem(
            input.caseId,
            { targetQueuePosition: input.newPosition },
            actor,
          );
          return projectionService.getRegistrarProjection(courtDayId);
        },
      });

      return projectionService.getRegistrarProjection(courtDayId);
    },
  );

  // ─── Compatibility undo endpoint ─────────────────────────────────────
  app.post<{ Params: { courtDayId: string } }>(
    '/v1/registrar/court-days/:courtDayId/undo',
    async (request) => {
      const actor = requireActor(request.headers);
      const courtDayId = request.params.courtDayId;
      const input = UndoCompatSchema.parse(request.body);

      await runIdempotent({
        scope: `courtday:${courtDayId}`,
        routeKey: 'undo',
        idempotencyKey: headerValue(request.headers, 'idempotency-key'),
        run: async () => {
          await undoService.undoListItemEvent(courtDayId, input.targetEventId, actor);
          return projectionService.getRegistrarProjection(courtDayId);
        },
      });

      return projectionService.getRegistrarProjection(courtDayId);
    },
  );

  // ─── Read: public snapshot ───────────────────────────────────────────
  app.get<{ Params: { courtDayId: string } }>(
    '/v1/public/court-days/:courtDayId',
    async (request) => {
      return projectionService.getPublicProjection(request.params.courtDayId);
    },
  );

  // ─── Read: registrar snapshot ────────────────────────────────────────
  app.get<{ Params: { courtDayId: string } }>(
    '/v1/registrar/court-days/:courtDayId',
    async (request) => {
      requireActor(request.headers);
      return projectionService.getRegistrarProjection(request.params.courtDayId);
    },
  );

  // ─── Read: lookup court day by court + date ──────────────────────────
  app.get<{ Params: { courtId: string; date: string } }>(
    '/v1/courts/:courtId/court-days/:date',
    async (request, reply) => {
      const result = await projectionService.findCourtDayByCourtAndDate(
        request.params.courtId,
        request.params.date,
      );
      if (!result) {
        reply.status(404);
        return { error: 'Court day not found' };
      }
      return projectionService.getPublicProjection(result.id);
    },
  );
}
