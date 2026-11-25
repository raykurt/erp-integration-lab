import { INestApplication } from '@nestjs/common';
import { client, closeApp, createApp, mockErp, resetDatabase } from './helpers';

describe('ERP synchronisation (mock SAP Business One Service Layer)', () => {
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

  const move = (body: object) => api.as('deniz').post('/stock-movements', body);
  const receive = (quantity = 10) => move({ type: 'IN', itemCode: 'FLT-OIL', toWarehouse: 'MAIN', quantity });
  const sync = async () => (await api.as('deniz').post('/erp-sync/run')).body;
  const movement = async (id: number) =>
    (await api.as('deniz').get('/stock-movements')).body.find((m: { id: number }) => m.id === id);

  it('sends each movement type to the right ERP document with the right lines', async () => {
    await receive(10);
    await move({ type: 'OUT', itemCode: 'GEN-100', fromWarehouse: 'MAIN', quantity: 2 });
    await move({ type: 'TRANSFER', itemCode: 'CBL-16', fromWarehouse: 'PROD', toWarehouse: 'SHIP', quantity: 25 });

    expect(await sync()).toEqual({ synced: 3, failed: 0, dead: 0, skipped: 0 });

    expect(mockErp.documents('InventoryGenEntries')).toEqual([
      expect.objectContaining({ U_ExtRef: 'ERPLAB-MOV-1', DocumentLines: [{ ItemCode: 'FLT-OIL', Quantity: 10, WarehouseCode: 'MAIN' }] }),
    ]);
    expect(mockErp.documents('InventoryGenExits')).toEqual([
      expect.objectContaining({ DocumentLines: [{ ItemCode: 'GEN-100', Quantity: 2, WarehouseCode: 'MAIN' }] }),
    ]);
    expect(mockErp.documents('StockTransfers')).toEqual([
      expect.objectContaining({ FromWarehouse: 'PROD', ToWarehouse: 'SHIP' }),
    ]);

    const synced = (await api.as('deniz').get('/stock-movements?syncStatus=SYNCED')).body;
    expect(synced).toHaveLength(3);
    expect(synced.every((m: { erpDocEntry: number | null }) => m.erpDocEntry !== null)).toBe(true);
  });

  it('does not send a movement again once it is synced', async () => {
    await receive();
    await sync();
    expect(await sync()).toEqual({ synced: 0, failed: 0, dead: 0, skipped: 0 });
    expect(mockErp.documents()).toHaveLength(1);
  });

  it('keeps the movement and retries later when the ERP is down', async () => {
    const id = (await receive()).body.id;
    mockErp.failNext(1, 503);

    expect(await sync()).toMatchObject({ failed: 1 });
    expect(await movement(id)).toMatchObject({ syncStatus: 'FAILED', syncAttempts: 1, lastSyncError: expect.stringContaining('503') });

    expect(await sync()).toMatchObject({ synced: 1 });
    expect(await movement(id)).toMatchObject({ syncStatus: 'SYNCED', syncAttempts: 2, lastSyncError: null });
    expect(mockErp.documents()).toHaveLength(1);
  });

  it('logs in again transparently when the ERP session has expired', async () => {
    await receive();
    await sync();
    mockErp.expireSessions();

    await receive(5);
    expect(await sync()).toMatchObject({ synced: 1 });
    expect(mockErp.loginCount).toBe(2);
  });

  it('does not create a duplicate when the ERP saved the document but the response was lost', async () => {
    const id = (await receive()).body.id;
    mockErp.saveThenFail(1);

    expect(await sync()).toMatchObject({ failed: 1 });
    expect(mockErp.documents()).toHaveLength(1); // the ERP already has it…

    expect(await sync()).toMatchObject({ synced: 1 });
    expect(mockErp.documents()).toHaveLength(1); // …and it is still only one document
    expect(mockErp.createAttempts).toBe(1); // the retry found it by U_ExtRef instead of posting again
    expect((await movement(id)).erpDocEntry).toBe(mockErp.documents()[0].DocEntry);
  });

  it('moves a movement to DEAD straight away when the ERP rejects the data (no pointless retries)', async () => {
    mockErp.markItemUnknown('FLT-OIL');
    const id = (await receive()).body.id;

    expect(await sync()).toMatchObject({ dead: 1 });
    expect(await movement(id)).toMatchObject({ syncStatus: 'DEAD', syncAttempts: 1, lastSyncError: expect.stringContaining("Invalid item code 'FLT-OIL'") });
    expect(await sync()).toMatchObject({ synced: 0, dead: 0 });
  });

  it('gives up after the maximum number of attempts', async () => {
    const id = (await receive()).body.id;
    mockErp.failNext(100, 503);

    for (let i = 0; i < 4; i++) expect(await sync()).toMatchObject({ failed: 1 });
    expect(await sync()).toMatchObject({ dead: 1 });
    expect(await movement(id)).toMatchObject({ syncStatus: 'DEAD', syncAttempts: 5 });
  });

  it('lets warehouse staff put a DEAD movement back in the queue after the cause is fixed', async () => {
    mockErp.markItemUnknown('FLT-OIL');
    const id = (await receive()).body.id;
    await sync();

    mockErp.reset(); // master data fixed in the ERP
    const res = await api.as('deniz').post(`/stock-movements/${id}/retry-sync`);
    expect(res.body).toMatchObject({ syncStatus: 'PENDING', syncAttempts: 0 });
    expect(await sync()).toMatchObject({ synced: 1 });
  });

  it('refuses to re-queue a movement that is already synced', async () => {
    const id = (await receive()).body.id;
    await sync();
    expect((await api.as('deniz').post(`/stock-movements/${id}/retry-sync`)).status).toBe(409);
  });

  it('sends every movement exactly once when two sync runs overlap', async () => {
    for (let i = 0; i < 10; i++) await receive(1);

    const [a, b] = await Promise.all([sync(), sync()]);
    expect(a.synced + b.synced).toBe(10);
    expect(mockErp.documents()).toHaveLength(10);
    expect(mockErp.createAttempts).toBe(10);
  });

  it('allows only warehouse staff and HR to trigger a sync', async () => {
    expect((await api.as('ayse').post('/erp-sync/run')).status).toBe(403);
    expect((await api.as('mert').post('/erp-sync/run')).status).toBe(403);
    expect((await api.as('hulya').post('/erp-sync/run')).status).toBe(200);
  });
});
