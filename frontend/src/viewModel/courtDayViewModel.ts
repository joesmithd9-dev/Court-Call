/**
 * Shared Court Day View Model
 *
 * Pure projection from canonical store state into display-ready sections.
 * Consumed by both Registrar UI and Judge UI.
 * No business logic — only formatting, grouping, and flagging.
 */

import type { CourtDay, CourtCase, CourtDayStatus, LastAction } from '../types';
import { getCaseTitle } from '../stores/courtDayStore';
import { formatTime, relativeMinutes } from '../utils/time';

export type ViewContext = 'public' | 'registrar' | 'judge';

// ---- Court status display ----

export interface CourtStatusView {
  status: CourtDayStatus;
  label: string;
  message: string | undefined;
  isLive: boolean;
  isPaused: boolean;
  isEnded: boolean;
}

export function deriveCourtStatus(cd: CourtDay): CourtStatusView {
  const STATUS_LABELS: Record<CourtDayStatus, string> = {
    scheduled: 'SCHEDULED',
    live: 'LIVE',
    judge_rose: 'JUDGE ROSE',
    at_lunch: 'AT LUNCH',
    adjourned: 'ADJOURNED',
    ended: 'DAY ENDED',
  };

  const isPaused = cd.status === 'judge_rose' || cd.status === 'at_lunch' || cd.status === 'adjourned';

  let message = cd.statusMessage;
  if (!message && cd.status === 'judge_rose' && cd.resumeTime) {
    message = `Back at ${formatTime(cd.resumeTime)}`;
  }
  if (!message && cd.status === 'at_lunch' && cd.resumeTime) {
    message = `Back at ${formatTime(cd.resumeTime)}`;
  }

  return {
    status: cd.status,
    label: STATUS_LABELS[cd.status] ?? 'UNKNOWN',
    message,
    isLive: cd.status === 'live',
    isPaused,
    isEnded: cd.status === 'ended',
  };
}

// ---- Active case view ----

export interface ActiveCaseView {
  id: string;
  title: string;
  caseNumber: string | undefined;
  status: CourtCase['status'];
  statusLabel: string;
  startedAt: string | undefined;
  estimatedMinutes: number | undefined;
  note: string | undefined;
}

export function deriveActiveCase(cd: CourtDay, view: ViewContext): ActiveCaseView | null {
  if (!cd.currentCaseId) return null;
  const c = cd.cases.find((c) => c.id === cd.currentCaseId);
  if (!c) return null;

  return {
    id: c.id,
    title: getCaseTitle(c, view === 'judge' ? 'registrar' : view),
    caseNumber: c.caseNumber,
    status: c.status,
    statusLabel: STATUS_DISPLAY[c.status] ?? c.status,
    startedAt: c.startedAt ? formatTime(c.startedAt) : undefined,
    estimatedMinutes: c.estimatedMinutes,
    note: c.note,
  };
}

// ---- Queue items ----

export interface QueueItemView {
  id: string;
  position: number;
  title: string;
  caseNumber: string | undefined;
  status: CourtCase['status'];
  statusLabel: string;
  timeLabel: string;
  isNotBefore: boolean;
  isPaused: boolean;
  isAdjourned: boolean;
  note: string | undefined;
}

export function deriveQueue(cd: CourtDay, view: ViewContext): QueueItemView[] {
  const titleView = view === 'judge' ? 'registrar' : view;
  return cd.cases
    .filter(
      (c) =>
        c.id !== cd.currentCaseId &&
        c.status !== 'concluded' &&
        c.status !== 'vacated'
    )
    .sort((a, b) => a.position - b.position)
    .map((c) => ({
      id: c.id,
      position: c.position,
      title: getCaseTitle(c, titleView as 'public' | 'registrar'),
      caseNumber: c.caseNumber,
      status: c.status,
      statusLabel: STATUS_DISPLAY[c.status] ?? c.status,
      timeLabel: deriveTimeLabel(c),
      isNotBefore: c.status === 'not_before',
      isPaused: c.status === 'stood_down',
      isAdjourned: c.status === 'adjourned',
      note: c.note,
    }));
}

export function deriveNextUp(cd: CourtDay, view: ViewContext, count: number): QueueItemView[] {
  return deriveQueue(cd, view)
    .filter((q) => q.status === 'pending' || q.status === 'calling' || q.status === 'not_before' || q.status === 'stood_down')
    .slice(0, count);
}

// ---- Concluded / recent items ----

export interface ConcludedItemView {
  id: string;
  position: number;
  title: string;
  status: CourtCase['status'];
  statusLabel: string;
}

export function deriveConcluded(cd: CourtDay, view: ViewContext): ConcludedItemView[] {
  const titleView = view === 'judge' ? 'registrar' : view;
  return cd.cases
    .filter((c) => c.status === 'concluded' || c.status === 'vacated')
    .sort((a, b) => a.position - b.position)
    .map((c) => ({
      id: c.id,
      position: c.position,
      title: getCaseTitle(c, titleView as 'public' | 'registrar'),
      status: c.status,
      statusLabel: STATUS_DISPLAY[c.status] ?? c.status,
    }));
}

// ---- Full sorted list (for registrar) ----

export function deriveFullList(cd: CourtDay, view: ViewContext): QueueItemView[] {
  const titleView = view === 'judge' ? 'registrar' : view;
  return [...cd.cases]
    .sort((a, b) => a.position - b.position)
    .map((c) => ({
      id: c.id,
      position: c.position,
      title: getCaseTitle(c, titleView as 'public' | 'registrar'),
      caseNumber: c.caseNumber,
      status: c.status,
      statusLabel: STATUS_DISPLAY[c.status] ?? c.status,
      timeLabel: deriveTimeLabel(c),
      isNotBefore: c.status === 'not_before',
      isPaused: c.status === 'stood_down',
      isAdjourned: c.status === 'adjourned',
      note: c.note,
    }));
}

// ---- Undo availability ----

export interface UndoView {
  available: boolean;
  label: string;
  remainingMs: number;
}

const UNDO_WINDOW_MS = 10_000;

export function deriveUndoState(lastAction: LastAction | null): UndoView {
  if (!lastAction) return { available: false, label: '', remainingMs: 0 };
  const elapsed = Date.now() - lastAction.timestamp;
  const remaining = Math.max(0, UNDO_WINDOW_MS - elapsed);
  if (remaining <= 0) return { available: false, label: '', remainingMs: 0 };
  return {
    available: true,
    label: `Undo (${Math.ceil(remaining / 1000)}s)`,
    remainingMs: remaining,
  };
}

// ---- Connection / metadata ----

export interface MetaView {
  courtName: string;
  courtRoom: string | undefined;
  judgeName: string;
  dateLabel: string;
  connected: boolean;
  lastSequence: number;
  criticalError: string | null;
}

export function deriveMeta(
  cd: CourtDay,
  connected: boolean,
  lastSequence: number,
  criticalError: string | null
): MetaView {
  return {
    courtName: cd.courtName,
    courtRoom: cd.courtRoom,
    judgeName: cd.judgeName,
    dateLabel: new Date(cd.date).toLocaleDateString('en-AU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
    connected,
    lastSequence,
    criticalError,
  };
}

// ---- Internals ----

const STATUS_DISPLAY: Record<string, string> = {
  pending: 'Pending',
  calling: 'Calling',
  hearing: 'Hearing',
  adjourned: 'Adjourned',
  stood_down: 'Let Stand',
  not_before: 'Not Before',
  concluded: 'Concluded',
  vacated: 'Vacated',
};

function deriveTimeLabel(c: CourtCase): string {
  if (c.status === 'adjourned' && c.adjournedToTime) {
    return `Adj. ${formatTime(c.adjournedToTime)}`;
  }
  if (c.status === 'not_before' && c.notBeforeTime) {
    return `Not before ${formatTime(c.notBeforeTime)}`;
  }
  if (c.predictedStartTime) {
    return relativeMinutes(c.predictedStartTime);
  }
  if (c.scheduledTime) {
    return formatTime(c.scheduledTime);
  }
  return '';
}
