import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class AvailabilityDto {
  @IsString()
  @MaxLength(64)
  serviceId!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  appointmentId?: string;
}
