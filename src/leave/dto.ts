import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { LeaveStatus, LeaveType } from './leave-request.entity';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class CreateLeaveRequestDto {
  @ApiProperty({ enum: LeaveType, example: LeaveType.ANNUAL })
  @IsEnum(LeaveType)
  type: LeaveType;

  @ApiProperty({ example: '2030-06-03' })
  @Matches(ISO_DATE, { message: 'startDate must be YYYY-MM-DD' })
  startDate: string;

  @ApiProperty({ example: '2030-06-07' })
  @Matches(ISO_DATE, { message: 'endDate must be YYYY-MM-DD' })
  endDate: string;

  @ApiPropertyOptional({ example: 'Family visit' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class RejectLeaveRequestDto {
  @ApiProperty({ example: 'Team is at minimum capacity that week' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}

export class ListLeaveRequestsQuery {
  @ApiPropertyOptional({ enum: LeaveStatus })
  @IsOptional()
  @IsEnum(LeaveStatus)
  status?: LeaveStatus;
}
