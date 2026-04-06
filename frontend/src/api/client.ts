import type {
  CourtDay,
  UpdateCasePayload,
  UpdateCourtDayPayload,
  ReorderPayload,
} from '../types';

const BASE = '/v1';

// (C) Collision-free idempotency key using crypto.randomUUID
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

function mutate<T>(path: string, method: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey(),
    },
  });
}

// ---- Public endpoints ----
export function fetchCourtDay(courtDayId: string): Promise<CourtDay> {
  return request(`/public/court-days/${courtDayId}`);
}

export function getSSEUrl(courtDayId: string): string {
  return `${BASE}/public/court-days/${courtDayId}/stream`;
}

// ---- Registrar endpoints ----
export function fetchRegistrarCourtDay(courtDayId: string): Promise<CourtDay> {
  return request(`/registrar/court-days/${courtDayId}`);
}

export function updateCourtDay(
  courtDayId: string,
  payload: UpdateCourtDayPayload
): Promise<CourtDay> {
  return mutate(`/registrar/court-days/${courtDayId}`, 'PATCH', payload);
}

export function updateCase(
  courtDayId: string,
  caseId: string,
  payload: UpdateCasePayload
): Promise<CourtDay> {
  return mutate(`/registrar/court-days/${courtDayId}/cases/${caseId}`, 'PATCH', payload);
}

export function startNextCase(courtDayId: string): Promise<CourtDay> {
  return mutate(`/registrar/court-days/${courtDayId}/start-next`, 'POST');
}

export function reorderCase(
  courtDayId: string,
  payload: ReorderPayload
): Promise<CourtDay> {
  return mutate(`/registrar/court-days/${courtDayId}/reorder`, 'POST', payload);
}

// (B) Undo is event-based — sends targetEventId, backend emits compensating event
export function undoAction(
  courtDayId: string,
  targetEventId: string
): Promise<CourtDay> {
  return mutate(`/registrar/court-days/${courtDayId}/undo`, 'POST', { targetEventId });
}
