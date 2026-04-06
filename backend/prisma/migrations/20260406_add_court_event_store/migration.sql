-- CourtCall Event Store (Locked Spec)
-- Canonical, append-only event table with monotonic sequence per court day.

CREATE TABLE "court_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "courtDayId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "causedByUserId" TEXT,
    "causedByRole" "ActorRole" NOT NULL,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "court_events_pkey" PRIMARY KEY ("id")
);

-- Idempotency enforcement table
CREATE TABLE "idempotency_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "eventId" UUID NOT NULL,
    "responseHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- Unique constraints (CRITICAL for correctness)
CREATE UNIQUE INDEX "court_events_courtDayId_sequence_key" ON "court_events"("courtDayId", "sequence");
CREATE UNIQUE INDEX "court_events_idempotencyKey_key" ON "court_events"("idempotencyKey");

-- Performance index
CREATE INDEX "court_events_courtDayId_sequence_idx" ON "court_events"("courtDayId", "sequence");

-- Idempotency key uniqueness
CREATE UNIQUE INDEX "idempotency_records_key_key" ON "idempotency_records"("key");

-- Foreign keys
ALTER TABLE "court_events" ADD CONSTRAINT "court_events_courtDayId_fkey"
    FOREIGN KEY ("courtDayId") REFERENCES "court_days"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
