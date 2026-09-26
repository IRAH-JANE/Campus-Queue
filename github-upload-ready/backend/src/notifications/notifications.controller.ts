import {
  Controller,
  Get,
  Param,
  Patch,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { NotificationsService } from './notifications.service';

type NotificationRequest = {
  user: { userId: string };
};

@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('STUDENT', 'STAFF', 'ADMIN')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('mine')
  findMine(@Request() request: NotificationRequest) {
    return this.notificationsService.findMine(request.user.userId);
  }

  @Patch('read-all')
  markAllRead(@Request() request: NotificationRequest) {
    return this.notificationsService.markAllRead(request.user.userId);
  }

  @Patch(':notificationId/read')
  markRead(
    @Param('notificationId') notificationId: string,
    @Request() request: NotificationRequest,
  ) {
    return this.notificationsService.markRead(
      notificationId,
      request.user.userId,
    );
  }
}
