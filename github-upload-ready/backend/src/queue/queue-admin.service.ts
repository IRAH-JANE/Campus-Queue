import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCounterDto } from './dto/create-counter.dto';
import { UpdateCounterDto } from './dto/update-counter.dto';

@Injectable()
export class QueueAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async assignStaffToOffice(officeId: string, userId: string) {
    await this.ensureActiveOffice(officeId);
    await this.ensureStaffUser(userId);

    return this.prisma.officeStaff.upsert({
      where: { officeId_userId: { officeId, userId } },
      create: { officeId, userId },
      update: {},
    });
  }

  async removeStaffFromOffice(officeId: string, userId: string) {
    await this.ensureActiveOffice(officeId);

    return this.prisma.officeStaff.deleteMany({ where: { officeId, userId } });
  }

  async listOfficeStaff(officeId: string) {
    await this.ensureActiveOffice(officeId);
    return this.prisma.officeStaff.findMany({
      where: { officeId },
      include: {
        user: {
          select: { id: true, fullName: true, email: true, employeeId: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async listCounters(officeId: string) {
    await this.ensureActiveOffice(officeId);

    return this.prisma.counter.findMany({
      where: { officeId },
      include: {
        staffAssignments: {
          include: {
            user: { select: { id: true, fullName: true, employeeId: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async createCounter(officeId: string, dto: CreateCounterDto) {
    await this.ensureActiveOffice(officeId);

    return this.prisma.counter.create({ data: { ...dto, officeId } });
  }

  async updateCounter(counterId: string, dto: UpdateCounterDto) {
    const counter = await this.prisma.counter.findUnique({
      where: { id: counterId },
      select: { id: true },
    });
    if (!counter) {
      throw new NotFoundException('Counter not found');
    }

    return this.prisma.counter.update({ where: { id: counterId }, data: dto });
  }

  async assignStaffToCounter(counterId: string, userId: string) {
    const counter = await this.prisma.counter.findUnique({
      where: { id: counterId },
      select: { id: true, officeId: true, isActive: true },
    });
    if (!counter || !counter.isActive) {
      throw new NotFoundException('Active counter not found');
    }
    await this.ensureStaffUser(userId);

    const officeAssignment = await this.prisma.officeStaff.findUnique({
      where: { officeId_userId: { officeId: counter.officeId, userId } },
      select: { officeId: true },
    });
    if (!officeAssignment) {
      throw new BadRequestException(
        'Assign the staff member to this office first',
      );
    }

    return this.prisma.counterStaff.upsert({
      where: { counterId_userId: { counterId, userId } },
      create: { counterId, userId },
      update: {},
    });
  }

  async removeStaffFromCounter(counterId: string, userId: string) {
    const counter = await this.prisma.counter.findUnique({
      where: { id: counterId },
      select: { id: true },
    });
    if (!counter) {
      throw new NotFoundException('Counter not found');
    }

    return this.prisma.counterStaff.deleteMany({
      where: { counterId, userId },
    });
  }

  private async ensureActiveOffice(officeId: string) {
    const office = await this.prisma.office.findFirst({
      where: { id: officeId, isActive: true },
      select: { id: true },
    });
    if (!office) {
      throw new NotFoundException('Active office not found');
    }
  }

  private async ensureStaffUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.role !== Role.STAFF) {
      throw new BadRequestException(
        'Only staff users can be assigned to offices or counters',
      );
    }
  }
}
