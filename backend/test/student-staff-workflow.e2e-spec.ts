import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { AppointmentsService } from '../src/appointments/appointments.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { QueueService } from '../src/queue/queue.service';

type AppointmentRecord = {
  id: string;
  userId: string;
  serviceId: string;
  officeId: string;
  appointmentDate: string;
  appointmentTime: string;
  purpose?: string;
  status: string;
  queueNumber?: string;
};

type TicketRecord = {
  id: string;
  userId: string;
  appointmentId?: string;
  sessionId: string;
  queueNumber: string;
  status: string;
};

type WorkflowActor = { userId: string; role: 'STUDENT' | 'STAFF' | 'ADMIN' };
type AppointmentInput = {
  serviceId: string;
  appointmentDate: string;
  appointmentTime: string;
  purpose?: string;
};
type QueueJoinInput = { serviceId: string; appointmentId?: string };
type NotificationRecord = {
  id: string;
  userId: string;
  message: string;
  isRead: boolean;
};
type QueueMocks = {
  join: jest.Mock<TicketRecord, [WorkflowActor, QueueJoinInput]>;
  findMine: jest.Mock<TicketRecord[], [string]>;
  findSessionTickets: jest.Mock<TicketRecord[], [string, WorkflowActor]>;
  callNext: jest.Mock<TicketRecord | null, [string, string, WorkflowActor]>;
  startServing: jest.Mock<TicketRecord | null, [string, WorkflowActor]>;
  complete: jest.Mock<TicketRecord | null, [string, WorkflowActor]>;
  skip: jest.Mock<TicketRecord | null, [string, WorkflowActor]>;
};
type AppointmentMocks = {
  create: jest.Mock<AppointmentRecord, [string, AppointmentInput]>;
  findMine: jest.Mock<AppointmentRecord[], [string]>;
  findForOffice: jest.Mock<
    AppointmentRecord[],
    [string, WorkflowActor, string?]
  >;
  approve: jest.Mock<AppointmentRecord | null, [string, WorkflowActor]>;
  checkIn: jest.Mock<Promise<TicketRecord | null>, [string, string]>;
};

describe('Student and staff workflow (e2e)', () => {
  let app: INestApplication<App>;
  let moduleRef: TestingModule;
  let appointments: AppointmentRecord[];
  let tickets: TicketRecord[];
  let notifications: NotificationRecord[];
  let appointmentsService: AppointmentMocks;
  let queueService: QueueMocks;
  let notificationsService: {
    findMine: jest.Mock<NotificationRecord[], [string]>;
    markRead: jest.Mock;
    markAllRead: jest.Mock;
  };
  const originalJwtSecret = process.env.JWT_SECRET;
  const studentId = 'student-1';
  const staffId = 'staff-1';

  beforeAll(async () => {
    process.env.JWT_SECRET = 'student-staff-workflow-e2e-secret';
    appointments = [];
    tickets = [];
    notifications = [];

    queueService = {
      join: jest.fn<TicketRecord, [WorkflowActor, QueueJoinInput]>(
        (actor, dto) => {
          const ticket: TicketRecord = {
            id: `ticket-${tickets.length + 1}`,
            userId: actor.userId,
            appointmentId: dto.appointmentId,
            sessionId: 'session-1',
            queueNumber: `LTO-${String(tickets.length + 1).padStart(3, '0')}`,
            status: 'WAITING',
          };
          tickets.push(ticket);
          return ticket;
        },
      ),
      findMine: jest.fn<TicketRecord[], [string]>((userId) =>
        tickets.filter(
          (ticket) =>
            ticket.userId === userId &&
            ['WAITING', 'CALLED', 'SERVING'].includes(ticket.status),
        ),
      ),
      findSessionTickets: jest.fn<TicketRecord[], [string, WorkflowActor]>(
        () => tickets,
      ),
      callNext: jest.fn<TicketRecord | null, [string, string, WorkflowActor]>(
        () => {
          const ticket = tickets.find((item) => item.status === 'WAITING');
          if (!ticket) return null;
          ticket.status = 'CALLED';
          return ticket;
        },
      ),
      startServing: jest.fn<TicketRecord | null, [string, WorkflowActor]>(
        (ticketId) => {
          const ticket = tickets.find((item) => item.id === ticketId);
          if (!ticket) return null;
          ticket.status = 'SERVING';
          return ticket;
        },
      ),
      complete: jest.fn<TicketRecord | null, [string, WorkflowActor]>(
        (ticketId) => {
          const ticket = tickets.find((item) => item.id === ticketId);
          if (!ticket) return null;
          ticket.status = 'COMPLETED';
          const appointment = appointments.find(
            (item) => item.id === ticket.appointmentId,
          );
          if (appointment) appointment.status = 'served';
          notifications.push({
            id: `notification-${notifications.length + 1}`,
            userId: ticket.userId,
            message: `Service is complete for queue number ${ticket.queueNumber}.`,
            isRead: false,
          });
          return ticket;
        },
      ),
      skip: jest.fn<TicketRecord | null, [string, WorkflowActor]>(
        (ticketId) => {
          const ticket = tickets.find((item) => item.id === ticketId);
          if (!ticket) return null;
          ticket.status = 'SKIPPED';
          const appointment = appointments.find(
            (item) => item.id === ticket.appointmentId,
          );
          if (appointment) appointment.status = 'skipped';
          return ticket;
        },
      ),
    };

    appointmentsService = {
      create: jest.fn<AppointmentRecord, [string, AppointmentInput]>(
        (userId, dto) => {
          const appointment: AppointmentRecord = {
            id: `appointment-${appointments.length + 1}`,
            userId,
            officeId: 'office-1',
            serviceId: dto.serviceId,
            appointmentDate: dto.appointmentDate,
            appointmentTime: dto.appointmentTime,
            purpose: dto.purpose,
            status: 'pending',
          };
          appointments.push(appointment);
          return appointment;
        },
      ),
      findMine: jest.fn<AppointmentRecord[], [string]>((userId) =>
        appointments.filter((appointment) => appointment.userId === userId),
      ),
      findForOffice: jest.fn<
        AppointmentRecord[],
        [string, WorkflowActor, string?]
      >((officeId) =>
        appointments.filter((appointment) => appointment.officeId === officeId),
      ),
      approve: jest.fn<AppointmentRecord | null, [string, WorkflowActor]>(
        (appointmentId) => {
          const appointment = appointments.find(
            (item) => item.id === appointmentId,
          );
          if (!appointment) return null;
          appointment.status = 'approved';
          notifications.push({
            id: `notification-${notifications.length + 1}`,
            userId: appointment.userId,
            message: 'Your appointment has been approved.',
            isRead: false,
          });
          return appointment;
        },
      ),
      checkIn: jest.fn<Promise<TicketRecord | null>, [string, string]>(
        (appointmentId, userId) => {
          const appointment = appointments.find(
            (item) => item.id === appointmentId && item.userId === userId,
          );
          if (!appointment) return null;
          const ticket = queueService.join(
            { userId, role: 'STUDENT' },
            { serviceId: appointment.serviceId, appointmentId },
          );
          appointment.status = 'waiting';
          appointment.queueNumber = ticket.queueNumber;
          return Promise.resolve(ticket);
        },
      ),
    };

    notificationsService = {
      findMine: jest.fn<NotificationRecord[], [string]>((userId) =>
        notifications.filter((item) => item.userId === userId),
      ),
      markRead: jest.fn(),
      markAllRead: jest.fn(),
    };

    moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ $connect: jest.fn(), $disconnect: jest.fn() })
      .overrideProvider(AppointmentsService)
      .useValue(appointmentsService)
      .overrideProvider(QueueService)
      .useValue(queueService)
      .overrideProvider(NotificationsService)
      .useValue(notificationsService)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        forbidUnknownValues: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    if (originalJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalJwtSecret;
    }
  });

  beforeEach(() => {
    appointments.splice(0);
    tickets.splice(0);
    notifications.splice(0);
    jest.clearAllMocks();
  });

  it('runs appointment request, approval, check-in, service, and notification flow across roles', async () => {
    const studentToken = await tokenFor(studentId, 'STUDENT');
    const staffToken = await tokenFor(staffId, 'STAFF');
    const appointmentDto = {
      serviceId: 'service-1',
      appointmentDate: '2030-06-14',
      appointmentTime: '09:30',
      purpose: 'Transcript request',
    };

    const createResponse = await request(app.getHttpServer())
      .post('/appointments')
      .set('Authorization', `Bearer ${studentToken}`)
      .send(appointmentDto)
      .expect(201);
    expect(createResponse.body).toMatchObject({
      id: 'appointment-1',
      userId: studentId,
      status: 'pending',
    });

    await request(app.getHttpServer())
      .get('/appointments/office/office-1?date=2030-06-14')
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200)
      .expect((response) => {
        const body = response.body as AppointmentRecord[];
        expect(body).toHaveLength(1);
        expect(body[0].id).toBe('appointment-1');
      });

    await request(app.getHttpServer())
      .patch('/appointments/appointment-1/approve')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .patch('/appointments/appointment-1/approve')
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200)
      .expect((response) => {
        expect((response.body as AppointmentRecord).status).toBe('approved');
      });

    await request(app.getHttpServer())
      .get('/notifications/mine')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual([
          expect.objectContaining({
            message: 'Your appointment has been approved.',
          }),
        ]);
      });

    const checkInResponse = await request(app.getHttpServer())
      .post('/appointments/appointment-1/check-in')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(201);
    expect(checkInResponse.body).toMatchObject({
      id: 'ticket-1',
      queueNumber: 'LTO-001',
      status: 'WAITING',
    });

    await request(app.getHttpServer())
      .post('/queue/sessions/session-1/call-next')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ counterId: 'counter-1' })
      .expect(403);

    await request(app.getHttpServer())
      .post('/queue/sessions/session-1/call-next')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ counterId: 'counter-1' })
      .expect(201)
      .expect((response) => {
        expect((response.body as TicketRecord).status).toBe('CALLED');
      });

    await request(app.getHttpServer())
      .patch('/queue/tickets/ticket-1/start')
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200)
      .expect((response) => {
        expect((response.body as TicketRecord).status).toBe('SERVING');
      });

    await request(app.getHttpServer())
      .patch('/queue/tickets/ticket-1/complete')
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200)
      .expect((response) => {
        expect((response.body as TicketRecord).status).toBe('COMPLETED');
      });

    await request(app.getHttpServer())
      .get('/appointments/mine')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200)
      .expect((response) => {
        const body = response.body as AppointmentRecord[];
        expect(body[0].status).toBe('served');
      });

    await request(app.getHttpServer())
      .get('/notifications/mine')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200)
      .expect((response) => {
        const body = response.body as NotificationRecord[];
        expect(body.map((item) => item.message)).toEqual(
          expect.arrayContaining([
            'Your appointment has been approved.',
            'Service is complete for queue number LTO-001.',
          ]),
        );
      });

    expect(appointmentsService.create).toHaveBeenCalledWith(
      studentId,
      expect.objectContaining(appointmentDto),
    );
    expect(queueService.join).toHaveBeenCalledWith(
      { userId: studentId, role: 'STUDENT' },
      { serviceId: 'service-1', appointmentId: 'appointment-1' },
    );
  });

  it('allows staff to skip a ticket while keeping student queue actions protected', async () => {
    const studentToken = await tokenFor(studentId, 'STUDENT');
    const staffToken = await tokenFor(staffId, 'STAFF');
    tickets.push({
      id: 'ticket-skip',
      userId: studentId,
      sessionId: 'session-1',
      queueNumber: 'LTO-009',
      status: 'WAITING',
    });

    await request(app.getHttpServer())
      .patch('/queue/tickets/ticket-skip/skip')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .patch('/queue/tickets/ticket-skip/skip')
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200)
      .expect((response) => {
        expect((response.body as TicketRecord).status).toBe('SKIPPED');
      });
  });

  async function tokenFor(userId: string, role: string): Promise<string> {
    return moduleRef.get(JwtService).signAsync({
      sub: userId,
      email: `${userId}@example.edu`,
      role,
    });
  }
});
