/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unnecessary-type-assertion -- Prisma delegates are intentionally represented by dynamic jest mocks in this unit test. */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma, QueueSessionStatus, QueueTicketStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JoinQueueDto } from './dto/join-queue.dto';
import { QueueService } from './queue.service';

describe('QueueService', () => {
  let prisma: Record<string, any>;
  let queueService: QueueService;

  beforeEach(() => {
    prisma = {
      service: { findFirst: jest.fn() },
      queueTicket: {
        count: jest.fn(),
        findMany: jest.fn(),
      },
      queueSession: { findUnique: jest.fn() },
      officeStaff: { findUnique: jest.fn() },
      $transaction: jest.fn(),
    };
    queueService = new QueueService(prisma as unknown as PrismaService);
  });

  it('allocates queue numbers by incrementing the session counter in a serializable transaction', async () => {
    const session = {
      id: 'session-1',
      officeId: 'office-1',
      serviceId: 'service-1',
      queuePrefix: 'REG',
      lastNumber: 1,
      status: QueueSessionStatus.OPEN,
    };
    const createdTicket = { id: 'ticket-1', queueNumber: 'REG-001' };
    prisma.service.findFirst.mockResolvedValue({
      id: 'service-1',
      officeId: 'office-1',
      office: { code: 'REG' },
    });
    const tx = {
      queueSession: {
        upsert: jest.fn().mockResolvedValue({ ...session, lastNumber: 0 }),
        update: jest.fn().mockResolvedValue(session),
      },
      queueTicket: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(createdTicket),
      },
      activityLog: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma.$transaction.mockImplementation((operation) => operation(tx));

    await expect(
      queueService.join({ userId: 'student-1', role: 'STUDENT' }, {
        serviceId: 'service-1',
      } as JoinQueueDto),
    ).resolves.toEqual(createdTicket);

    expect(tx.queueSession.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: { lastNumber: { increment: 1 } },
    });
    expect(tx.queueTicket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sequence: 1,
          queueNumber: 'REG-001',
        }),
      }),
    );
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it('does not issue a second active ticket for a student in the same session', async () => {
    prisma.service.findFirst.mockResolvedValue({
      id: 'service-1',
      officeId: 'office-1',
      office: { code: 'REG' },
    });
    const tx = {
      queueSession: {
        upsert: jest.fn().mockResolvedValue({
          id: 'session-1',
          status: QueueSessionStatus.OPEN,
        }),
        update: jest.fn(),
      },
      queueTicket: {
        findFirst: jest.fn().mockResolvedValue({ id: 'existing-ticket' }),
        create: jest.fn(),
      },
    };
    prisma.$transaction.mockImplementation((operation) => operation(tx));

    await expect(
      queueService.join({ userId: 'student-1', role: 'STUDENT' }, {
        serviceId: 'service-1',
      } as JoinQueueDto),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.queueSession.update).not.toHaveBeenCalled();
    expect(tx.queueTicket.create).not.toHaveBeenCalled();
  });

  it('links an approved appointment to its check-in ticket and updates appointment status', async () => {
    prisma.service.findFirst.mockResolvedValue({
      id: 'service-1',
      officeId: 'office-1',
      office: { code: 'REG' },
    });
    const tx = {
      queueSession: {
        upsert: jest.fn().mockResolvedValue({
          id: 'session-1',
          status: QueueSessionStatus.OPEN,
          lastNumber: 0,
        }),
        update: jest.fn().mockResolvedValue({
          id: 'session-1',
          queuePrefix: 'REG',
          lastNumber: 1,
        }),
      },
      appointment: {
        findFirst: jest.fn().mockResolvedValue({ id: 'appointment-1' }),
        update: jest.fn().mockResolvedValue({}),
      },
      queueTicket: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'ticket-1',
          queueNumber: 'REG-001',
        }),
      },
      activityLog: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma.$transaction.mockImplementation((operation) => operation(tx));

    await queueService.join(
      { userId: 'student-1', role: 'STUDENT' },
      { serviceId: 'service-1', appointmentId: 'appointment-1' },
    );

    expect(tx.queueTicket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ appointmentId: 'appointment-1' }),
      }),
    );
    expect(tx.appointment.update).toHaveBeenCalledWith({
      where: { id: 'appointment-1' },
      data: { status: 'waiting', queueNumber: 'REG-001' },
    });
  });

  it('rejects invalid ticket state transitions', async () => {
    const tx = {
      queueTicket: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ticket-1',
          queueNumber: 'REG-001',
          status: QueueTicketStatus.COMPLETED,
          counterId: null,
          session: { officeId: 'office-1' },
        }),
        updateMany: jest.fn(),
      },
    };
    prisma.$transaction.mockImplementation((operation) => operation(tx));

    await expect(
      queueService.startServing('ticket-1', {
        userId: 'admin-1',
        role: 'ADMIN',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.queueTicket.updateMany).not.toHaveBeenCalled();
  });

  it('denies staff queue access outside their assigned office', async () => {
    prisma.queueSession.findUnique.mockResolvedValue({
      id: 'session-1',
      officeId: 'office-1',
    });
    prisma.officeStaff.findUnique.mockResolvedValue(null);

    await expect(
      queueService.findSessionTickets('session-1', {
        userId: 'staff-1',
        role: 'STAFF',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.queueTicket.findMany).not.toHaveBeenCalled();
  });

  it('does not close a queue while active tickets remain', async () => {
    const tx = {
      queueSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'session-1',
          officeId: 'office-1',
          status: QueueSessionStatus.OPEN,
        }),
        updateMany: jest.fn(),
      },
      queueTicket: {
        findFirst: jest.fn().mockResolvedValue({ id: 'waiting-ticket' }),
      },
    };
    prisma.$transaction.mockImplementation((operation) => operation(tx));

    await expect(
      queueService.closeSession('session-1', {
        userId: 'admin-1',
        role: 'ADMIN',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.queueSession.updateMany).not.toHaveBeenCalled();
  });
});
