import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOfficeDto } from './dto/create-office.dto';
import { UpdateOfficeDto } from './dto/update-office.dto';

@Injectable()
export class OfficesService {
  constructor(private prisma: PrismaService) {}

  async create(createOfficeDto: CreateOfficeDto) {
    try {
      return await this.prisma.office.create({
        data: createOfficeDto,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'An office with this code already exists. Choose a different code.',
        );
      }
      throw error;
    }
  }

  findAll() {
    return this.prisma.office.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findAssignedToStaff(userId: string) {
    const assignments = await this.prisma.officeStaff.findMany({
      where: { userId },
      include: { office: true },
      orderBy: { createdAt: 'asc' },
    });
    return assignments.map((assignment) => assignment.office);
  }

  async findOne(id: string) {
    const office = await this.prisma.office.findUnique({
      where: { id },
    });

    if (!office) {
      throw new NotFoundException('Office not found');
    }

    return office;
  }

  async update(id: string, updateOfficeDto: UpdateOfficeDto) {
    await this.findOne(id);

    return this.prisma.office.update({
      where: { id },
      data: updateOfficeDto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.office.update({
      where: { id },
      data: {
        isActive: false,
      },
    });
  }
}
