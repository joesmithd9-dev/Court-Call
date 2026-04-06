/**
 * Response DTOs for snapshot / projection endpoints.
 *
 * These are the shapes returned by GET endpoints — not raw database rows.
 * The public projection strips internal-only fields (internalNote).
 */

// ─── Shared sub-shapes ──────────────────────────────────────────────────────

export interface ListItemPublicView {
  id: string;
  queuePosition: number;
  caseName: string;
  caseReference: string;
  partiesShort: string | null;
  status: string;
  estimatedDurationMinutes: number | null;
  predictedStartTime: string | null;
  predictedEndTime: string | null;
  actualStartTime: string | null;
  actualEndTime: string | null;
  calledAt: string | null;
  notBeforeTime: string | null;
  adjournedUntil: string | null;
  directionCode: string | null;
  outcomeCode: string | null;
  publicNote: string | null;
  isPriority: boolean;
}

export interface ListItemRegistrarView extends ListItemPublicView {
  internalNote: string | null;
  stoodDownAt: string | null;
  restoredAt: string | null;
  isHiddenFromPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Court Day Projection ────────────────────────────────────────────────────

export interface CourtDayBanner {
  status: string;
  sessionStatus: string;
  sessionMessage: string | null;
  judgeName: string;
  registrarName: string;
  roseAt: string | null;
  expectedResumeAt: string | null;
  resumedAt: string | null;
  startedAt: string | null;
}

export interface CourtDayPublicProjection {
  id: string;
  courtId: string;
  date: string;
  banner: CourtDayBanner;
  activeItem: ListItemPublicView | null;
  nextCallableItems: ListItemPublicView[];
  listItems: ListItemPublicView[];
}

export interface CourtDayRegistrarProjection {
  id: string;
  courtId: string;
  date: string;
  banner: CourtDayBanner & { endedAt: string | null };
  activeItem: ListItemRegistrarView | null;
  nextCallableItems: ListItemRegistrarView[];
  listItems: ListItemRegistrarView[];
}

export interface CommandResult {
  success: true;
  eventId: string;
  eventType: string;
}
