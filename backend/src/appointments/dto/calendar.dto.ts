import { IsString, Matches, MaxLength } from 'class-validator';

export class CalendarDto {
  @IsString()
  @MaxLength(64)
  serviceId!: string;

  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  month!: string;
}
