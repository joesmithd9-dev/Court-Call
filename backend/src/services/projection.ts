import { prisma } from '../db';

/**
 * Projection Service — builds authoritative CourtDay snapshot.
 * Single transactional read to prevent non-atomic projection.
 */
export async function getCourtDaySnapshot(courtDayId: string) {
  const cd = await prisma.courtDay.findUnique({
    where: { id: courtDayId },
    include: {
      cases: { orderBy: { position: 'asc' } },
    },
  });

  if (!cd) return null;

  return {
    id: cd.id,
    courtName: cd.courtName,
    courtRoom: cd.courtRoom,
    judgeName: cd.judgeName,
    date: cd.date,
    status: cd.status,
    statusMessage: cd.statusMessage,
    resumeTime: cd.resumeTime,
    currentCaseId: cd.currentCaseId,
    lastSequence: cd.lastSequence,
    cases: cd.cases.map((c) => ({
      id: c.id,
      courtDayId: c.courtDayId,
      position: c.position,
      caseName: c.caseName,
      caseTitleFull: c.caseTitleFull,
      caseTitlePublic: c.caseTitlePublic,
      caseNumber: c.caseNumber,
      matterType: c.matterType,
      status: c.status,
      scheduledTime: c.scheduledTime,
      startedAt: c.startedAt,
      estimatedMinutes: c.estimatedMinutes,
      predictedStartTime: c.predictedStartTime,
      notBeforeTime: c.notBeforeTime,
      adjournedToTime: c.adjournedToTime,
      note: c.note,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    })),
    createdAt: cd.createdAt.toISOString(),
    updatedAt: cd.updatedAt.toISOString(),
  };
}
