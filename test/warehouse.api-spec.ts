import { INestApplication } from '@nestjs/common';
import { client, closeApp, createApp, resetDatabase } from './helpers';

// Opening stock (see seed): MAIN: GEN-100 5, FLT-OIL 20, ATS-63 8 · PROD: CBL-16 100
describe('Warehouse: stock movements', () => {
  let app: INestApplication;
  let api: ReturnType<typeof client>;

  beforeAll(async () => {
    app = await createApp();
    api = client(app);
  });
  beforeEach(async () => {
    await resetDatabase(app);
    api.clearTokens();
  });
  afterAll(() => closeApp(app));

  const qty = async (warehouse: string, item: string): Promise<number> => {
    const rows = (await api.as('deniz').get(`/stock?warehouse=${warehouse}&item=${item}`)).body;
    return rows[0]?.quantity ?? 0;
  };
  const move = (body: object, headers?: Record<string, string>) => api.as('deniz').post('/stock-movements', body, headers);

  describe('booking', () => {
    it('receives stock (IN) and creates a PENDING outbox record', async () => {
      const res = await move({ type: 'IN', itemCode: 'FLT-OIL', toWarehouse: 'MAIN', quantity: 10 });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ type: 'IN', quantity: 10, syncStatus: 'PENDING', erpDocEntry: null });
      expect(res.body.item.itemCode).toBe('FLT-OIL');
      expect(await qty('MAIN', 'FLT-OIL')).toBe(30);
    });

    it('receives an item into a warehouse that never had it', async () => {
      await move({ type: 'IN', itemCode: 'GEN-100', toWarehouse: 'SHIP', quantity: 2 });
      expect(await qty('SHIP', 'GEN-100')).toBe(2);
    });

    it('issues stock (OUT)', async () => {
      expect((await move({ type: 'OUT', itemCode: 'GEN-100', fromWarehouse: 'MAIN', quantity: 5 })).status).toBe(201);
      expect(await qty('MAIN', 'GEN-100')).toBe(0);
    });

    it('transfers stock between warehouses', async () => {
      await move({ type: 'TRANSFER', itemCode: 'CBL-16', fromWarehouse: 'PROD', toWarehouse: 'SHIP', quantity: 40 });
      expect(await qty('PROD', 'CBL-16')).toBe(60);
      expect(await qty('SHIP', 'CBL-16')).toBe(40);
    });

    it('rejects taking more than available (422) and changes nothing', async () => {
      const res = await move({ type: 'TRANSFER', itemCode: 'GEN-100', fromWarehouse: 'MAIN', toWarehouse: 'SHIP', quantity: 6 });
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('INSUFFICIENT_STOCK');
      expect(await qty('MAIN', 'GEN-100')).toBe(5);
      expect(await qty('SHIP', 'GEN-100')).toBe(0);
      expect((await api.as('deniz').get('/stock-movements')).body).toHaveLength(0);
    });

    it.each([
      ['a transfer to the same warehouse', { type: 'TRANSFER', itemCode: 'GEN-100', fromWarehouse: 'MAIN', toWarehouse: 'MAIN', quantity: 1 }, 'INVALID_WAREHOUSES'],
      ['an IN without target', { type: 'IN', itemCode: 'GEN-100', quantity: 1 }, 'INVALID_WAREHOUSES'],
      ['an OUT with a target', { type: 'OUT', itemCode: 'GEN-100', fromWarehouse: 'MAIN', toWarehouse: 'SHIP', quantity: 1 }, 'INVALID_WAREHOUSES'],
    ])('rejects %s (400)', async (_, body, code) => {
      const res = await move(body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe(code);
    });

    it.each([0, -3, 2.5, '5'])('rejects quantity %p (400)', async (quantity) => {
      expect((await move({ type: 'IN', itemCode: 'GEN-100', toWarehouse: 'MAIN', quantity })).status).toBe(400);
    });

    it.each([
      ['an unknown item', { type: 'IN', itemCode: 'NOPE-1', toWarehouse: 'MAIN', quantity: 1 }, 'ITEM_NOT_FOUND'],
      ['an unknown warehouse', { type: 'IN', itemCode: 'GEN-100', toWarehouse: 'XYZ', quantity: 1 }, 'WAREHOUSE_NOT_FOUND'],
    ])('returns 404 for %s', async (_, body, code) => {
      const res = await move(body);
      expect(res.status).toBe(404);
      expect(res.body.code).toBe(code);
    });
  });

  describe('roles', () => {
    it('lets only warehouse staff book movements', async () => {
      const body = { type: 'IN', itemCode: 'GEN-100', toWarehouse: 'MAIN', quantity: 1 };
      for (const user of ['ayse', 'mert', 'hulya'] as const) {
        expect((await api.as(user).post('/stock-movements', body)).status).toBe(403);
      }
    });

    it('lets managers and HR read stock, but not employees', async () => {
      expect((await api.as('mert').get('/stock')).status).toBe(200);
      expect((await api.as('hulya').get('/stock')).status).toBe(200);
      expect((await api.as('ayse').get('/stock')).status).toBe(403);
    });
  });

  describe('idempotency (safe retries from scanners and mobile clients)', () => {
    const body = { type: 'OUT', itemCode: 'FLT-OIL', fromWarehouse: 'MAIN', quantity: 4 };

    it('books once when the same request is sent twice with the same key', async () => {
      const first = await move(body, { 'Idempotency-Key': 'scan-0001-abc' });
      const second = await move(body, { 'Idempotency-Key': 'scan-0001-abc' });
      expect(first.status).toBe(201);
      expect(second.status).toBe(200);
      expect(second.body.id).toBe(first.body.id);
      expect(await qty('MAIN', 'FLT-OIL')).toBe(16);
    });

    it('books once when duplicates arrive at the same time', async () => {
      const results = await Promise.all(Array.from({ length: 5 }, () => move(body, { 'Idempotency-Key': 'scan-0002-abc' })));
      expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(await qty('MAIN', 'FLT-OIL')).toBe(16);
    });

    it('rejects the same key with a different body (422)', async () => {
      await move(body, { 'Idempotency-Key': 'scan-0003-abc' });
      const res = await move({ ...body, quantity: 5 }, { 'Idempotency-Key': 'scan-0003-abc' });
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
      expect(await qty('MAIN', 'FLT-OIL')).toBe(16);
    });

    it('rejects a malformed key (400)', async () => {
      expect((await move(body, { 'Idempotency-Key': 'short' })).status).toBe(400);
    });
  });

  describe('concurrency', () => {
    it('never oversells: 10 parallel issues of 3 from a stock of 20', async () => {
      // Without row locks several requests would read "20" at the same time and all succeed.
      const results = await Promise.all(
        Array.from({ length: 10 }, () => move({ type: 'OUT', itemCode: 'FLT-OIL', fromWarehouse: 'MAIN', quantity: 3 })),
      );
      const statuses = results.map((r) => r.status);
      expect(statuses.filter((s) => s === 201)).toHaveLength(6);
      expect(statuses.filter((s) => s === 422)).toHaveLength(4);
      expect(await qty('MAIN', 'FLT-OIL')).toBe(2);
    });

    it('keeps the total constant when transfers run in both directions at once (no deadlock, no loss)', async () => {
      await move({ type: 'IN', itemCode: 'ATS-63', toWarehouse: 'SHIP', quantity: 8 });
      const results = await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          move({ type: 'TRANSFER', itemCode: 'ATS-63', fromWarehouse: i % 2 ? 'MAIN' : 'SHIP', toWarehouse: i % 2 ? 'SHIP' : 'MAIN', quantity: 1 }),
        ),
      );
      expect(results.every((r) => r.status === 201)).toBe(true);
      expect((await qty('MAIN', 'ATS-63')) + (await qty('SHIP', 'ATS-63'))).toBe(16);
    });
  });
});
