import { Body, Controller, Get, Headers, HttpCode, Param, ParseIntPipe, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { BusinessError } from '../common/errors';
import { AuthUser, Role } from '../common/roles';
import { CreateMovementDto, MovementQuery, StockQuery } from './dto';
import { StockMovement } from './entities';
import { StockRow, WarehouseService } from './warehouse.service';

const READERS = [Role.WAREHOUSE, Role.MANAGER, Role.HR];

/** The only part of the Express response we use. */
interface StatusSetter {
  status(code: number): unknown;
}

@ApiTags('warehouse')
@ApiBearerAuth()
@Controller()
export class WarehouseController {
  constructor(private readonly warehouse: WarehouseService) {}

  @Get('warehouses')
  @Roles(...READERS)
  warehouses() {
    return this.warehouse.warehouses();
  }

  @Get('items')
  @Roles(...READERS)
  items() {
    return this.warehouse.items();
  }

  @Get('stock')
  @Roles(...READERS)
  stock(@Query() query: StockQuery): Promise<StockRow[]> {
    return this.warehouse.stock(query);
  }

  @Get('stock-movements')
  @Roles(...READERS)
  movements(@Query() query: MovementQuery): Promise<StockMovement[]> {
    return this.warehouse.movements(query);
  }

  /** 201 for a new movement, 200 when the Idempotency-Key was already used for the same request. */
  @Post('stock-movements')
  @Roles(Role.WAREHOUSE)
  @ApiHeader({ name: 'Idempotency-Key', required: false, description: 'Retrying with the same key never books stock twice' })
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateMovementDto,
    @Headers('idempotency-key') key: string | undefined,
    @Res({ passthrough: true }) res: StatusSetter,
  ): Promise<StockMovement> {
    if (key !== undefined && !/^[A-Za-z0-9_-]{8,100}$/.test(key)) {
      throw new BusinessError(400, 'INVALID_IDEMPOTENCY_KEY', 'Idempotency-Key must be 8-100 characters: letters, digits, - or _');
    }
    const { movement, replayed } = await this.warehouse.createMovement(user, dto, key);
    res.status(replayed ? 200 : 201);
    return movement;
  }

  /** Puts a DEAD or FAILED movement back in the sync queue after the cause was fixed. */
  @Post('stock-movements/:id/retry-sync')
  @HttpCode(200)
  @Roles(Role.WAREHOUSE, Role.HR)
  retrySync(@Param('id', ParseIntPipe) id: number): Promise<StockMovement> {
    return this.warehouse.retrySync(id);
  }
}
