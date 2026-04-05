import type { ListItem, Prisma } from '@prisma/client';
import { prisma } from './prisma.js';
import { buildEnvelope } from './event-envelope-service.js';
import { publish } from './sse-broadcaster.js';
import { recomputePredictionsForCourtDay } from './court-day-service.js';
import { ListItemStatus, CourtDayStatus } from '../domain/enums.js';
import { ListItemEventType, CourtDayEventType } from '../domain/event-types.js';
import { assertTransitionAllowed, isCallableNow, shouldAffectQueuePrediction } from '../domain/transition-rules.js';
import type { ActorContext, CourtCallEventEnvelope } from '../domain/types.js';
import type {
  CreateListItemInput,
  CallInput,
  ExtendEstimateInput,
  NotBeforeInput,
  AdjournInput,
  LetStandInput,
  StoodDownInput,
  RestoreInput,
  CompleteInput,
  ReorderInput,
  NoteInput,
  DirectionInput,
  OutcomeInput,
  RemoveInput,
} from '../dto/requests.js';

type CommandResult = { listItem: ListItem; envelope: CourtCallEventEnvelope };

// ─── Helper: transition + update in one shot ─────────────────────────────────

async function transitionItem(
  listItemId: string,
  targetStatus: ListItemStatus,
  eventType: string,
  actor: ActorContext,
  extraData: Partial<Record<string, unknown>> = {},
  payloadOverride?: Record<string, unknown>,
): Promise<CommandResult> {
  const result = await prisma.$transaction(async (tx) => {
    const item = await tx.listItem.findUniqueOrThrow({ where: { id: listItemId } });

    assertTransitionAllowed(item.status as ListItemStatus, targetStatus);

    // Build the data object for Prisma update, separating known fields from extras
    const updateData: Record<string, unknown> = { status: targetStatus };
    for (const [k, v] of Object.entries(extraData)) {
      updateData[k] = v;
    }

    const updated = await tx.listItem.update({
      where: { id: listItemId },
      data: updateData,
    });

    const update = await tx.listItemUpdate.create({
      data: {
        listItemId,
        courtDayId: item.courtDayId,
        eventType,
        actorUserId: actor.userId,
        actorDisplayName: actor.displayName,
        actorRole: actor.role,
        previousStatus: item.status,
        newStatus: targetStatus,
        payloadJson: (payloadOverride ?? extraData) as Prisma.InputJsonValue,
      },
    });

    return { item: updated, update, courtDayId: item.courtDayId, previousStatus: item.status };
  });

  const envelope = buildEnvelope({
    eventId: result.update.id,
    eventType,
    aggregateType: 'listitem',
    aggregateId: listItemId,
    courtDayId: result.courtDayId,
    occurredAt: result.update.createdAt,
    actor,
    payload: {
      previousStatus: result.previousStatus,
      newStatus: targetStatus,
      ...(payloadOverride ?? extraData),
    },
  });

  publish(envelope);

  if (shouldAffectQueuePrediction(result.previousStatus as ListItemStatus, targetStatus)) {
    await recomputePredictionsForCourtDay(result.courtDayId);
  }

  return { listItem: result.item, envelope };
}

/**
 * Helper for non-status-changing metadata updates (notes, directions, etc.)
 */
async function metadataUpdate(
  listItemId: string,
  eventType: string,
  actor: ActorContext,
  updateData: Record<string, unknown>,
  payload: Record<string, unknown>,
): Promise<CommandResult> {
  const result = await prisma.$transaction(async (tx) => {
    const item = await tx.listItem.findUniqueOrThrow({ where: { id: listItemId } });

    const updated = await tx.listItem.update({
      where: { id: listItemId },
      data: updateData,
    });

    const update = await tx.listItemUpdate.create({
      data: {
        listItemId,
        courtDayId: item.courtDayId,
        eventType,
        actorUserId: actor.userId,
        actorDisplayName: actor.displayName,
        actorRole: actor.role,
        payloadJson: payload as Prisma.InputJsonValue,
      },
    });

    return { item: updated, update, courtDayId: item.courtDayId };
  });

  const envelope = buildEnvelope({
    eventId: result.update.id,
    eventType,
    aggregateType: 'listitem',
    aggregateId: listItemId,
    courtDayId: result.courtDayId,
    occurredAt: result.update.createdAt,
    actor,
    payload,
  });

  publish(envelope);
  return { listItem: result.item, envelope };
}

// ─── Commands ────────────────────────────────────────────────────────────────

export async function createListItem(
  courtDayId: string,
  input: CreateListItemInput,
  actor: ActorContext,
): Promise<CommandResult> {
  const result = await prisma.$transaction(async (tx) => {
    // Verify court day exists and is not closed
    const courtDay = await tx.courtDay.findUniqueOrThrow({ where: { id: courtDayId } });
    if (courtDay.status === CourtDayStatus.CLOSED) {
      throw new Error('Cannot add items to a closed court day');
    }

    // Determine queue position: append at end
    const lastItem = await tx.listItem.findFirst({
      where: { courtDayId },
      orderBy: { queuePosition: 'desc' },
      select: { queuePosition: true },
    });
    const queuePosition = (lastItem?.queuePosition ?? 0) + 1;

    const initialStatus = input.notBeforeTime
      ? ListItemStatus.NOT_BEFORE
      : ListItemStatus.WAITING;

    const item = await tx.listItem.create({
      data: {
        courtDayId,
        queuePosition,
        caseName: input.caseName,
        caseReference: input.caseReference,
        partiesShort: input.partiesShort ?? null,
        status: initialStatus,
        estimatedDurationMinutes: input.estimatedDurationMinutes ?? null,
        notBeforeTime: input.notBeforeTime ? new Date(input.notBeforeTime) : null,
        isPriority: input.isPriority ?? false,
        publicNote: input.publicNote ?? null,
        internalNote: input.internalNote ?? null,
      },
    });

    const update = await tx.listItemUpdate.create({
      data: {
        listItemId: item.id,
        courtDayId,
        eventType: ListItemEventType.CREATED,
        actorUserId: actor.userId,
        actorDisplayName: actor.displayName,
        actorRole: actor.role,
        newStatus: initialStatus,
        payloadJson: {
          caseName: input.caseName,
          caseReference: input.caseReference,
          queuePosition,
        },
      },
    });

    return { item, update };
  });

  const envelope = buildEnvelope({
    eventId: result.update.id,
    eventType: ListItemEventType.CREATED,
    aggregateType: 'listitem',
    aggregateId: result.item.id,
    courtDayId,
    occurredAt: result.update.createdAt,
    actor,
    payload: {
      caseName: input.caseName,
      caseReference: input.caseReference,
      queuePosition: result.item.queuePosition,
      status: result.item.status,
    },
  });

  publish(envelope);
  await recomputePredictionsForCourtDay(courtDayId);
  return { listItem: result.item, envelope };
}

export async function callItem(
  listItemId: string,
  input: CallInput,
  actor: ActorContext,
): Promise<CommandResult> {
  // Pre-check callable status before entering transaction
  const item = await prisma.listItem.findUniqueOrThrow({ where: { id: listItemId } });

  if (!input.override && !isCallableNow(item.status as ListItemStatus, item.notBeforeTime)) {
    throw new Error(
      `Item ${listItemId} is not callable now (status: ${item.status}, notBefore: ${item.notBeforeTime?.toISOString() ?? 'none'})`,
    );
  }

  return transitionItem(listItemId, ListItemStatus.CALLING, ListItemEventType.CALLED, actor, {
    calledAt: new Date(),
  });
}

export async function startItem(
  listItemId: string,
  actor: ActorContext,
): Promise<CommandResult> {
  return transitionItem(listItemId, ListItemStatus.HEARING, ListItemEventType.STARTED, actor, {
    actualStartTime: new Date(),
  });
}

export async function extendEstimate(
  listItemId: string,
  input: ExtendEstimateInput,
  actor: ActorContext,
): Promise<CommandResult> {
  const result = await prisma.$transaction(async (tx) => {
    const item = await tx.listItem.findUniqueOrThrow({ where: { id: listItemId } });

    const currentEstimate = item.estimatedDurationMinutes ?? 0;
    const newEstimate = currentEstimate + input.additionalMinutes;

    const updated = await tx.listItem.update({
      where: { id: listItemId },
      data: { estimatedDurationMinutes: newEstimate },
    });

    const update = await tx.listItemUpdate.create({
      data: {
        listItemId,
        courtDayId: item.courtDayId,
        eventType: ListItemEventType.ESTIMATE_EXTENDED,
        actorUserId: actor.userId,
        actorDisplayName: actor.displayName,
        actorRole: actor.role,
        payloadJson: {
          previousEstimate: currentEstimate,
          additionalMinutes: input.additionalMinutes,
          newEstimate,
        },
      },
    });

    return { item: updated, update, courtDayId: item.courtDayId };
  });

  const envelope = buildEnvelope({
    eventId: result.update.id,
    eventType: ListItemEventType.ESTIMATE_EXTENDED,
    aggregateType: 'listitem',
    aggregateId: listItemId,
    courtDayId: result.courtDayId,
    occurredAt: result.update.createdAt,
    actor,
    payload: {
      previousEstimate: (result.item.estimatedDurationMinutes ?? 0) - input.additionalMinutes,
      additionalMinutes: input.additionalMinutes,
      newEstimate: result.item.estimatedDurationMinutes,
    },
  });

  publish(envelope);
  await recomputePredictionsForCourtDay(result.courtDayId);
  return { listItem: result.item, envelope };
}

export async function setNotBefore(
  listItemId: string,
  input: NotBeforeInput,
  actor: ActorContext,
): Promise<CommandResult> {
  return transitionItem(
    listItemId,
    ListItemStatus.NOT_BEFORE,
    ListItemEventType.NOT_BEFORE_SET,
    actor,
    {
      notBeforeTime: new Date(input.notBeforeTime),
      publicNote: input.publicNote ?? undefined,
    },
    {
      notBeforeTime: input.notBeforeTime,
      publicNote: input.publicNote ?? null,
    },
  );
}

export async function adjournItem(
  listItemId: string,
  input: AdjournInput,
  actor: ActorContext,
): Promise<CommandResult> {
  return transitionItem(
    listItemId,
    ListItemStatus.ADJOURNED,
    ListItemEventType.ADJOURNED,
    actor,
    {
      adjournedUntil: input.adjournedUntil ? new Date(input.adjournedUntil) : null,
      publicNote: input.publicNote ?? undefined,
      internalNote: input.internalNote ?? undefined,
      directionCode: input.directionCode ?? undefined,
    },
    {
      adjournedUntil: input.adjournedUntil ?? null,
      publicNote: input.publicNote ?? null,
      internalNote: input.internalNote ?? null,
      directionCode: input.directionCode ?? null,
    },
  );
}

export async function letStandItem(
  listItemId: string,
  input: LetStandInput,
  actor: ActorContext,
): Promise<CommandResult> {
  return transitionItem(
    listItemId,
    ListItemStatus.LET_STAND,
    ListItemEventType.LET_STAND,
    actor,
    {
      publicNote: input.publicNote ?? undefined,
      internalNote: input.internalNote ?? undefined,
    },
    {
      publicNote: input.publicNote ?? null,
      internalNote: input.internalNote ?? null,
    },
  );
}

export async function standDownItem(
  listItemId: string,
  input: StoodDownInput,
  actor: ActorContext,
): Promise<CommandResult> {
  return transitionItem(
    listItemId,
    ListItemStatus.STOOD_DOWN,
    ListItemEventType.STOOD_DOWN,
    actor,
    {
      stoodDownAt: new Date(),
      publicNote: input.publicNote ?? undefined,
      internalNote: input.internalNote ?? undefined,
    },
    {
      publicNote: input.publicNote ?? null,
      internalNote: input.internalNote ?? null,
    },
  );
}

export async function restoreItem(
  listItemId: string,
  input: RestoreInput,
  actor: ActorContext,
): Promise<CommandResult> {
  return transitionItem(
    listItemId,
    ListItemStatus.WAITING,
    ListItemEventType.RESTORED,
    actor,
    {
      restoredAt: new Date(),
      publicNote: input.publicNote ?? undefined,
    },
    {
      publicNote: input.publicNote ?? null,
    },
  );
}

export async function completeItem(
  listItemId: string,
  input: CompleteInput,
  actor: ActorContext,
): Promise<CommandResult> {
  return transitionItem(
    listItemId,
    ListItemStatus.CONCLUDED,
    ListItemEventType.COMPLETED,
    actor,
    {
      outcomeCode: input.outcomeCode,
      actualEndTime: new Date(),
      publicNote: input.publicNote ?? undefined,
      internalNote: input.internalNote ?? undefined,
    },
    {
      outcomeCode: input.outcomeCode,
      publicNote: input.publicNote ?? null,
      internalNote: input.internalNote ?? null,
    },
  );
}

export async function reorderItem(
  listItemId: string,
  input: ReorderInput,
  actor: ActorContext,
): Promise<CommandResult> {
  const result = await prisma.$transaction(async (tx) => {
    const item = await tx.listItem.findUniqueOrThrow({ where: { id: listItemId } });
    const oldPosition = item.queuePosition;
    const newPosition = input.targetQueuePosition;

    if (oldPosition === newPosition) {
      throw new Error('Item is already at the target position');
    }

    // Shift other items to make room
    if (newPosition < oldPosition) {
      // Moving up: shift items in [newPosition, oldPosition-1] down by 1
      await tx.listItem.updateMany({
        where: {
          courtDayId: item.courtDayId,
          queuePosition: { gte: newPosition, lt: oldPosition },
        },
        data: { queuePosition: { increment: 1 } },
      });
    } else {
      // Moving down: shift items in [oldPosition+1, newPosition] up by 1
      await tx.listItem.updateMany({
        where: {
          courtDayId: item.courtDayId,
          queuePosition: { gt: oldPosition, lte: newPosition },
        },
        data: { queuePosition: { decrement: 1 } },
      });
    }

    const updated = await tx.listItem.update({
      where: { id: listItemId },
      data: { queuePosition: newPosition },
    });

    const update = await tx.listItemUpdate.create({
      data: {
        listItemId,
        courtDayId: item.courtDayId,
        eventType: ListItemEventType.REORDERED,
        actorUserId: actor.userId,
        actorDisplayName: actor.displayName,
        actorRole: actor.role,
        payloadJson: {
          previousPosition: oldPosition,
          newPosition,
        },
      },
    });

    // Also emit a court-day-level resequence event
    await tx.courtDayUpdate.create({
      data: {
        courtDayId: item.courtDayId,
        eventType: CourtDayEventType.LIST_RESEQUENCED,
        actorUserId: actor.userId,
        actorDisplayName: actor.displayName,
        actorRole: actor.role,
        payloadJson: {
          trigger: 'reorder',
          listItemId,
          previousPosition: oldPosition,
          newPosition,
        },
      },
    });

    return { item: updated, update, courtDayId: item.courtDayId, oldPosition };
  });

  const envelope = buildEnvelope({
    eventId: result.update.id,
    eventType: ListItemEventType.REORDERED,
    aggregateType: 'listitem',
    aggregateId: listItemId,
    courtDayId: result.courtDayId,
    occurredAt: result.update.createdAt,
    actor,
    payload: {
      previousPosition: result.oldPosition,
      newPosition: input.targetQueuePosition,
    },
  });

  publish(envelope);
  await recomputePredictionsForCourtDay(result.courtDayId);
  return { listItem: result.item, envelope };
}

export async function updateNote(
  listItemId: string,
  input: NoteInput,
  actor: ActorContext,
): Promise<CommandResult> {
  const updateData: Record<string, unknown> = {};
  if (input.publicNote !== undefined) updateData.publicNote = input.publicNote;
  if (input.internalNote !== undefined) updateData.internalNote = input.internalNote;

  return metadataUpdate(listItemId, ListItemEventType.NOTE_UPDATED, actor, updateData, {
    publicNote: input.publicNote ?? null,
    internalNote: input.internalNote ?? null,
  });
}

export async function recordDirection(
  listItemId: string,
  input: DirectionInput,
  actor: ActorContext,
): Promise<CommandResult> {
  const updateData: Record<string, unknown> = {
    directionCode: input.directionCode,
  };
  if (input.publicNote !== undefined) updateData.publicNote = input.publicNote;
  if (input.internalNote !== undefined) updateData.internalNote = input.internalNote;

  return metadataUpdate(listItemId, ListItemEventType.DIRECTION_RECORDED, actor, updateData, {
    directionCode: input.directionCode,
    publicNote: input.publicNote ?? null,
    internalNote: input.internalNote ?? null,
  });
}

export async function recordOutcome(
  listItemId: string,
  input: OutcomeInput,
  actor: ActorContext,
): Promise<CommandResult> {
  const updateData: Record<string, unknown> = {
    outcomeCode: input.outcomeCode,
  };
  if (input.publicNote !== undefined) updateData.publicNote = input.publicNote;
  if (input.internalNote !== undefined) updateData.internalNote = input.internalNote;

  return metadataUpdate(listItemId, ListItemEventType.OUTCOME_RECORDED, actor, updateData, {
    outcomeCode: input.outcomeCode,
    publicNote: input.publicNote ?? null,
    internalNote: input.internalNote ?? null,
  });
}

export async function removeItem(
  listItemId: string,
  input: RemoveInput,
  actor: ActorContext,
): Promise<CommandResult> {
  return transitionItem(
    listItemId,
    ListItemStatus.REMOVED,
    ListItemEventType.REMOVED,
    actor,
    {
      publicNote: input.publicNote ?? undefined,
      internalNote: input.internalNote ?? undefined,
    },
    {
      publicNote: input.publicNote ?? null,
      internalNote: input.internalNote ?? null,
    },
  );
}
