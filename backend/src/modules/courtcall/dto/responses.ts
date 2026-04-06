/**
 * Response DTOs for snapshot / projection endpoints.
 */

// ─── Shared sub-shapes ──────────────────────────────────────────────────────

export interface ListItemPublicView {
  id: string;
  position: number;
  caseTitlePublic: string;
  caseReference: string | null;
  parties: string | null;
  status: string;
  estimatedDurationMinutes: number | null;
  actualStartTime: string | null;
  actualEndTime: string | null;
  notBeforeTime: string | null;
  adjournedUntil: string | null;
  directionCode: string | null;
  outcomeCode: string | null;
  publicNote: string | null;
}

export interface ListItemRegistrarView extends ListItemPublicView {
  caseTitleFull: string;
  counselNames: string[];
  internalNote: string | null;
  stoodDownAt: string | null;
  restoredAt: string | null;
  callOverType: string | null;
  isKnownAdjournment: boolean;
  adjournmentType: string | null;
  nextListingNote: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Court Day Projection ────────────────────────────────────────────────────

export interface CourtDayBanner {
  status: string;
  judgeName: string | null;
  sessionPeriod: string;
  judgeRoseAt: string | null;
  resumesAt: string | null;
  wentLiveAt: string | null;
  publicNote: string | null;
  lastSequence: number;
}

export interface CourtDayPublicProjection {
  id: string;
  courtId: string;
  date: string;
  banner: CourtDayBanner;
  activeItem: ListItemPublicView | null;
  nextCallableItems: ListItemPublicView[];
  listItems: ListItemPublicView[];
  serverTime: string;
}

export interface CourtDayRegistrarProjection {
  id: string;
  courtId: string;
  date: string;
  banner: CourtDayBanner & { concludedAt: string | null };
  activeItem: ListItemRegistrarView | null;
  nextCallableItems: ListItemRegistrarView[];
  listItems: ListItemRegistrarView[];
  serverTime: string;
}

export interface CommandResult {
  success: true;
  eventId: string;
  eventType: string;
  sequence: number;
}
