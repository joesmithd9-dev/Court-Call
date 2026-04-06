import type {
  CourtDay,
  CourtCase,
  UpdateCasePayload,
  UpdateCourtDayPayload,
  ReorderPayload,
} from '../types';

const BASE = '/v1';
const REGISTRAR_HEADERS = {
  'X-Actor-Display-Name': 'Registrar UI',
  'X-Actor-Role': 'REGISTRAR',
};

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
    const body = await res.text();
    throw new Error(`API ${res.status}: ${res.statusText}${body ? ` — ${body}` : ''}`);
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
      ...REGISTRAR_HEADERS,
    },
  });
}

// ---- Public endpoints ----
export function fetchCourtDay(courtDayId: string): Promise<CourtDay> {
  return request<unknown>(`/public/court-days/${courtDayId}`).then(adaptCourtDaySnapshot);
}

export function getSSEUrl(
  courtDayId: string,
  mode: 'public' | 'registrar' = 'public'
): string {
  if (mode === 'registrar') {
    return `${BASE}/registrar/court-days/${courtDayId}/stream`;
  }
  return `${BASE}/public/court-days/${courtDayId}/stream`;
}

// ---- Registrar endpoints ----
export function fetchRegistrarCourtDay(courtDayId: string): Promise<CourtDay> {
  return request<unknown>(`/registrar/court-days/${courtDayId}`, {
    headers: {
      ...REGISTRAR_HEADERS,
    },
  }).then(adaptCourtDaySnapshot);
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

// ---- Snapshot compatibility adapter ----
type BackendSnapshot = {
  id: string;
  date?: string;
  status?: string;
  sessionStatus?: string;
  statusMessage?: string | null;
  resumeTime?: string | null;
  currentCaseId?: string | null;
  courtName?: string;
  courtRoom?: string | null;
  judgeName?: string;
  lastSequence?: number;
  createdAt?: string;
  updatedAt?: string;
  banner?: {
    status?: string;
    sessionStatus?: string;
    sessionMessage?: string | null;
    expectedResumeAt?: string | null;
    judgeName?: string;
  };
  activeItem?: { id?: string | null } | null;
  listItems?: BackendListItem[];
  cases?: BackendListItem[];
};

type BackendListItem = {
  id: string;
  queuePosition?: number;
  position?: number;
  caseName?: string;
  caseTitleFull?: string;
  caseTitlePublic?: string;
  caseReference?: string | null;
  caseNumber?: string | null;
  status?: string;
  estimatedDurationMinutes?: number | null;
  estimatedMinutes?: number | null;
  predictedStartTime?: string | null;
  startedAt?: string | null;
  actualStartTime?: string | null;
  notBeforeTime?: string | null;
  adjournedToTime?: string | null;
  adjournedUntil?: string | null;
  publicNote?: string | null;
  note?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

function adaptCourtDaySnapshot(raw: unknown): CourtDay {
  const data = raw as BackendSnapshot;
  const nowIso = new Date().toISOString();
  const listItems = Array.isArray(data.listItems)
    ? data.listItems
    : Array.isArray(data.cases)
      ? data.cases
      : [];

  const cases: CourtCase[] = listItems.map((item) => ({
    id: item.id,
    courtDayId: data.id,
    position: item.queuePosition ?? item.position ?? 0,
    caseName: item.caseName ?? 'Case',
    caseTitleFull: item.caseTitleFull ?? item.caseName ?? 'Case',
    caseTitlePublic: item.caseTitlePublic ?? item.caseName ?? 'Case',
    caseNumber: item.caseReference ?? item.caseNumber ?? undefined,
    status: adaptCaseStatus(item.status),
    startedAt: item.actualStartTime ?? item.startedAt ?? undefined,
    estimatedMinutes: item.estimatedDurationMinutes ?? item.estimatedMinutes ?? undefined,
    predictedStartTime: item.predictedStartTime ?? undefined,
    notBeforeTime: item.notBeforeTime ?? undefined,
    adjournedToTime: item.adjournedUntil ?? item.adjournedToTime ?? undefined,
    note: item.publicNote ?? item.note ?? undefined,
    createdAt: item.createdAt ?? nowIso,
    updatedAt: item.updatedAt ?? nowIso,
  }));

  const inferredCurrentCaseId =
    data.currentCaseId ??
    data.activeItem?.id ??
    cases.find((c) => c.status === 'calling' || c.status === 'hearing')?.id;

  return {
    id: data.id,
    courtName: data.courtName ?? 'Court',
    courtRoom: data.courtRoom ?? undefined,
    judgeName: data.judgeName ?? data.banner?.judgeName ?? 'Judge',
    date: data.date ?? nowIso.slice(0, 10),
    status: adaptCourtStatus(
      data.status ?? data.banner?.status,
      data.sessionStatus ?? data.banner?.sessionStatus
    ),
    statusMessage:
      data.statusMessage ??
      data.banner?.sessionMessage ??
      undefined,
    resumeTime:
      data.resumeTime ??
      data.banner?.expectedResumeAt ??
      undefined,
    currentCaseId: inferredCurrentCaseId ?? undefined,
    lastSequence: data.lastSequence ?? 0,
    cases,
    createdAt: data.createdAt ?? nowIso,
    updatedAt: data.updatedAt ?? nowIso,
  };
}

function adaptCourtStatus(status?: string, sessionStatus?: string): CourtDay['status'] {
  if (status === 'live') return 'live';
  if (status === 'scheduled') return 'scheduled';
  if (status === 'judge_rose') return 'judge_rose';
  if (status === 'at_lunch') return 'at_lunch';
  if (status === 'adjourned') return 'adjourned';
  if (status === 'ended') return 'ended';

  if (sessionStatus === 'JUDGE_RISING_SHORT') return 'judge_rose';
  if (sessionStatus === 'AT_LUNCH') return 'at_lunch';
  if (sessionStatus === 'ADJOURNED_PART_HEARD') return 'adjourned';
  if (sessionStatus === 'FINISHED') return 'ended';

  switch (status) {
    case 'LIVE':
      return 'live';
    case 'ADJOURNED':
      return 'adjourned';
    case 'CLOSED':
      return 'ended';
    case 'SCHEDULED':
    default:
      return 'scheduled';
  }
}

function adaptCaseStatus(status?: string): CourtCase['status'] {
  if (
    status === 'pending' ||
    status === 'calling' ||
    status === 'hearing' ||
    status === 'adjourned' ||
    status === 'stood_down' ||
    status === 'not_before' ||
    status === 'concluded' ||
    status === 'vacated'
  ) {
    return status;
  }

  switch (status) {
    case 'CALLING':
      return 'calling';
    case 'HEARING':
      return 'hearing';
    case 'ADJOURNED':
      return 'adjourned';
    case 'STOOD_DOWN':
    case 'LET_STAND':
      return 'stood_down';
    case 'NOT_BEFORE':
      return 'not_before';
    case 'CONCLUDED':
    case 'SETTLED':
      return 'concluded';
    case 'REMOVED':
      return 'vacated';
    case 'PART_HEARD':
      return 'hearing';
    case 'WAITING':
    default:
      return 'pending';
  }
}
