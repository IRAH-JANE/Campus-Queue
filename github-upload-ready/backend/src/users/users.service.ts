import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  listStaff() {
    return this.prisma.user.findMany({
      where: { role: Role.STAFF },
      select: { id: true, fullName: true, email: true, employeeId: true },
      orderBy: { fullName: 'asc' },
    });
  }

  async createUser(data: {
    fullName: string;
    email: string;
    password: string;
    role?: Role;
    studentId?: string;
    employeeId?: string;
  }) {
    return this.prisma.user.create({
      data,
    });
  }
}
