import { z } from 'zod';

// ─── CourtDay command schemas ────────────────────────────────────────────────

export const CreateCourtDaySchema = z.object({
  courtId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  judgeName: z.string().min(1).max(200).optional(),
  sessionPeriod: z.enum(['MORNING', 'AFTERNOON']).optional(),
  registrarId: z.string().min(1).optional(),
  publicNote: z.string().max(1000).optional(),
});
export type CreateCourtDayInput = z.infer<typeof CreateCourtDaySchema>;

export const StartLiveSchema = z.object({
  publicNote: z.string().max(500).optional(),
});
export type StartLiveInput = z.infer<typeof StartLiveSchema>;

export const JudgeRoseSchema = z.object({
  resumesAt: z.string().datetime().optional(),
  publicNote: z.string().max(500).optional(),
});
export type JudgeRoseInput = z.infer<typeof JudgeRoseSchema>;

export const AtLunchSchema = z.object({
  resumesAt: z.string().datetime().optional(),
  publicNote: z.string().max(500).optional(),
});
export type AtLunchInput = z.infer<typeof AtLunchSchema>;

export const ResumeSchema = z.object({
  publicNote: z.string().max(500).optional(),
});
export type ResumeInput = z.infer<typeof ResumeSchema>;

export const ConcludeCourtDaySchema = z.object({
  publicNote: z.string().max(500).optional(),
});
export type ConcludeCourtDayInput = z.infer<typeof ConcludeCourtDaySchema>;

// ─── ListItem command schemas ────────────────────────────────────────────────

export const CreateListItemSchema = z.object({
  caseTitleFull: z.string().min(1).max(500),
  caseTitlePublic: z.string().min(1).max(500),
  caseReference: z.string().max(100).optional(),
  parties: z.string().max(300).optional(),
  counselNames: z.array(z.string().max(200)).optional(),
  estimatedDurationMinutes: z.number().int().min(1).max(1440).optional(),
  notBeforeTime: z.string().datetime().optional(),
  publicNote: z.string().max(1000).optional(),
  internalNote: z.string().max(2000).optional(),
});
export type CreateListItemInput = z.infer<typeof CreateListItemSchema>;

export const CallSchema = z.object({
  override: z.boolean().optional(),
});
export type CallInput = z.infer<typeof CallSchema>;

export const ExtendEstimateSchema = z.object({
  additionalMinutes: z.number().int().min(1).max(480),
});
export type ExtendEstimateInput = z.infer<typeof ExtendEstimateSchema>;

export const NotBeforeSchema = z.object({
  notBeforeTime: z.string().datetime(),
  publicNote: z.string().max(1000).optional(),
});
export type NotBeforeInput = z.infer<typeof NotBeforeSchema>;

export const AdjournSchema = z.object({
  adjournedUntil: z.string().datetime().optional(),
  adjournmentType: z.enum(['SAME_DAY', 'NEXT_TERM', 'DATE_FIXED', 'DATE_TO_BE_FIXED', 'GENERAL']).optional(),
  nextListingNote: z.string().max(1000).optional(),
  publicNote: z.string().max(1000).optional(),
  internalNote: z.string().max(2000).optional(),
  directionCode: z.enum([
    'MENTION', 'FOR_HEARING', 'CONSENT', 'PART_HEARD', 'LIBERTY_TO_REENTER',
    'COSTS_RESERVED', 'NO_ORDER', 'REPLYING_PAPERS', 'INTERPRETER_REQUIRED',
    'COUNSEL_TO_ATTEND', 'OTHER',
  ]).optional(),
});
export type AdjournInput = z.infer<typeof AdjournSchema>;

export const LetStandSchema = z.object({
  publicNote: z.string().max(1000).optional(),
  internalNote: z.string().max(2000).optional(),
});
export type LetStandInput = z.infer<typeof LetStandSchema>;

export const StoodDownSchema = z.object({
  publicNote: z.string().max(1000).optional(),
  internalNote: z.string().max(2000).optional(),
});
export type StoodDownInput = z.infer<typeof StoodDownSchema>;

export const RestoreSchema = z.object({
  publicNote: z.string().max(1000).optional(),
});
export type RestoreInput = z.infer<typeof RestoreSchema>;

export const CompleteSchema = z.object({
  outcomeCode: z.enum([
    'CONCLUDED', 'ADJOURNED_SAME_DAY', 'ADJOURNED_NEXT_TERM', 'ADJOURNED_DATE_FIXED',
    'ADJOURNED_DATE_TO_BE_FIXED', 'PART_HEARD', 'SETTLED', 'STRUCK_OUT',
    'LIBERTY_TO_REENTER', 'REMOVED',
  ]),
  publicNote: z.string().max(1000).optional(),
  internalNote: z.string().max(2000).optional(),
});
export type CompleteInput = z.infer<typeof CompleteSchema>;

export const ReorderSchema = z.object({
  targetPosition: z.number().int().min(1),
});
export type ReorderInput = z.infer<typeof ReorderSchema>;

export const NoteSchema = z.object({
  publicNote: z.string().max(1000).optional(),
  internalNote: z.string().max(2000).optional(),
});
export type NoteInput = z.infer<typeof NoteSchema>;

export const DirectionSchema = z.object({
  directionCode: z.enum([
    'MENTION', 'FOR_HEARING', 'CONSENT', 'PART_HEARD', 'LIBERTY_TO_REENTER',
    'COSTS_RESERVED', 'NO_ORDER', 'REPLYING_PAPERS', 'INTERPRETER_REQUIRED',
    'COUNSEL_TO_ATTEND', 'OTHER',
  ]),
  publicNote: z.string().max(1000).optional(),
  internalNote: z.string().max(2000).optional(),
});
export type DirectionInput = z.infer<typeof DirectionSchema>;

export const OutcomeSchema = z.object({
  outcomeCode: z.enum([
    'CONCLUDED', 'ADJOURNED_SAME_DAY', 'ADJOURNED_NEXT_TERM', 'ADJOURNED_DATE_FIXED',
    'ADJOURNED_DATE_TO_BE_FIXED', 'PART_HEARD', 'SETTLED', 'STRUCK_OUT',
    'LIBERTY_TO_REENTER', 'REMOVED',
  ]),
  publicNote: z.string().max(1000).optional(),
  internalNote: z.string().max(2000).optional(),
});
export type OutcomeInput = z.infer<typeof OutcomeSchema>;

export const RemoveSchema = z.object({
  publicNote: z.string().max(1000).optional(),
  internalNote: z.string().max(2000).optional(),
});
export type RemoveInput = z.infer<typeof RemoveSchema>;

export const UndoSchema = z.object({
  targetEventId: z.string().min(1),
});
export type UndoInput = z.infer<typeof UndoSchema>;
