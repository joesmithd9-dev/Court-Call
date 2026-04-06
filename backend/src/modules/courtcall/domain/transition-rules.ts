import { ListItemStatus } from './enums.js';

/**
 * ListItem state-machine transition rules.
 *
 * The map key is the *current* status; the value is the set of statuses
 * that are reachable from it via an explicit command.
 *
 * Design decisions:
 * - WAITING is the entry state for all new items.
 * - CALLING is the only gateway into HEARING (registrar must call first).
 * - NOT_BEFORE items can only be called once the not-before time is reached
 *   or the registrar overrides; the transition is still NOT_BEFORE → CALLING.
 * - LET_STAND items go back to WAITING (re-enter queue) or directly to CALLING.
 * - STOOD_DOWN items return to WAITING when restored.
 * - HEARING can end in PART_HEARD, CONCLUDED, SETTLED, or ADJOURNED.
 * - CONCLUDED, SETTLED, and REMOVED are terminal for the current court day.
 * - ADJOURNED means adjourned *out* of today's list (next term, future date).
 * - PART_HEARD can resume via CALLING on a subsequent sitting or be concluded.
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
    ListItemStatus.STOOD_DOWN,  // no appearance, stand down
    ListItemStatus.WAITING,     // call abandoned, back to queue
  ]),
  [ListItemStatus.HEARING]: new Set([
    ListItemStatus.PART_HEARD,
    ListItemStatus.CONCLUDED,
    ListItemStatus.SETTLED,
    ListItemStatus.ADJOURNED,
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
  [ListItemStatus.ADJOURNED]: new Set([
    // Terminal for this court day. Re-listing is a new ListItem on a future day.
  ]),
  [ListItemStatus.PART_HEARD]: new Set([
    ListItemStatus.CALLING,     // resume hearing
    ListItemStatus.CONCLUDED,
    ListItemStatus.ADJOURNED,
  ]),
  [ListItemStatus.CONCLUDED]: new Set([
    // Terminal
  ]),
  [ListItemStatus.SETTLED]: new Set([
    // Terminal
  ]),
  [ListItemStatus.REMOVED]: new Set([
    // Terminal — restore would be future work with explicit audit trail
  ]),
};

/**
 * Throws if the proposed transition is not allowed.
 */
export function assertTransitionAllowed(
  from: ListItemStatus,
  to: ListItemStatus,
): void {
  const allowed = ALLOWED_TRANSITIONS[from];
  if (!allowed || !allowed.has(to)) {
    throw new TransitionError(from, to);
  }
}

/**
 * Returns true if the item can currently be called (CALLING transition).
 * NOT_BEFORE items need explicit override or the not-before time must have passed.
 */
export function isCallableNow(
  status: ListItemStatus,
  notBeforeTime: Date | null,
): boolean {
  if (status === ListItemStatus.WAITING || status === ListItemStatus.LET_STAND || status === ListItemStatus.PART_HEARD) {
    return true;
  }
  if (status === ListItemStatus.NOT_BEFORE) {
    if (!notBeforeTime) return true; // no time constraint, callable
    return new Date() >= notBeforeTime;
  }
  return false;
}

/**
 * Returns true if the status is terminal for the current court day.
 */
export function isTerminalStatus(status: ListItemStatus): boolean {
  return (
    status === ListItemStatus.CONCLUDED ||
    status === ListItemStatus.SETTLED ||
    status === ListItemStatus.REMOVED ||
    status === ListItemStatus.ADJOURNED
  );
}

/**
 * Returns true if a status change on this item should cause the prediction
 * engine to recalculate queue timings for the court day.
 *
 * Any transition that changes whether an item is "active" or "ahead in queue"
 * affects downstream predictions.
 */
export function shouldAffectQueuePrediction(
  _from: ListItemStatus,
  _to: ListItemStatus,
): boolean {
  // For MVP, every status change potentially shifts the queue.
  // The recalculation engine (future phase) will be more selective.
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
