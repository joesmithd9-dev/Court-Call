# CourtCall Backend – Implementation Notes

## Quick Start

```bash
cd backend

# Install dependencies
npm install

# Set up database (requires PostgreSQL running locally)
cp .env .env.local  # edit DATABASE_URL if needed
npx prisma migrate dev --name init
npx prisma db seed

# Run in development
npm run dev
```

Server starts on `http://localhost:3100`.

## Architecture

```
backend/src/
  server.ts                          # Fastify entry point, error handling, route registration
  modules/courtcall/
    domain/
      enums.ts                       # Domain enums (status, roles, court levels)
      event-types.ts                 # Canonical event type strings
      types.ts                       # Event envelope, actor context interfaces
      transition-rules.ts            # ListItem state machine + helpers
    dto/
      requests.ts                    # Zod schemas for all command inputs
      responses.ts                   # Response DTOs for snapshot endpoints
    services/
      prisma.ts                      # Shared Prisma client instance
      court-day-service.ts           # CourtDay command handlers
      list-item-service.ts           # ListItem command handlers
      projection-service.ts          # Snapshot/projection queries
      event-envelope-service.ts      # Event envelope builder + version counter
      sse-broadcaster.ts             # In-memory SSE subscriber registry + fanout
    routes/
      court-day-routes.ts            # CourtDay command + read routes
      list-item-routes.ts            # ListItem command routes
      stream-routes.ts               # SSE stream endpoints
    mappers/
      public-projection-mapper.ts    # CourtDay → public-safe projection
      registrar-projection-mapper.ts # CourtDay → full registrar projection
```

## Testing the SSE Stream

```bash
# Terminal 1: Start server
npm run dev

# Terminal 2: Open public SSE stream (replace COURT_DAY_ID from seed output)
curl -N http://localhost:3100/v1/public/court-days/COURT_DAY_ID/stream

# Terminal 3: Send a command to see events flow
curl -X POST http://localhost:3100/v1/court-days/COURT_DAY_ID/start-live \
  -H 'Content-Type: application/json' \
  -H 'X-Actor-Display-Name: M. Chen' \
  -H 'X-Actor-Role: registrar' \
  -d '{}'
```

## Event Contract

Every SSE event is delivered as a `CourtCallEventEnvelope`:

```json
{
  "eventId": "uuid",
  "eventType": "courtday.live_started",
  "aggregateType": "courtday",
  "aggregateId": "uuid",
  "courtDayId": "uuid",
  "occurredAt": "2026-04-05T09:30:00.000Z",
  "actor": { "displayName": "M. Chen", "role": "REGISTRAR" },
  "version": 1,
  "payload": { "sessionMessage": null }
}
```

- `version` is monotonically increasing per court day stream (in-memory counter).
- Public stream strips `internalNote` from payloads.
- Registrar stream includes full detail.

## State Machine

ListItem statuses and allowed transitions:

```
WAITING → CALLING, NOT_BEFORE, LET_STAND, STOOD_DOWN, REMOVED
CALLING → HEARING, STOOD_DOWN, WAITING
HEARING → PART_HEARD, CONCLUDED, SETTLED, ADJOURNED
LET_STAND → WAITING, CALLING, REMOVED
NOT_BEFORE → CALLING, WAITING, REMOVED
STOOD_DOWN → WAITING, REMOVED
PART_HEARD → CALLING, CONCLUDED, ADJOURNED
CONCLUDED → (terminal)
SETTLED → (terminal)
REMOVED → (terminal)
ADJOURNED → (terminal for this court day)
```

## Actor Headers

For MVP, actor context is passed via request headers:

- `X-Actor-User-Id` – optional user ID
- `X-Actor-Display-Name` – display name for audit trail
- `X-Actor-Role` – `registrar` or `system`

In production these should come from JWT/auth middleware.

## Remaining for Next Phase

1. **Recalculation engine** – `recomputePredictionsForCourtDay()` is wired as a callable boundary in `court-day-service.ts`. Currently a no-op. Should run after:
   - `courtday.live_started`, `courtday.resumed`
   - `listitem.created`, `listitem.called`, `listitem.started`, `listitem.completed`
   - `listitem.adjourned`, `listitem.removed`, `listitem.reordered`
   - `listitem.estimate_extended`, `listitem.not_before_set`

2. **Authentication / authorization** – replace header-based actor extraction with JWT verification.

3. **Redis pub/sub** – replace in-memory SSE broadcaster for multi-process deployment.

4. **Direction code taxonomy** – define structured direction codes (e.g. `LET_STAND`, `NEXT_TERM`, `COSTS_RESERVED`, `AFFIDAVIT_7D`, `BY_CONSENT`).

5. **Outcome code taxonomy** – define structured outcome codes.
