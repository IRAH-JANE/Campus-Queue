import { Module } from '@nestjs/common';
import { QueueController } from './queue.controller';
import { QueueAdminController } from './queue-admin.controller';
import { QueueAdminService } from './queue-admin.service';
import { QueueService } from './queue.service';

@Module({
  controllers: [QueueController, QueueAdminController],
  providers: [QueueService, QueueAdminService],
  exports: [QueueService],
})
export class QueueModule {}
