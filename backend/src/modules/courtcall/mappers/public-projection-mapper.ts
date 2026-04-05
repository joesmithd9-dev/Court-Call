import type { CourtDay, ListItem } from '@prisma/client';
import type {
  CourtDayPublicProjection,
  ListItemPublicView,
  CourtDayBanner,
} from '../dto/responses.js';
import { ListItemStatus } from '../domain/enums.js';

function toIsoOrNull(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

export function mapListItemPublic(item: ListItem): ListItemPublicView {
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
  };
}

function mapBanner(courtDay: CourtDay): CourtDayBanner {
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
  };
}

export function mapPublicProjection(
  courtDay: CourtDay,
  items: ListItem[],
): CourtDayPublicProjection {
  // Filter out hidden items for public view
  const visibleItems = items.filter((i) => !i.isHiddenFromPublic);
  const publicItems = visibleItems.map(mapListItemPublic);

  const activeItem =
    publicItems.find(
      (i) => i.status === ListItemStatus.HEARING || i.status === ListItemStatus.CALLING,
    ) ?? null;

  const nextCallableItems = publicItems.filter(
    (i) => i.status === ListItemStatus.WAITING || i.status === ListItemStatus.NOT_BEFORE,
  ).slice(0, 5);

  return {
    id: courtDay.id,
    courtId: courtDay.courtId,
    date: courtDay.date.toISOString().split('T')[0],
    banner: mapBanner(courtDay),
    activeItem,
    nextCallableItems,
    listItems: publicItems,
  };
}
