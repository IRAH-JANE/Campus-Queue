import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { OfficesService } from '../src/offices/offices.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ServicesService } from '../src/services/services.service';
import { UsersService } from '../src/users/users.service';

describe('P0 backend foundation hardening (e2e)', () => {
  let app: INestApplication<App>;
  let moduleRef: TestingModule;
  let usersByEmail: Map<string, Record<string, unknown>>;
  let createUser: jest.Mock;
  let officeCreate: jest.Mock;
  let serviceCreate: jest.Mock;
  const originalJwtSecret = process.env.JWT_SECRET;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'p0-hardening-test-secret';

    usersByEmail = new Map();
    createUser = jest.fn((data: Record<string, unknown>) => {
      const user = {
        id: `user-${usersByEmail.size + 1}`,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      };
      usersByEmail.set(String(user.email), user);
      return user;
    });
    const usersService = {
      findByEmail: jest.fn((email: string) => usersByEmail.get(email) ?? null),
      createUser,
    };

    officeCreate = jest.fn((dto: Record<string, unknown>) => ({
      id: 'office-1',
      ...dto,
    }));
    const officeUpdate = jest.fn(
      (_id: string, dto: Record<string, unknown>) => ({
        id: 'office-1',
        ...dto,
      }),
    );
    const officeRemove = jest.fn((id: string) => ({
      id,
      isActive: false,
    }));
    serviceCreate = jest.fn((dto: Record<string, unknown>) => ({
      id: 'service-1',
      ...dto,
    }));
    const serviceUpdate = jest.fn(
      (_id: string, dto: Record<string, unknown>) => ({
        id: 'service-1',
        ...dto,
      }),
    );
    const serviceRemove = jest.fn((id: string) => ({
      id,
      isActive: false,
    }));

    moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ $connect: jest.fn(), $disconnect: jest.fn() })
      .overrideProvider(UsersService)
      .useValue(usersService)
      .overrideProvider(OfficesService)
      .useValue({
        create: officeCreate,
        update: officeUpdate,
        remove: officeRemove,
      })
      .overrideProvider(ServicesService)
      .useValue({
        create: serviceCreate,
        update: serviceUpdate,
        remove: serviceRemove,
      })
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
    usersByEmail.clear();
    createUser.mockClear();
    officeCreate.mockClear();
    serviceCreate.mockClear();
  });

  it('registers a student account', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        fullName: 'Ari Student',
        email: 'ari@example.edu',
        password: 'correct-horse-123',
      });
    expect(response.status).toBe(201);

    const body = response.body as {
      user: { role: string; password?: string };
    };
    expect(body.user.role).toBe('STUDENT');
    expect(body.user.password).toBeUndefined();
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'STUDENT' }),
    );
  });

  it.each(['ADMIN', 'STAFF'])(
    'rejects public registration that requests role %s',
    async (role) => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          fullName: 'Ari Student',
          email: 'ari@example.edu',
          password: 'correct-horse-123',
          role,
        })
        .expect(400);

      expect(createUser).not.toHaveBeenCalled();
    },
  );

  it('rejects invalid registration input', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ fullName: '', email: 'not-an-email', password: 'short' })
      .expect(400);

    expect(createUser).not.toHaveBeenCalled();
  });

  it('rejects invalid login input', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'not-an-email', password: '' })
      .expect(400);
  });

  it('rejects invalid office and service DTO input', async () => {
    const token = await tokenFor('ADMIN');

    await request(app.getHttpServer())
      .post('/offices')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 123, code: 'bad code' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/services')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Transcript', officeId: 'office-1', durationMinutes: 1.5 })
      .expect(400);

    expect(officeCreate).not.toHaveBeenCalled();
    expect(serviceCreate).not.toHaveBeenCalled();
  });

  it('allows ADMIN to use protected office and service operations', async () => {
    const token = await tokenFor('ADMIN');

    await request(app.getHttpServer())
      .post('/offices')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Registrar', code: 'REG' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/services')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Transcript', officeId: 'office-1' })
      .expect(201);
    await request(app.getHttpServer())
      .patch('/offices/office-1')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Registrar Office' })
      .expect(200);
    await request(app.getHttpServer())
      .delete('/offices/office-1')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    await request(app.getHttpServer())
      .patch('/services/service-1')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Transcript Request' })
      .expect(200);
    await request(app.getHttpServer())
      .delete('/services/service-1')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(officeCreate).toHaveBeenCalledTimes(1);
    expect(serviceCreate).toHaveBeenCalledTimes(1);
  });

  it.each(['STUDENT', 'STAFF'])(
    'blocks %s from ADMIN-only office and service operations',
    async (role) => {
      const token = await tokenFor(role);

      await request(app.getHttpServer())
        .post('/offices')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Registrar', code: 'REG' })
        .expect(403);
      await request(app.getHttpServer())
        .post('/services')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Transcript', officeId: 'office-1' })
        .expect(403);
      await request(app.getHttpServer())
        .patch('/offices/office-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Registrar Office' })
        .expect(403);
      await request(app.getHttpServer())
        .delete('/offices/office-1')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
      await request(app.getHttpServer())
        .patch('/services/service-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Transcript Request' })
        .expect(403);
      await request(app.getHttpServer())
        .delete('/services/service-1')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      expect(officeCreate).not.toHaveBeenCalled();
      expect(serviceCreate).not.toHaveBeenCalled();
    },
  );

  it('fails clearly when JWT_SECRET is missing', () => {
    const configuredSecret = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;

    try {
      expect(() => new JwtStrategy()).toThrow(
        'JWT_SECRET is required. Set JWT_SECRET in the backend environment before starting the application.',
      );
    } finally {
      if (configuredSecret === undefined) {
        delete process.env.JWT_SECRET;
      } else {
        process.env.JWT_SECRET = configuredSecret;
      }
    }
  });

  async function tokenFor(role: string): Promise<string> {
    return moduleRef.get(JwtService).signAsync({
      sub: 'test-user',
      email: 'test@example.edu',
      role,
    });
  }
});
