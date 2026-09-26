/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- Prisma delegates are intentionally represented by dynamic jest mocks in this unit test. */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AppointmentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { AppointmentsService } from './appointments.service';

describe('AppointmentsService', () => {
  let prisma: Record<string, any>;
  let tx: Record<string, any>;
  let queueService: { join: jest.Mock };
  let appointments: AppointmentsService;

  beforeEach(() => {
    tx = {
      appointment: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'appointment-1' }),
        findUnique: jest.fn().mockResolvedValue({ id: 'appointment-1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      activityLog: { create: jest.fn().mockResolvedValue({}) },
      notification: { create: jest.fn().mockResolvedValue({}) },
      officeHours: {
        findUnique: jest.fn().mockResolvedValue({
          isClosed: false,
          openTime: '09:00',
          closeTime: '17:00',
        }),
      },
      officeClosedDate: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    prisma = {
      service: { findFirst: jest.fn() },
      office: { findUnique: jest.fn().mockResolvedValue({ id: 'office-1' }) },
      appointment: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      officeHours: {
        findUnique: jest.fn().mockResolvedValue({
          isClosed: false,
          openTime: '09:00',
          closeTime: '10:00',
        }),
      },
      officeClosedDate: { findUnique: jest.fn().mockResolvedValue(null) },
      officeStaff: { findUnique: jest.fn() },
      $transaction: jest.fn((operation) => operation(tx)),
    };
    queueService = { join: jest.fn() };
    appointments = new AppointmentsService(
      prisma as unknown as PrismaService,
      queueService as unknown as QueueService,
    );
  });

  function requestForTomorrow(time = '09:30'): CreateAppointmentDto {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: process.env.CAMPUS_TIME_ZONE || 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value);
    const date = new Date(
      Date.UTC(value('year'), value('month') - 1, value('day') + 1),
    );
    return {
      serviceId: 'service-1',
      appointmentDate: date.toISOString().slice(0, 10),
      appointmentTime: time,
      purpose: 'Transcript request',
    };
  }

  it('creates a pending appointment within a serializable transaction', async () => {
    prisma.service.findFirst.mockResolvedValue({
      id: 'service-1',
      officeId: 'office-1',
      durationMinutes: 30,
    });

    await expect(
      appointments.create('student-1', requestForTomorrow()),
    ).resolves.toEqual({ id: 'appointment-1' });

    expect(tx.appointment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'student-1',
        officeId: 'office-1',
        serviceId: 'service-1',
        status: AppointmentStatus.pending,
      }),
      include: { office: true, service: true },
    });
    expect(tx.activityLog.create).toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it('returns service-duration slots inside office hours', async () => {
    prisma.service.findFirst.mockResolvedValue({
      id: 'service-1',
      name: 'Transcript',
      officeId: 'office-1',
      durationMinutes: 30,
      office: { id: 'office-1', name: 'Registrar' },
    });
    prisma.appointment.findMany.mockResolvedValue([]);
    const result = await appointments.availability('student-1', {
      serviceId: 'service-1',
      date: requestForTomorrow().appointmentDate,
    });
    expect(result.slots).toEqual(['09:00', '09:30']);
  });

  it('rejects a booking outside configured office hours', async () => {
    prisma.service.findFirst.mockResolvedValue({
      id: 'service-1',
      officeId: 'office-1',
      durationMinutes: 30,
    });
    await expect(
      appointments.create('student-1', requestForTomorrow('08:30')),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.appointment.create).not.toHaveBeenCalled();
  });

  it('rejects overlapping service appointments', async () => {
    prisma.service.findFirst.mockResolvedValue({
      id: 'service-1',
      officeId: 'office-1',
      durationMinutes: 30,
    });
    tx.appointment.findMany.mockResolvedValue([
      {
        userId: 'other-student',
        serviceId: 'service-1',
        appointmentTime: '09:00',
        service: { durationMinutes: 60 },
      },
    ]);

    await expect(
      appointments.create('student-1', requestForTomorrow('09:30')),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.appointment.create).not.toHaveBeenCalled();
  });

  it('rejects appointments whose service would run past midnight', async () => {
    prisma.service.findFirst.mockResolvedValue({
      id: 'service-1',
      officeId: 'office-1',
      durationMinutes: 30,
    });

    await expect(
      appointments.create('student-1', requestForTomorrow('23:45')),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('reschedules an owned pending appointment and returns it to pending', async () => {
    prisma.appointment.findFirst.mockResolvedValue({
      id: 'appointment-1',
      status: AppointmentStatus.approved,
      purpose: 'Old purpose',
    });
    prisma.service.findFirst.mockResolvedValue({
      id: 'service-1',
      officeId: 'office-1',
      durationMinutes: 30,
    });
    tx.appointment.findUnique.mockResolvedValue({ id: 'appointment-1' });

    const dto = requestForTomorrow('10:00');
    await expect(
      appointments.reschedule('appointment-1', 'student-1', dto),
    ).resolves.toEqual({ id: 'appointment-1' });

    expect(tx.appointment.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'appointment-1',
        userId: 'student-1',
        status: AppointmentStatus.approved,
      },
      data: expect.objectContaining({
        status: AppointmentStatus.pending,
        queueNumber: null,
        appointmentTime: '10:00',
      }),
    });
    expect(tx.activityLog.create).toHaveBeenCalled();
  });

  it('does not reschedule another student’s appointment', async () => {
    prisma.appointment.findFirst.mockResolvedValue(null);

    await expect(
      appointments.reschedule(
        'appointment-foreign',
        'student-1',
        requestForTomorrow(),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.service.findFirst).not.toHaveBeenCalled();
  });

  it('does not return or cancel another student’s appointment', async () => {
    prisma.appointment.findFirst.mockResolvedValue(null);

    await expect(
      appointments.cancel('appointment-foreign', 'student-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects cancellation after an appointment has entered the queue', async () => {
    prisma.appointment.findFirst.mockResolvedValue({
      id: 'appointment-1',
      status: AppointmentStatus.waiting,
    });

    await expect(
      appointments.cancel('appointment-1', 'student-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('limits office appointment access to assigned staff', async () => {
    prisma.officeStaff.findUnique.mockResolvedValue(null);

    await expect(
      appointments.findForOffice('office-1', {
        userId: 'staff-1',
        role: 'STAFF',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.appointment.findMany).not.toHaveBeenCalled();
  });

  it('returns not found for an unknown office', async () => {
    prisma.office.findUnique.mockResolvedValue(null);

    await expect(
      appointments.findForOffice('missing-office', {
        userId: 'admin-1',
        role: 'ADMIN',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.appointment.findMany).not.toHaveBeenCalled();
  });

  it('allows administrators to list office appointments without staff assignment', async () => {
    prisma.appointment.findMany.mockResolvedValue([]);

    await expect(
      appointments.findForOffice('office-1', {
        userId: 'admin-1',
        role: 'ADMIN',
      }),
    ).resolves.toEqual([]);
    expect(prisma.officeStaff.findUnique).not.toHaveBeenCalled();
    expect(prisma.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { officeId: 'office-1' } }),
    );
  });

  it('only checks in the owner’s approved appointment', async () => {
    prisma.appointment.findFirst.mockResolvedValue({
      id: 'appointment-1',
      serviceId: 'service-1',
      status: AppointmentStatus.approved,
    });
    queueService.join.mockResolvedValue({ id: 'ticket-1' });

    await expect(
      appointments.checkIn('appointment-1', 'student-1'),
    ).resolves.toEqual({ id: 'ticket-1' });
    expect(queueService.join).toHaveBeenCalledWith(
      { userId: 'student-1', role: 'STUDENT' },
      { serviceId: 'service-1', appointmentId: 'appointment-1' },
    );
  });

  it('rejects check-in before an appointment is approved', async () => {
    prisma.appointment.findFirst.mockResolvedValue({
      id: 'appointment-1',
      serviceId: 'service-1',
      status: AppointmentStatus.pending,
    });

    await expect(
      appointments.checkIn('appointment-1', 'student-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(queueService.join).not.toHaveBeenCalled();
  });

  it('approves a pending appointment and records notification and activity', async () => {
    prisma.appointment.findUnique.mockResolvedValue({
      id: 'appointment-1',
      userId: 'student-1',
      officeId: 'office-1',
      status: AppointmentStatus.pending,
    });
    prisma.officeStaff.findUnique.mockResolvedValue({ officeId: 'office-1' });

    await expect(
      appointments.approve('appointment-1', {
        userId: 'staff-1',
        role: 'STAFF',
      }),
    ).resolves.toEqual({ id: 'appointment-1' });

    expect(tx.appointment.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'appointment-1',
        officeId: 'office-1',
        status: AppointmentStatus.pending,
      },
      data: { status: AppointmentStatus.approved },
    });
    expect(tx.notification.create).toHaveBeenCalledWith({
      data: {
        userId: 'student-1',
        message: 'Your appointment has been approved.',
      },
    });
    expect(tx.activityLog.create).toHaveBeenCalled();
  });
});
