import { Router } from 'express';
import { prisma } from '../db';
import { v4 as uuid } from 'uuid';

export const seedRouter = Router();

/** POST /v1/seed — create a demo court day with cases for testing */
seedRouter.post('/seed', async (_req, res) => {
  const courtDayId = uuid();
  const now = new Date().toISOString().split('T')[0];

  await prisma.courtDay.create({
    data: {
      id: courtDayId,
      courtName: 'Supreme Court — Court 1',
      courtRoom: '1A',
      judgeName: 'Justice Smith',
      date: now,
      status: 'scheduled',
      cases: {
        create: [
          { id: uuid(), position: 1, caseName: 'R v Thompson', caseTitleFull: 'R v Thompson [2026] SC 142', caseTitlePublic: 'R v T', matterType: 'mention', status: 'pending', estimatedMinutes: 5, scheduledTime: `${now}T09:30:00Z` },
          { id: uuid(), position: 2, caseName: 'Smith v Jones', caseTitleFull: 'Smith v Jones [2026] SC 98', caseTitlePublic: 'S v J', matterType: 'hearing', status: 'pending', estimatedMinutes: 30, scheduledTime: `${now}T09:35:00Z` },
          { id: uuid(), position: 3, caseName: 'R v Williams', caseTitleFull: 'R v Williams [2026] SC 201', caseTitlePublic: 'R v W', matterType: 'bail', status: 'pending', estimatedMinutes: 10, scheduledTime: `${now}T10:05:00Z` },
          { id: uuid(), position: 4, caseName: 'Brown v State', caseTitleFull: 'Brown v State of NSW [2026] SC 55', caseTitlePublic: 'B v State', matterType: 'sentence', status: 'pending', estimatedMinutes: 20, scheduledTime: `${now}T10:15:00Z` },
          { id: uuid(), position: 5, caseName: 'Lee v Commissioner', caseTitleFull: 'Lee v Commissioner of Police [2026] SC 310', caseTitlePublic: 'L v CoP', matterType: 'application', status: 'pending', estimatedMinutes: 15, scheduledTime: `${now}T10:35:00Z` },
          { id: uuid(), position: 6, caseName: 'R v Nguyen', caseTitleFull: 'R v Nguyen [2026] SC 88', caseTitlePublic: 'R v N', matterType: 'mention', status: 'pending', estimatedMinutes: 3, scheduledTime: `${now}T10:50:00Z` },
          { id: uuid(), position: 7, caseName: 'Davis v Davis', caseTitleFull: 'Davis v Davis [2026] SC 412', caseTitlePublic: 'D v D', matterType: 'consent', status: 'pending', estimatedMinutes: 5, scheduledTime: `${now}T10:53:00Z` },
          { id: uuid(), position: 8, caseName: 'R v Patel', caseTitleFull: 'R v Patel & Ors [2026] SC 199', caseTitlePublic: 'R v P', matterType: 'hearing', status: 'pending', estimatedMinutes: 45, scheduledTime: `${now}T10:58:00Z` },
        ],
      },
    },
  });

  res.json({ courtDayId, message: 'Seeded court day with 8 cases' });
});
