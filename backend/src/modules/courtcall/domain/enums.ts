/**
 * Domain enums for CourtCall.
 *
 * These mirror the Prisma enums but live in the domain layer so service code
 * doesn't depend on generated client types for business logic.
 */

// ─── Court ───────────────────────────────────────────────────────────────────

export const CourtLevel = {
  SUPREME: 'SUPREME',
  DISTRICT: 'DISTRICT',
  COUNTY: 'COUNTY',
  FAMILY: 'FAMILY',
  FEDERAL: 'FEDERAL',
  MAGISTRATES: 'MAGISTRATES',
  TRIBUNAL: 'TRIBUNAL',
  OTHER: 'OTHER',
} as const;
export type CourtLevel = (typeof CourtLevel)[keyof typeof CourtLevel];

// ─── CourtDay ────────────────────────────────────────────────────────────────

export const CourtDayStatus = {
  SCHEDULED: 'SCHEDULED',
  LIVE: 'LIVE',
  ADJOURNED: 'ADJOURNED',
  CLOSED: 'CLOSED',
} as const;
export type CourtDayStatus = (typeof CourtDayStatus)[keyof typeof CourtDayStatus];

export const CourtSessionStatus = {
  BEFORE_SITTING: 'BEFORE_SITTING',
  LIVE: 'LIVE',
  JUDGE_RISING_SHORT: 'JUDGE_RISING_SHORT',
  AT_LUNCH: 'AT_LUNCH',
  ADJOURNED_PART_HEARD: 'ADJOURNED_PART_HEARD',
  FINISHED: 'FINISHED',
} as const;
export type CourtSessionStatus = (typeof CourtSessionStatus)[keyof typeof CourtSessionStatus];

// ─── ListItem ────────────────────────────────────────────────────────────────

export const ListItemStatus = {
  WAITING: 'WAITING',
  CALLING: 'CALLING',
  HEARING: 'HEARING',
  LET_STAND: 'LET_STAND',
  NOT_BEFORE: 'NOT_BEFORE',
  STOOD_DOWN: 'STOOD_DOWN',
  ADJOURNED: 'ADJOURNED',
  PART_HEARD: 'PART_HEARD',
  CONCLUDED: 'CONCLUDED',
  SETTLED: 'SETTLED',
  REMOVED: 'REMOVED',
} as const;
export type ListItemStatus = (typeof ListItemStatus)[keyof typeof ListItemStatus];

// ─── Actor ───────────────────────────────────────────────────────────────────

export const ActorRole = {
  REGISTRAR: 'REGISTRAR',
  SYSTEM: 'SYSTEM',
} as const;
export type ActorRole = (typeof ActorRole)[keyof typeof ActorRole];
