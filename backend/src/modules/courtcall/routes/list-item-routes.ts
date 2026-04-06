import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
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
import * as projectionService from '../services/projection-service.js';
import { requireActor } from './auth.js';
import type { CommandResult } from '../dto/responses.js';
import {
  abortIdempotentRequest,
  beginIdempotentRequest,
  completeIdempotentRequest,
} from '../services/idempotency-service.js';

const RegistrarCasePatchSchema = z.object({
  status: z
    .enum([
      'pending',
      'calling',
      'hearing',
      'adjourned',
      'stood_down',
      'not_before',
      'concluded',
      'vacated',
    ])
    .optional(),
  estimatedMinutes: z.number().int().min(1).max(1440).optional(),
  notBeforeTime: z.string().datetime().optional(),
  adjournedToTime: z.string().datetime().optional(),
  note: z.string().max(1000).optional(),
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

export async function listItemRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { courtDayId: string } }>(
    '/v1/court-days/:courtDayId/list-items',
    async (request, reply) => {
      const input = CreateListItemSchema.parse(request.body);
      const actor = requireActor(request.headers);
      const courtDayId = request.params.courtDayId;
      const response = await runIdempotent<CommandResult>({
        scope: `courtday:${courtDayId}`,
        routeKey: 'create-list-item',
        idempotencyKey: headerValue(request.headers, 'idempotency-key'),
        run: async () => {
          const { envelope } = await listItemService.createListItem(
            courtDayId,
            input,
            actor,
          );
          reply.status(201);
          return commandResult(envelope.eventId, envelope.eventType);
        },
      });
      return response;
    },
  );

  app.post<{ Params: { listItemId: string } }>(
    '/v1/list-items/:listItemId/call',
    async (request) => {
      const input = CallSchema.parse(request.body);
      const actor = requireActor(request.headers);
      const listItemId = request.params.listItemId;
      return runIdempotent<CommandResult>({
        scope: `listitem:${listItemId}`,
        routeKey: 'call',
        idempotencyKey: headerValue(request.headers, 'idempotency-key'),
        run: async () => {
          const { envelope } = await listItemService.callItem(listItemId, input, actor);
          return commandResult(envelope.eventId, envelope.eventType);
        },
      });
    },
  );

  app.post<{ Params: { listItemId: string } }>(
    '/v1/list-items/:listItemId/start',
    async (request) => {
      const actor = requireActor(request.headers);
      const listItemId = request.params.listItemId;
      return runIdempotent<CommandResult>({
        scope: `listitem:${listItemId}`,
        routeKey: 'start',
        idempotencyKey: headerValue(request.headers, 'idempotency-key'),
        run: async () => {
          const { envelope } = await listItemService.startItem(listItemId, actor);
          return commandResult(envelope.eventId, envelope.eventType);
        },
      });
    },
  );

  app.post<{ Params: { listItemId: string } }>(
    '/v1/list-items/:listItemId/extend-estimate',
    async (request) => {
      const input = ExtendEstimateSchema.parse(request.body);
      const actor = requireActor(request.headers);
      const listItemId = request.params.listItemId;
      return runIdempotent<CommandResult>({
        scope: `listitem:${listItemId}`,
        routeKey: 'extend-estimate',
        idempotencyKey: headerValue(request.headers, 'idempotency-key'),
        run: async () => {
          const { envelope } = await listItemService.extendEstimate(listItemId, input, actor);
          return commandResult(envelope.eventId, envelope.eventType);
        },
      });
    },
  );

  app.post<{ Params: { listItemId: string } }>(
    '/v1/list-items/:listItemId/not-before',
    async (request) => {
      const input = NotBeforeSchema.parse(request.body);
      const actor = requireActor(request.headers);
      const listItemId = request.params.listItemId;
      return runIdempotent<CommandResult>({
        scope: `listitem:${listItemId}`,
        routeKey: 'not-before',
        idempotencyKey: headerValue(request.headers, 'idempotency-key'),
        run: async () => {
          const { envelope } = await listItemService.setNotBefore(listItemId, input, actor);
          return commandResult(envelope.eventId, envelope.eventType);
        },
      });
    },
  );

  app.post<{ Params: { listItemId: string } }>(
    '/v1/list-items/:listItemId/adjourn',
    async (request) => {
      const input = AdjournSchema.parse(request.body);
      const actor = requireActor(request.headers);
      const listItemId = request.params.listItemId;
      return runIdempotent<CommandResult>({
        scope: `listitem:${listItemId}`,
        routeKey: 'adjourn',
        idempotencyKey: headerValue(request.headers, 'idempotency-key'),
        run: async () => {
          const { envelope } = await listItemService.adjournItem(listItemId, input, actor);
          return commandResult(envelope.eventId, envelope.eventType);
        },
      });
    },
  );

  app.post<{ Params: { listItemId: string } }>(
    '/v1/list-items/:listItemId/let-stand',
    async (request) => {
      const input = LetStandSchema.parse(request.body);
      const actor = requireActor(request.headers);
      const listItemId = request.params.listItemId;
      return runIdempotent<CommandResult>({
        scope: `listitem:${listItemId}`,
        routeKey: 'let-stand',
        idempotencyKey: headerValue(request.headers, 'idempotency-key'),
        run: async () => {
          const { envelope } = await listItemService.letStandItem(listItemId, input, actor);
          return commandResult(envelope.eventId, envelope.eventType);
        },
      });
    },
  );

  app.post<{ Params: { listItemId: string } }>(
    '/v1/list-items/:listItemId/stood-down',
    async (request) => {
      const input = StoodDownSchema.parse(request.body);
      const actor = requireActor(request.headers);
      const listItemId = request.params.listItemId;
      return runIdempotent<CommandResult>({
        scope: `listitem:${listItemId}`,
        routeKey: 'stood-down',
        idempotencyKey: headerValue(request.headers, 'idempotency-key'),
        run: async () => {
          const { envelope } = await listItemService.standDownItem(listItemId, input, actor);
          return commandResult(envelope.eventId, envelope.eventType);
        },
      });
    },
  );

  app.post<{ Params: { listItemId: string } }>(
    '/v1/list-items/:listItemId/restore',
    async (request) => {
      const input = RestoreSchema.parse(request.body);
      const actor = requireActor(request.headers);
      const listItemId = request.params.listItemId;
      return runIdempotent<CommandResult>({
        scope: `listitem:${listItemId}`,
        routeKey: 'restore',
        idempotencyKey: headerValue(request.headers, 'idempotency-key'),
        run: async () => {
          const { envelope } = await listItemService.restoreItem(listItemId, input, actor);
          return commandResult(envelope.eventId, envelope.eventType);
        },
      });
    },
  );

  app.post<{ Params: { listItemId: string } }>(
    '/v1/list-items/:listItemId/complete',
    async (request) => {
      const input = CompleteSchema.parse(request.body);
      const actor = requireActor(request.headers);
      const listItemId = request.params.listItemId;
      return runIdempotent<CommandResult>({
        scope: `listitem:${listItemId}`,
        routeKey: 'complete',
        idempotencyKey: headerValue(request.headers, 'idempotency-key'),
        run: async () => {
          const { envelope } = await listItemService.completeItem(listItemId, input, actor);
          return commandResult(envelope.eventId, envelope.eventType);
        },
      });
    },
  );

  app.post<{ Params: { listItemId: string } }>(
    '/v1/list-items/:listItemId/reorder',
    async (request) => {
      const input = ReorderSchema.parse(request.body);
      const actor = requireActor(request.headers);
      const listItemId = request.params.listItemId;
      return runIdempotent<CommandResult>({
        scope: `listitem:${listItemId}`,
        routeKey: 'reorder',
        idempotencyKey: headerValue(request.headers, 'idempotency-key'),
        run: async () => {
          const { envelope } = await listItemService.reorderItem(listItemId, input, actor);
          return commandResult(envelope.eventId, envelope.eventType);
        },
      });
    },
  );

  app.post<{ Params: { listItemId: string } }>(
    '/v1/list-items/:listItemId/note',
    async (request) => {
      const input = NoteSchema.parse(request.body);
      const actor = requireActor(request.headers);
      const listItemId = request.params.listItemId;
      return runIdempotent<CommandResult>({
        scope: `listitem:${listItemId}`,
        routeKey: 'note',
        idempotencyKey: headerValue(request.headers, 'idempotency-key'),
        run: async () => {
          const { envelope } = await listItemService.updateNote(listItemId, input, actor);
          return commandResult(envelope.eventId, envelope.eventType);
        },
      });
    },
  );

  app.post<{ Params: { listItemId: string } }>(
    '/v1/list-items/:listItemId/direction',
    async (request) => {
      const input = DirectionSchema.parse(request.body);
      const actor = requireActor(request.headers);
      const listItemId = request.params.listItemId;
      return runIdempotent<CommandResult>({
        scope: `listitem:${listItemId}`,
        routeKey: 'direction',
        idempotencyKey: headerValue(request.headers, 'idempotency-key'),
        run: async () => {
          const { envelope } = await listItemService.recordDirection(listItemId, input, actor);
          return commandResult(envelope.eventId, envelope.eventType);
        },
      });
    },
  );

  app.post<{ Params: { listItemId: string } }>(
    '/v1/list-items/:listItemId/outcome',
    async (request) => {
      const input = OutcomeSchema.parse(request.body);
      const actor = requireActor(request.headers);
      const listItemId = request.params.listItemId;
      return runIdempotent<CommandResult>({
        scope: `listitem:${listItemId}`,
        routeKey: 'outcome',
        idempotencyKey: headerValue(request.headers, 'idempotency-key'),
        run: async () => {
          const { envelope } = await listItemService.recordOutcome(listItemId, input, actor);
          return commandResult(envelope.eventId, envelope.eventType);
        },
      });
    },
  );

  app.post<{ Params: { listItemId: string } }>(
    '/v1/list-items/:listItemId/remove',
    async (request) => {
      const input = RemoveSchema.parse(request.body);
      const actor = requireActor(request.headers);
      const listItemId = request.params.listItemId;
      return runIdempotent<CommandResult>({
        scope: `listitem:${listItemId}`,
        routeKey: 'remove',
        idempotencyKey: headerValue(request.headers, 'idempotency-key'),
        run: async () => {
          const { envelope } = await listItemService.removeItem(listItemId, input, actor);
          return commandResult(envelope.eventId, envelope.eventType);
        },
      });
    },
  );

  // Compatibility endpoint used by registrar UI
  app.patch<{ Params: { courtDayId: string; caseId: string } }>(
    '/v1/registrar/court-days/:courtDayId/cases/:caseId',
    async (request) => {
      const actor = requireActor(request.headers);
      const courtDayId = request.params.courtDayId;
      const caseId = request.params.caseId;
      const input = RegistrarCasePatchSchema.parse(request.body);

      const response = await runIdempotent({
        scope: `courtday:${courtDayId}`,
        routeKey: `compat-case-patch:${caseId}`,
        idempotencyKey: headerValue(request.headers, 'idempotency-key'),
        run: async () => {
          let lastEventId: string | undefined;
          if (input.estimatedMinutes !== undefined) {
            const snapshot = await projectionService.getRegistrarProjection(courtDayId);
            const existing = snapshot.listItems.find((i) => i.id === caseId);
            if (!existing) throw new Error('Case not found');
            const currentEstimate = existing.estimatedDurationMinutes ?? 0;
            if (input.estimatedMinutes > currentEstimate) {
              const res = await listItemService.extendEstimate(
                caseId,
                { additionalMinutes: input.estimatedMinutes - currentEstimate },
                actor,
              );
              lastEventId = res.envelope.eventId;
            }
          }

          if (input.note !== undefined) {
            const res = await listItemService.updateNote(
              caseId,
              { publicNote: input.note },
              actor,
            );
            lastEventId = res.envelope.eventId;
          }

          switch (input.status) {
            case 'concluded':
              lastEventId = (
                await listItemService.completeItem(
                caseId,
                { outcomeCode: 'CONCLUDED' },
                actor,
                )
              ).envelope.eventId;
              break;
            case 'stood_down':
              lastEventId = (await listItemService.standDownItem(caseId, {}, actor)).envelope.eventId;
              break;
            case 'adjourned':
              lastEventId = (
                await listItemService.adjournItem(
                caseId,
                { adjournedUntil: input.adjournedToTime },
                actor,
                )
              ).envelope.eventId;
              break;
            case 'not_before':
              if (!input.notBeforeTime) {
                throw new Error('notBeforeTime is required for not_before status');
              }
              lastEventId = (
                await listItemService.setNotBefore(
                caseId,
                { notBeforeTime: input.notBeforeTime },
                actor,
                )
              ).envelope.eventId;
              break;
            case 'calling':
              lastEventId = (await listItemService.callItem(caseId, { override: false }, actor)).envelope.eventId;
              break;
            case 'hearing':
              lastEventId = (await listItemService.startItem(caseId, actor)).envelope.eventId;
              break;
            case 'pending':
              lastEventId = (await listItemService.restoreItem(caseId, {}, actor)).envelope.eventId;
              break;
            case 'vacated':
              lastEventId = (await listItemService.removeItem(caseId, {}, actor)).envelope.eventId;
              break;
            default:
              break;
          }

          const snapshot = await projectionService.getRegistrarProjection(courtDayId);
          return {
            ...snapshot,
            lastEventId,
          };
        },
      });

      return response;
    },
  );
}
