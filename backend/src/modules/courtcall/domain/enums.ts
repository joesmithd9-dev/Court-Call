/**
 * Domain enums for CourtCall.
 *
 * These mirror the Prisma enums but live in the domain layer so service code
 * doesn't depend on generated client types for business logic.
 */

// ─── User ───────────────────────────────────────────────────────────────────

export const UserRole = {
  REGISTRAR: 'REGISTRAR',
  COUNSEL: 'COUNSEL',
  ADMIN: 'ADMIN',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

// ─── CourtDay ───────────────────────────────────────────────────────────────

export const CourtDayStatus = {
  SETUP: 'SETUP',
  LIVE: 'LIVE',
  JUDGE_ROSE: 'JUDGE_ROSE',
  AT_LUNCH: 'AT_LUNCH',
  PAUSED: 'PAUSED',
  CONCLUDED: 'CONCLUDED',
} as const;
export type CourtDayStatus = (typeof CourtDayStatus)[keyof typeof CourtDayStatus];

export const SessionPeriod = {
  MORNING: 'MORNING',
  AFTERNOON: 'AFTERNOON',
} as const;
export type SessionPeriod = (typeof SessionPeriod)[keyof typeof SessionPeriod];

// ─── ListItem ───────────────────────────────────────────────────────────────

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
  STRUCK_OUT: 'STRUCK_OUT',
  REMOVED: 'REMOVED',
} as const;
export type ListItemStatus = (typeof ListItemStatus)[keyof typeof ListItemStatus];

// ─── Direction / Outcome ────────────────────────────────────────────────────

export const DirectionCode = {
  MENTION: 'MENTION',
  FOR_HEARING: 'FOR_HEARING',
  CONSENT: 'CONSENT',
  PART_HEARD: 'PART_HEARD',
  LIBERTY_TO_REENTER: 'LIBERTY_TO_REENTER',
  COSTS_RESERVED: 'COSTS_RESERVED',
  NO_ORDER: 'NO_ORDER',
  REPLYING_PAPERS: 'REPLYING_PAPERS',
  INTERPRETER_REQUIRED: 'INTERPRETER_REQUIRED',
  COUNSEL_TO_ATTEND: 'COUNSEL_TO_ATTEND',
  OTHER: 'OTHER',
} as const;
export type DirectionCode = (typeof DirectionCode)[keyof typeof DirectionCode];

export const OutcomeCode = {
  CONCLUDED: 'CONCLUDED',
  ADJOURNED_SAME_DAY: 'ADJOURNED_SAME_DAY',
  ADJOURNED_NEXT_TERM: 'ADJOURNED_NEXT_TERM',
  ADJOURNED_DATE_FIXED: 'ADJOURNED_DATE_FIXED',
  ADJOURNED_DATE_TO_BE_FIXED: 'ADJOURNED_DATE_TO_BE_FIXED',
  PART_HEARD: 'PART_HEARD',
  SETTLED: 'SETTLED',
  STRUCK_OUT: 'STRUCK_OUT',
  LIBERTY_TO_REENTER: 'LIBERTY_TO_REENTER',
  REMOVED: 'REMOVED',
} as const;
export type OutcomeCode = (typeof OutcomeCode)[keyof typeof OutcomeCode];

export const AdjournmentType = {
  SAME_DAY: 'SAME_DAY',
  NEXT_TERM: 'NEXT_TERM',
  DATE_FIXED: 'DATE_FIXED',
  DATE_TO_BE_FIXED: 'DATE_TO_BE_FIXED',
  GENERAL: 'GENERAL',
} as const;
export type AdjournmentType = (typeof AdjournmentType)[keyof typeof AdjournmentType];

// ─── Actor (domain-level, not a Prisma enum) ───────────────────────────────

export const ActorRole = {
  REGISTRAR: 'REGISTRAR',
  SYSTEM: 'SYSTEM',
} as const;
export type ActorRole = (typeof ActorRole)[keyof typeof ActorRole];
