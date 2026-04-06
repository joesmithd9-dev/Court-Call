import { z } from 'zod';

// ─── CourtDay command schemas ────────────────────────────────────────────────

export const CreateCourtDaySchema = z.object({
  courtId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  judgeName: z.string().min(1).max(200),
  registrarName: z.string().min(1).max(200),
});
export type CreateCourtDayInput = z.infer<typeof CreateCourtDaySchema>;

export const StartLiveSchema = z.object({
  sessionMessage: z.string().max(500).optional(),
});
export type StartLiveInput = z.infer<typeof StartLiveSchema>;

export const JudgeRoseSchema = z.object({
  sessionStatus: z.enum([
    'JUDGE_RISING_SHORT',
    'AT_LUNCH',
    'ADJOURNED_PART_HEARD',
  ]),
  message: z.string().max(500).optional(),
  expectedResumeAt: z.string().datetime().optional(),
});
export type JudgeRoseInput = z.infer<typeof JudgeRoseSchema>;

export const ResumeSchema = z.object({
  sessionMessage: z.string().max(500).optional(),
});
export type ResumeInput = z.infer<typeof ResumeSchema>;

export const CloseCourtDaySchema = z.object({
  sessionMessage: z.string().max(500).optional(),
});
export type CloseCourtDayInput = z.infer<typeof CloseCourtDaySchema>;

// ─── ListItem command schemas ────────────────────────────────────────────────

export const CreateListItemSchema = z.object({
  caseName: z.string().min(1).max(500),
  caseReference: z.string().min(1).max(100),
  partiesShort: z.string().max(300).optional(),
  estimatedDurationMinutes: z.number().int().min(1).max(1440).optional(),
  notBeforeTime: z.string().datetime().optional(),
  isPriority: z.boolean().optional(),
  publicNote: z.string().max(1000).optional(),
  internalNote: z.string().max(2000).optional(),
});
export type CreateListItemInput = z.infer<typeof CreateListItemSchema>;

export const CallSchema = z.object({
  override: z.boolean().optional(), // override NOT_BEFORE time constraint
});
export type CallInput = z.infer<typeof CallSchema>;

export const StartSchema = z.object({}); // no additional input needed
export type StartInput = z.infer<typeof StartSchema>;

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
  publicNote: z.string().max(1000).optional(),
  internalNote: z.string().max(2000).optional(),
  directionCode: z.string().max(100).optional(),
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
  outcomeCode: z.string().min(1).max(100),
  publicNote: z.string().max(1000).optional(),
  internalNote: z.string().max(2000).optional(),
});
export type CompleteInput = z.infer<typeof CompleteSchema>;

export const ReorderSchema = z.object({
  targetQueuePosition: z.number().int().min(1),
});
export type ReorderInput = z.infer<typeof ReorderSchema>;

export const NoteSchema = z.object({
  publicNote: z.string().max(1000).optional(),
  internalNote: z.string().max(2000).optional(),
});
export type NoteInput = z.infer<typeof NoteSchema>;

export const DirectionSchema = z.object({
  directionCode: z.string().min(1).max(100),
  publicNote: z.string().max(1000).optional(),
  internalNote: z.string().max(2000).optional(),
});
export type DirectionInput = z.infer<typeof DirectionSchema>;

export const OutcomeSchema = z.object({
  outcomeCode: z.string().min(1).max(100),
  publicNote: z.string().max(1000).optional(),
  internalNote: z.string().max(2000).optional(),
});
export type OutcomeInput = z.infer<typeof OutcomeSchema>;

export const RemoveSchema = z.object({
  publicNote: z.string().max(1000).optional(),
  internalNote: z.string().max(2000).optional(),
});
export type RemoveInput = z.infer<typeof RemoveSchema>;
