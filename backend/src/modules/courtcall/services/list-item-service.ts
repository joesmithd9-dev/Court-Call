import type { ListItem, Prisma } from '@prisma/client';
import { prisma } from './prisma.js';
import { buildEnvelope } from './event-envelope-service.js';
import { publish } from './sse-broadcaster.js';
import { ListItemStatus, CourtDayStatus } from '../domain/enums.js';
import { ListItemEventType } from '../domain/event-types.js';
import { assertTransitionAllowed, isCallableNow, shouldAffectQueuePrediction } from '../domain/transition-rules.js';
import type { ActorContext, CourtCallEventEnvelope } from '../domain/types.js';
import {
  bridgeCaseStarted,
  bridgeCaseCompleted,
  bridgeCaseAdjourned,
  bridgeCaseNotBeforeSet,
  bridgeCaseDelayAdded,
} from './event-bridge.js';
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
type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function nextSequence(tx: TxClient, courtDayId: string): Promise<number> {
  const updated = await tx.courtDay.update({
    where: { id: courtDayId },
    data: { lastSequence: { increment: 1 } },
    select: { lastSequence: true },
  });
  return updated.lastSequence;
}

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

    const updateData: Record<string, unknown> = { status: targetStatus };
    for (const [k, v] of Object.entries(extraData)) {
      updateData[k] = v;
    }

    const updated = await tx.listItem.update({
      where: { id: listItemId },
      data: updateData,
    });

    const seq = await nextSequence(tx, item.courtDayId);

    const update = await tx.listUpdate.create({
      data: {
        listItemId,
        courtDayId: item.courtDayId,
        sequence: seq,
        eventType,
        updatedById: actor.userId ?? null,
        previousStatus: item.status as any,
        newStatus: targetStatus as any,
        snapshotNote: (payloadOverride?.publicNote as string) ?? (extraData.publicNote as string) ?? null,
      },
    });

    return { item: updated, update, courtDayId: item.courtDayId, previousStatus: item.status, seq };
  });

  const envelope = buildEnvelope({
    eventId: result.update.id,
    eventType,
    aggregateType: 'listitem',
    aggregateId: listItemId,
    courtDayId: result.courtDayId,
    occurredAt: result.update.timestamp,
    sequence: result.seq,
    actor,
    payload: {
      previousStatus: result.previousStatus,
      newStatus: targetStatus,
      ...(payloadOverride ?? extraData),
    },
  });

  publish(envelope);
  return { listItem: result.item, envelope };
}

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

    const seq = await nextSequence(tx, item.courtDayId);

    const update = await tx.listUpdate.create({
      data: {
        listItemId,
        courtDayId: item.courtDayId,
        sequence: seq,
        eventType,
        updatedById: actor.userId ?? null,
      },
    });

    return { item: updated, update, courtDayId: item.courtDayId, seq };
  });

  const envelope = buildEnvelope({
    eventId: result.update.id,
    eventType,
    aggregateType: 'listitem',
    aggregateId: listItemId,
    courtDayId: result.courtDayId,
    occurredAt: result.update.timestamp,
    sequence: result.seq,
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
    const courtDay = await tx.courtDay.findUniqueOrThrow({ where: { id: courtDayId } });
    if (courtDay.status === CourtDayStatus.CONCLUDED) {
      throw new Error('Cannot add items to a concluded court day');
    }

    const lastItem = await tx.listItem.findFirst({
      where: { courtDayId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    const position = (lastItem?.position ?? 0) + 1;

    const initialStatus = input.notBeforeTime
      ? ListItemStatus.NOT_BEFORE
      : ListItemStatus.WAITING;

    const item = await tx.listItem.create({
      data: {
        courtDayId,
        position,
        caseTitleFull: input.caseTitleFull,
        caseTitlePublic: input.caseTitlePublic,
        caseReference: input.caseReference ?? null,
        parties: input.parties ?? null,
        counselNames: input.counselNames ?? [],
        status: initialStatus,
        estimatedDurationMinutes: input.estimatedDurationMinutes ?? null,
        notBeforeTime: input.notBeforeTime ? new Date(input.notBeforeTime) : null,
        publicNote: input.publicNote ?? null,
        internalNote: input.internalNote ?? null,
      },
    });

    const seq = await nextSequence(tx, courtDayId);

    const update = await tx.listUpdate.create({
      data: {
        listItemId: item.id,
        courtDayId,
        sequence: seq,
        eventType: ListItemEventType.CREATED,
        updatedById: actor.userId ?? null,
        newStatus: initialStatus as any,
      },
    });

    return { item, update, seq };
  });

  const envelope = buildEnvelope({
    eventId: result.update.id,
    eventType: ListItemEventType.CREATED,
    aggregateType: 'listitem',
    aggregateId: result.item.id,
    courtDayId,
    occurredAt: result.update.timestamp,
    sequence: result.seq,
    actor,
    payload: {
      caseTitlePublic: input.caseTitlePublic,
      caseReference: input.caseReference ?? null,
      position: result.item.position,
      status: result.item.status,
    },
  });

  publish(envelope);
  return { listItem: result.item, envelope };
}

export async function callItem(
  listItemId: string,
  input: CallInput,
  actor: ActorContext,
): Promise<CommandResult> {
  const item = await prisma.listItem.findUniqueOrThrow({ where: { id: listItemId } });

  if (!input.override && !isCallableNow(item.status as ListItemStatus, item.notBeforeTime)) {
    throw new Error(
      `Item ${listItemId} is not callable now (status: ${item.status}, notBefore: ${item.notBeforeTime?.toISOString() ?? 'none'})`,
    );
  }

  return transitionItem(listItemId, ListItemStatus.CALLING, ListItemEventType.CALLED, actor);
}

export async function startItem(
  listItemId: string,
  actor: ActorContext,
): Promise<CommandResult> {
  const result = await prisma.$transaction(async (tx) => {
    const target = await tx.listItem.findUniqueOrThrow({ where: { id: listItemId } });

    assertTransitionAllowed(target.status as ListItemStatus, ListItemStatus.HEARING);

    const now = new Date();

    // Auto-complete active items (single active invariant)
    const activeItems = await tx.listItem.findMany({
      where: {
        courtDayId: target.courtDayId,
        id: { not: listItemId },
        status: { in: ['HEARING', 'CALLING'] },
      },
    });

    for (const active of activeItems) {
      await tx.listItem.update({
        where: { id: active.id },
        data: {
          status: 'CONCLUDED',
          actualEndTime: now,
          outcomeCode: active.outcomeCode ?? 'CONCLUDED',
        },
      });

      const autoSeq = await nextSequence(tx, target.courtDayId);

      await tx.listUpdate.create({
        data: {
          listItemId: active.id,
          courtDayId: target.courtDayId,
          sequence: autoSeq,
          eventType: ListItemEventType.COMPLETED,
          updatedById: actor.userId ?? null,
          previousStatus: active.status as any,
          newStatus: 'CONCLUDED' as any,
          snapshotNote: 'Auto-concluded: new item started',
        },
      });
    }

    const updated = await tx.listItem.update({
      where: { id: listItemId },
      data: {
        status: ListItemStatus.HEARING,
        actualStartTime: now,
      },
    });

    const seq = await nextSequence(tx, target.courtDayId);

    const update = await tx.listUpdate.create({
      data: {
        listItemId,
        courtDayId: target.courtDayId,
        sequence: seq,
        eventType: ListItemEventType.STARTED,
        updatedById: actor.userId ?? null,
        previousStatus: target.status as any,
        newStatus: ListItemStatus.HEARING as any,
      },
    });

    return {
      item: updated,
      update,
      courtDayId: target.courtDayId,
      previousStatus: target.status,
      autoCompletedIds: activeItems.map((a) => a.id),
      seq,
    };
  });

  // Broadcast auto-completion events first
  for (const id of result.autoCompletedIds) {
    const autoEnvelope = buildEnvelope({
      eventId: `auto_complete_${id}_${Date.now()}`,
      eventType: ListItemEventType.COMPLETED,
      aggregateType: 'listitem',
      aggregateId: id,
      courtDayId: result.courtDayId,
      occurredAt: new Date(),
      sequence: result.seq - 1, // auto-complete happened before the start
      actor,
      payload: { autoCompleted: true },
    });
    publish(autoEnvelope);
  }

  const envelope = buildEnvelope({
    eventId: result.update.id,
    eventType: ListItemEventType.STARTED,
    aggregateType: 'listitem',
    aggregateId: listItemId,
    courtDayId: result.courtDayId,
    occurredAt: result.update.timestamp,
    sequence: result.seq,
    actor,
    payload: {
      previousStatus: result.previousStatus,
      newStatus: ListItemStatus.HEARING,
      autoCompletedPriorItems: result.autoCompletedIds,
    },
  });

  publish(envelope);
  bridgeCaseStarted(result.courtDayId, listItemId, actor);
  for (const id of result.autoCompletedIds) {
    bridgeCaseCompleted(result.courtDayId, id, 'CONCLUDED', actor);
  }
  return { listItem: result.item, envelope };
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

    const seq = await nextSequence(tx, item.courtDayId);

    const update = await tx.listUpdate.create({
      data: {
        listItemId,
        courtDayId: item.courtDayId,
        sequence: seq,
        eventType: ListItemEventType.ESTIMATE_EXTENDED,
        updatedById: actor.userId ?? null,
        minutesAdded: input.additionalMinutes,
      },
    });

    return { item: updated, update, courtDayId: item.courtDayId, seq };
  });

  const envelope = buildEnvelope({
    eventId: result.update.id,
    eventType: ListItemEventType.ESTIMATE_EXTENDED,
    aggregateType: 'listitem',
    aggregateId: listItemId,
    courtDayId: result.courtDayId,
    occurredAt: result.update.timestamp,
    sequence: result.seq,
    actor,
    payload: {
      additionalMinutes: input.additionalMinutes,
      newEstimate: result.item.estimatedDurationMinutes,
    },
  });

  publish(envelope);
  bridgeCaseDelayAdded(result.courtDayId, listItemId, input.additionalMinutes, actor);
  return { listItem: result.item, envelope };
}

export async function setNotBefore(
  listItemId: string,
  input: NotBeforeInput,
  actor: ActorContext,
): Promise<CommandResult> {
  const result = await transitionItem(
    listItemId,
    ListItemStatus.NOT_BEFORE,
    ListItemEventType.NOT_BEFORE_SET,
    actor,
    { notBeforeTime: new Date(input.notBeforeTime) },
    { notBeforeTime: input.notBeforeTime, publicNote: input.publicNote ?? null },
  );
  bridgeCaseNotBeforeSet(result.envelope.courtDayId, listItemId, input.notBeforeTime, actor);
  return result;
}

export async function adjournItem(
  listItemId: string,
  input: AdjournInput,
  actor: ActorContext,
): Promise<CommandResult> {
  const result = await transitionItem(
    listItemId,
    ListItemStatus.ADJOURNED,
    ListItemEventType.ADJOURNED,
    actor,
    {
      adjournedUntil: input.adjournedUntil ? new Date(input.adjournedUntil) : null,
      adjournmentType: input.adjournmentType ?? null,
      nextListingNote: input.nextListingNote ?? null,
      publicNote: input.publicNote ?? undefined,
      internalNote: input.internalNote ?? undefined,
      directionCode: input.directionCode ?? undefined,
    },
    {
      adjournedUntil: input.adjournedUntil ?? null,
      adjournmentType: input.adjournmentType ?? null,
      publicNote: input.publicNote ?? null,
    },
  );
  bridgeCaseAdjourned(
    result.envelope.courtDayId,
    listItemId,
    input.adjournedUntil ?? new Date().toISOString(),
    actor,
  );
  return result;
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
    { publicNote: input.publicNote ?? null },
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
    { publicNote: input.publicNote ?? null },
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
    { publicNote: input.publicNote ?? null },
  );
}

export async function completeItem(
  listItemId: string,
  input: CompleteInput,
  actor: ActorContext,
): Promise<CommandResult> {
  const result = await transitionItem(
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
    { outcomeCode: input.outcomeCode, publicNote: input.publicNote ?? null },
  );
  bridgeCaseCompleted(result.envelope.courtDayId, listItemId, input.outcomeCode, actor);
  return result;
}

export async function reorderItem(
  listItemId: string,
  input: ReorderInput,
  actor: ActorContext,
): Promise<CommandResult> {
  const result = await prisma.$transaction(async (tx) => {
    const item = await tx.listItem.findUniqueOrThrow({ where: { id: listItemId } });
    const oldPosition = item.position;
    const newPosition = input.targetPosition;

    if (oldPosition === newPosition) {
      throw new Error('Item is already at the target position');
    }

    if (newPosition < oldPosition) {
      await tx.listItem.updateMany({
        where: {
          courtDayId: item.courtDayId,
          position: { gte: newPosition, lt: oldPosition },
        },
        data: { position: { increment: 1 } },
      });
    } else {
      await tx.listItem.updateMany({
        where: {
          courtDayId: item.courtDayId,
          position: { gt: oldPosition, lte: newPosition },
        },
        data: { position: { decrement: 1 } },
      });
    }

    const updated = await tx.listItem.update({
      where: { id: listItemId },
      data: { position: newPosition },
    });

    const seq = await nextSequence(tx, item.courtDayId);

    const update = await tx.listUpdate.create({
      data: {
        listItemId,
        courtDayId: item.courtDayId,
        sequence: seq,
        eventType: ListItemEventType.REORDERED,
        updatedById: actor.userId ?? null,
      },
    });

    return { item: updated, update, courtDayId: item.courtDayId, oldPosition, seq };
  });

  const envelope = buildEnvelope({
    eventId: result.update.id,
    eventType: ListItemEventType.REORDERED,
    aggregateType: 'listitem',
    aggregateId: listItemId,
    courtDayId: result.courtDayId,
    occurredAt: result.update.timestamp,
    sequence: result.seq,
    actor,
    payload: {
      previousPosition: result.oldPosition,
      newPosition: input.targetPosition,
    },
  });

  publish(envelope);
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
    { publicNote: input.publicNote ?? null },
  );
}
