import type { CourtDay, ListItem } from '@prisma/client';
import type {
  CourtDayRegistrarProjection,
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
    position: item.position,
    caseTitlePublic: item.caseTitlePublic,
    caseTitleFull: item.caseTitleFull,
    caseReference: item.caseReference,
    parties: item.parties,
    counselNames: item.counselNames,
    status: item.status,
    estimatedDurationMinutes: item.estimatedDurationMinutes,
    actualStartTime: toIsoOrNull(item.actualStartTime),
    actualEndTime: toIsoOrNull(item.actualEndTime),
    notBeforeTime: toIsoOrNull(item.notBeforeTime),
    adjournedUntil: toIsoOrNull(item.adjournedUntil),
    directionCode: item.directionCode,
    outcomeCode: item.outcomeCode,
    publicNote: item.publicNote,
    internalNote: item.internalNote,
    stoodDownAt: toIsoOrNull(item.stoodDownAt),
    restoredAt: toIsoOrNull(item.restoredAt),
    callOverType: item.callOverType,
    isKnownAdjournment: item.isKnownAdjournment,
    adjournmentType: item.adjournmentType,
    nextListingNote: item.nextListingNote,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

function mapBannerRegistrar(courtDay: CourtDay): CourtDayBanner & { concludedAt: string | null } {
  return {
    status: courtDay.status,
    judgeName: courtDay.judgeName,
    sessionPeriod: courtDay.sessionPeriod,
    judgeRoseAt: toIsoOrNull(courtDay.judgeRoseAt),
    resumesAt: toIsoOrNull(courtDay.resumesAt),
    wentLiveAt: toIsoOrNull(courtDay.wentLiveAt),
    publicNote: courtDay.publicNote,
    lastSequence: courtDay.lastSequence,
    concludedAt: toIsoOrNull(courtDay.concludedAt),
  };
}

export function mapRegistrarProjection(
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

  return {
    id: courtDay.id,
    courtId: courtDay.courtId,
    date: courtDay.date.toISOString().split('T')[0],
    banner: mapBannerRegistrar(courtDay),
    activeItem,
    nextCallableItems,
    listItems: registrarItems,
    serverTime: new Date().toISOString(),
  };
}
