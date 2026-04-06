import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { publicRouter } from './routes/public';
import { registrarRouter } from './routes/registrar';
import { seedRouter } from './routes/seed';
import { startHeartbeat } from './services/sse';

const app = express();
const PORT = parseInt(process.env.PORT ?? '3000', 10);

app.use(cors());
app.use(express.json());

// Routes matching frontend client.ts contract exactly
app.use('/v1/public', publicRouter);
app.use('/v1/registrar', registrarRouter);
app.use('/v1', seedRouter);

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`CourtCall backend running on port ${PORT}`);
  startHeartbeat();
import Fastify from 'fastify';
import { ZodError } from 'zod';
import { courtDayRoutes } from './modules/courtcall/routes/court-day-routes.js';
import { listItemRoutes } from './modules/courtcall/routes/list-item-routes.js';
import { streamRoutes } from './modules/courtcall/routes/stream-routes.js';
import { eventRoutes } from './modules/courtcall/routes/event-routes.js';
import { TransitionError } from './modules/courtcall/domain/transition-rules.js';
import { EventValidationError } from './modules/courtcall/services/event-validator.js';

const app = Fastify({
  logger: {
    level: 'info',
    transport: {
      target: 'pino-pretty',
      options: { colorize: true },
    },
  },
});

// ─── Global error handler ────────────────────────────────────────────────────

app.setErrorHandler((error, _request, reply) => {
  // Zod validation errors → 400
  if (error instanceof ZodError) {
    reply.status(400).send({
      error: 'Validation error',
      details: error.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      })),
    });
    return;
  }

  // Event validation errors → 409 Conflict
  if (error instanceof EventValidationError) {
    reply.status(409).send({
      error: 'Event validation failed',
      message: error.message,
    });
    return;
  }

  // Domain transition errors → 409 Conflict
  if (error instanceof TransitionError) {
    reply.status(409).send({
      error: 'Invalid state transition',
      message: error.message,
      from: error.from,
      to: error.to,
    });
    return;
  }

  // Prisma NotFoundError → 404
  if (error.name === 'NotFoundError' || error.message?.includes('not found')) {
    reply.status(404).send({ error: 'Not found', message: error.message });
    return;
  }

  // Business logic errors → 409 Conflict
  if (error.message?.startsWith('Cannot ') || error.message?.startsWith('Item ') || error.message?.startsWith('Court day')) {
    reply.status(409).send({ error: 'Conflict', message: error.message });
    return;
  }

  // Fallback
  app.log.error(error);
  reply.status(500).send({ error: 'Internal server error' });
});

// ─── Register routes ─────────────────────────────────────────────────────────

app.register(courtDayRoutes);
app.register(listItemRoutes);
app.register(streamRoutes);
app.register(eventRoutes);

// ─── Health check ────────────────────────────────────────────────────────────

app.get('/health', async () => ({ status: 'ok', service: 'courtcall' }));

// ─── Start ───────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? '3100', 10);
const HOST = process.env.HOST ?? '0.0.0.0';

app.listen({ port: PORT, host: HOST }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
});

export default app;
