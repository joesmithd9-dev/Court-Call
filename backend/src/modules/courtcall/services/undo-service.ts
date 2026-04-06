import type { ListItem, Prisma } from '@prisma/client';
import { prisma } from './prisma.js';
import { buildEnvelope } from './event-envelope-service.js';
import { publish } from './sse-broadcaster.js';
import { recomputePredictionsForCourtDay } from './court-day-service.js';
import { ListItemEventType } from '../domain/event-types.js';
import type { ActorContext, CourtCallEventEnvelope } from '../domain/types.js';
import { lockCourtDayRow, nextStreamVersion } from './stream-version-service.js';

interface UndoResult {
  listItem: ListItem;
  envelope: CourtCallEventEnvelope;
}

function asObject(value: Prisma.JsonValue | null): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export async function undoListItemEvent(
  courtDayId: string,
  targetEventId: string,
  actor: ActorContext,
): Promise<UndoResult> {
  const result = await prisma.$transaction(async (tx) => {
    await lockCourtDayRow(tx, courtDayId);

    const existingUndo = await tx.undoRecord.findUnique({
      where: { targetEventId },
      select: { targetEventId: true },
    });
    if (existingUndo) {
      throw new Error('Target event has already been undone');
    }

    const targetUpdate = await tx.listItemUpdate.findUnique({
      where: { id: targetEventId },
    });
    if (!targetUpdate || targetUpdate.courtDayId !== courtDayId) {
      throw new Error('Target event not found on this court day');
    }
    if (targetUpdate.eventType === ListItemEventType.UNDO_APPLIED) {
      throw new Error('Cannot undo an undo event');
    }

    const item = await tx.listItem.findUniqueOrThrow({
      where: { id: targetUpdate.listItemId },
    });

    const payload = asObject(targetUpdate.payloadJson);
    const updateData: Prisma.ListItemUncheckedUpdateInput = {};

    if (targetUpdate.eventType === ListItemEventType.ESTIMATE_EXTENDED) {
      const previousEstimate = payload.previousEstimate;
      if (typeof previousEstimate !== 'number') {
        throw new Error('Undo unsupported: missing previous estimate');
      }
      updateData.estimatedDurationMinutes = previousEstimate;
    } else if (targetUpdate.previousStatus && targetUpdate.newStatus) {
      updateData.status = targetUpdate.previousStatus as any;
      // Rewind known timestamp fields for common reversible transitions.
      if (targetUpdate.eventType === ListItemEventType.CALLED) {
        updateData.calledAt = null;
      }
      if (targetUpdate.eventType === ListItemEventType.STARTED) {
        updateData.actualStartTime = null;
      }
      if (targetUpdate.eventType === ListItemEventType.COMPLETED) {
        updateData.actualEndTime = null;
      }
      if (targetUpdate.eventType === ListItemEventType.STOOD_DOWN) {
        updateData.stoodDownAt = null;
      }
      if (targetUpdate.eventType === ListItemEventType.RESTORED) {
        updateData.restoredAt = null;
      }
      if (targetUpdate.eventType === ListItemEventType.NOT_BEFORE_SET) {
        updateData.notBeforeTime = null;
      }
      if (targetUpdate.eventType === ListItemEventType.ADJOURNED) {
        updateData.adjournedUntil = null;
      }
    } else {
      throw new Error('Undo unsupported for this event type');
    }

    const updated = await tx.listItem.update({
      where: { id: item.id },
      data: updateData,
    });

    const version = await nextStreamVersion(tx, courtDayId);
    const undoUpdate = await tx.listItemUpdate.create({
      data: {
        listItemId: item.id,
        courtDayId,
        eventType: ListItemEventType.UNDO_APPLIED,
        actorUserId: actor.userId,
        actorDisplayName: actor.displayName,
        actorRole: actor.role,
        previousStatus: item.status,
        newStatus: updated.status,
        payloadJson: {
          targetEventId,
          undoneEventType: targetUpdate.eventType,
        } as Prisma.InputJsonValue,
      },
    });

    await tx.undoRecord.create({
      data: {
        targetEventId,
        courtDayId,
      },
    });

    return {
      listItem: updated,
      update: undoUpdate,
      version,
      previousStatus: item.status,
      newStatus: updated.status,
      undoneEventType: targetUpdate.eventType,
      listItemId: item.id,
    };
  });

  const envelope = buildEnvelope({
    eventId: result.update.id,
    eventType: ListItemEventType.UNDO_APPLIED,
    aggregateType: 'listitem',
    aggregateId: result.listItemId,
    courtDayId,
    occurredAt: result.update.createdAt,
    actor,
    version: result.version,
    payload: {
      targetEventId,
      undoneEventType: result.undoneEventType,
      previousStatus: result.previousStatus,
      newStatus: result.newStatus,
    },
  });

  publish(envelope);
  await recomputePredictionsForCourtDay(courtDayId);
  return { listItem: result.listItem, envelope };
}
