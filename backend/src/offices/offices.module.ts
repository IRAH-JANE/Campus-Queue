import { Module } from '@nestjs/common';
import { OfficesController } from './offices.controller';
import { OfficesService } from './offices.service';
import { OfficeHoursService } from './office-hours.service';

@Module({
  controllers: [OfficesController],
  providers: [OfficesService, OfficeHoursService],
})
export class OfficesModule {}
