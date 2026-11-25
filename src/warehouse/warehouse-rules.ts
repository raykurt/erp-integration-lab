import { HttpStatus } from '@nestjs/common';
import { BusinessError } from '../common/errors';
import { MovementType } from './entities';

/** Which warehouses a movement type needs: IN → to, OUT → from, TRANSFER → both (and different). */
export function checkWarehouses(type: MovementType, from?: string, to?: string): void {
  const fail = (message: string) => {
    throw new BusinessError(HttpStatus.BAD_REQUEST, 'INVALID_WAREHOUSES', message);
  };
  if (type === MovementType.IN && (!to || from)) fail('IN needs toWarehouse only');
  if (type === MovementType.OUT && (!from || to)) fail('OUT needs fromWarehouse only');
  if (type === MovementType.TRANSFER) {
    if (!from || !to) fail('TRANSFER needs fromWarehouse and toWarehouse');
    if (from === to) fail('TRANSFER needs two different warehouses');
  }
}

export function ensureEnoughStock(available: number, requested: number, itemCode: string, warehouse: string): void {
  if (requested > available) {
    throw new BusinessError(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'INSUFFICIENT_STOCK',
      `Only ${available} of ${itemCode} in ${warehouse}, requested ${requested}`,
    );
  }
}
