import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class OfficeDayHoursDto {
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @IsBoolean()
  isClosed!: boolean;

  @ValidateIf((day: OfficeDayHoursDto) => !day.isClosed)
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  openTime?: string;

  @ValidateIf((day: OfficeDayHoursDto) => !day.isClosed)
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  closeTime?: string;
}

export class ReplaceOfficeHoursDto {
  @IsArray()
  @ArrayMinSize(7)
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => OfficeDayHoursDto)
  hours!: OfficeDayHoursDto[];
}

export class CreateOfficeClosedDateDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  closedDate!: string;

  @IsOptional()
  @IsString()
  @Matches(/^.{0,160}$/)
  reason?: string;
}
