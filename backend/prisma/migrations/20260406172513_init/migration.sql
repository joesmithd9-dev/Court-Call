-- CreateTable
CREATE TABLE "CourtDay" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courtName" TEXT NOT NULL,
    "courtRoom" TEXT,
    "judgeName" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "statusMessage" TEXT,
    "resumeTime" TEXT,
    "currentCaseId" TEXT,
    "lastSequence" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CourtCase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courtDayId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "caseName" TEXT NOT NULL DEFAULT '',
    "caseTitleFull" TEXT NOT NULL DEFAULT '',
    "caseTitlePublic" TEXT NOT NULL DEFAULT '',
    "caseNumber" TEXT,
    "matterType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "scheduledTime" TEXT,
    "startedAt" TEXT,
    "estimatedMinutes" INTEGER,
    "predictedStartTime" TEXT,
    "notBeforeTime" TEXT,
    "adjournedToTime" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CourtCase_courtDayId_fkey" FOREIGN KEY ("courtDayId") REFERENCES "CourtDay" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CourtEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courtDayId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL DEFAULT 'system',
    "idempotencyKey" TEXT,
    "undoneByEventId" TEXT,
    "undoTargetEventId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CourtEvent_courtDayId_fkey" FOREIGN KEY ("courtDayId") REFERENCES "CourtDay" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CourtCase_courtDayId_position_key" ON "CourtCase"("courtDayId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "CourtEvent_courtDayId_sequence_key" ON "CourtEvent"("courtDayId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "CourtEvent_courtDayId_idempotencyKey_key" ON "CourtEvent"("courtDayId", "idempotencyKey");
