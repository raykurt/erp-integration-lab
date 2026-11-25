import { MovementType } from './entities';
import { checkWarehouses, ensureEnoughStock } from './warehouse-rules';

describe('checkWarehouses', () => {
  it.each([
    [MovementType.IN, undefined, 'MAIN'],
    [MovementType.OUT, 'MAIN', undefined],
    [MovementType.TRANSFER, 'MAIN', 'PROD'],
  ])('accepts %s from=%s to=%s', (type, from, to) => {
    expect(() => checkWarehouses(type, from, to)).not.toThrow();
  });

  it.each([
    [MovementType.IN, 'MAIN', 'PROD'],
    [MovementType.IN, undefined, undefined],
    [MovementType.OUT, undefined, 'MAIN'],
    [MovementType.TRANSFER, 'MAIN', undefined],
    [MovementType.TRANSFER, 'MAIN', 'MAIN'],
  ])('rejects %s from=%s to=%s', (type, from, to) => {
    expect(() => checkWarehouses(type, from, to)).toThrow(expect.objectContaining({ code: 'INVALID_WAREHOUSES' }));
  });
});

describe('ensureEnoughStock', () => {
  it('accepts taking exactly the available quantity', () => expect(() => ensureEnoughStock(5, 5, 'X', 'MAIN')).not.toThrow());
  it('rejects taking more', () =>
    expect(() => ensureEnoughStock(5, 6, 'X', 'MAIN')).toThrow(expect.objectContaining({ code: 'INSUFFICIENT_STOCK' })));
});
