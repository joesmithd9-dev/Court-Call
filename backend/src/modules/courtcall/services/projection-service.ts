import { prisma } from './prisma.js';
import { mapPublicProjection } from '../mappers/public-projection-mapper.js';
import { mapRegistrarProjection } from '../mappers/registrar-projection-mapper.js';
import type { CourtDayPublicProjection, CourtDayRegistrarProjection } from '../dto/responses.js';

async function loadCourtDayWithItems(courtDayId: string) {
  const courtDay = await prisma.courtDay.findUniqueOrThrow({
    where: { id: courtDayId },
  });

  const items = await prisma.listItem.findMany({
    where: { courtDayId },
    orderBy: { queuePosition: 'asc' },
  });

  return { courtDay, items };
}

export async function getPublicProjection(
  courtDayId: string,
): Promise<CourtDayPublicProjection> {
  const { courtDay, items } = await loadCourtDayWithItems(courtDayId);
  return mapPublicProjection(courtDay, items);
}

export async function getRegistrarProjection(
  courtDayId: string,
): Promise<CourtDayRegistrarProjection> {
  const { courtDay, items } = await loadCourtDayWithItems(courtDayId);
  return mapRegistrarProjection(courtDay, items);
}

/**
 * Look up a court day by court + date. Returns the court day id if found.
 */
export async function findCourtDayByCourtAndDate(
  courtId: string,
  date: string,
): Promise<{ id: string } | null> {
  return prisma.courtDay.findUnique({
    where: { courtId_date: { courtId, date: new Date(date) } },
    select: { id: true },
  });
}
