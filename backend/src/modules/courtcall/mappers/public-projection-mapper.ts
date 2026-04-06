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
    position: item.position,
    caseTitlePublic: item.caseTitlePublic,
    caseReference: item.caseReference,
    parties: item.parties,
    status: item.status,
    estimatedDurationMinutes: item.estimatedDurationMinutes,
    actualStartTime: toIsoOrNull(item.actualStartTime),
    actualEndTime: toIsoOrNull(item.actualEndTime),
    notBeforeTime: toIsoOrNull(item.notBeforeTime),
    adjournedUntil: toIsoOrNull(item.adjournedUntil),
    directionCode: item.directionCode,
    outcomeCode: item.outcomeCode,
    publicNote: item.publicNote,
  };
}

function mapBanner(courtDay: CourtDay): CourtDayBanner {
  return {
    status: courtDay.status,
    judgeName: courtDay.judgeName,
    sessionPeriod: courtDay.sessionPeriod,
    judgeRoseAt: toIsoOrNull(courtDay.judgeRoseAt),
    resumesAt: toIsoOrNull(courtDay.resumesAt),
    wentLiveAt: toIsoOrNull(courtDay.wentLiveAt),
    publicNote: courtDay.publicNote,
    lastSequence: courtDay.lastSequence,
  };
}

export function mapPublicProjection(
  courtDay: CourtDay,
  items: ListItem[],
): CourtDayPublicProjection {
  const publicItems = items.map(mapListItemPublic);

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
    serverTime: new Date().toISOString(),
  };
}
