import { prisma } from '../db';
import { v4 as uuid } from 'uuid';
import { broadcastEvent } from './sse';
import { getCourtDaySnapshot } from './projection';

type SnapshotResult = Awaited<ReturnType<typeof getCourtDaySnapshot>> & { lastEventId: string };

/**
 * Emit event: increment sequence, persist event, broadcast SSE, return snapshot.
 * All mutations go through this to guarantee sequencing + idempotency + audit.
 */
async function emitEvent(
  courtDayId: string,
  type: string,
  data: Record<string, unknown>,
  opts: { idempotencyKey?: string; actorRole?: string; undoTargetEventId?: string } = {}
): Promise<SnapshotResult> {
  // Idempotency check: if key already used, return current snapshot
  if (opts.idempotencyKey) {
    const existing = await prisma.courtEvent.findUnique({
      where: { courtDayId_idempotencyKey: { courtDayId, idempotencyKey: opts.idempotencyKey } },
    });
    if (existing) {
      const snapshot = await getCourtDaySnapshot(courtDayId);
      return { ...snapshot!, lastEventId: existing.id };
    }
  }

  // Atomically increment sequence
  const cd = await prisma.courtDay.update({
    where: { id: courtDayId },
    data: { lastSequence: { increment: 1 } },
  });

  const eventId = uuid();
  const event = await prisma.courtEvent.create({
    data: {
      id: eventId,
      courtDayId,
      sequence: cd.lastSequence,
      type,
      data: JSON.stringify(data),
      actorRole: opts.actorRole ?? 'registrar',
      idempotencyKey: opts.idempotencyKey ?? null,
      undoTargetEventId: opts.undoTargetEventId ?? null,
    },
  });

  // Broadcast to SSE clients
  broadcastEvent(courtDayId, {
    id: event.id,
    sequence: event.sequence,
    type: event.type,
    data,
    timestamp: event.createdAt.toISOString(),
  });

  // Return authoritative snapshot + lastEventId
  const snapshot = await getCourtDaySnapshot(courtDayId);
  return { ...snapshot!, lastEventId: eventId };
}

// ---- Court Day Commands ----

export async function updateCourtDayStatus(
  courtDayId: string,
  payload: { status?: string; statusMessage?: string; resumeTime?: string; currentCaseId?: string },
  idempotencyKey?: string
): Promise<SnapshotResult> {
  await prisma.courtDay.update({
    where: { id: courtDayId },
    data: {
      status: payload.status,
      statusMessage: payload.statusMessage,
      resumeTime: payload.resumeTime,
      currentCaseId: payload.currentCaseId,
    },
  });

  return emitEvent(courtDayId, 'court_day_updated', payload, { idempotencyKey });
}

// ---- Case Commands ----

export async function updateCase(
  courtDayId: string,
  caseId: string,
  payload: {
    status?: string;
    estimatedMinutes?: number;
    notBeforeTime?: string;
    adjournedToTime?: string;
    note?: string;
  },
  idempotencyKey?: string
): Promise<SnapshotResult> {
  // Single-active guard: if setting to 'hearing', conclude any current hearing
  if (payload.status === 'hearing') {
    await prisma.courtCase.updateMany({
      where: { courtDayId, status: 'hearing', NOT: { id: caseId } },
      data: { status: 'concluded' },
    });
  }

  const updateData: Record<string, unknown> = {};
  if (payload.status !== undefined) updateData.status = payload.status;
  if (payload.estimatedMinutes !== undefined) updateData.estimatedMinutes = payload.estimatedMinutes;
  if (payload.notBeforeTime !== undefined) updateData.notBeforeTime = payload.notBeforeTime;
  if (payload.adjournedToTime !== undefined) updateData.adjournedToTime = payload.adjournedToTime;
  if (payload.note !== undefined) updateData.note = payload.note;
  if (payload.status === 'hearing') updateData.startedAt = new Date().toISOString();

  await prisma.courtCase.update({
    where: { id: caseId },
    data: updateData,
  });

  // If starting a hearing, update court day's currentCaseId
  if (payload.status === 'hearing') {
    await prisma.courtDay.update({
      where: { id: courtDayId },
      data: { currentCaseId: caseId },
    });
  }

  // If concluding current case, clear currentCaseId
  if (payload.status === 'concluded' || payload.status === 'adjourned' || payload.status === 'stood_down') {
    const cd = await prisma.courtDay.findUnique({ where: { id: courtDayId } });
    if (cd?.currentCaseId === caseId) {
      await prisma.courtDay.update({
        where: { id: courtDayId },
        data: { currentCaseId: null },
      });
    }
  }

  return emitEvent(courtDayId, 'case_updated', { caseId, ...payload }, { idempotencyKey });
}

export async function startNextCase(
  courtDayId: string,
  idempotencyKey?: string
): Promise<SnapshotResult> {
  // Find current hearing and conclude it
  const current = await prisma.courtCase.findFirst({
    where: { courtDayId, status: 'hearing' },
  });
  if (current) {
    await prisma.courtCase.update({
      where: { id: current.id },
      data: { status: 'concluded' },
    });
  }

  // Find next pending/calling case by position
  const next = await prisma.courtCase.findFirst({
    where: { courtDayId, status: { in: ['pending', 'calling'] } },
    orderBy: { position: 'asc' },
  });

  if (!next) {
    // No next case — just return snapshot
    const snapshot = await getCourtDaySnapshot(courtDayId);
    return { ...snapshot!, lastEventId: '' };
  }

  await prisma.courtCase.update({
    where: { id: next.id },
    data: { status: 'hearing', startedAt: new Date().toISOString() },
  });

  await prisma.courtDay.update({
    where: { id: courtDayId },
    data: { currentCaseId: next.id, status: 'live' },
  });

  return emitEvent(courtDayId, 'case_updated', { caseId: next.id, status: 'hearing' }, { idempotencyKey });
}

export async function reorderCase(
  courtDayId: string,
  payload: { caseId: string; newPosition: number },
  idempotencyKey?: string
): Promise<SnapshotResult> {
  const cases = await prisma.courtCase.findMany({
    where: { courtDayId },
    orderBy: { position: 'asc' },
  });

  const maxPos = cases.length;
  const targetPos = Math.max(1, Math.min(payload.newPosition, maxPos));

  const moving = cases.find((c) => c.id === payload.caseId);
  if (!moving) throw new Error('Case not found');

  const oldPos = moving.position;
  if (oldPos === targetPos) {
    const snapshot = await getCourtDaySnapshot(courtDayId);
    return { ...snapshot!, lastEventId: '' };
  }

  // Reorder: shift others, then place the moved case
  // Use a temp position to avoid unique constraint violations
  await prisma.courtCase.update({
    where: { id: moving.id },
    data: { position: maxPos + 1000 },
  });

  if (targetPos < oldPos) {
    // Moving up: shift others down
    await prisma.$executeRawUnsafe(
      `UPDATE CourtCase SET position = position + 1 WHERE courtDayId = ? AND position >= ? AND position < ? AND id != ?`,
      courtDayId, targetPos, oldPos, moving.id
    );
  } else {
    // Moving down: shift others up
    await prisma.$executeRawUnsafe(
      `UPDATE CourtCase SET position = position - 1 WHERE courtDayId = ? AND position > ? AND position <= ? AND id != ?`,
      courtDayId, oldPos, targetPos, moving.id
    );
  }

  await prisma.courtCase.update({
    where: { id: moving.id },
    data: { position: targetPos },
  });

  return emitEvent(courtDayId, 'case_reordered', { caseId: payload.caseId, newPosition: targetPos }, { idempotencyKey });
}

// ---- Undo ----

export async function undoEvent(
  courtDayId: string,
  targetEventId: string,
  idempotencyKey?: string
): Promise<SnapshotResult> {
  const target = await prisma.courtEvent.findUnique({
    where: { id: targetEventId },
  });

  if (!target || target.courtDayId !== courtDayId) {
    throw new Error('Event not found');
  }

  if (target.undoneByEventId) {
    throw new Error('Event already undone');
  }

  // Parse the original event data to determine reversal
  const data = JSON.parse(target.data) as Record<string, unknown>;
  const caseId = data.caseId as string | undefined;

  // Reverse the effect based on event type
  if (target.type === 'case_updated' && caseId) {
    // Revert case to pending (safe default for undo)
    await prisma.courtCase.update({
      where: { id: caseId },
      data: {
        status: 'pending',
        startedAt: null,
        adjournedToTime: null,
        notBeforeTime: null,
      },
    });

    // If this case was current, clear it
    const cd = await prisma.courtDay.findUnique({ where: { id: courtDayId } });
    if (cd?.currentCaseId === caseId) {
      await prisma.courtDay.update({
        where: { id: courtDayId },
        data: { currentCaseId: null },
      });
    }
  }

  // Mark original event as undone
  const undoEventResult = await emitEvent(
    courtDayId,
    'case_updated',
    { caseId, undoOf: targetEventId },
    { idempotencyKey, undoTargetEventId: targetEventId }
  );

  await prisma.courtEvent.update({
    where: { id: targetEventId },
    data: { undoneByEventId: undoEventResult.lastEventId },
  });

  return undoEventResult;
}
