import type { ActorContext } from '../domain/types.js';

export class AuthError extends Error {
  public readonly statusCode: 401 | 403;

  constructor(message: string, statusCode: 401 | 403 = 401) {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
  }
}

export function extractActorOptional(
  headers: Record<string, string | string[] | undefined>,
): ActorContext {
  const roleHeader = (headers['x-actor-role'] as string | undefined)?.toUpperCase();
  const role =
    roleHeader === 'SYSTEM'
      ? 'SYSTEM'
      : roleHeader === 'REGISTRAR'
        ? 'REGISTRAR'
        : 'REGISTRAR';

  return {
    userId: (headers['x-actor-user-id'] as string) ?? undefined,
    displayName: (headers['x-actor-display-name'] as string) ?? undefined,
    role,
  };
}

export function requireActor(
  headers: Record<string, string | string[] | undefined>,
  allowedRoles: Array<'REGISTRAR' | 'SYSTEM'> = ['REGISTRAR', 'SYSTEM'],
): ActorContext {
  const roleHeader = (headers['x-actor-role'] as string | undefined)?.toUpperCase();
  if (!roleHeader) {
    throw new AuthError('Missing X-Actor-Role header', 401);
  }
  if (roleHeader !== 'REGISTRAR' && roleHeader !== 'SYSTEM') {
    throw new AuthError('Invalid actor role', 403);
  }
  if (!allowedRoles.includes(roleHeader)) {
    throw new AuthError('Actor is not permitted for this endpoint', 403);
  }
  const displayName = (headers['x-actor-display-name'] as string | undefined)?.trim();
  if (!displayName) {
    throw new AuthError('Missing X-Actor-Display-Name header', 401);
  }

  return {
    userId: (headers['x-actor-user-id'] as string) ?? undefined,
    displayName,
    role: roleHeader,
  };
}
