import { MovementType } from '../warehouse/entities';
import { isRetryableStatus, retryDelayMs, toErpRequest } from './erp-mapping';

const base = { id: 7, itemCode: 'FLT-OIL', quantity: 3, createdAt: new Date('2030-06-03T10:00:00Z') };

describe('toErpRequest (contract with SAP Business One Service Layer)', () => {
  it('maps IN to a goods receipt on the target warehouse', () => {
    const req = toErpRequest({ ...base, type: MovementType.IN, fromWarehouseCode: null, toWarehouseCode: 'MAIN' });
    expect(req.entity).toBe('InventoryGenEntries');
    expect(req.body).toMatchObject({
      DocDate: '2030-06-03',
      U_ExtRef: 'ERPLAB-MOV-7',
      DocumentLines: [{ ItemCode: 'FLT-OIL', Quantity: 3, WarehouseCode: 'MAIN' }],
    });
  });

  it('maps OUT to a goods issue from the source warehouse', () => {
    const req = toErpRequest({ ...base, type: MovementType.OUT, fromWarehouseCode: 'MAIN', toWarehouseCode: null });
    expect(req.entity).toBe('InventoryGenExits');
    expect(req.body.DocumentLines).toEqual([{ ItemCode: 'FLT-OIL', Quantity: 3, WarehouseCode: 'MAIN' }]);
  });

  it('maps TRANSFER to a stock transfer with both warehouses', () => {
    const req = toErpRequest({ ...base, type: MovementType.TRANSFER, fromWarehouseCode: 'MAIN', toWarehouseCode: 'PROD' });
    expect(req.entity).toBe('StockTransfers');
    expect(req.body).toMatchObject({
      FromWarehouse: 'MAIN',
      ToWarehouse: 'PROD',
      StockTransferLines: [{ ItemCode: 'FLT-OIL', Quantity: 3, FromWarehouseCode: 'MAIN', WarehouseCode: 'PROD' }],
    });
  });

  it('fails loudly when a required warehouse is missing', () => {
    expect(() => toErpRequest({ ...base, type: MovementType.IN, fromWarehouseCode: null, toWarehouseCode: null })).toThrow();
  });
});

describe('retry policy', () => {
  it('doubles the delay on every attempt and caps it at one hour', () => {
    expect([1, 2, 3, 4].map((a) => retryDelayMs(a, 1000))).toEqual([1000, 2000, 4000, 8000]);
    expect(retryDelayMs(30, 1000)).toBe(3600000);
  });

  it.each([0, 401, 408, 429, 500, 503])('retries status %s', (s) => expect(isRetryableStatus(s)).toBe(true));
  it.each([400, 404, 409, 422])('does not retry status %s', (s) => expect(isRetryableStatus(s)).toBe(false));
});
