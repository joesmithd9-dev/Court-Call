import type { Prisma } from '@prisma/client';

/**
 * Acquire a row lock on the court day to serialize concurrent write commands.
 */
export async function lockCourtDayRow(
  tx: Prisma.TransactionClient,
  courtDayId: string,
): Promise<void> {
  await tx.$executeRawUnsafe(
    'SELECT 1 FROM court_days WHERE id = $1::uuid FOR UPDATE',
    courtDayId,
  );
}

/**
 * Increment and return the durable stream version for a court day.
 */
export async function nextStreamVersion(
  tx: Prisma.TransactionClient,
  courtDayId: string,
): Promise<number> {
  const updated = await tx.courtDay.update({
    where: { id: courtDayId },
    data: { streamVersion: { increment: 1 } },
    select: { streamVersion: true },
  });
  return updated.streamVersion;
}
