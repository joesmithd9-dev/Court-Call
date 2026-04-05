import type { CourtDay } from '@prisma/client';
import { prisma } from './prisma.js';
import { buildEnvelope } from './event-envelope-service.js';
import { publish } from './sse-broadcaster.js';
import { CourtDayStatus, CourtSessionStatus } from '../domain/enums.js';
import { CourtDayEventType } from '../domain/event-types.js';
import type { ActorContext, CourtCallEventEnvelope } from '../domain/types.js';
import type {
  CreateCourtDayInput,
  StartLiveInput,
  JudgeRoseInput,
  ResumeInput,
  CloseCourtDayInput,
} from '../dto/requests.js';

/**
 * Placeholder hook for the recalculation engine (next phase).
 *
 * After events that change the live queue shape (start-live, resume, close,
 * and after most list-item transitions), this function should be called to
 * recompute predictedStartTime / predictedEndTime for all WAITING items.
 *
 * For now it is a no-op. Wire the real engine here.
 */
export async function recomputePredictionsForCourtDay(
  _courtDayId: string,
): Promise<void> {
  // Future: load all non-terminal items, run timing model, persist updates,
  // emit courtday.projections_recomputed event.
}

// ─── Commands ────────────────────────────────────────────────────────────────

export async function createCourtDay(
  input: CreateCourtDayInput,
  actor: ActorContext,
): Promise<{ courtDay: CourtDay; envelope: CourtCallEventEnvelope }> {
  const result = await prisma.$transaction(async (tx) => {
    const courtDay = await tx.courtDay.create({
      data: {
        courtId: input.courtId,
        date: new Date(input.date),
        judgeName: input.judgeName,
        registrarName: input.registrarName,
        status: CourtDayStatus.SCHEDULED,
        sessionStatus: CourtSessionStatus.BEFORE_SITTING,
      },
    });

    const update = await tx.courtDayUpdate.create({
      data: {
        courtDayId: courtDay.id,
        eventType: CourtDayEventType.CREATED,
        actorUserId: actor.userId,
        actorDisplayName: actor.displayName,
        actorRole: actor.role,
        payloadJson: {
          courtId: input.courtId,
          date: input.date,
          judgeName: input.judgeName,
          registrarName: input.registrarName,
        },
      },
    });

    return { courtDay, update };
  });

  const envelope = buildEnvelope({
    eventId: result.update.id,
    eventType: CourtDayEventType.CREATED,
    aggregateType: 'courtday',
    aggregateId: result.courtDay.id,
    courtDayId: result.courtDay.id,
    occurredAt: result.update.createdAt,
    actor,
    payload: {
      courtId: input.courtId,
      date: input.date,
      judgeName: input.judgeName,
      registrarName: input.registrarName,
    },
  });

  publish(envelope);
  return { courtDay: result.courtDay, envelope };
}

export async function startLive(
  courtDayId: string,
  input: StartLiveInput,
  actor: ActorContext,
): Promise<{ courtDay: CourtDay; envelope: CourtCallEventEnvelope }> {
  const result = await prisma.$transaction(async (tx) => {
    const courtDay = await tx.courtDay.findUniqueOrThrow({ where: { id: courtDayId } });

    if (courtDay.status !== CourtDayStatus.SCHEDULED) {
      throw new Error(`Cannot start live: court day is ${courtDay.status}, expected SCHEDULED`);
    }

    const now = new Date();
    const updated = await tx.courtDay.update({
      where: { id: courtDayId },
      data: {
        status: CourtDayStatus.LIVE,
        sessionStatus: CourtSessionStatus.LIVE,
        sessionMessage: input.sessionMessage ?? null,
        startedAt: now,
      },
    });

    const update = await tx.courtDayUpdate.create({
      data: {
        courtDayId,
        eventType: CourtDayEventType.LIVE_STARTED,
        actorUserId: actor.userId,
        actorDisplayName: actor.displayName,
        actorRole: actor.role,
        payloadJson: { sessionMessage: input.sessionMessage ?? null },
      },
    });

    return { courtDay: updated, update };
  });

  const envelope = buildEnvelope({
    eventId: result.update.id,
    eventType: CourtDayEventType.LIVE_STARTED,
    aggregateType: 'courtday',
    aggregateId: courtDayId,
    courtDayId,
    occurredAt: result.update.createdAt,
    actor,
    payload: { sessionMessage: input.sessionMessage ?? null },
  });

  publish(envelope);
  await recomputePredictionsForCourtDay(courtDayId);
  return { courtDay: result.courtDay, envelope };
}

export async function judgeRose(
  courtDayId: string,
  input: JudgeRoseInput,
  actor: ActorContext,
): Promise<{ courtDay: CourtDay; envelope: CourtCallEventEnvelope }> {
  const result = await prisma.$transaction(async (tx) => {
    const courtDay = await tx.courtDay.findUniqueOrThrow({ where: { id: courtDayId } });

    if (courtDay.status !== CourtDayStatus.LIVE) {
      throw new Error(`Cannot record judge rose: court day is ${courtDay.status}, expected LIVE`);
    }

    const now = new Date();
    const updated = await tx.courtDay.update({
      where: { id: courtDayId },
      data: {
        sessionStatus: input.sessionStatus,
        sessionMessage: input.message ?? null,
        roseAt: now,
        expectedResumeAt: input.expectedResumeAt ? new Date(input.expectedResumeAt) : null,
        resumedAt: null, // clear any previous resume timestamp
      },
    });

    const update = await tx.courtDayUpdate.create({
      data: {
        courtDayId,
        eventType: CourtDayEventType.JUDGE_ROSE,
        actorUserId: actor.userId,
        actorDisplayName: actor.displayName,
        actorRole: actor.role,
        payloadJson: {
          sessionStatus: input.sessionStatus,
          message: input.message ?? null,
          expectedResumeAt: input.expectedResumeAt ?? null,
        },
      },
    });

    return { courtDay: updated, update };
  });

  const envelope = buildEnvelope({
    eventId: result.update.id,
    eventType: CourtDayEventType.JUDGE_ROSE,
    aggregateType: 'courtday',
    aggregateId: courtDayId,
    courtDayId,
    occurredAt: result.update.createdAt,
    actor,
    payload: {
      sessionStatus: input.sessionStatus,
      message: input.message ?? null,
      expectedResumeAt: input.expectedResumeAt ?? null,
    },
  });

  publish(envelope);
  return { courtDay: result.courtDay, envelope };
}

export async function resume(
  courtDayId: string,
  input: ResumeInput,
  actor: ActorContext,
): Promise<{ courtDay: CourtDay; envelope: CourtCallEventEnvelope }> {
  const result = await prisma.$transaction(async (tx) => {
    const courtDay = await tx.courtDay.findUniqueOrThrow({ where: { id: courtDayId } });

    if (courtDay.status !== CourtDayStatus.LIVE) {
      throw new Error(`Cannot resume: court day is ${courtDay.status}, expected LIVE`);
    }
    if (courtDay.sessionStatus === CourtSessionStatus.LIVE) {
      throw new Error('Court day session is already LIVE');
    }

    const now = new Date();
    const updated = await tx.courtDay.update({
      where: { id: courtDayId },
      data: {
        sessionStatus: CourtSessionStatus.LIVE,
        sessionMessage: input.sessionMessage ?? null,
        resumedAt: now,
      },
    });

    const update = await tx.courtDayUpdate.create({
      data: {
        courtDayId,
        eventType: CourtDayEventType.RESUMED,
        actorUserId: actor.userId,
        actorDisplayName: actor.displayName,
        actorRole: actor.role,
        payloadJson: { sessionMessage: input.sessionMessage ?? null },
      },
    });

    return { courtDay: updated, update };
  });

  const envelope = buildEnvelope({
    eventId: result.update.id,
    eventType: CourtDayEventType.RESUMED,
    aggregateType: 'courtday',
    aggregateId: courtDayId,
    courtDayId,
    occurredAt: result.update.createdAt,
    actor,
    payload: { sessionMessage: input.sessionMessage ?? null },
  });

  publish(envelope);
  await recomputePredictionsForCourtDay(courtDayId);
  return { courtDay: result.courtDay, envelope };
}

export async function closeCourtDay(
  courtDayId: string,
  input: CloseCourtDayInput,
  actor: ActorContext,
): Promise<{ courtDay: CourtDay; envelope: CourtCallEventEnvelope }> {
  const result = await prisma.$transaction(async (tx) => {
    const courtDay = await tx.courtDay.findUniqueOrThrow({ where: { id: courtDayId } });

    if (courtDay.status === CourtDayStatus.CLOSED) {
      throw new Error('Court day is already closed');
    }

    const now = new Date();
    const updated = await tx.courtDay.update({
      where: { id: courtDayId },
      data: {
        status: CourtDayStatus.CLOSED,
        sessionStatus: CourtSessionStatus.FINISHED,
        sessionMessage: input.sessionMessage ?? null,
        endedAt: now,
      },
    });

    const update = await tx.courtDayUpdate.create({
      data: {
        courtDayId,
        eventType: CourtDayEventType.CLOSED,
        actorUserId: actor.userId,
        actorDisplayName: actor.displayName,
        actorRole: actor.role,
        payloadJson: { sessionMessage: input.sessionMessage ?? null },
      },
    });

    return { courtDay: updated, update };
  });

  const envelope = buildEnvelope({
    eventId: result.update.id,
    eventType: CourtDayEventType.CLOSED,
    aggregateType: 'courtday',
    aggregateId: courtDayId,
    courtDayId,
    occurredAt: result.update.createdAt,
    actor,
    payload: { sessionMessage: input.sessionMessage ?? null },
  });

  publish(envelope);
  return { courtDay: result.courtDay, envelope };
}
