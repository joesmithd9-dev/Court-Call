import type { ListItem, Prisma } from '@prisma/client';
import { prisma } from './prisma.js';
import { buildEnvelope } from './event-envelope-service.js';
import { publish } from './sse-broadcaster.js';
import { recomputePredictionsForCourtDay } from './court-day-service.js';
import { lockCourtDayRow, nextStreamVersion } from './stream-version-service.js';
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
    await lockCourtDayRow(tx, item.courtDayId);

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

    const version = await nextStreamVersion(tx, item.courtDayId);
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

    return { item: updated, update, courtDayId: item.courtDayId, previousStatus: item.status, version };
  });

  const envelope = buildEnvelope({
    eventId: result.update.id,
    eventType,
    aggregateType: 'listitem',
    aggregateId: listItemId,
    courtDayId: result.courtDayId,
    occurredAt: result.update.createdAt,
    actor,
    version: result.version,
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
    await lockCourtDayRow(tx, item.courtDayId);

    const updated = await tx.listItem.update({
      where: { id: listItemId },
      data: updateData,
    });

    const version = await nextStreamVersion(tx, item.courtDayId);
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

    return { item: updated, update, courtDayId: item.courtDayId, version };
  });

  const envelope = buildEnvelope({
    eventId: result.update.id,
    eventType,
    aggregateType: 'listitem',
    aggregateId: listItemId,
    courtDayId: result.courtDayId,
    occurredAt: result.update.createdAt,
    actor,
    version: result.version,
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
    await lockCourtDayRow(tx, courtDayId);
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

    const version = await nextStreamVersion(tx, courtDayId);
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

    return { item, update, version };
  });

  const envelope = buildEnvelope({
    eventId: result.update.id,
    eventType: ListItemEventType.CREATED,
    aggregateType: 'listitem',
    aggregateId: result.item.id,
    courtDayId,
    occurredAt: result.update.createdAt,
    actor,
    version: result.version,
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
  // ── Single-active invariant ──────────────────────────────────────────
  // At most one item may be in HEARING or CALLING at any time. If another
  // item is currently active when the registrar starts a new one, we
  // auto-complete the prior item. This mirrors real courtroom behaviour:
  // the registrar moves on, the previous matter is implicitly concluded.
  //
  // The auto-completion writes its own append-only update and SSE event
  // so the audit trail is complete.
  const result = await prisma.$transaction(async (tx) => {
    const target = await tx.listItem.findUniqueOrThrow({ where: { id: listItemId } });
    await lockCourtDayRow(tx, target.courtDayId);

    assertTransitionAllowed(target.status as ListItemStatus, ListItemStatus.HEARING);

    const now = new Date();

    // Find any currently active items on the same court day
    const activeItems = await tx.listItem.findMany({
      where: {
        courtDayId: target.courtDayId,
        id: { not: listItemId },
        status: { in: ['HEARING', 'CALLING'] },
      },
    });

    // Auto-complete each prior active item
    const autoCompletedEventIds: string[] = [];
    for (const active of activeItems) {
      await tx.listItem.update({
        where: { id: active.id },
        data: {
          status: 'CONCLUDED',
          actualEndTime: now,
          // Preserve any existing outcomeCode; default to CONCLUDED if none
          outcomeCode: active.outcomeCode ?? 'CONCLUDED',
        },
      });

      const autoVersion = await nextStreamVersion(tx, target.courtDayId);
      const autoUpdate = await tx.listItemUpdate.create({
        data: {
          listItemId: active.id,
          courtDayId: target.courtDayId,
          eventType: ListItemEventType.COMPLETED,
          actorUserId: actor.userId,
          actorDisplayName: actor.displayName,
          actorRole: actor.role,
          previousStatus: active.status,
          newStatus: 'CONCLUDED',
          payloadJson: {
            autoCompleted: true,
            reason: 'New item started — prior active item auto-concluded',
            outcomeCode: active.outcomeCode ?? 'CONCLUDED',
            version: autoVersion,
          } as Prisma.InputJsonValue,
        },
      });
      autoCompletedEventIds.push(autoUpdate.id);
    }

    // Now start the target item
    const updated = await tx.listItem.update({
      where: { id: listItemId },
      data: {
        status: ListItemStatus.HEARING,
        actualStartTime: now,
      },
    });

    const version = await nextStreamVersion(tx, target.courtDayId);
    const update = await tx.listItemUpdate.create({
      data: {
        listItemId,
        courtDayId: target.courtDayId,
        eventType: ListItemEventType.STARTED,
        actorUserId: actor.userId,
        actorDisplayName: actor.displayName,
        actorRole: actor.role,
        previousStatus: target.status,
        newStatus: ListItemStatus.HEARING,
        payloadJson: {
          autoCompletedPriorItems: activeItems.map((a) => a.id),
        } as Prisma.InputJsonValue,
      },
    });

    return {
      item: updated,
      update,
      version,
      courtDayId: target.courtDayId,
      previousStatus: target.status,
      autoCompletedIds: activeItems.map((a) => a.id),
      autoCompletedEventIds,
    };
  });

  // Auto-complete events are persisted for audit, and their IDs are included
  // in the start payload to preserve deterministic ordering without synthetic IDs.

  // Broadcast the start event
  const envelope = buildEnvelope({
    eventId: result.update.id,
    eventType: ListItemEventType.STARTED,
    aggregateType: 'listitem',
    aggregateId: listItemId,
    courtDayId: result.courtDayId,
    occurredAt: result.update.createdAt,
    actor,
    version: result.version,
    payload: {
      previousStatus: result.previousStatus,
      newStatus: ListItemStatus.HEARING,
      autoCompletedPriorItems: result.autoCompletedIds,
      autoCompletedEventIds: result.autoCompletedEventIds,
    },
  });

  publish(envelope);
  await recomputePredictionsForCourtDay(result.courtDayId);
  return { listItem: result.item, envelope };
}

export async function extendEstimate(
  listItemId: string,
  input: ExtendEstimateInput,
  actor: ActorContext,
): Promise<CommandResult> {
  const result = await prisma.$transaction(async (tx) => {
    const item = await tx.listItem.findUniqueOrThrow({ where: { id: listItemId } });
    await lockCourtDayRow(tx, item.courtDayId);

    const currentEstimate = item.estimatedDurationMinutes ?? 0;
    const newEstimate = currentEstimate + input.additionalMinutes;

    const updated = await tx.listItem.update({
      where: { id: listItemId },
      data: { estimatedDurationMinutes: newEstimate },
    });

    const version = await nextStreamVersion(tx, item.courtDayId);
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

    return { item: updated, update, courtDayId: item.courtDayId, version };
  });

  const envelope = buildEnvelope({
    eventId: result.update.id,
    eventType: ListItemEventType.ESTIMATE_EXTENDED,
    aggregateType: 'listitem',
    aggregateId: listItemId,
    courtDayId: result.courtDayId,
    occurredAt: result.update.createdAt,
    actor,
    version: result.version,
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
    await lockCourtDayRow(tx, item.courtDayId);
    const oldPosition = item.queuePosition;
    const newPosition = input.targetQueuePosition;
    const itemCount = await tx.listItem.count({ where: { courtDayId: item.courtDayId } });

    if (oldPosition === newPosition) {
      throw new Error('Item is already at the target position');
    }
    if (newPosition > itemCount) {
      throw new Error(`Target queue position ${newPosition} is out of bounds (max ${itemCount})`);
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

    const version = await nextStreamVersion(tx, item.courtDayId);
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

    return { item: updated, update, courtDayId: item.courtDayId, oldPosition, version };
  });

  const envelope = buildEnvelope({
    eventId: result.update.id,
    eventType: ListItemEventType.REORDERED,
    aggregateType: 'listitem',
    aggregateId: listItemId,
    courtDayId: result.courtDayId,
    occurredAt: result.update.createdAt,
    actor,
    version: result.version,
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
