import type { CourtDay } from '@prisma/client';
import { prisma } from './prisma.js';
import { buildEnvelope } from './event-envelope-service.js';
import { publish } from './sse-broadcaster.js';
import { CourtDayStatus } from '../domain/enums.js';
import { CourtDayEventType } from '../domain/event-types.js';
import type { ActorContext, CourtCallEventEnvelope } from '../domain/types.js';
import type {
  CreateCourtDayInput,
  StartLiveInput,
  JudgeRoseInput,
  AtLunchInput,
  ResumeInput,
  ConcludeCourtDayInput,
} from '../dto/requests.js';
import { bridgeCourtRose, bridgeCourtResumed } from './event-bridge.js';

// ──�� Helpers ────────────────────────────────────────────────────────────────

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function nextSequence(tx: TxClient, courtDayId: string): Promise<number> {
  const updated = await tx.courtDay.update({
    where: { id: courtDayId },
    data: { lastSequence: { increment: 1 } },
    select: { lastSequence: true },
  });
  return updated.lastSequence;
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
        judgeName: input.judgeName ?? null,
        sessionPeriod: (input.sessionPeriod as any) ?? 'MORNING',
        registrarId: input.registrarId ?? null,
        publicNote: input.publicNote ?? null,
        status: CourtDayStatus.SETUP,
      },
    });

    const seq = await nextSequence(tx, courtDay.id);

    const update = await tx.courtDayUpdate.create({
      data: {
        courtDayId: courtDay.id,
        sequence: seq,
        eventType: CourtDayEventType.CREATED,
        newStatus: CourtDayStatus.SETUP as any,
        publicNote: input.publicNote ?? null,
        updatedById: actor.userId ?? null,
      },
    });

    return { courtDay, update, seq };
  });

  const envelope = buildEnvelope({
    eventId: result.update.id,
    eventType: CourtDayEventType.CREATED,
    aggregateType: 'courtday',
    aggregateId: result.courtDay.id,
    courtDayId: result.courtDay.id,
    occurredAt: result.update.timestamp,
    sequence: result.seq,
    actor,
    payload: {
      courtId: input.courtId,
      date: input.date,
      judgeName: input.judgeName ?? null,
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

    if (courtDay.status !== CourtDayStatus.SETUP) {
      throw new Error(`Cannot start live: court day is ${courtDay.status}, expected SETUP`);
    }

    const now = new Date();
    const updated = await tx.courtDay.update({
      where: { id: courtDayId },
      data: {
        status: CourtDayStatus.LIVE,
        wentLiveAt: now,
        publicNote: input.publicNote ?? courtDay.publicNote,
      },
    });

    const seq = await nextSequence(tx, courtDayId);

    const update = await tx.courtDayUpdate.create({
      data: {
        courtDayId,
        sequence: seq,
        eventType: CourtDayEventType.LIVE_STARTED,
        previousStatus: courtDay.status as any,
        newStatus: CourtDayStatus.LIVE as any,
        publicNote: input.publicNote ?? null,
        updatedById: actor.userId ?? null,
      },
    });

    return { courtDay: updated, update, seq };
  });

  const envelope = buildEnvelope({
    eventId: result.update.id,
    eventType: CourtDayEventType.LIVE_STARTED,
    aggregateType: 'courtday',
    aggregateId: courtDayId,
    courtDayId,
    occurredAt: result.update.timestamp,
    sequence: result.seq,
    actor,
    payload: { publicNote: input.publicNote ?? null },
  });

  publish(envelope);
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
        status: CourtDayStatus.JUDGE_ROSE,
        judgeRoseAt: now,
        resumesAt: input.resumesAt ? new Date(input.resumesAt) : null,
        publicNote: input.publicNote ?? courtDay.publicNote,
      },
    });

    const seq = await nextSequence(tx, courtDayId);

    const update = await tx.courtDayUpdate.create({
      data: {
        courtDayId,
        sequence: seq,
        eventType: CourtDayEventType.JUDGE_ROSE,
        previousStatus: courtDay.status as any,
        newStatus: CourtDayStatus.JUDGE_ROSE as any,
        publicNote: input.publicNote ?? null,
        updatedById: actor.userId ?? null,
      },
    });

    return { courtDay: updated, update, seq };
  });

  const envelope = buildEnvelope({
    eventId: result.update.id,
    eventType: CourtDayEventType.JUDGE_ROSE,
    aggregateType: 'courtday',
    aggregateId: courtDayId,
    courtDayId,
    occurredAt: result.update.timestamp,
    sequence: result.seq,
    actor,
    payload: {
      resumesAt: input.resumesAt ?? null,
      publicNote: input.publicNote ?? null,
    },
  });

  publish(envelope);
  bridgeCourtRose(courtDayId, actor);
  return { courtDay: result.courtDay, envelope };
}

export async function atLunch(
  courtDayId: string,
  input: AtLunchInput,
  actor: ActorContext,
): Promise<{ courtDay: CourtDay; envelope: CourtCallEventEnvelope }> {
  const result = await prisma.$transaction(async (tx) => {
    const courtDay = await tx.courtDay.findUniqueOrThrow({ where: { id: courtDayId } });

    if (courtDay.status !== CourtDayStatus.LIVE) {
      throw new Error(`Cannot go to lunch: court day is ${courtDay.status}, expected LIVE`);
    }

    const updated = await tx.courtDay.update({
      where: { id: courtDayId },
      data: {
        status: CourtDayStatus.AT_LUNCH,
        resumesAt: input.resumesAt ? new Date(input.resumesAt) : null,
        publicNote: input.publicNote ?? courtDay.publicNote,
      },
    });

    const seq = await nextSequence(tx, courtDayId);

    const update = await tx.courtDayUpdate.create({
      data: {
        courtDayId,
        sequence: seq,
        eventType: CourtDayEventType.AT_LUNCH,
        previousStatus: courtDay.status as any,
        newStatus: CourtDayStatus.AT_LUNCH as any,
        publicNote: input.publicNote ?? null,
        updatedById: actor.userId ?? null,
      },
    });

    return { courtDay: updated, update, seq };
  });

  const envelope = buildEnvelope({
    eventId: result.update.id,
    eventType: CourtDayEventType.AT_LUNCH,
    aggregateType: 'courtday',
    aggregateId: courtDayId,
    courtDayId,
    occurredAt: result.update.timestamp,
    sequence: result.seq,
    actor,
    payload: {
      resumesAt: input.resumesAt ?? null,
      publicNote: input.publicNote ?? null,
    },
  });

  publish(envelope);
  bridgeCourtRose(courtDayId, actor);
  return { courtDay: result.courtDay, envelope };
}

export async function resume(
  courtDayId: string,
  input: ResumeInput,
  actor: ActorContext,
): Promise<{ courtDay: CourtDay; envelope: CourtCallEventEnvelope }> {
  const result = await prisma.$transaction(async (tx) => {
    const courtDay = await tx.courtDay.findUniqueOrThrow({ where: { id: courtDayId } });

    const pausedStatuses: string[] = [CourtDayStatus.JUDGE_ROSE, CourtDayStatus.AT_LUNCH, CourtDayStatus.PAUSED];
    if (!pausedStatuses.includes(courtDay.status)) {
      throw new Error(`Cannot resume: court day is ${courtDay.status}, expected JUDGE_ROSE/AT_LUNCH/PAUSED`);
    }

    const updated = await tx.courtDay.update({
      where: { id: courtDayId },
      data: {
        status: CourtDayStatus.LIVE,
        publicNote: input.publicNote ?? courtDay.publicNote,
      },
    });

    const seq = await nextSequence(tx, courtDayId);

    const update = await tx.courtDayUpdate.create({
      data: {
        courtDayId,
        sequence: seq,
        eventType: CourtDayEventType.RESUMED,
        previousStatus: courtDay.status as any,
        newStatus: CourtDayStatus.LIVE as any,
        publicNote: input.publicNote ?? null,
        updatedById: actor.userId ?? null,
      },
    });

    return { courtDay: updated, update, seq };
  });

  const envelope = buildEnvelope({
    eventId: result.update.id,
    eventType: CourtDayEventType.RESUMED,
    aggregateType: 'courtday',
    aggregateId: courtDayId,
    courtDayId,
    occurredAt: result.update.timestamp,
    sequence: result.seq,
    actor,
    payload: { publicNote: input.publicNote ?? null },
  });

  publish(envelope);
  bridgeCourtResumed(courtDayId, actor);
  return { courtDay: result.courtDay, envelope };
}

export async function concludeCourtDay(
  courtDayId: string,
  input: ConcludeCourtDayInput,
  actor: ActorContext,
): Promise<{ courtDay: CourtDay; envelope: CourtCallEventEnvelope }> {
  const result = await prisma.$transaction(async (tx) => {
    const courtDay = await tx.courtDay.findUniqueOrThrow({ where: { id: courtDayId } });

    if (courtDay.status === CourtDayStatus.CONCLUDED) {
      throw new Error('Court day is already concluded');
    }

    const now = new Date();
    const updated = await tx.courtDay.update({
      where: { id: courtDayId },
      data: {
        status: CourtDayStatus.CONCLUDED,
        concludedAt: now,
        publicNote: input.publicNote ?? courtDay.publicNote,
      },
    });

    const seq = await nextSequence(tx, courtDayId);

    const update = await tx.courtDayUpdate.create({
      data: {
        courtDayId,
        sequence: seq,
        eventType: CourtDayEventType.CONCLUDED,
        previousStatus: courtDay.status as any,
        newStatus: CourtDayStatus.CONCLUDED as any,
        publicNote: input.publicNote ?? null,
        updatedById: actor.userId ?? null,
      },
    });

    return { courtDay: updated, update, seq };
  });

  const envelope = buildEnvelope({
    eventId: result.update.id,
    eventType: CourtDayEventType.CONCLUDED,
    aggregateType: 'courtday',
    aggregateId: courtDayId,
    courtDayId,
    occurredAt: result.update.timestamp,
    sequence: result.seq,
    actor,
    payload: { publicNote: input.publicNote ?? null },
  });

  publish(envelope);
  return { courtDay: result.courtDay, envelope };
}
