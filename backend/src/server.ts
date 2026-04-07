import 'dotenv/config';
import Fastify from 'fastify';
import { ZodError } from 'zod';
import { courtDayRoutes } from './modules/courtcall/routes/court-day-routes.js';
import { listItemRoutes } from './modules/courtcall/routes/list-item-routes.js';
import { streamRoutes } from './modules/courtcall/routes/stream-routes.js';
import { TransitionError } from './modules/courtcall/domain/transition-rules.js';
import { AuthError } from './modules/courtcall/routes/auth.js';

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

  if (error instanceof AuthError) {
    reply.status(error.statusCode).send({
      error: 'Unauthorized',
      message: error.message,
    });
    return;
  }

  // Prisma NotFoundError → 404
  if (error.name === 'NotFoundError' || error.message?.includes('not found')) {
    reply.status(404).send({ error: 'Not found', message: error.message });
    return;
  }

  // Business logic errors (thrown as plain Error with message)
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
