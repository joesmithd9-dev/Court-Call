import { Router } from 'express';
import { getCourtDaySnapshot } from '../services/projection';
import { addSSEClient } from '../services/sse';

export const publicRouter = Router();

// GET /v1/public/court-days/:courtDayId — snapshot
publicRouter.get('/court-days/:courtDayId', async (req, res) => {
  const snapshot = await getCourtDaySnapshot(req.params.courtDayId);
  if (!snapshot) return res.status(404).json({ error: 'Court day not found' });
  res.json(snapshot);
});

// GET /v1/public/court-days/:courtDayId/stream — SSE
publicRouter.get('/court-days/:courtDayId/stream', async (req, res) => {
  const snapshot = await getCourtDaySnapshot(req.params.courtDayId);
  if (!snapshot) return res.status(404).json({ error: 'Court day not found' });
  addSSEClient(req.params.courtDayId, res);
});
