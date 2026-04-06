import { ListItemStatus } from './enums.js';

/**
 * ListItem state-machine transition rules.
 */
const ALLOWED_TRANSITIONS: Record<ListItemStatus, ReadonlySet<ListItemStatus>> = {
  [ListItemStatus.WAITING]: new Set([
    ListItemStatus.CALLING,
    ListItemStatus.NOT_BEFORE,
    ListItemStatus.LET_STAND,
    ListItemStatus.STOOD_DOWN,
    ListItemStatus.REMOVED,
  ]),
  [ListItemStatus.CALLING]: new Set([
    ListItemStatus.HEARING,
    ListItemStatus.STOOD_DOWN,
    ListItemStatus.WAITING,
  ]),
  [ListItemStatus.HEARING]: new Set([
    ListItemStatus.PART_HEARD,
    ListItemStatus.CONCLUDED,
    ListItemStatus.SETTLED,
    ListItemStatus.ADJOURNED,
    ListItemStatus.STRUCK_OUT,
  ]),
  [ListItemStatus.LET_STAND]: new Set([
    ListItemStatus.WAITING,
    ListItemStatus.CALLING,
    ListItemStatus.REMOVED,
  ]),
  [ListItemStatus.NOT_BEFORE]: new Set([
    ListItemStatus.CALLING,
    ListItemStatus.WAITING,
    ListItemStatus.REMOVED,
  ]),
  [ListItemStatus.STOOD_DOWN]: new Set([
    ListItemStatus.WAITING,
    ListItemStatus.REMOVED,
  ]),
  [ListItemStatus.ADJOURNED]: new Set([]),
  [ListItemStatus.PART_HEARD]: new Set([
    ListItemStatus.CALLING,
    ListItemStatus.CONCLUDED,
    ListItemStatus.ADJOURNED,
  ]),
  [ListItemStatus.CONCLUDED]: new Set([]),
  [ListItemStatus.SETTLED]: new Set([]),
  [ListItemStatus.STRUCK_OUT]: new Set([]),
  [ListItemStatus.REMOVED]: new Set([]),
};

export function assertTransitionAllowed(
  from: ListItemStatus,
  to: ListItemStatus,
): void {
  const allowed = ALLOWED_TRANSITIONS[from];
  if (!allowed || !allowed.has(to)) {
    throw new TransitionError(from, to);
  }
}

export function isCallableNow(
  status: ListItemStatus,
  notBeforeTime: Date | null,
): boolean {
  if (status === ListItemStatus.WAITING || status === ListItemStatus.LET_STAND || status === ListItemStatus.PART_HEARD) {
    return true;
  }
  if (status === ListItemStatus.NOT_BEFORE) {
    if (!notBeforeTime) return true;
    return new Date() >= notBeforeTime;
  }
  return false;
}

export function isTerminalStatus(status: ListItemStatus): boolean {
  return (
    status === ListItemStatus.CONCLUDED ||
    status === ListItemStatus.SETTLED ||
    status === ListItemStatus.STRUCK_OUT ||
    status === ListItemStatus.REMOVED ||
    status === ListItemStatus.ADJOURNED
  );
}

export function shouldAffectQueuePrediction(
  _from: ListItemStatus,
  _to: ListItemStatus,
): boolean {
  return true;
}

export class TransitionError extends Error {
  public readonly from: ListItemStatus;
  public readonly to: ListItemStatus;

  constructor(from: ListItemStatus, to: ListItemStatus) {
    super(`Illegal status transition: ${from} → ${to}`);
    this.name = 'TransitionError';
    this.from = from;
    this.to = to;
  }
}
