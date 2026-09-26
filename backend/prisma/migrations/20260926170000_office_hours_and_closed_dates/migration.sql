CREATE TABLE "OfficeHours" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "openTime" TEXT,
    "closeTime" TEXT,
    "isClosed" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OfficeHours_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OfficeClosedDate" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "closedDate" DATE NOT NULL,
    "reason" VARCHAR(160),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OfficeClosedDate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OfficeHours_officeId_dayOfWeek_key" ON "OfficeHours"("officeId", "dayOfWeek");
CREATE INDEX "OfficeHours_officeId_idx" ON "OfficeHours"("officeId");
CREATE UNIQUE INDEX "OfficeClosedDate_officeId_closedDate_key" ON "OfficeClosedDate"("officeId", "closedDate");
CREATE INDEX "OfficeClosedDate_officeId_closedDate_idx" ON "OfficeClosedDate"("officeId", "closedDate");

ALTER TABLE "OfficeHours" ADD CONSTRAINT "OfficeHours_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OfficeClosedDate" ADD CONSTRAINT "OfficeClosedDate_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE CASCADE ON UPDATE CASCADE;
