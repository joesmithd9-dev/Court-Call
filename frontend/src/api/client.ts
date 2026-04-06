import type {
  CourtDay,
  UpdateCasePayload,
  UpdateCourtDayPayload,
  ReorderPayload,
} from '../types';

const BASE = '/v1';

// 6.4: Generate idempotency key
function idempotencyKey(resource: string, action: string): string {
  return `${resource}-${action}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

// 6.4: Mutating request with idempotency header
function mutate<T>(path: string, method: string, body?: unknown, idempKey?: string): Promise<T> {
  return request<T>(path, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      'Content-Type': 'application/json',
      ...(idempKey ? { 'Idempotency-Key': idempKey } : {}),
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
  return mutate(`/registrar/court-days/${courtDayId}`, 'PATCH', payload,
    idempotencyKey(courtDayId, 'update-day'));
}

export function updateCase(
  courtDayId: string,
  caseId: string,
  payload: UpdateCasePayload
): Promise<CourtDay> {
  return mutate(`/registrar/court-days/${courtDayId}/cases/${caseId}`, 'PATCH', payload,
    idempotencyKey(caseId, 'update-case'));
}

export function startNextCase(courtDayId: string): Promise<CourtDay> {
  return mutate(`/registrar/court-days/${courtDayId}/start-next`, 'POST', undefined,
    idempotencyKey(courtDayId, 'start-next'));
}

export function reorderCase(
  courtDayId: string,
  payload: ReorderPayload
): Promise<CourtDay> {
  return mutate(`/registrar/court-days/${courtDayId}/reorder`, 'POST', payload,
    idempotencyKey(payload.caseId, 'reorder'));
}

// 6.3: Undo endpoint
export function undoAction(
  courtDayId: string,
  actionType: string,
  caseId: string,
  previousPayload: unknown
): Promise<CourtDay> {
  return mutate(`/registrar/court-days/${courtDayId}/undo`, 'POST',
    { actionType, caseId, previousPayload },
    idempotencyKey(caseId, 'undo'));
}
