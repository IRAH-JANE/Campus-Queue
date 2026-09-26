import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AppointmentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { RescheduleAppointmentDto } from './dto/reschedule-appointment.dto';
import { AvailabilityDto } from './dto/availability.dto';
import { CalendarDto } from './dto/calendar.dto';

type AppointmentActor = { userId: string; role: 'STUDENT' | 'STAFF' | 'ADMIN' };
const blockingStatuses = [
  AppointmentStatus.pending,
  AppointmentStatus.approved,
  AppointmentStatus.waiting,
  AppointmentStatus.called,
  AppointmentStatus.serving,
];

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
  ) {}

  async availability(userId: string, query: AvailabilityDto) {
    const date = this.parseDate(query.date);
    const service = await this.prisma.service.findFirst({
      where: {
        id: query.serviceId,
        isActive: true,
        office: { isActive: true },
      },
      select: {
        id: true,
        name: true,
        officeId: true,
        durationMinutes: true,
        office: { select: { id: true, name: true } },
      },
    });
    if (!service) throw new NotFoundException('Active service not found');
    if (query.appointmentId) {
      const owned = await this.prisma.appointment.findFirst({
        where: { id: query.appointmentId, userId },
        select: { id: true },
      });
      if (!owned) throw new NotFoundException('Appointment not found');
    }
    const dayOfWeek = date.getUTCDay();
    const [hours, closure, booked] = await Promise.all([
      this.prisma.officeHours.findUnique({
        where: {
          officeId_dayOfWeek: { officeId: service.officeId, dayOfWeek },
        },
      }),
      this.prisma.officeClosedDate.findUnique({
        where: {
          officeId_closedDate: { officeId: service.officeId, closedDate: date },
        },
      }),
      this.prisma.appointment.findMany({
        where: {
          appointmentDate: date,
          status: { in: blockingStatuses },
          OR: [{ serviceId: service.id }, { userId }],
          ...(query.appointmentId ? { id: { not: query.appointmentId } } : {}),
        },
        select: {
          userId: true,
          serviceId: true,
          appointmentTime: true,
          service: { select: { durationMinutes: true } },
        },
      }),
    ]);
    const slots: string[] = [];
    let availabilityMessage: string | null = null;
    if (closure) {
      availabilityMessage = closure.reason
        ? `This office is closed on the selected date: ${closure.reason}.`
        : 'This office is closed on the selected date.';
    } else if (!hours) {
      availabilityMessage =
        'This office has not set hours for the selected day.';
    } else if (hours.isClosed || !hours.openTime || !hours.closeTime) {
      availabilityMessage = 'This office is closed on the selected day.';
    }
    if (
      hours &&
      !hours.isClosed &&
      !closure &&
      hours.openTime &&
      hours.closeTime
    ) {
      const open = this.timeToMinutes(hours.openTime);
      const close = this.timeToMinutes(hours.closeTime);
      for (
        let start = open;
        start + service.durationMinutes <= close;
        start += service.durationMinutes
      ) {
        const end = start + service.durationMinutes;
        const conflicts = booked.some((appointment) => {
          const bookedStart = this.timeToMinutes(appointment.appointmentTime);
          const overlaps =
            start < bookedStart + appointment.service.durationMinutes &&
            bookedStart < end;
          return (
            overlaps &&
            (appointment.serviceId === service.id ||
              appointment.userId === userId)
          );
        });
        const time = `${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}`;
        if (
          !conflicts &&
          (() => {
            try {
              this.assertFutureDateTime(query.date, time);
              return true;
            } catch {
              return false;
            }
          })()
        )
          slots.push(time);
      }
    }
    if (!availabilityMessage && slots.length === 0) {
      availabilityMessage =
        'No future appointment times are available for this service on this date.';
    }
    return {
      date: query.date,
      timeZone: process.env.CAMPUS_TIME_ZONE || 'Asia/Manila',
      message: availabilityMessage,
      office: service.office,
      service: {
        id: service.id,
        name: service.name,
        durationMinutes: service.durationMinutes,
      },
      slots,
    };
  }

  async calendar(query: CalendarDto) {
    const service = await this.prisma.service.findFirst({
      where: {
        id: query.serviceId,
        isActive: true,
        office: { isActive: true },
      },
      select: {
        id: true,
        name: true,
        officeId: true,
        durationMinutes: true,
        office: { select: { id: true, name: true } },
      },
    });
    if (!service) throw new NotFoundException('Active service not found');

    const [year, month] = query.month.split('-').map(Number);
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));
    const [hours, closedDates] = await Promise.all([
      this.prisma.officeHours.findMany({
        where: { officeId: service.officeId },
        select: {
          dayOfWeek: true,
          isClosed: true,
          openTime: true,
          closeTime: true,
        },
        orderBy: { dayOfWeek: 'asc' },
      }),
      this.prisma.officeClosedDate.findMany({
        where: {
          officeId: service.officeId,
          closedDate: { gte: start, lt: end },
        },
        select: { closedDate: true, reason: true },
        orderBy: { closedDate: 'asc' },
      }),
    ]);

    return {
      month: query.month,
      timeZone: process.env.CAMPUS_TIME_ZONE || 'Asia/Manila',
      office: service.office,
      service: {
        id: service.id,
        name: service.name,
        durationMinutes: service.durationMinutes,
      },
      hours,
      closedDates: closedDates.map((closedDate) => ({
        closedDate: closedDate.closedDate.toISOString().slice(0, 10),
        reason: closedDate.reason,
      })),
    };
  }

  async create(userId: string, dto: CreateAppointmentDto) {
    const service = await this.prisma.service.findFirst({
      where: {
        id: dto.serviceId,
        isActive: true,
        office: { isActive: true },
      },
      select: {
        id: true,
        officeId: true,
        durationMinutes: true,
      },
    });
    if (!service) {
      throw new NotFoundException('Active service not found');
    }

    const appointmentDate = new Date(`${dto.appointmentDate}T00:00:00.000Z`);
    this.assertFutureDateTime(dto.appointmentDate, dto.appointmentTime);
    const requestedStart = this.timeToMinutes(dto.appointmentTime);
    const requestedEnd = requestedStart + service.durationMinutes;
    if (requestedEnd > 24 * 60) {
      throw new BadRequestException(
        'Appointment duration cannot extend past midnight',
      );
    }

    return this.serializableTransaction(async (tx) => {
      await this.assertWithinOfficeHours(
        tx,
        service.officeId,
        appointmentDate,
        dto.appointmentTime,
        service.durationMinutes,
      );
      const existing = await tx.appointment.findMany({
        where: {
          appointmentDate,
          status: { in: blockingStatuses },
          OR: [{ serviceId: service.id }, { userId }],
        },
        select: {
          userId: true,
          serviceId: true,
          appointmentTime: true,
          service: { select: { durationMinutes: true } },
        },
      });

      const conflict = existing.some((appointment) => {
        const existingStart = this.timeToMinutes(appointment.appointmentTime);
        const existingEnd = existingStart + appointment.service.durationMinutes;
        const sameService = appointment.serviceId === service.id;
        const sameStudent = appointment.userId === userId;
        const overlaps =
          requestedStart < existingEnd && existingStart < requestedEnd;
        return overlaps && (sameService || sameStudent);
      });

      if (conflict) {
        throw new ConflictException(
          'The service slot or your schedule is already booked',
        );
      }

      const appointment = await tx.appointment.create({
        data: {
          userId,
          officeId: service.officeId,
          serviceId: service.id,
          appointmentDate,
          appointmentTime: dto.appointmentTime,
          purpose: dto.purpose,
          status: AppointmentStatus.pending,
        },
        include: { office: true, service: true },
      });
      await tx.activityLog.create({
        data: {
          userId,
          action: 'APPOINTMENT_CREATED',
          description: `Booked appointment ${appointment.id}`,
        },
      });
      return appointment;
    });
  }

  findMine(userId: string) {
    return this.prisma.appointment.findMany({
      where: { userId },
      select: {
        id: true,
        appointmentDate: true,
        appointmentTime: true,
        queueNumber: true,
        status: true,
        purpose: true,
        remarks: true,
        createdAt: true,
        office: {
          select: { id: true, name: true, code: true, isActive: true },
        },
        service: {
          select: {
            id: true,
            name: true,
            durationMinutes: true,
            officeId: true,
          },
        },
        queueTicket: {
          select: {
            id: true,
            queueNumber: true,
            status: true,
            checkedInAt: true,
          },
        },
      },
      orderBy: [{ appointmentDate: 'desc' }, { appointmentTime: 'desc' }],
    });
  }

  async reschedule(
    appointmentId: string,
    userId: string,
    dto: RescheduleAppointmentDto,
  ) {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, userId },
      select: {
        id: true,
        status: true,
        purpose: true,
      },
    });
    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }
    if (
      appointment.status !== AppointmentStatus.pending &&
      appointment.status !== AppointmentStatus.approved
    ) {
      throw new BadRequestException(
        'Only pending or approved appointments can be rescheduled',
      );
    }

    const service = await this.prisma.service.findFirst({
      where: {
        id: dto.serviceId,
        isActive: true,
        office: { isActive: true },
      },
      select: { id: true, officeId: true, durationMinutes: true },
    });
    if (!service) {
      throw new NotFoundException('Active service not found');
    }

    this.assertFutureDateTime(dto.appointmentDate, dto.appointmentTime);
    const appointmentDate = new Date(`${dto.appointmentDate}T00:00:00.000Z`);
    const requestedStart = this.timeToMinutes(dto.appointmentTime);
    const requestedEnd = requestedStart + service.durationMinutes;
    if (requestedEnd > 24 * 60) {
      throw new BadRequestException(
        'Appointment duration cannot extend past midnight',
      );
    }

    return this.serializableTransaction(async (tx) => {
      await this.assertWithinOfficeHours(
        tx,
        service.officeId,
        appointmentDate,
        dto.appointmentTime,
        service.durationMinutes,
      );
      const existing = await tx.appointment.findMany({
        where: {
          id: { not: appointmentId },
          appointmentDate,
          status: { in: blockingStatuses },
          OR: [{ serviceId: service.id }, { userId }],
        },
        select: {
          userId: true,
          serviceId: true,
          appointmentTime: true,
          service: { select: { durationMinutes: true } },
        },
      });

      const conflict = existing.some((existingAppointment) => {
        const existingStart = this.timeToMinutes(
          existingAppointment.appointmentTime,
        );
        const existingEnd =
          existingStart + existingAppointment.service.durationMinutes;
        const overlaps =
          requestedStart < existingEnd && existingStart < requestedEnd;
        return (
          overlaps &&
          (existingAppointment.serviceId === service.id ||
            existingAppointment.userId === userId)
        );
      });
      if (conflict) {
        throw new ConflictException(
          'The service slot or your schedule is already booked',
        );
      }

      const changed = await tx.appointment.updateMany({
        where: {
          id: appointmentId,
          userId,
          status: appointment.status,
        },
        data: {
          officeId: service.officeId,
          serviceId: service.id,
          appointmentDate,
          appointmentTime: dto.appointmentTime,
          purpose: dto.purpose ?? appointment.purpose,
          status: AppointmentStatus.pending,
          queueNumber: null,
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException(
          'The appointment was changed by another user',
        );
      }
      await tx.activityLog.create({
        data: {
          userId,
          action: 'APPOINTMENT_RESCHEDULED',
          description: `Rescheduled appointment ${appointmentId}`,
        },
      });
      return tx.appointment.findUnique({
        where: { id: appointmentId },
        include: { office: true, service: true },
      });
    });
  }

  async findForOffice(
    officeId: string,
    actor: AppointmentActor,
    date?: string,
  ) {
    const office = await this.prisma.office.findUnique({
      where: { id: officeId },
      select: { id: true },
    });
    if (!office) {
      throw new NotFoundException('Office not found');
    }
    await this.assertOfficeAccess(this.prisma, officeId, actor);
    const appointmentDate = date ? this.parseDate(date) : undefined;

    return this.prisma.appointment.findMany({
      where: {
        officeId,
        ...(appointmentDate ? { appointmentDate } : {}),
      },
      select: {
        id: true,
        appointmentDate: true,
        appointmentTime: true,
        status: true,
        queueNumber: true,
        purpose: true,
        remarks: true,
        createdAt: true,
        user: { select: { id: true, fullName: true, studentId: true } },
        service: { select: { id: true, name: true, durationMinutes: true } },
        queueTicket: { select: { id: true, status: true, queueNumber: true } },
      },
      orderBy: [{ appointmentDate: 'asc' }, { appointmentTime: 'asc' }],
    });
  }

  async cancel(appointmentId: string, userId: string) {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, userId },
    });
    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }
    if (
      !(
        appointment.status === AppointmentStatus.pending ||
        appointment.status === AppointmentStatus.approved
      )
    ) {
      throw new BadRequestException(
        'This appointment can no longer be cancelled',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.appointment.updateMany({
        where: {
          id: appointmentId,
          userId,
          status: appointment.status,
        },
        data: { status: AppointmentStatus.cancelled },
      });
      if (changed.count !== 1) {
        throw new ConflictException(
          'The appointment was changed by another user',
        );
      }
      await tx.activityLog.create({
        data: {
          userId,
          action: 'APPOINTMENT_CANCELLED',
          description: `Cancelled appointment ${appointmentId}`,
        },
      });
      return tx.appointment.findUnique({ where: { id: appointmentId } });
    });
  }

  async checkIn(appointmentId: string, userId: string) {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, userId },
      select: { id: true, serviceId: true, status: true },
    });
    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }
    if (appointment.status !== AppointmentStatus.approved) {
      throw new BadRequestException('Only approved appointments can check in');
    }

    return this.queueService.join(
      { userId, role: 'STUDENT' },
      { serviceId: appointment.serviceId, appointmentId },
    );
  }

  async approve(appointmentId: string, actor: AppointmentActor) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: { id: true, userId: true, officeId: true, status: true },
    });
    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }
    await this.assertOfficeAccess(this.prisma, appointment.officeId, actor);
    if (appointment.status !== AppointmentStatus.pending) {
      throw new BadRequestException(
        'Only pending appointments can be approved',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.appointment.updateMany({
        where: {
          id: appointmentId,
          officeId: appointment.officeId,
          status: AppointmentStatus.pending,
        },
        data: { status: AppointmentStatus.approved },
      });
      if (changed.count !== 1) {
        throw new ConflictException(
          'The appointment was changed by another staff member',
        );
      }
      await tx.notification.create({
        data: {
          userId: appointment.userId,
          message: 'Your appointment has been approved.',
        },
      });
      await tx.activityLog.create({
        data: {
          userId: actor.userId,
          action: 'APPOINTMENT_APPROVED',
          description: `Approved appointment ${appointmentId}`,
        },
      });
      return tx.appointment.findUnique({ where: { id: appointmentId } });
    });
  }

  private async assertOfficeAccess(
    tx: Prisma.TransactionClient | PrismaService,
    officeId: string,
    actor: AppointmentActor,
  ) {
    if (actor.role === 'ADMIN') return;
    const assignment = await tx.officeStaff.findUnique({
      where: { officeId_userId: { officeId, userId: actor.userId } },
      select: { officeId: true },
    });
    if (!assignment) {
      throw new ForbiddenException('You are not assigned to this office');
    }
  }

  private async serializableTransaction<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
    retries = 3,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (
        retries > 1 &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      ) {
        return this.serializableTransaction(operation, retries - 1);
      }
      throw error;
    }
  }

  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private async assertWithinOfficeHours(
    tx: Prisma.TransactionClient,
    officeId: string,
    date: Date,
    time: string,
    duration: number,
  ) {
    const dayOfWeek = date.getUTCDay();
    const [hours, closure] = await Promise.all([
      tx.officeHours.findUnique({
        where: { officeId_dayOfWeek: { officeId, dayOfWeek } },
      }),
      tx.officeClosedDate.findUnique({
        where: { officeId_closedDate: { officeId, closedDate: date } },
      }),
    ]);
    if (
      !hours ||
      hours.isClosed ||
      !hours.openTime ||
      !hours.closeTime ||
      closure
    )
      throw new BadRequestException(
        'This office is closed on the selected date',
      );
    const start = this.timeToMinutes(time);
    const open = this.timeToMinutes(hours.openTime);
    const close = this.timeToMinutes(hours.closeTime);
    if (
      start < open ||
      start + duration > close ||
      (start - open) % duration !== 0
    )
      throw new BadRequestException(
        'Choose an available slot during office hours',
      );
  }

  private parseDate(value: string): Date {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException('Date must use YYYY-MM-DD format');
    }
    const date = new Date(`${value}T00:00:00.000Z`);
    if (
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
    ) {
      throw new BadRequestException('Date is invalid');
    }
    return date;
  }

  private assertFutureDateTime(date: string, time: string) {
    const nowParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: process.env.CAMPUS_TIME_ZONE || 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date());
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      nowParts.find((item) => item.type === type)?.value;
    const localDate = `${part('year')}-${part('month')}-${part('day')}`;
    const localTime = `${part('hour')}:${part('minute')}`;
    if (date < localDate || (date === localDate && time <= localTime)) {
      throw new BadRequestException(
        'Appointments must be scheduled for a future time',
      );
    }
  }
}
