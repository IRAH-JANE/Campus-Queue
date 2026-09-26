import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateCounterDto } from './dto/create-counter.dto';
import { UpdateCounterDto } from './dto/update-counter.dto';
import { QueueAdminService } from './queue-admin.service';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class QueueAdminController {
  constructor(private readonly queueAdminService: QueueAdminService) {}

  @Post('offices/:officeId/staff/:userId')
  assignStaffToOffice(
    @Param('officeId') officeId: string,
    @Param('userId') userId: string,
  ) {
    return this.queueAdminService.assignStaffToOffice(officeId, userId);
  }

  @Delete('offices/:officeId/staff/:userId')
  removeStaffFromOffice(
    @Param('officeId') officeId: string,
    @Param('userId') userId: string,
  ) {
    return this.queueAdminService.removeStaffFromOffice(officeId, userId);
  }

  @Get('offices/:officeId/staff')
  listOfficeStaff(@Param('officeId') officeId: string) {
    return this.queueAdminService.listOfficeStaff(officeId);
  }

  @Get('offices/:officeId/counters')
  listCounters(@Param('officeId') officeId: string) {
    return this.queueAdminService.listCounters(officeId);
  }

  @Post('offices/:officeId/counters')
  createCounter(
    @Param('officeId') officeId: string,
    @Body() dto: CreateCounterDto,
  ) {
    return this.queueAdminService.createCounter(officeId, dto);
  }

  @Patch('counters/:counterId')
  updateCounter(
    @Param('counterId') counterId: string,
    @Body() dto: UpdateCounterDto,
  ) {
    return this.queueAdminService.updateCounter(counterId, dto);
  }

  @Post('counters/:counterId/staff/:userId')
  assignStaffToCounter(
    @Param('counterId') counterId: string,
    @Param('userId') userId: string,
  ) {
    return this.queueAdminService.assignStaffToCounter(counterId, userId);
  }

  @Delete('counters/:counterId/staff/:userId')
  removeStaffFromCounter(
    @Param('counterId') counterId: string,
    @Param('userId') userId: string,
  ) {
    return this.queueAdminService.removeStaffFromCounter(counterId, userId);
  }
}
