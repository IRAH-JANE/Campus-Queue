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
import { CallNextDto } from './dto/call-next.dto';
import { JoinQueueDto } from './dto/join-queue.dto';
import { QueueService } from './queue.service';

type QueueRequest = {
  user: { userId: string; role: 'STUDENT' | 'STAFF' | 'ADMIN' };
};

@Controller('queue')
export class QueueController {
  constructor(private readonly queueService: QueueService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  @Post('join')
  join(@Request() request: QueueRequest, @Body() dto: JoinQueueDto) {
    return this.queueService.join(request.user, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  @Get('mine')
  findMine(@Request() request: QueueRequest) {
    return this.queueService.findMine(request.user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  @Patch('tickets/:ticketId/cancel')
  cancel(
    @Request() request: QueueRequest,
    @Param('ticketId') ticketId: string,
  ) {
    return this.queueService.cancel(ticketId, request.user.userId);
  }

  @Get('sessions/:sessionId/display')
  display(@Param('sessionId') sessionId: string) {
    return this.queueService.display(sessionId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STAFF', 'ADMIN')
  @Get('sessions')
  findTodaySessions(
    @Request() request: QueueRequest,
    @Query('officeId') officeId?: string,
  ) {
    return this.queueService.findTodaySessions(request.user, officeId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STAFF', 'ADMIN')
  @Get('sessions/:sessionId/tickets')
  findSessionTickets(
    @Request() request: QueueRequest,
    @Param('sessionId') sessionId: string,
  ) {
    return this.queueService.findSessionTickets(sessionId, request.user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STAFF', 'ADMIN')
  @Post('sessions/:sessionId/call-next')
  callNext(
    @Request() request: QueueRequest,
    @Param('sessionId') sessionId: string,
    @Body() dto: CallNextDto,
  ) {
    return this.queueService.callNext(sessionId, dto.counterId, request.user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STAFF', 'ADMIN')
  @Patch('sessions/:sessionId/pause')
  pauseSession(
    @Request() request: QueueRequest,
    @Param('sessionId') sessionId: string,
  ) {
    return this.queueService.pauseSession(sessionId, request.user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STAFF', 'ADMIN')
  @Patch('sessions/:sessionId/resume')
  resumeSession(
    @Request() request: QueueRequest,
    @Param('sessionId') sessionId: string,
  ) {
    return this.queueService.resumeSession(sessionId, request.user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STAFF', 'ADMIN')
  @Patch('sessions/:sessionId/close')
  closeSession(
    @Request() request: QueueRequest,
    @Param('sessionId') sessionId: string,
  ) {
    return this.queueService.closeSession(sessionId, request.user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STAFF', 'ADMIN')
  @Patch('tickets/:ticketId/recall')
  recall(
    @Request() request: QueueRequest,
    @Param('ticketId') ticketId: string,
  ) {
    return this.queueService.recall(ticketId, request.user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STAFF', 'ADMIN')
  @Patch('tickets/:ticketId/start')
  startServing(
    @Request() request: QueueRequest,
    @Param('ticketId') ticketId: string,
  ) {
    return this.queueService.startServing(ticketId, request.user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STAFF', 'ADMIN')
  @Patch('tickets/:ticketId/complete')
  complete(
    @Request() request: QueueRequest,
    @Param('ticketId') ticketId: string,
  ) {
    return this.queueService.complete(ticketId, request.user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STAFF', 'ADMIN')
  @Patch('tickets/:ticketId/skip')
  skip(@Request() request: QueueRequest, @Param('ticketId') ticketId: string) {
    return this.queueService.skip(ticketId, request.user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STAFF', 'ADMIN')
  @Patch('tickets/:ticketId/no-show')
  markNoShow(
    @Request() request: QueueRequest,
    @Param('ticketId') ticketId: string,
  ) {
    return this.queueService.markNoShow(ticketId, request.user);
  }
}
