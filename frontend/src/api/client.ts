import type {
  CourtDay,
  UpdateCasePayload,
  UpdateCourtDayPayload,
  ReorderPayload,
} from '../types';
import { adaptProjection, isCommandResult, getEventIdFromCommandResult } from './backendAdapter';

const BASE = '/v1';

function idempotencyKey(): string {
  return crypto.randomUUID();
}

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...((opts?.headers as Record<string, string>) ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

/**
 * Fetch a snapshot and normalize it.
 * Handles both backend shapes:
 *   - Original Fastify: { banner, listItems, activeItem }
 *   - Express compat: { status, cases, currentCaseId }
 */
async function fetchSnapshot(path: string): Promise<CourtDay> {
  const raw = await request<Record<string, unknown>>(path);

  // Detect original Fastify backend shape (has 'banner' and 'listItems')
  if ('banner' in raw && 'listItems' in raw) {
    return adaptProjection(raw as any);
  }

  // Already in frontend shape (Express backend or pre-adapted)
  return raw as unknown as CourtDay;
}

/**
 * Mutating request. Returns a snapshot.
 * Handles both response shapes:
 *   - Original Fastify: { success, eventId, eventType } → refetch snapshot
 *   - Express compat: full CourtDay snapshot with lastEventId
 */
async function mutateAndSnapshot(
  snapshotPath: string,
  mutatePath: string,
  method: string,
  body?: unknown
): Promise<CourtDay & { lastEventId?: string }> {
  const raw = await request<Record<string, unknown>>(mutatePath, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey(),
    },
  });

  // Original Fastify backend returns { success, eventId, eventType }
  if (isCommandResult(raw)) {
    const snapshot = await fetchSnapshot(snapshotPath);
    return { ...snapshot, lastEventId: getEventIdFromCommandResult(raw as any) };
  }

  // Express backend returns full snapshot with lastEventId
  if ('banner' in raw && 'listItems' in raw) {
    const adapted = adaptProjection(raw as any);
    return { ...adapted, lastEventId: (raw as any).lastEventId };
  }

  return raw as unknown as CourtDay & { lastEventId?: string };
}

// ---- Public endpoints ----

export function fetchCourtDay(courtDayId: string): Promise<CourtDay> {
  return fetchSnapshot(`/public/court-days/${courtDayId}`);
}

export function getSSEUrl(courtDayId: string): string {
  return `${BASE}/public/court-days/${courtDayId}/stream`;
}

// ---- Registrar endpoints ----

export function fetchRegistrarCourtDay(courtDayId: string): Promise<CourtDay> {
  return fetchSnapshot(`/registrar/court-days/${courtDayId}`);
}

export function updateCourtDay(
  courtDayId: string,
  payload: UpdateCourtDayPayload
): Promise<CourtDay> {
  return mutateAndSnapshot(
    `/registrar/court-days/${courtDayId}`,
    `/registrar/court-days/${courtDayId}`,
    'PATCH',
    payload
  );
}

export function updateCase(
  courtDayId: string,
  caseId: string,
  payload: UpdateCasePayload
): Promise<CourtDay> {
  return mutateAndSnapshot(
    `/registrar/court-days/${courtDayId}`,
    `/registrar/court-days/${courtDayId}/cases/${caseId}`,
    'PATCH',
    payload
  );
}

export function startNextCase(courtDayId: string): Promise<CourtDay> {
  return mutateAndSnapshot(
    `/registrar/court-days/${courtDayId}`,
    `/registrar/court-days/${courtDayId}/start-next`,
    'POST'
  );
}

export function reorderCase(
  courtDayId: string,
  payload: ReorderPayload
): Promise<CourtDay> {
  return mutateAndSnapshot(
    `/registrar/court-days/${courtDayId}`,
    `/registrar/court-days/${courtDayId}/reorder`,
    'POST',
    payload
  );
}

export function undoAction(
  courtDayId: string,
  targetEventId: string
): Promise<CourtDay> {
  return mutateAndSnapshot(
    `/registrar/court-days/${courtDayId}`,
    `/registrar/court-days/${courtDayId}/undo`,
    'POST',
    { targetEventId }
  );
}
