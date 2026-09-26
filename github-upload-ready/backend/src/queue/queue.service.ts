import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import {
  AppointmentStatus,
  Prisma,
  QueueSessionStatus,
  QueueTicketStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JoinQueueDto } from './dto/join-queue.dto';

type QueueActor = { userId: string; role: 'STUDENT' | 'STAFF' | 'ADMIN' };
type QueueTransaction = Prisma.TransactionClient;

@Injectable()
export class QueueService {
  constructor(private readonly prisma: PrismaService) {}

  async join(actor: QueueActor, dto: JoinQueueDto) {
    const service = await this.prisma.service.findFirst({
      where: {
        id: dto.serviceId,
        isActive: true,
        office: { isActive: true },
      },
      select: {
        id: true,
        officeId: true,
        office: { select: { code: true } },
      },
    });

    if (!service) {
      throw new NotFoundException('Active service not found');
    }

    const sessionDate = this.campusDate();

    return this.serializableTransaction(async (tx) => {
      const session = await tx.queueSession.upsert({
        where: {
          officeId_serviceId_sessionDate: {
            officeId: service.officeId,
            serviceId: service.id,
            sessionDate,
          },
        },
        create: {
          officeId: service.officeId,
          serviceId: service.id,
          sessionDate,
          queuePrefix: service.office.code,
        },
        update: {},
      });

      if (session.status !== QueueSessionStatus.OPEN) {
        throw new ConflictException('This service queue is not open');
      }

      if (dto.appointmentId) {
        const appointment = await tx.appointment.findFirst({
          where: {
            id: dto.appointmentId,
            userId: actor.userId,
            serviceId: service.id,
            appointmentDate: sessionDate,
            status: AppointmentStatus.approved,
          },
          select: { id: true },
        });
        if (!appointment) {
          throw new BadRequestException(
            'Appointment must be approved, belong to you, match this service, and be scheduled for today',
          );
        }
      }

      const activeTicket = await tx.queueTicket.findFirst({
        where: {
          sessionId: session.id,
          userId: actor.userId,
          status: {
            in: [
              QueueTicketStatus.WAITING,
              QueueTicketStatus.CALLED,
              QueueTicketStatus.SERVING,
            ],
          },
        },
        select: { id: true },
      });

      if (activeTicket) {
        throw new ConflictException(
          'You already have an active ticket in this queue',
        );
      }

      const numberedSession = await tx.queueSession.update({
        where: { id: session.id },
        data: { lastNumber: { increment: 1 } },
      });
      const queueNumber = `${numberedSession.queuePrefix}-${String(
        numberedSession.lastNumber,
      ).padStart(3, '0')}`;

      const ticket = await tx.queueTicket.create({
        data: {
          sessionId: session.id,
          userId: actor.userId,
          ...(dto.appointmentId ? { appointmentId: dto.appointmentId } : {}),
          sequence: numberedSession.lastNumber,
          queueNumber,
        },
        include: {
          session: { include: { office: true, service: true } },
        },
      });

      if (dto.appointmentId) {
        await tx.appointment.update({
          where: { id: dto.appointmentId },
          data: { status: AppointmentStatus.waiting, queueNumber },
        });
      }

      await tx.activityLog.create({
        data: {
          userId: actor.userId,
          action: 'QUEUE_JOINED',
          description: `Joined queue with ticket ${ticket.queueNumber}`,
        },
      });

      return ticket;
    });
  }

  async findMine(userId: string) {
    const tickets = await this.prisma.queueTicket.findMany({
      where: {
        userId,
        status: {
          in: [
            QueueTicketStatus.WAITING,
            QueueTicketStatus.CALLED,
            QueueTicketStatus.SERVING,
          ],
        },
      },
      include: {
        session: {
          include: {
            office: true,
            service: true,
          },
        },
        counter: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return Promise.all(
      tickets.map(async (ticket) => {
        const peopleAhead =
          ticket.status === QueueTicketStatus.WAITING
            ? await this.prisma.queueTicket.count({
                where: {
                  sessionId: ticket.sessionId,
                  status: QueueTicketStatus.WAITING,
                  OR: [
                    { priority: { gt: ticket.priority } },
                    {
                      priority: ticket.priority,
                      sequence: { lt: ticket.sequence },
                    },
                  ],
                },
              })
            : 0;

        return {
          ...ticket,
          peopleAhead,
          position:
            ticket.status === QueueTicketStatus.WAITING ? peopleAhead + 1 : 0,
          estimatedWaitMinutes:
            peopleAhead * ticket.session.service.durationMinutes,
        };
      }),
    );
  }

  async cancel(ticketId: string, userId: string) {
    return this.serializableTransaction(async (tx) => {
      const ticket = await tx.queueTicket.findFirst({
        where: { id: ticketId, userId },
      });

      if (!ticket) {
        throw new NotFoundException('Queue ticket not found');
      }
      if (ticket.status !== QueueTicketStatus.WAITING) {
        throw new BadRequestException('Only waiting tickets can be cancelled');
      }

      return this.updateTicketState(
        tx,
        ticket,
        QueueTicketStatus.CANCELLED,
        {
          cancelledAt: new Date(),
        },
        { userId, role: 'STUDENT' },
        'QUEUE_CANCELLED',
      );
    });
  }

  async display(sessionId: string) {
    const session = await this.prisma.queueSession.findUnique({
      where: { id: sessionId },
      include: { office: true, service: true },
    });

    if (!session) {
      throw new NotFoundException('Queue session not found');
    }

    const [nowServing, upNext] = await Promise.all([
      this.prisma.queueTicket.findMany({
        where: {
          sessionId,
          status: { in: [QueueTicketStatus.CALLED, QueueTicketStatus.SERVING] },
        },
        select: {
          queueNumber: true,
          status: true,
          counter: { select: { name: true, code: true } },
        },
        orderBy: { calledAt: 'asc' },
      }),
      this.prisma.queueTicket.findMany({
        where: { sessionId, status: QueueTicketStatus.WAITING },
        select: { queueNumber: true },
        orderBy: [{ priority: 'desc' }, { sequence: 'asc' }],
        take: 5,
      }),
    ]);

    return {
      office: { name: session.office.name, code: session.office.code },
      service: session.service.name,
      status: session.status,
      nowServing,
      upNext: upNext.map((ticket) => ticket.queueNumber),
    };
  }

  async findSessionTickets(sessionId: string, actor: QueueActor) {
    const session = await this.prisma.queueSession.findUnique({
      where: { id: sessionId },
      select: { id: true, officeId: true },
    });
    if (!session) {
      throw new NotFoundException('Queue session not found');
    }

    await this.assertOfficeAccess(this.prisma, session.officeId, actor);

    return this.prisma.queueTicket.findMany({
      where: { sessionId },
      select: {
        id: true,
        queueNumber: true,
        status: true,
        priority: true,
        checkedInAt: true,
        calledAt: true,
        servingStartedAt: true,
        completedAt: true,
        user: { select: { id: true, fullName: true, studentId: true } },
        counter: { select: { id: true, name: true, code: true } },
      },
      orderBy: [{ priority: 'desc' }, { sequence: 'asc' }],
    });
  }

  async findTodaySessions(actor: QueueActor, officeId?: string) {
    let officeIds: string[] | undefined;
    if (actor.role === 'STAFF') {
      if (officeId) {
        await this.assertOfficeAccess(this.prisma, officeId, actor);
        officeIds = [officeId];
      } else {
        const assignments = await this.prisma.officeStaff.findMany({
          where: { userId: actor.userId },
          select: { officeId: true },
        });
        officeIds = assignments.map((assignment) => assignment.officeId);
        if (officeIds.length === 0) return [];
      }
    } else if (officeId) {
      const office = await this.prisma.office.findUnique({
        where: { id: officeId },
        select: { id: true },
      });
      if (!office) throw new NotFoundException('Office not found');
      officeIds = [officeId];
    }

    const officeFilter = officeIds ? { officeId: { in: officeIds } } : {};
    const [sessions, counters] = await Promise.all([
      this.prisma.queueSession.findMany({
        where: {
          sessionDate: this.campusDate(),
          office: { isActive: true },
          ...officeFilter,
        },
        include: {
          office: { select: { id: true, name: true, code: true } },
          service: { select: { id: true, name: true, durationMinutes: true } },
          tickets: {
            where: {
              status: {
                in: [
                  QueueTicketStatus.WAITING,
                  QueueTicketStatus.CALLED,
                  QueueTicketStatus.SERVING,
                ],
              },
            },
            select: {
              id: true,
              queueNumber: true,
              status: true,
              counterId: true,
              priority: true,
              sequence: true,
            },
            orderBy: [{ priority: 'desc' }, { sequence: 'asc' }],
          },
        },
        orderBy: [{ office: { name: 'asc' } }, { service: { name: 'asc' } }],
      }),
      this.prisma.counter.findMany({
        where: {
          isActive: true,
          ...(officeIds ? { officeId: { in: officeIds } } : {}),
          ...(actor.role === 'STAFF'
            ? { staffAssignments: { some: { userId: actor.userId } } }
            : {}),
        },
        select: { id: true, officeId: true, name: true, code: true },
        orderBy: [{ officeId: 'asc' }, { name: 'asc' }],
      }),
    ]);

    return sessions.map((session) => ({
      id: session.id,
      status: session.status,
      sessionDate: session.sessionDate,
      office: session.office,
      service: session.service,
      waitingCount: session.tickets.filter(
        (ticket) => ticket.status === QueueTicketStatus.WAITING,
      ).length,
      currentTickets: session.tickets
        .filter(
          (ticket) =>
            ticket.status === QueueTicketStatus.CALLED ||
            ticket.status === QueueTicketStatus.SERVING,
        )
        .map(({ id, queueNumber, status, counterId }) => ({
          id,
          queueNumber,
          status,
          counterId,
        })),
      counters: counters.filter(
        (counter) => counter.officeId === session.officeId,
      ),
    }));
  }

  async callNext(sessionId: string, counterId: string, actor: QueueActor) {
    return this.serializableTransaction(async (tx) => {
      const session = await tx.queueSession.findUnique({
        where: { id: sessionId },
        select: { id: true, officeId: true, status: true },
      });
      if (!session) {
        throw new NotFoundException('Queue session not found');
      }
      await this.assertOfficeAccess(tx, session.officeId, actor);
      if (session.status !== QueueSessionStatus.OPEN) {
        throw new ConflictException('This service queue is not open');
      }

      const counter = await tx.counter.findFirst({
        where: { id: counterId, officeId: session.officeId, isActive: true },
        select: { id: true, code: true },
      });
      if (!counter) {
        throw new NotFoundException('Active counter not found in this office');
      }
      await this.assertCounterAccess(tx, counterId, actor);

      const counterHasCurrentTicket = await tx.queueTicket.findFirst({
        where: {
          counterId,
          status: { in: [QueueTicketStatus.CALLED, QueueTicketStatus.SERVING] },
        },
        select: { id: true },
      });
      if (counterHasCurrentTicket) {
        throw new ConflictException(
          'Resolve the current called or serving ticket before calling another',
        );
      }

      const nextTicket = await tx.queueTicket.findFirst({
        where: { sessionId, status: QueueTicketStatus.WAITING },
        orderBy: [{ priority: 'desc' }, { sequence: 'asc' }],
      });
      if (!nextTicket) {
        throw new NotFoundException('There are no waiting tickets');
      }

      const changed = await tx.queueTicket.updateMany({
        where: { id: nextTicket.id, status: QueueTicketStatus.WAITING },
        data: {
          status: QueueTicketStatus.CALLED,
          counterId,
          calledById: actor.userId,
          calledAt: new Date(),
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException(
          'The next ticket was changed by another staff member',
        );
      }

      if (nextTicket.appointmentId) {
        await tx.appointment.updateMany({
          where: { id: nextTicket.appointmentId },
          data: { status: AppointmentStatus.called },
        });
      }

      await tx.notification.create({
        data: {
          userId: nextTicket.userId,
          message: `Your queue number ${nextTicket.queueNumber} is called at counter ${counter.code}.`,
        },
      });
      await this.logAction(
        tx,
        actor.userId,
        'QUEUE_CALLED',
        `Called ticket ${nextTicket.queueNumber} at counter ${counter.code}`,
      );

      return tx.queueTicket.findUnique({
        where: { id: nextTicket.id },
        include: { counter: true },
      });
    });
  }

  pauseSession(sessionId: string, actor: QueueActor) {
    return this.changeSessionStatus(
      sessionId,
      actor,
      [QueueSessionStatus.OPEN],
      QueueSessionStatus.PAUSED,
      'QUEUE_SESSION_PAUSED',
    );
  }

  resumeSession(sessionId: string, actor: QueueActor) {
    return this.changeSessionStatus(
      sessionId,
      actor,
      [QueueSessionStatus.PAUSED],
      QueueSessionStatus.OPEN,
      'QUEUE_SESSION_RESUMED',
    );
  }

  closeSession(sessionId: string, actor: QueueActor) {
    return this.changeSessionStatus(
      sessionId,
      actor,
      [QueueSessionStatus.OPEN, QueueSessionStatus.PAUSED],
      QueueSessionStatus.CLOSED,
      'QUEUE_SESSION_CLOSED',
    );
  }

  recall(ticketId: string, actor: QueueActor) {
    return this.changeTicket(
      ticketId,
      actor,
      [QueueTicketStatus.CALLED],
      {
        calledAt: new Date(),
      },
      'QUEUE_RECALLED',
      (ticket) => `Your queue number ${ticket.queueNumber} is being recalled.`,
    );
  }

  startServing(ticketId: string, actor: QueueActor) {
    return this.changeTicket(
      ticketId,
      actor,
      [QueueTicketStatus.CALLED],
      {
        status: QueueTicketStatus.SERVING,
        servingStartedAt: new Date(),
        servedById: actor.userId,
      },
      'QUEUE_SERVING',
      (ticket) => `Service has started for queue number ${ticket.queueNumber}.`,
    );
  }

  complete(ticketId: string, actor: QueueActor) {
    return this.changeTicket(
      ticketId,
      actor,
      [QueueTicketStatus.SERVING],
      { status: QueueTicketStatus.COMPLETED, completedAt: new Date() },
      'QUEUE_COMPLETED',
      (ticket) => `Service is complete for queue number ${ticket.queueNumber}.`,
    );
  }

  skip(ticketId: string, actor: QueueActor) {
    return this.changeTicket(
      ticketId,
      actor,
      [QueueTicketStatus.WAITING, QueueTicketStatus.CALLED],
      { status: QueueTicketStatus.SKIPPED, skippedAt: new Date() },
      'QUEUE_SKIPPED',
      (ticket) => `Queue number ${ticket.queueNumber} was skipped.`,
    );
  }

  markNoShow(ticketId: string, actor: QueueActor) {
    return this.changeTicket(
      ticketId,
      actor,
      [QueueTicketStatus.CALLED],
      { status: QueueTicketStatus.NO_SHOW, noShowAt: new Date() },
      'QUEUE_NO_SHOW',
      (ticket) => `Queue number ${ticket.queueNumber} was marked as no-show.`,
    );
  }

  private async changeTicket(
    ticketId: string,
    actor: QueueActor,
    expectedStatuses: QueueTicketStatus[],
    data: Prisma.QueueTicketUncheckedUpdateManyInput,
    action: string,
    notificationMessage: (ticket: { queueNumber: string }) => string,
  ) {
    return this.serializableTransaction(async (tx) => {
      const ticket = await tx.queueTicket.findUnique({
        where: { id: ticketId },
        include: { session: { select: { officeId: true } } },
      });

      if (!ticket) {
        throw new NotFoundException('Queue ticket not found');
      }
      await this.assertOfficeAccess(tx, ticket.session.officeId, actor);
      if (!expectedStatuses.includes(ticket.status)) {
        throw new BadRequestException(
          `Ticket in ${ticket.status} status cannot perform this action`,
        );
      }
      if (ticket.counterId) {
        await this.assertCounterAccess(tx, ticket.counterId, actor);
      }

      const changed = await tx.queueTicket.updateMany({
        where: { id: ticketId, status: ticket.status },
        data,
      });
      if (changed.count !== 1) {
        throw new ConflictException(
          'The ticket was changed by another staff member',
        );
      }

      const appointmentStatus = this.appointmentStatusForQueueStatus(
        data.status as QueueTicketStatus | undefined,
      );
      if (ticket.appointmentId && appointmentStatus) {
        await tx.appointment.updateMany({
          where: { id: ticket.appointmentId },
          data: { status: appointmentStatus },
        });
      }

      await tx.notification.create({
        data: { userId: ticket.userId, message: notificationMessage(ticket) },
      });
      await this.logAction(
        tx,
        actor.userId,
        action,
        `${action} for ticket ${ticket.queueNumber}`,
      );

      return tx.queueTicket.findUnique({
        where: { id: ticketId },
        include: { counter: true },
      });
    });
  }

  private async changeSessionStatus(
    sessionId: string,
    actor: QueueActor,
    expectedStatuses: QueueSessionStatus[],
    status: QueueSessionStatus,
    action: string,
  ) {
    return this.serializableTransaction(async (tx) => {
      const session = await tx.queueSession.findUnique({
        where: { id: sessionId },
        select: { id: true, officeId: true, status: true },
      });
      if (!session) {
        throw new NotFoundException('Queue session not found');
      }
      await this.assertOfficeAccess(tx, session.officeId, actor);
      if (!expectedStatuses.includes(session.status)) {
        throw new BadRequestException(
          `Queue session in ${session.status} status cannot transition to ${status}`,
        );
      }

      if (status === QueueSessionStatus.CLOSED) {
        const activeTicket = await tx.queueTicket.findFirst({
          where: {
            sessionId,
            status: {
              in: [
                QueueTicketStatus.WAITING,
                QueueTicketStatus.CALLED,
                QueueTicketStatus.SERVING,
              ],
            },
          },
          select: { id: true },
        });
        if (activeTicket) {
          throw new ConflictException(
            'Resolve active tickets before closing this queue',
          );
        }
      }

      const changed = await tx.queueSession.updateMany({
        where: { id: sessionId, status: session.status },
        data: {
          status,
          ...(status === QueueSessionStatus.CLOSED
            ? { closedAt: new Date() }
            : {}),
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException(
          'The queue session was changed by another staff member',
        );
      }
      await this.logAction(
        tx,
        actor.userId,
        action,
        `${action} for session ${sessionId}`,
      );
      return tx.queueSession.findUnique({ where: { id: sessionId } });
    });
  }

  private async updateTicketState(
    tx: QueueTransaction,
    ticket: {
      id: string;
      queueNumber: string;
      userId: string;
      status: QueueTicketStatus;
    },
    status: QueueTicketStatus,
    extraData: Prisma.QueueTicketUncheckedUpdateManyInput,
    actor: QueueActor,
    action: string,
  ) {
    const changed = await tx.queueTicket.updateMany({
      where: { id: ticket.id, status: ticket.status },
      data: { ...extraData, status },
    });
    if (changed.count !== 1) {
      throw new ConflictException('The ticket was changed by another user');
    }

    const ticketWithAppointment = await tx.queueTicket.findUnique({
      where: { id: ticket.id },
      select: { appointmentId: true },
    });
    const appointmentStatus = this.appointmentStatusForQueueStatus(status);
    if (ticketWithAppointment?.appointmentId && appointmentStatus) {
      await tx.appointment.updateMany({
        where: { id: ticketWithAppointment.appointmentId },
        data: { status: appointmentStatus },
      });
    }

    await this.logAction(
      tx,
      actor.userId,
      action,
      `${action} for ticket ${ticket.queueNumber}`,
    );
    return tx.queueTicket.findUnique({ where: { id: ticket.id } });
  }

  private async assertOfficeAccess(
    tx: QueueTransaction | PrismaService,
    officeId: string,
    actor: QueueActor,
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

  private async assertCounterAccess(
    tx: QueueTransaction,
    counterId: string,
    actor: QueueActor,
  ) {
    if (actor.role === 'ADMIN') return;
    const assignment = await tx.counterStaff.findUnique({
      where: { counterId_userId: { counterId, userId: actor.userId } },
      select: { counterId: true },
    });
    if (!assignment) {
      throw new ForbiddenException('You are not assigned to this counter');
    }
  }

  private async logAction(
    tx: QueueTransaction,
    userId: string,
    action: string,
    description: string,
  ) {
    await tx.activityLog.create({ data: { userId, action, description } });
  }

  private appointmentStatusForQueueStatus(status?: QueueTicketStatus) {
    const map: Partial<Record<QueueTicketStatus, AppointmentStatus>> = {
      [QueueTicketStatus.CALLED]: AppointmentStatus.called,
      [QueueTicketStatus.CANCELLED]: AppointmentStatus.cancelled,
      [QueueTicketStatus.SERVING]: AppointmentStatus.serving,
      [QueueTicketStatus.COMPLETED]: AppointmentStatus.served,
      [QueueTicketStatus.SKIPPED]: AppointmentStatus.skipped,
      [QueueTicketStatus.NO_SHOW]: AppointmentStatus.no_show,
    };
    return status ? map[status] : undefined;
  }

  private async serializableTransaction<T>(
    operation: (tx: QueueTransaction) => Promise<T>,
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
        ['P2002', 'P2034'].includes(error.code)
      ) {
        return this.serializableTransaction(operation, retries - 1);
      }
      throw error;
    }
  }

  private campusDate(): Date {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: process.env.CAMPUS_TIME_ZONE || 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((item) => item.type === type)?.value;
    const year = Number(part('year'));
    const month = Number(part('month'));
    const day = Number(part('day'));
    return new Date(Date.UTC(year, month - 1, day));
  }
}
