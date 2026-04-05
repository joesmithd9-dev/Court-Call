/**
 * Canonical event type strings for CourtCall.
 *
 * These are used as the eventType field in CourtDayUpdate / ListItemUpdate
 * rows and in the SSE event envelope. Keep them stable — they form the
 * contract between backend and every consumer (frontend, analytics, exports).
 */

// ─── CourtDay events ─────────────────────────────────────────────────────────

export const CourtDayEventType = {
  CREATED: 'courtday.created',
  LIVE_STARTED: 'courtday.live_started',
  JUDGE_ROSE: 'courtday.judge_rose',
  RESUMED: 'courtday.resumed',
  PAUSED: 'courtday.paused',
  CLOSED: 'courtday.closed',
  BANNER_UPDATED: 'courtday.banner_updated',

  // Derived / system-generated
  PROJECTIONS_RECOMPUTED: 'courtday.projections_recomputed',
  LIST_RESEQUENCED: 'courtday.list_resequenced',
} as const;
export type CourtDayEventType = (typeof CourtDayEventType)[keyof typeof CourtDayEventType];

// ─── ListItem events ─────────────────────────────────────────────────────────

export const ListItemEventType = {
  CREATED: 'listitem.created',
  CALLED: 'listitem.called',
  STARTED: 'listitem.started',
  ESTIMATE_SET: 'listitem.estimate_set',
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
  REORDERED: 'listitem.reordered',
  REMOVED: 'listitem.removed',
} as const;
export type ListItemEventType = (typeof ListItemEventType)[keyof typeof ListItemEventType];

// Union for convenience
export type CourtCallEventType = CourtDayEventType | ListItemEventType;
