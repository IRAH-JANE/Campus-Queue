import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { OfficesService } from './offices.service';
import { CreateOfficeDto } from './dto/create-office.dto';
import { UpdateOfficeDto } from './dto/update-office.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { OfficeHoursService } from './office-hours.service';
import {
  CreateOfficeClosedDateDto,
  ReplaceOfficeHoursDto,
} from './dto/replace-office-hours.dto';

@Controller('offices')
export class OfficesController {
  constructor(
    private readonly officesService: OfficesService,
    private readonly officeHoursService: OfficeHoursService,
  ) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STAFF', 'ADMIN')
  @Get(':id/hours')
  findHours(
    @Request() request: { user: { userId: string; role: 'STAFF' | 'ADMIN' } },
    @Param('id') id: string,
  ) {
    return this.officeHoursService.findHours(id, request.user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STAFF', 'ADMIN')
  @Patch(':id/hours')
  replaceHours(
    @Request() request: { user: { userId: string; role: 'STAFF' | 'ADMIN' } },
    @Param('id') id: string,
    @Body() dto: ReplaceOfficeHoursDto,
  ) {
    return this.officeHoursService.replaceHours(id, request.user, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STAFF', 'ADMIN')
  @Get(':id/closed-dates')
  findClosedDates(
    @Request() request: { user: { userId: string; role: 'STAFF' | 'ADMIN' } },
    @Param('id') id: string,
  ) {
    return this.officeHoursService.findClosedDates(id, request.user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STAFF', 'ADMIN')
  @Post(':id/closed-dates')
  addClosedDate(
    @Request() request: { user: { userId: string; role: 'STAFF' | 'ADMIN' } },
    @Param('id') id: string,
    @Body() dto: CreateOfficeClosedDateDto,
  ) {
    return this.officeHoursService.addClosedDate(id, request.user, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STAFF', 'ADMIN')
  @Delete(':id/closed-dates/:closedDateId')
  removeClosedDate(
    @Request() request: { user: { userId: string; role: 'STAFF' | 'ADMIN' } },
    @Param('id') id: string,
    @Param('closedDateId') closedDateId: string,
  ) {
    return this.officeHoursService.removeClosedDate(
      id,
      closedDateId,
      request.user,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post()
  create(@Body() createOfficeDto: CreateOfficeDto) {
    return this.officesService.create(createOfficeDto);
  }

  @Get()
  findAll() {
    return this.officesService.findAll();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STAFF')
  @Get('mine')
  findAssignedToStaff(@Request() request: { user: { userId: string } }) {
    return this.officesService.findAssignedToStaff(request.user.userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.officesService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateOfficeDto: UpdateOfficeDto) {
    return this.officesService.update(id, updateOfficeDto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.officesService.remove(id);
  }
}
