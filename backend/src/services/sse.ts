import type { Response } from 'express';

/**
 * SSE Broadcaster — in-memory pub/sub for court day streams.
 * Emits standard `message` events with JSON envelope matching frontend contract:
 * { id, sequence, type, data, timestamp }
 */

type Client = {
  res: Response;
  courtDayId: string;
};

const clients: Client[] = [];

export function addSSEClient(courtDayId: string, res: Response): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write('\n');

  clients.push({ res, courtDayId });

  res.on('close', () => {
    const idx = clients.findIndex((c) => c.res === res);
    if (idx >= 0) clients.splice(idx, 1);
  });
}

export function broadcastEvent(
  courtDayId: string,
  event: {
    id: string;
    sequence: number;
    type: string;
    data: Record<string, unknown>;
    timestamp: string;
  }
): void {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of clients) {
    if (client.courtDayId === courtDayId) {
      client.res.write(payload);
    }
  }
}

/** Send heartbeat to keep connections alive */
export function startHeartbeat(intervalMs = 15000): void {
  setInterval(() => {
    for (const client of clients) {
      client.res.write(': heartbeat\n\n');
    }
  }, intervalMs);
}
