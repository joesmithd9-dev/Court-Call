import type { FastifyInstance } from 'fastify';
import { subscribePublic, subscribeRegistrar } from '../services/sse-broadcaster.js';

/**
 * SSE stream endpoints for CourtCall.
 *
 * Pattern:
 *  1. Client fetches snapshot via GET /v1/public/court-days/:id (or registrar equivalent)
 *  2. Client opens SSE stream via GET /v1/public/court-days/:id/stream
 *  3. Server broadcasts new event envelopes as updates occur
 *  4. Client uses envelope.version to detect missed events and refetch snapshot if needed
 *
 * Reconnection: the EventSource API in browsers handles reconnection automatically.
 * The server sends a :heartbeat comment every 30 seconds to keep the connection alive
 * through proxies and load balancers that might close idle connections.
 */

const HEARTBEAT_INTERVAL_MS = 30_000;

function setupSSE(
  app: FastifyInstance,
  path: string,
  subscribeFn: typeof subscribePublic,
): void {
  app.get<{ Params: { courtDayId: string } }>(path, async (request, reply) => {
    // Set SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // disable nginx buffering
    });

    // Send initial connection event
    reply.raw.write(`event: connected\ndata: ${JSON.stringify({ courtDayId: request.params.courtDayId })}\n\n`);

    // Subscribe to the court day stream
    const unsubscribe = subscribeFn(request.params.courtDayId, reply);

    // Heartbeat to keep connection alive
    const heartbeatTimer = setInterval(() => {
      try {
        if (!reply.raw.destroyed && !reply.raw.writableEnded) {
          reply.raw.write(': heartbeat\n\n');
        } else {
          clearInterval(heartbeatTimer);
        }
      } catch {
        clearInterval(heartbeatTimer);
      }
    }, HEARTBEAT_INTERVAL_MS);

    // Cleanup on disconnect
    request.raw.on('close', () => {
      clearInterval(heartbeatTimer);
      unsubscribe();
    });

    // Prevent Fastify from sending its own response — we're managing the stream
    await reply;
  });
}

export async function streamRoutes(app: FastifyInstance): Promise<void> {
  setupSSE(app, '/v1/public/court-days/:courtDayId/stream', subscribePublic);
  setupSSE(app, '/v1/registrar/court-days/:courtDayId/stream', subscribeRegistrar);
}
