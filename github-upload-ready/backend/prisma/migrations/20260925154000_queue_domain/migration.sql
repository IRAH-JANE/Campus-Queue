-- CreateEnum
CREATE TYPE "QueueSessionStatus" AS ENUM ('OPEN', 'PAUSED', 'CLOSED');

-- CreateEnum
CREATE TYPE "QueueTicketStatus" AS ENUM ('WAITING', 'CALLED', 'SERVING', 'COMPLETED', 'SKIPPED', 'CANCELLED', 'NO_SHOW');

-- CreateTable
CREATE TABLE "OfficeStaff" (
    "officeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfficeStaff_pkey" PRIMARY KEY ("officeId","userId")
);

-- CreateTable
CREATE TABLE "Counter" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CounterStaff" (
    "counterId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CounterStaff_pkey" PRIMARY KEY ("counterId","userId")
);

-- CreateTable
CREATE TABLE "QueueSession" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "sessionDate" DATE NOT NULL,
    "queuePrefix" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    "status" "QueueSessionStatus" NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QueueSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueueTicket" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "counterId" TEXT,
    "calledById" TEXT,
    "servedById" TEXT,
    "sequence" INTEGER NOT NULL,
    "queueNumber" TEXT NOT NULL,
    "status" "QueueTicketStatus" NOT NULL DEFAULT 'WAITING',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "calledAt" TIMESTAMP(3),
    "servingStartedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "skippedAt" TIMESTAMP(3),
    "noShowAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QueueTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OfficeStaff_userId_idx" ON "OfficeStaff"("userId");

-- CreateIndex
CREATE INDEX "Counter_officeId_isActive_idx" ON "Counter"("officeId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Counter_officeId_code_key" ON "Counter"("officeId", "code");

-- CreateIndex
CREATE INDEX "CounterStaff_userId_idx" ON "CounterStaff"("userId");

-- CreateIndex
CREATE INDEX "QueueSession_sessionDate_status_idx" ON "QueueSession"("sessionDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "QueueSession_officeId_serviceId_sessionDate_key" ON "QueueSession"("officeId", "serviceId", "sessionDate");

-- CreateIndex
CREATE UNIQUE INDEX "QueueTicket_appointmentId_key" ON "QueueTicket"("appointmentId");

-- CreateIndex
CREATE INDEX "QueueTicket_sessionId_status_priority_sequence_idx" ON "QueueTicket"("sessionId", "status", "priority", "sequence");

-- CreateIndex
CREATE INDEX "QueueTicket_userId_createdAt_idx" ON "QueueTicket"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "QueueTicket_counterId_status_idx" ON "QueueTicket"("counterId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "QueueTicket_sessionId_sequence_key" ON "QueueTicket"("sessionId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "QueueTicket_sessionId_queueNumber_key" ON "QueueTicket"("sessionId", "queueNumber");

-- AddForeignKey
ALTER TABLE "OfficeStaff" ADD CONSTRAINT "OfficeStaff_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficeStaff" ADD CONSTRAINT "OfficeStaff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Counter" ADD CONSTRAINT "Counter_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounterStaff" ADD CONSTRAINT "CounterStaff_counterId_fkey" FOREIGN KEY ("counterId") REFERENCES "Counter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounterStaff" ADD CONSTRAINT "CounterStaff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueSession" ADD CONSTRAINT "QueueSession_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueSession" ADD CONSTRAINT "QueueSession_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueTicket" ADD CONSTRAINT "QueueTicket_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "QueueSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueTicket" ADD CONSTRAINT "QueueTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueTicket" ADD CONSTRAINT "QueueTicket_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueTicket" ADD CONSTRAINT "QueueTicket_counterId_fkey" FOREIGN KEY ("counterId") REFERENCES "Counter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueTicket" ADD CONSTRAINT "QueueTicket_calledById_fkey" FOREIGN KEY ("calledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueTicket" ADD CONSTRAINT "QueueTicket_servedById_fkey" FOREIGN KEY ("servedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Appointment_serviceId_appointmentDate_status_idx" ON "Appointment"("serviceId", "appointmentDate", "status");

-- CreateIndex
CREATE INDEX "Appointment_userId_appointmentDate_status_idx" ON "Appointment"("userId", "appointmentDate", "status");
