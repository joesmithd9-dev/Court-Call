import { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';

export interface IdempotencyBeginResult<T> {
  replay: T | null;
  recordId: string | null;
}

export async function beginIdempotentRequest<T>(
  scope: string,
  routeKey: string,
  idempotencyKey: string | undefined,
): Promise<IdempotencyBeginResult<T>> {
  if (!idempotencyKey) {
    return { replay: null, recordId: null };
  }

  try {
    const row = await prisma.commandIdempotency.create({
      data: {
        scope,
        routeKey,
        idempotencyKey,
      },
      select: { id: true },
    });
    return { replay: null, recordId: row.id };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const existing = await prisma.commandIdempotency.findFirst({
        where: { scope, routeKey, idempotencyKey },
        select: { responseJson: true, completed: true },
      });
      if (existing?.completed && existing.responseJson) {
        return { replay: existing.responseJson as T, recordId: null };
      }
      throw new Error('Duplicate request is still processing');
    }
    throw error;
  }
}

export async function completeIdempotentRequest(
  recordId: string | null,
  response: unknown,
): Promise<void> {
  if (!recordId) return;
  await prisma.commandIdempotency.update({
    where: { id: recordId },
    data: {
      completed: true,
      responseJson: response as Prisma.InputJsonValue,
    },
  });
}

export async function abortIdempotentRequest(recordId: string | null): Promise<void> {
  if (!recordId) return;
  await prisma.commandIdempotency.delete({ where: { id: recordId } }).catch(() => {});
}
