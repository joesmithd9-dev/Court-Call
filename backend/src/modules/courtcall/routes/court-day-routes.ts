import type { FastifyInstance } from 'fastify';
import {
  CreateCourtDaySchema,
  StartLiveSchema,
  JudgeRoseSchema,
  ResumeSchema,
  CloseCourtDaySchema,
} from '../dto/requests.js';
import * as courtDayService from '../services/court-day-service.js';
import * as projectionService from '../services/projection-service.js';
import type { ActorContext } from '../domain/types.js';
import type { CommandResult } from '../dto/responses.js';

/**
 * Extract actor context from request headers.
 * In production this would come from an auth middleware / JWT.
 * For MVP we accept explicit headers.
 */
function extractActor(headers: Record<string, string | string[] | undefined>): ActorContext {
  return {
    userId: (headers['x-actor-user-id'] as string) ?? undefined,
    displayName: (headers['x-actor-display-name'] as string) ?? undefined,
    role: ((headers['x-actor-role'] as string)?.toUpperCase() === 'SYSTEM' ? 'SYSTEM' : 'REGISTRAR') as ActorContext['role'],
  };
}

function commandResult(eventId: string, eventType: string): CommandResult {
  return { success: true, eventId, eventType };
}

export async function courtDayRoutes(app: FastifyInstance): Promise<void> {
  // ─── Create court day ────────────────────────────────────────────────
  app.post('/v1/court-days', async (request, reply) => {
    const input = CreateCourtDaySchema.parse(request.body);
    const actor = extractActor(request.headers);
    const { envelope } = await courtDayService.createCourtDay(input, actor);
    reply.status(201);
    return commandResult(envelope.eventId, envelope.eventType);
  });

  // ─── Start live ──────────────────────────────────────────────────────
  app.post<{ Params: { courtDayId: string } }>(
    '/v1/court-days/:courtDayId/start-live',
    async (request, reply) => {
      const input = StartLiveSchema.parse(request.body);
      const actor = extractActor(request.headers);
      const { envelope } = await courtDayService.startLive(request.params.courtDayId, input, actor);
      reply.status(200);
      return commandResult(envelope.eventId, envelope.eventType);
    },
  );

  // ─── Judge rose ──────────────────────────────────────────────────────
  app.post<{ Params: { courtDayId: string } }>(
    '/v1/court-days/:courtDayId/judge-rose',
    async (request, reply) => {
      const input = JudgeRoseSchema.parse(request.body);
      const actor = extractActor(request.headers);
      const { envelope } = await courtDayService.judgeRose(request.params.courtDayId, input, actor);
      reply.status(200);
      return commandResult(envelope.eventId, envelope.eventType);
    },
  );

  // ─── Resume ──────────────────────────────────────────────────────────
  app.post<{ Params: { courtDayId: string } }>(
    '/v1/court-days/:courtDayId/resume',
    async (request, reply) => {
      const input = ResumeSchema.parse(request.body);
      const actor = extractActor(request.headers);
      const { envelope } = await courtDayService.resume(request.params.courtDayId, input, actor);
      reply.status(200);
      return commandResult(envelope.eventId, envelope.eventType);
    },
  );

  // ─── Close ───────────────────────────────────────────────────────────
  app.post<{ Params: { courtDayId: string } }>(
    '/v1/court-days/:courtDayId/close',
    async (request, reply) => {
      const input = CloseCourtDaySchema.parse(request.body);
      const actor = extractActor(request.headers);
      const { envelope } = await courtDayService.closeCourtDay(request.params.courtDayId, input, actor);
      reply.status(200);
      return commandResult(envelope.eventId, envelope.eventType);
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
