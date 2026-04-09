/**
 * Shared Court Day View Model
 *
 * Pure projection from canonical store state into display-ready sections.
 * Consumed by Registrar, Judge, and Public UIs.
 * No business logic - only formatting, grouping, and flagging.
 */

import type { CourtDay, CourtCase, CourtDayStatus, LastAction } from '../types';
import { getCaseTitle } from '../stores/courtDayStore';
import { formatTime, relativeMinutes } from '../utils/time';

export type ViewContext = 'public' | 'registrar' | 'judge';
type MatterType = string;

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
  matterType: MatterType | undefined;
  matterTypeLabel: string | undefined;
  status: CourtCase['status'];
  statusLabel: string;
  startedAt: string | undefined;
  estimatedMinutes: number | undefined;
  durationLabel: string;
  durationColor: string;
  note: string | undefined;
}

export function deriveActiveCase(cd: CourtDay, view: ViewContext): ActiveCaseView | null {
  if (!cd.currentCaseId) return null;
  const c = cd.cases.find((item) => item.id === cd.currentCaseId);
  if (!c) return null;

  const matterType = getMatterType(c);

  return {
    id: c.id,
    title: getCaseTitle(c, view === 'judge' ? 'registrar' : view),
    caseNumber: c.caseNumber,
    matterType,
    matterTypeLabel: matterType ? MATTER_TYPE_LABELS[matterType] ?? matterType : undefined,
    status: c.status,
    statusLabel: STATUS_DISPLAY[c.status] ?? c.status,
    startedAt: c.startedAt ? formatTime(c.startedAt) : undefined,
    estimatedMinutes: c.estimatedMinutes,
    durationLabel: deriveDurationLabel(c.estimatedMinutes),
    durationColor: deriveDurationColor(c.estimatedMinutes),
    note: c.note,
  };
}

// ---- Queue items ----

export interface QueueItemView {
  id: string;
  position: number;
  title: string;
  caseNumber: string | undefined;
  matterType: MatterType | undefined;
  matterTypeLabel: string | undefined;
  status: CourtCase['status'];
  statusLabel: string;
  timeLabel: string;
  estimatedMinutes: number | undefined;
  durationLabel: string;
  durationColor: string;
  isNotBefore: boolean;
  isPaused: boolean;
  isAdjourned: boolean;
  note: string | undefined;
}

function mapCaseToQueueItem(c: CourtCase, titleView: 'public' | 'registrar'): QueueItemView {
  const matterType = getMatterType(c);
  return {
    id: c.id,
    position: c.position,
    title: getCaseTitle(c, titleView),
    caseNumber: c.caseNumber,
    matterType,
    matterTypeLabel: matterType ? MATTER_TYPE_LABELS[matterType] ?? matterType : undefined,
    status: c.status,
    statusLabel: STATUS_DISPLAY[c.status] ?? c.status,
    timeLabel: deriveTimeLabel(c),
    estimatedMinutes: c.estimatedMinutes,
    durationLabel: deriveDurationLabel(c.estimatedMinutes),
    durationColor: deriveDurationColor(c.estimatedMinutes),
    isNotBefore: c.status === 'not_before',
    isPaused: c.status === 'stood_down',
    isAdjourned: c.status === 'adjourned',
    note: c.note,
  };
}

export function deriveQueue(cd: CourtDay, view: ViewContext): QueueItemView[] {
  const titleView = view === 'judge' ? 'registrar' : view;
  return cd.cases
    .filter((c) => c.id !== cd.currentCaseId && c.status !== 'concluded' && c.status !== 'vacated')
    .sort((a, b) => a.position - b.position)
    .map((c) => mapCaseToQueueItem(c, titleView as 'public' | 'registrar'));
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
    .map((c) => mapCaseToQueueItem(c, titleView as 'public' | 'registrar'));
}

// ---- Judge grouping: By Time Band ----

export interface TimeBandGroup {
  label: string;
  minMinutes: number;
  maxMinutes: number;
  items: QueueItemView[];
  totalMinutes: number;
}

const TIME_BANDS: { label: string; min: number; max: number }[] = [
  { label: '5 min or less', min: 0, max: 5 },
  { label: '6-10 min', min: 6, max: 10 },
  { label: '11-20 min', min: 11, max: 20 },
  { label: '21-30 min', min: 21, max: 30 },
  { label: 'Over 30 min', min: 31, max: Infinity },
];

export function deriveTimeBandGroups(cd: CourtDay, view: ViewContext): TimeBandGroup[] {
  const queue = deriveQueue(cd, view).filter((q) => !q.isAdjourned && q.status !== 'stood_down');

  return TIME_BANDS.map((band) => {
    const items = queue.filter((q) => {
      const minutes = q.estimatedMinutes ?? 5;
      return minutes >= band.min && minutes <= band.max;
    });

    return {
      label: band.label,
      minMinutes: band.min,
      maxMinutes: band.max,
      items,
      totalMinutes: items.reduce((sum, q) => sum + (q.estimatedMinutes ?? 5), 0),
    };
  }).filter((group) => group.items.length > 0);
}

// ---- Judge grouping: By Matter Type ----

export interface MatterTypeGroup {
  type: MatterType | 'unknown';
  label: string;
  items: QueueItemView[];
  totalMinutes: number;
  averageMinutes: number;
}

export function deriveMatterTypeGroups(cd: CourtDay, view: ViewContext): MatterTypeGroup[] {
  const queue = deriveQueue(cd, view).filter((q) => !q.isAdjourned && q.status !== 'stood_down');
  const groups = new Map<string, QueueItemView[]>();

  for (const item of queue) {
    const key = item.matterType ?? 'unknown';
    const bucket = groups.get(key) ?? [];
    bucket.push(item);
    groups.set(key, bucket);
  }

  return Array.from(groups.entries())
    .map(([key, items]) => {
      const totalMinutes = items.reduce((sum, q) => sum + (q.estimatedMinutes ?? 5), 0);
      return {
        type: key as MatterType | 'unknown',
        label: MATTER_TYPE_LABELS[key] ?? 'Other',
        items,
        totalMinutes,
        averageMinutes: Math.round(totalMinutes / items.length),
      };
    })
    .sort((a, b) => b.items.length - a.items.length);
}

// ---- Gap Filler: matters that fit within N minutes ----

export function deriveGapFillerMatters(cd: CourtDay, view: ViewContext, maxMinutes: number): QueueItemView[] {
  return deriveQueue(cd, view)
    .filter(
      (q) =>
        !q.isAdjourned &&
        q.status !== 'stood_down' &&
        q.status !== 'not_before' &&
        (q.estimatedMinutes ?? 5) <= maxMinutes
    )
    .sort((a, b) => (a.estimatedMinutes ?? 5) - (b.estimatedMinutes ?? 5));
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

const MATTER_TYPE_LABELS: Record<string, string> = {
  mention: 'Mention',
  bail: 'Bail',
  hearing: 'Hearing',
  consent: 'Consent',
  directions: 'Directions',
  sentence: 'Sentence',
  application: 'Application',
  review: 'Review',
  other: 'Other',
  unknown: 'Other',
};

function getMatterType(c: CourtCase): MatterType | undefined {
  return (c as CourtCase & { matterType?: MatterType }).matterType;
}

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

export function deriveDurationColor(minutes: number | undefined): string {
  if (minutes == null) return 'text-court-text-dim';
  if (minutes <= 5) return 'text-court-active';
  if (minutes <= 10) return 'text-court-active opacity-70';
  if (minutes <= 20) return 'text-court-warning';
  return 'text-court-danger';
}

export function deriveDurationLabel(minutes: number | undefined): string {
  if (minutes == null) return '';
  return `${minutes}m`;
}
