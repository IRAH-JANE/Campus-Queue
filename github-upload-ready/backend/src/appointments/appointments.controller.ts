import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { RescheduleAppointmentDto } from './dto/reschedule-appointment.dto';
import { AppointmentsService } from './appointments.service';
import { AvailabilityDto } from './dto/availability.dto';
import { CalendarDto } from './dto/calendar.dto';

type AppointmentRequest = {
  user: { userId: string; role: 'STUDENT' | 'STAFF' | 'ADMIN' };
};

@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  @Get('availability')
  availability(
    @Request() request: AppointmentRequest,
    @Query() query: AvailabilityDto,
  ) {
    return this.appointmentsService.availability(request.user.userId, query);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  @Get('calendar')
  calendar(@Query() query: CalendarDto) {
    return this.appointmentsService.calendar(query);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  @Post()
  create(
    @Request() request: AppointmentRequest,
    @Body() dto: CreateAppointmentDto,
  ) {
    return this.appointmentsService.create(request.user.userId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  @Get('mine')
  findMine(@Request() request: AppointmentRequest) {
    return this.appointmentsService.findMine(request.user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  @Patch(':appointmentId/reschedule')
  reschedule(
    @Request() request: AppointmentRequest,
    @Param('appointmentId') appointmentId: string,
    @Body() dto: RescheduleAppointmentDto,
  ) {
    return this.appointmentsService.reschedule(
      appointmentId,
      request.user.userId,
      dto,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  @Patch(':appointmentId/cancel')
  cancel(
    @Request() request: AppointmentRequest,
    @Param('appointmentId') appointmentId: string,
  ) {
    return this.appointmentsService.cancel(appointmentId, request.user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  @Post(':appointmentId/check-in')
  checkIn(
    @Request() request: AppointmentRequest,
    @Param('appointmentId') appointmentId: string,
  ) {
    return this.appointmentsService.checkIn(appointmentId, request.user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STAFF', 'ADMIN')
  @Get('office/:officeId')
  findForOffice(
    @Request() request: AppointmentRequest,
    @Param('officeId') officeId: string,
    @Query('date') date?: string,
  ) {
    return this.appointmentsService.findForOffice(officeId, request.user, date);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STAFF', 'ADMIN')
  @Patch(':appointmentId/approve')
  approve(
    @Request() request: AppointmentRequest,
    @Param('appointmentId') appointmentId: string,
  ) {
    return this.appointmentsService.approve(appointmentId, request.user);
  }
}
