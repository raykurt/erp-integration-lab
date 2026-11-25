import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { MovementType, SyncStatus } from './entities';

const CODE = /^[A-Z0-9-]{2,20}$/;

export class CreateMovementDto {
  @ApiProperty({ enum: MovementType, example: MovementType.TRANSFER })
  @IsEnum(MovementType)
  type: MovementType;

  @ApiProperty({ example: 'FLT-OIL' })
  @Matches(CODE, { message: 'itemCode must be an upper-case code like FLT-OIL' })
  itemCode: string;

  @ApiPropertyOptional({ example: 'MAIN', description: 'Required for OUT and TRANSFER' })
  @IsOptional()
  @Matches(CODE)
  fromWarehouse?: string;

  @ApiPropertyOptional({ example: 'PROD', description: 'Required for IN and TRANSFER' })
  @IsOptional()
  @Matches(CODE)
  toWarehouse?: string;

  @ApiProperty({ example: 5, minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(100000)
  quantity: number;

  @ApiPropertyOptional({ example: 'Weekly production order' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class StockQuery {
  @ApiPropertyOptional({ example: 'MAIN' })
  @IsOptional()
  @Matches(CODE)
  warehouse?: string;

  @ApiPropertyOptional({ example: 'FLT-OIL' })
  @IsOptional()
  @Matches(CODE)
  item?: string;
}

export class MovementQuery {
  @ApiPropertyOptional({ enum: SyncStatus })
  @IsOptional()
  @IsEnum(SyncStatus)
  syncStatus?: SyncStatus;
}
