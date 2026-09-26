import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createServiceDto: CreateServiceDto) {
    await this.ensureActiveOffice(createServiceDto.officeId);

    return this.prisma.service.create({
      data: createServiceDto,
      include: { office: true },
    });
  }

  findAll(officeId?: string) {
    return this.prisma.service.findMany({
      where: {
        isActive: true,
        ...(officeId ? { officeId } : {}),
      },
      include: { office: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const service = await this.prisma.service.findFirst({
      where: { id, isActive: true },
      include: { office: true },
    });

    if (!service) {
      throw new NotFoundException('Service not found');
    }

    return service;
  }

  async update(id: string, updateServiceDto: UpdateServiceDto) {
    await this.findOne(id);

    if (updateServiceDto.officeId) {
      await this.ensureActiveOffice(updateServiceDto.officeId);
    }

    return this.prisma.service.update({
      where: { id },
      data: updateServiceDto,
      include: { office: true },
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.service.update({
      where: { id },
      data: { isActive: false },
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
}
