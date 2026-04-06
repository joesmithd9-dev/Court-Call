import type { Court, CourtDay, ListItem } from '@prisma/client';
import type {
  CourtDayRegistrarProjection,
  CaseCompatView,
  ListItemRegistrarView,
  CourtDayBanner,
} from '../dto/responses.js';
import { ListItemStatus } from '../domain/enums.js';

function toIsoOrNull(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

export function mapListItemRegistrar(item: ListItem): ListItemRegistrarView {
  return {
    id: item.id,
    queuePosition: item.queuePosition,
    caseName: item.caseName,
    caseReference: item.caseReference,
    partiesShort: item.partiesShort,
    status: item.status,
    estimatedDurationMinutes: item.estimatedDurationMinutes,
    predictedStartTime: toIsoOrNull(item.predictedStartTime),
    predictedEndTime: toIsoOrNull(item.predictedEndTime),
    actualStartTime: toIsoOrNull(item.actualStartTime),
    actualEndTime: toIsoOrNull(item.actualEndTime),
    calledAt: toIsoOrNull(item.calledAt),
    notBeforeTime: toIsoOrNull(item.notBeforeTime),
    adjournedUntil: toIsoOrNull(item.adjournedUntil),
    directionCode: item.directionCode,
    outcomeCode: item.outcomeCode,
    publicNote: item.publicNote,
    isPriority: item.isPriority,
    // Registrar-only fields
    internalNote: item.internalNote,
    stoodDownAt: toIsoOrNull(item.stoodDownAt),
    restoredAt: toIsoOrNull(item.restoredAt),
    isHiddenFromPublic: item.isHiddenFromPublic,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

function mapBannerRegistrar(courtDay: CourtDay): CourtDayBanner & { endedAt: string | null } {
  return {
    status: courtDay.status,
    sessionStatus: courtDay.sessionStatus,
    sessionMessage: courtDay.sessionMessage,
    judgeName: courtDay.judgeName,
    registrarName: courtDay.registrarName,
    roseAt: toIsoOrNull(courtDay.roseAt),
    expectedResumeAt: toIsoOrNull(courtDay.expectedResumeAt),
    resumedAt: toIsoOrNull(courtDay.resumedAt),
    startedAt: toIsoOrNull(courtDay.startedAt),
    endedAt: toIsoOrNull(courtDay.endedAt),
  };
}

export function mapRegistrarProjection(
  court: Court,
  courtDay: CourtDay,
  items: ListItem[],
): CourtDayRegistrarProjection {
  const registrarItems = items.map(mapListItemRegistrar);

  const activeItem =
    registrarItems.find(
      (i) => i.status === ListItemStatus.HEARING || i.status === ListItemStatus.CALLING,
    ) ?? null;

  const nextCallableItems = registrarItems.filter(
    (i) => i.status === ListItemStatus.WAITING || i.status === ListItemStatus.NOT_BEFORE,
  ).slice(0, 5);

  const cases: CaseCompatView[] = items.map((item) => ({
    id: item.id,
    courtDayId: item.courtDayId,
    position: item.queuePosition,
    caseName: item.caseName,
    caseTitleFull: item.caseName,
    caseTitlePublic: item.caseName,
    caseNumber: item.caseReference,
    status: toCompatCaseStatus(item.status),
    startedAt: toIsoOrNull(item.actualStartTime) ?? undefined,
    estimatedMinutes: item.estimatedDurationMinutes ?? undefined,
    predictedStartTime: toIsoOrNull(item.predictedStartTime) ?? undefined,
    notBeforeTime: toIsoOrNull(item.notBeforeTime) ?? undefined,
    adjournedToTime: toIsoOrNull(item.adjournedUntil) ?? undefined,
    note: item.publicNote ?? undefined,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  }));

  return {
    id: courtDay.id,
    courtId: courtDay.courtId,
    courtName: court.name,
    courtRoom: court.room,
    date: courtDay.date.toISOString().split('T')[0],
    judgeName: courtDay.judgeName,
    status: toCompatCourtStatus(courtDay.status, courtDay.sessionStatus),
    statusMessage: courtDay.sessionMessage ?? undefined,
    resumeTime: toIsoOrNull(courtDay.expectedResumeAt) ?? undefined,
    currentCaseId: activeItem?.id ?? undefined,
    lastSequence: courtDay.streamVersion,
    cases,
    createdAt: courtDay.createdAt.toISOString(),
    updatedAt: courtDay.updatedAt.toISOString(),
    banner: mapBannerRegistrar(courtDay),
    activeItem,
    nextCallableItems,
    listItems: registrarItems,
  };
}

function toCompatCaseStatus(status: string): string {
  switch (status) {
    case 'WAITING':
      return 'pending';
    case 'CALLING':
      return 'calling';
    case 'HEARING':
      return 'hearing';
    case 'ADJOURNED':
      return 'adjourned';
    case 'STOOD_DOWN':
    case 'LET_STAND':
      return 'stood_down';
    case 'NOT_BEFORE':
      return 'not_before';
    case 'CONCLUDED':
    case 'SETTLED':
    case 'REMOVED':
      return 'concluded';
    default:
      return 'pending';
  }
}

function toCompatCourtStatus(status: string, sessionStatus: string): string {
  if (status === 'CLOSED') return 'ended';
  if (status === 'SCHEDULED') return 'scheduled';
  if (sessionStatus === 'JUDGE_RISING_SHORT') return 'judge_rose';
  if (sessionStatus === 'AT_LUNCH') return 'at_lunch';
  if (sessionStatus === 'ADJOURNED_PART_HEARD') return 'adjourned';
  return 'live';
}
