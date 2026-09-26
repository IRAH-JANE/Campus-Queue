import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { AppointmentsService } from '../src/appointments/appointments.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Appointments API (e2e)', () => {
  let app: INestApplication<App>;
  let moduleRef: TestingModule;
  let appointmentsService: {
    create: jest.Mock;
    findMine: jest.Mock;
    cancel: jest.Mock;
    checkIn: jest.Mock;
    reschedule: jest.Mock;
    findForOffice: jest.Mock;
    approve: jest.Mock;
  };
  const originalJwtSecret = process.env.JWT_SECRET;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'appointments-e2e-test-secret';
    appointmentsService = {
      create: jest.fn().mockResolvedValue({ id: 'appointment-1' }),
      findMine: jest.fn().mockResolvedValue([]),
      cancel: jest.fn().mockResolvedValue({ id: 'appointment-1' }),
      checkIn: jest.fn().mockResolvedValue({ id: 'ticket-1' }),
      reschedule: jest.fn().mockResolvedValue({ id: 'appointment-1' }),
      findForOffice: jest.fn().mockResolvedValue([]),
      approve: jest.fn().mockResolvedValue({ id: 'appointment-1' }),
    };

    moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ $connect: jest.fn(), $disconnect: jest.fn() })
      .overrideProvider(AppointmentsService)
      .useValue(appointmentsService)
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
    jest.clearAllMocks();
  });

  it('allows students to request a valid appointment', async () => {
    const token = await tokenFor('STUDENT');
    const dto = {
      serviceId: 'service-1',
      appointmentDate: '2030-06-14',
      appointmentTime: '09:30',
      purpose: 'Transcript request',
    };

    await request(app.getHttpServer())
      .post('/appointments')
      .set('Authorization', `Bearer ${token}`)
      .send(dto)
      .expect(201)
      .expect({ id: 'appointment-1' });

    expect(appointmentsService.create).toHaveBeenCalledWith(
      'test-user',
      expect.objectContaining(dto),
    );
  });

  it('rejects invalid appointment dates and times at the HTTP boundary', async () => {
    const token = await tokenFor('STUDENT');

    await request(app.getHttpServer())
      .post('/appointments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        serviceId: 'service-1',
        appointmentDate: '2030-02-30',
        appointmentTime: '09:30',
      })
      .expect(400);
    await request(app.getHttpServer())
      .post('/appointments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        serviceId: 'service-1',
        appointmentDate: '2030-06-14',
        appointmentTime: '25:99',
      })
      .expect(400);
    await request(app.getHttpServer())
      .post('/appointments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        serviceId: 'service-1',
        appointmentDate: '2030-06-14',
        appointmentTime: '09:30',
        userId: 'someone-else',
      })
      .expect(400);

    expect(appointmentsService.create).not.toHaveBeenCalled();
  });

  it('blocks non-students from creating appointments', async () => {
    const token = await tokenFor('ADMIN');

    await request(app.getHttpServer())
      .post('/appointments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        serviceId: 'service-1',
        appointmentDate: '2030-06-14',
        appointmentTime: '09:30',
      })
      .expect(403);

    expect(appointmentsService.create).not.toHaveBeenCalled();
  });

  it('scopes student listing and cancellation to the authenticated user', async () => {
    const token = await tokenFor('STUDENT');

    await request(app.getHttpServer())
      .get('/appointments/mine')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect([]);
    await request(app.getHttpServer())
      .patch('/appointments/appointment-1/cancel')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(appointmentsService.findMine).toHaveBeenCalledWith('test-user');
    expect(appointmentsService.cancel).toHaveBeenCalledWith(
      'appointment-1',
      'test-user',
    );
  });

  it('allows students to reschedule their appointment and validates the payload', async () => {
    const token = await tokenFor('STUDENT');
    const dto = {
      serviceId: 'service-1',
      appointmentDate: '2030-06-14',
      appointmentTime: '10:00',
    };

    await request(app.getHttpServer())
      .patch('/appointments/appointment-1/reschedule')
      .set('Authorization', `Bearer ${token}`)
      .send(dto)
      .expect(200)
      .expect({ id: 'appointment-1' });
    expect(appointmentsService.reschedule).toHaveBeenCalledWith(
      'appointment-1',
      'test-user',
      expect.objectContaining(dto),
    );

    await request(app.getHttpServer())
      .patch('/appointments/appointment-1/reschedule')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...dto, appointmentDate: '2030-02-30' })
      .expect(400);
  });

  it('allows staff office listing while rejecting students from that endpoint', async () => {
    const staffToken = await tokenFor('STAFF');
    await request(app.getHttpServer())
      .get('/appointments/office/office-1?date=2030-06-14')
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);
    expect(appointmentsService.findForOffice).toHaveBeenCalledWith(
      'office-1',
      expect.objectContaining({ userId: 'test-user', role: 'STAFF' }),
      '2030-06-14',
    );

    const studentToken = await tokenFor('STUDENT');
    await request(app.getHttpServer())
      .get('/appointments/office/office-1')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(403);
  });

  async function tokenFor(role: string): Promise<string> {
    return moduleRef.get(JwtService).signAsync({
      sub: 'test-user',
      email: 'test@example.edu',
      role,
    });
  }
});
