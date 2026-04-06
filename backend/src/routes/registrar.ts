import { Router } from 'express';
import { getCourtDaySnapshot } from '../services/projection';
import {
  updateCourtDayStatus,
  updateCase,
  startNextCase,
  reorderCase,
  undoEvent,
} from '../services/commands';

export const registrarRouter = Router();

// GET /v1/registrar/court-days/:courtDayId — snapshot
registrarRouter.get('/court-days/:courtDayId', async (req, res) => {
  const snapshot = await getCourtDaySnapshot(req.params.courtDayId);
  if (!snapshot) return res.status(404).json({ error: 'Court day not found' });
  res.json(snapshot);
});

// PATCH /v1/registrar/court-days/:courtDayId — update court day status
registrarRouter.patch('/court-days/:courtDayId', async (req, res) => {
  try {
    const result = await updateCourtDayStatus(
      req.params.courtDayId,
      req.body,
      req.headers['idempotency-key'] as string | undefined
    );
    res.json(result);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// PATCH /v1/registrar/court-days/:courtDayId/cases/:caseId — update case
registrarRouter.patch('/court-days/:courtDayId/cases/:caseId', async (req, res) => {
  try {
    const result = await updateCase(
      req.params.courtDayId,
      req.params.caseId,
      req.body,
      req.headers['idempotency-key'] as string | undefined
    );
    res.json(result);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// POST /v1/registrar/court-days/:courtDayId/start-next
registrarRouter.post('/court-days/:courtDayId/start-next', async (req, res) => {
  try {
    const result = await startNextCase(
      req.params.courtDayId,
      req.headers['idempotency-key'] as string | undefined
    );
    res.json(result);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// POST /v1/registrar/court-days/:courtDayId/reorder
registrarRouter.post('/court-days/:courtDayId/reorder', async (req, res) => {
  try {
    const result = await reorderCase(
      req.params.courtDayId,
      req.body,
      req.headers['idempotency-key'] as string | undefined
    );
    res.json(result);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// POST /v1/registrar/court-days/:courtDayId/undo
registrarRouter.post('/court-days/:courtDayId/undo', async (req, res) => {
  try {
    const result = await undoEvent(
      req.params.courtDayId,
      req.body.targetEventId,
      req.headers['idempotency-key'] as string | undefined
    );
    res.json(result);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});
