import type {
  CourtDay,
  UpdateCasePayload,
  UpdateCourtDayPayload,
  ReorderPayload,
} from '../types';

const BASE = '/v1';

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${res.statusText}`);
  }
  return res.json();
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
  return request(`/registrar/court-days/${courtDayId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function updateCase(
  courtDayId: string,
  caseId: string,
  payload: UpdateCasePayload
): Promise<CourtDay> {
  return request(`/registrar/court-days/${courtDayId}/cases/${caseId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function startNextCase(courtDayId: string): Promise<CourtDay> {
  return request(`/registrar/court-days/${courtDayId}/start-next`, {
    method: 'POST',
  });
}

export function reorderCase(
  courtDayId: string,
  payload: ReorderPayload
): Promise<CourtDay> {
  return request(`/registrar/court-days/${courtDayId}/reorder`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
