import type { FastifyInstance } from 'fastify';
import {
  CreateListItemSchema,
  CallSchema,
  ExtendEstimateSchema,
  NotBeforeSchema,
  AdjournSchema,
  LetStandSchema,
  StoodDownSchema,
  RestoreSchema,
  CompleteSchema,
  ReorderSchema,
  NoteSchema,
  DirectionSchema,
  OutcomeSchema,
  RemoveSchema,
} from '../dto/requests.js';
import * as listItemService from '../services/list-item-service.js';
import type { ActorContext } from '../domain/types.js';
import type { CommandResult } from '../dto/responses.js';

function extractActor(headers: Record<string, string | string[] | undefined>): ActorContext {
  return {
    userId: (headers['x-actor-user-id'] as string) ?? undefined,
    role: ((headers['x-actor-role'] as string)?.toUpperCase() === 'SYSTEM' ? 'SYSTEM' : 'REGISTRAR') as ActorContext['role'],
  };
}

function commandResult(eventId: string, eventType: string, sequence: number): CommandResult {
  return { success: true, eventId, eventType, sequence };
}

export async function listItemRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { courtDayId: string } }>(
    '/v1/court-days/:courtDayId/list-items',
    async (request, reply) => {
      const input = CreateListItemSchema.parse(request.body);
      const actor = extractActor(request.headers);
      const { envelope } = await listItemService.createListItem(request.params.courtDayId, input, actor);
      reply.status(201);
      return commandResult(envelope.eventId, envelope.eventType, envelope.sequence);
    },
  );

  app.post<{ Params: { listItemId: string } }>(
    '/v1/list-items/:listItemId/call',
    async (request) => {
      const input = CallSchema.parse(request.body);
      const actor = extractActor(request.headers);
      const { envelope } = await listItemService.callItem(request.params.listItemId, input, actor);
      return commandResult(envelope.eventId, envelope.eventType, envelope.sequence);
    },
  );

  app.post<{ Params: { listItemId: string } }>(
    '/v1/list-items/:listItemId/start',
    async (request) => {
      const actor = extractActor(request.headers);
      const { envelope } = await listItemService.startItem(request.params.listItemId, actor);
      return commandResult(envelope.eventId, envelope.eventType, envelope.sequence);
    },
  );

  app.post<{ Params: { listItemId: string } }>(
    '/v1/list-items/:listItemId/extend-estimate',
    async (request) => {
      const input = ExtendEstimateSchema.parse(request.body);
      const actor = extractActor(request.headers);
      const { envelope } = await listItemService.extendEstimate(request.params.listItemId, input, actor);
      return commandResult(envelope.eventId, envelope.eventType, envelope.sequence);
    },
  );

  app.post<{ Params: { listItemId: string } }>(
    '/v1/list-items/:listItemId/not-before',
    async (request) => {
      const input = NotBeforeSchema.parse(request.body);
      const actor = extractActor(request.headers);
      const { envelope } = await listItemService.setNotBefore(request.params.listItemId, input, actor);
      return commandResult(envelope.eventId, envelope.eventType, envelope.sequence);
    },
  );

  app.post<{ Params: { listItemId: string } }>(
    '/v1/list-items/:listItemId/adjourn',
    async (request) => {
      const input = AdjournSchema.parse(request.body);
      const actor = extractActor(request.headers);
      const { envelope } = await listItemService.adjournItem(request.params.listItemId, input, actor);
      return commandResult(envelope.eventId, envelope.eventType, envelope.sequence);
    },
  );

  app.post<{ Params: { listItemId: string } }>(
    '/v1/list-items/:listItemId/let-stand',
    async (request) => {
      const input = LetStandSchema.parse(request.body);
      const actor = extractActor(request.headers);
      const { envelope } = await listItemService.letStandItem(request.params.listItemId, input, actor);
      return commandResult(envelope.eventId, envelope.eventType, envelope.sequence);
    },
  );

  app.post<{ Params: { listItemId: string } }>(
    '/v1/list-items/:listItemId/stood-down',
    async (request) => {
      const input = StoodDownSchema.parse(request.body);
      const actor = extractActor(request.headers);
      const { envelope } = await listItemService.standDownItem(request.params.listItemId, input, actor);
      return commandResult(envelope.eventId, envelope.eventType, envelope.sequence);
    },
  );

  app.post<{ Params: { listItemId: string } }>(
    '/v1/list-items/:listItemId/restore',
    async (request) => {
      const input = RestoreSchema.parse(request.body);
      const actor = extractActor(request.headers);
      const { envelope } = await listItemService.restoreItem(request.params.listItemId, input, actor);
      return commandResult(envelope.eventId, envelope.eventType, envelope.sequence);
    },
  );

  app.post<{ Params: { listItemId: string } }>(
    '/v1/list-items/:listItemId/complete',
    async (request) => {
      const input = CompleteSchema.parse(request.body);
      const actor = extractActor(request.headers);
      const { envelope } = await listItemService.completeItem(request.params.listItemId, input, actor);
      return commandResult(envelope.eventId, envelope.eventType, envelope.sequence);
    },
  );

  app.post<{ Params: { listItemId: string } }>(
    '/v1/list-items/:listItemId/reorder',
    async (request) => {
      const input = ReorderSchema.parse(request.body);
      const actor = extractActor(request.headers);
      const { envelope } = await listItemService.reorderItem(request.params.listItemId, input, actor);
      return commandResult(envelope.eventId, envelope.eventType, envelope.sequence);
    },
  );

  app.post<{ Params: { listItemId: string } }>(
    '/v1/list-items/:listItemId/note',
    async (request) => {
      const input = NoteSchema.parse(request.body);
      const actor = extractActor(request.headers);
      const { envelope } = await listItemService.updateNote(request.params.listItemId, input, actor);
      return commandResult(envelope.eventId, envelope.eventType, envelope.sequence);
    },
  );

  app.post<{ Params: { listItemId: string } }>(
    '/v1/list-items/:listItemId/direction',
    async (request) => {
      const input = DirectionSchema.parse(request.body);
      const actor = extractActor(request.headers);
      const { envelope } = await listItemService.recordDirection(request.params.listItemId, input, actor);
      return commandResult(envelope.eventId, envelope.eventType, envelope.sequence);
    },
  );

  app.post<{ Params: { listItemId: string } }>(
    '/v1/list-items/:listItemId/outcome',
    async (request) => {
      const input = OutcomeSchema.parse(request.body);
      const actor = extractActor(request.headers);
      const { envelope } = await listItemService.recordOutcome(request.params.listItemId, input, actor);
      return commandResult(envelope.eventId, envelope.eventType, envelope.sequence);
    },
  );

  app.post<{ Params: { listItemId: string } }>(
    '/v1/list-items/:listItemId/remove',
    async (request) => {
      const input = RemoveSchema.parse(request.body);
      const actor = extractActor(request.headers);
      const { envelope } = await listItemService.removeItem(request.params.listItemId, input, actor);
      return commandResult(envelope.eventId, envelope.eventType, envelope.sequence);
    },
  );
}
