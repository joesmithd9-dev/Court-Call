-- CourtCall — Production Schema (Event-Driven)
-- Full schema migration — drop-in ready

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE "UserRole" AS ENUM ('REGISTRAR', 'COUNSEL', 'ADMIN');
CREATE TYPE "CourtDayStatus" AS ENUM ('SETUP', 'LIVE', 'JUDGE_ROSE', 'AT_LUNCH', 'PAUSED', 'CONCLUDED');
CREATE TYPE "SessionPeriod" AS ENUM ('MORNING', 'AFTERNOON');
CREATE TYPE "ListItemStatus" AS ENUM ('WAITING', 'CALLING', 'HEARING', 'LET_STAND', 'NOT_BEFORE', 'STOOD_DOWN', 'ADJOURNED', 'PART_HEARD', 'CONCLUDED', 'SETTLED', 'STRUCK_OUT', 'REMOVED');
CREATE TYPE "DirectionCode" AS ENUM ('MENTION', 'FOR_HEARING', 'CONSENT', 'PART_HEARD', 'LIBERTY_TO_REENTER', 'COSTS_RESERVED', 'NO_ORDER', 'REPLYING_PAPERS', 'INTERPRETER_REQUIRED', 'COUNSEL_TO_ATTEND', 'OTHER');
CREATE TYPE "OutcomeCode" AS ENUM ('CONCLUDED', 'ADJOURNED_SAME_DAY', 'ADJOURNED_NEXT_TERM', 'ADJOURNED_DATE_FIXED', 'ADJOURNED_DATE_TO_BE_FIXED', 'PART_HEARD', 'SETTLED', 'STRUCK_OUT', 'LIBERTY_TO_REENTER', 'REMOVED');
CREATE TYPE "AdjournmentType" AS ENUM ('SAME_DAY', 'NEXT_TERM', 'DATE_FIXED', 'DATE_TO_BE_FIXED', 'GENERAL');

-- ============================================================
-- USER
-- ============================================================

CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- ============================================================
-- COURT
-- ============================================================

CREATE TABLE "courts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "courtLevel" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "roomLabel" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courts_pkey" PRIMARY KEY ("id")
);

-- ============================================================
-- COURT DAY
-- ============================================================

CREATE TABLE "court_days" (
    "id" TEXT NOT NULL,
    "courtId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "judgeName" TEXT,
    "sessionPeriod" "SessionPeriod" NOT NULL DEFAULT 'MORNING',
    "status" "CourtDayStatus" NOT NULL DEFAULT 'SETUP',
    "lastSequence" INTEGER NOT NULL DEFAULT 0,
    "judgeRoseAt" TIMESTAMP(3),
    "resumesAt" TIMESTAMP(3),
    "wentLiveAt" TIMESTAMP(3),
    "concludedAt" TIMESTAMP(3),
    "registrarId" TEXT,
    "publicNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "court_days_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "court_days_courtId_date_key" ON "court_days"("courtId", "date");

-- ============================================================
-- LIST ITEM
-- ============================================================

CREATE TABLE "list_items" (
    "id" TEXT NOT NULL,
    "courtDayId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "caseReference" TEXT,
    "caseTitleFull" TEXT NOT NULL,
    "caseTitlePublic" TEXT NOT NULL,
    "parties" TEXT,
    "counselNames" TEXT[],
    "status" "ListItemStatus" NOT NULL DEFAULT 'WAITING',
    "estimatedDurationMinutes" INTEGER,
    "actualStartTime" TIMESTAMP(3),
    "actualEndTime" TIMESTAMP(3),
    "notBeforeTime" TIMESTAMP(3),
    "adjournedUntil" TIMESTAMP(3),
    "directionCode" "DirectionCode",
    "outcomeCode" "OutcomeCode",
    "adjournmentType" "AdjournmentType",
    "nextListingNote" TEXT,
    "publicNote" TEXT,
    "internalNote" TEXT,
    "callOverType" TEXT,
    "isKnownAdjournment" BOOLEAN NOT NULL DEFAULT false,
    "stoodDownAt" TIMESTAMP(3),
    "restoredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "list_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "list_items_courtDayId_position_idx" ON "list_items"("courtDayId", "position");
CREATE INDEX "list_items_courtDayId_status_idx" ON "list_items"("courtDayId", "status");

-- ============================================================
-- LIST UPDATE (EVENT STREAM)
-- ============================================================

CREATE TABLE "list_updates" (
    "id" TEXT NOT NULL,
    "courtDayId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "listItemId" TEXT NOT NULL,
    "updatedById" TEXT,
    "eventType" TEXT NOT NULL,
    "previousStatus" "ListItemStatus",
    "newStatus" "ListItemStatus",
    "minutesAdded" INTEGER,
    "snapshotNote" TEXT,
    "reversedEventId" TEXT,
    "idempotencyKey" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "list_updates_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "list_updates_courtDayId_sequence_key" ON "list_updates"("courtDayId", "sequence");
CREATE INDEX "list_updates_courtDayId_sequence_idx" ON "list_updates"("courtDayId", "sequence");
CREATE INDEX "list_updates_listItemId_idx" ON "list_updates"("listItemId");
CREATE INDEX "list_updates_idempotencyKey_idx" ON "list_updates"("idempotencyKey");

-- ============================================================
-- COURT DAY UPDATE (EVENT STREAM)
-- ============================================================

CREATE TABLE "court_day_updates" (
    "id" TEXT NOT NULL,
    "courtDayId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "previousStatus" "CourtDayStatus",
    "newStatus" "CourtDayStatus",
    "eventType" TEXT NOT NULL,
    "publicNote" TEXT,
    "reversedEventId" TEXT,
    "idempotencyKey" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedById" TEXT,

    CONSTRAINT "court_day_updates_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "court_day_updates_courtDayId_sequence_key" ON "court_day_updates"("courtDayId", "sequence");
CREATE INDEX "court_day_updates_courtDayId_sequence_idx" ON "court_day_updates"("courtDayId", "sequence");
CREATE INDEX "court_day_updates_idempotencyKey_idx" ON "court_day_updates"("idempotencyKey");

-- ============================================================
-- FOREIGN KEYS
-- ============================================================

ALTER TABLE "court_days" ADD CONSTRAINT "court_days_courtId_fkey"
    FOREIGN KEY ("courtId") REFERENCES "courts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "court_days" ADD CONSTRAINT "court_days_registrarId_fkey"
    FOREIGN KEY ("registrarId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "list_items" ADD CONSTRAINT "list_items_courtDayId_fkey"
    FOREIGN KEY ("courtDayId") REFERENCES "court_days"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "list_updates" ADD CONSTRAINT "list_updates_listItemId_fkey"
    FOREIGN KEY ("listItemId") REFERENCES "list_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "list_updates" ADD CONSTRAINT "list_updates_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "list_updates" ADD CONSTRAINT "list_updates_courtDayId_fkey"
    FOREIGN KEY ("courtDayId") REFERENCES "court_days"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "court_day_updates" ADD CONSTRAINT "court_day_updates_courtDayId_fkey"
    FOREIGN KEY ("courtDayId") REFERENCES "court_days"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "court_day_updates" ADD CONSTRAINT "court_day_updates_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
