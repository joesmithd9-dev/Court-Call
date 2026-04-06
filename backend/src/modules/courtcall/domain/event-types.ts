/**
 * Canonical event type strings for CourtCall.
 *
 * Used as the eventType field in ListUpdate / CourtDayUpdate rows
 * and in the SSE event envelope.
 */

// ─── CourtDay events ─────────────────────────────────────────────────────────

export const CourtDayEventType = {
  CREATED: 'courtday.created',
  LIVE_STARTED: 'courtday.live_started',
  JUDGE_ROSE: 'courtday.judge_rose',
  AT_LUNCH: 'courtday.at_lunch',
  PAUSED: 'courtday.paused',
  RESUMED: 'courtday.resumed',
  CONCLUDED: 'courtday.concluded',
  UNDO_APPLIED: 'courtday.undo_applied',
} as const;
export type CourtDayEventType = (typeof CourtDayEventType)[keyof typeof CourtDayEventType];

// ─── ListItem events ─────────────────────────────────────────────────────────

export const ListItemEventType = {
  CREATED: 'listitem.created',
  CALLED: 'listitem.called',
  STARTED: 'listitem.started',
  ESTIMATE_EXTENDED: 'listitem.estimate_extended',
  NOT_BEFORE_SET: 'listitem.not_before_set',
  ADJOURNED: 'listitem.adjourned',
  LET_STAND: 'listitem.let_stand',
  STOOD_DOWN: 'listitem.stood_down',
  RESTORED: 'listitem.restored',
  DIRECTION_RECORDED: 'listitem.direction_recorded',
  NOTE_UPDATED: 'listitem.note_updated',
  OUTCOME_RECORDED: 'listitem.outcome_recorded',
  COMPLETED: 'listitem.completed',
  SETTLED: 'listitem.settled',
  STRUCK_OUT: 'listitem.struck_out',
  REORDERED: 'listitem.reordered',
  REMOVED: 'listitem.removed',
  UNDO_APPLIED: 'listitem.undo_applied',
} as const;
export type ListItemEventType = (typeof ListItemEventType)[keyof typeof ListItemEventType];

export type CourtCallEventType = CourtDayEventType | ListItemEventType;
