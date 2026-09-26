import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateOfficeClosedDateDto,
  ReplaceOfficeHoursDto,
} from './dto/replace-office-hours.dto';

type OfficeActor = { userId: string; role: 'STAFF' | 'ADMIN' };

@Injectable()
export class OfficeHoursService {
  constructor(private readonly prisma: PrismaService) {}

  async findHours(officeId: string, actor: OfficeActor) {
    await this.assertOfficeAccess(officeId, actor);
    return this.prisma.officeHours.findMany({
      where: { officeId },
      orderBy: { dayOfWeek: 'asc' },
    });
  }

  async replaceHours(
    officeId: string,
    actor: OfficeActor,
    dto: ReplaceOfficeHoursDto,
  ) {
    await this.assertOfficeAccess(officeId, actor);
    const days = new Set(dto.hours.map((item) => item.dayOfWeek));
    if (days.size !== 7) {
      throw new ConflictException('Provide exactly one entry for each weekday');
    }

    for (const day of dto.hours) {
      if (day.isClosed) continue;
      if (!day.openTime || !day.closeTime || day.openTime >= day.closeTime) {
        throw new ConflictException(
          'Opening time must be earlier than closing time',
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      for (const day of dto.hours) {
        await tx.officeHours.upsert({
          where: { officeId_dayOfWeek: { officeId, dayOfWeek: day.dayOfWeek } },
          create: {
            officeId,
            dayOfWeek: day.dayOfWeek,
            isClosed: day.isClosed,
            openTime: day.isClosed ? null : day.openTime,
            closeTime: day.isClosed ? null : day.closeTime,
          },
          update: {
            isClosed: day.isClosed,
            openTime: day.isClosed ? null : day.openTime,
            closeTime: day.isClosed ? null : day.closeTime,
          },
        });
      }
    });

    return this.prisma.officeHours.findMany({
      where: { officeId },
      orderBy: { dayOfWeek: 'asc' },
    });
  }

  async findClosedDates(officeId: string, actor: OfficeActor) {
    await this.assertOfficeAccess(officeId, actor);
    return this.prisma.officeClosedDate.findMany({
      where: { officeId },
      orderBy: { closedDate: 'asc' },
      take: 100,
    });
  }

  async addClosedDate(
    officeId: string,
    actor: OfficeActor,
    dto: CreateOfficeClosedDateDto,
  ) {
    await this.assertOfficeAccess(officeId, actor);
    const date = this.parseDate(dto.closedDate);
    try {
      return await this.prisma.officeClosedDate.create({
        data: {
          officeId,
          closedDate: date,
          reason: dto.reason?.trim() || null,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('This date is already marked as closed');
      }
      throw error;
    }
  }

  async removeClosedDate(
    officeId: string,
    closedDateId: string,
    actor: OfficeActor,
  ) {
    await this.assertOfficeAccess(officeId, actor);
    const result = await this.prisma.officeClosedDate.deleteMany({
      where: { id: closedDateId, officeId },
    });
    if (result.count === 0) {
      throw new NotFoundException('Closed date not found');
    }
    return { deleted: true };
  }

  private async assertOfficeAccess(officeId: string, actor: OfficeActor) {
    const office = await this.prisma.office.findUnique({
      where: { id: officeId },
      select: { id: true },
    });
    if (!office) throw new NotFoundException('Office not found');
    if (actor.role === 'ADMIN') return;

    const assignment = await this.prisma.officeStaff.findUnique({
      where: { officeId_userId: { officeId, userId: actor.userId } },
      select: { officeId: true },
    });
    if (!assignment) {
      throw new ForbiddenException('You are not assigned to this office');
    }
  }

  private parseDate(value: string): Date {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
    ) {
      throw new ConflictException('Closed date is invalid');
    }
    return date;
  }
}
