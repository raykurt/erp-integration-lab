import { INestApplication } from '@nestjs/common';
import { balanceOf, client, closeApp, createApp, resetDatabase } from './helpers';

// Dates far in the future, so "start date in the past" never triggers by accident.
const WEEK = { type: 'ANNUAL', startDate: '2030-06-03', endDate: '2030-06-07' }; // Mon–Fri = 5 days

describe('Leave requests', () => {
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

  describe('creating a request', () => {
    it('creates a PENDING request and counts working days', async () => {
      const res = await api.as('ayse').post('/leave-requests', WEEK);
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ status: 'PENDING', workingDays: 5, startDate: '2030-06-03' });
    });

    it('does not count weekends or public holidays (23 April)', async () => {
      const res = await api.as('ayse').post('/leave-requests', { type: 'ANNUAL', startDate: '2030-04-22', endDate: '2030-04-26' });
      expect(res.body.workingDays).toBe(4);
    });

    it('does not deduct the balance before approval', async () => {
      await api.as('ayse').post('/leave-requests', WEEK);
      expect(await balanceOf(api, 'ayse')).toBe(14);
    });

    it.each([
      ['end before start', { ...WEEK, startDate: '2030-06-07', endDate: '2030-06-03' }, 'END_BEFORE_START'],
      ['start in the past', { ...WEEK, startDate: '2020-01-06', endDate: '2020-01-07' }, 'START_IN_PAST'],
      ['weekend only', { ...WEEK, startDate: '2030-06-08', endDate: '2030-06-09' }, 'NO_WORKING_DAYS'],
      ['impossible date', { ...WEEK, startDate: '2030-02-30', endDate: '2030-03-01' }, 'INVALID_DATE'],
    ])('rejects %s with 400', async (_, body, code) => {
      const res = await api.as('ayse').post('/leave-requests', body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe(code);
    });

    it.each([
      ['an unknown leave type', { ...WEEK, type: 'HOLIDAY' }],
      ['a wrong date format', { ...WEEK, startDate: '03.06.2030' }],
      ['an unexpected field', { ...WEEK, employeeId: 99 }],
      ['a missing field', { type: 'ANNUAL', startDate: '2030-06-03' }],
    ])('rejects %s with 400 (input validation)', async (_, body) => {
      expect((await api.as('ayse').post('/leave-requests', body)).status).toBe(400);
    });

    it('rejects annual leave above the balance with 422', async () => {
      // can has 5 days; Mon 3 June to Mon 10 June = 6 working days
      const res = await api.as('can').post('/leave-requests', { ...WEEK, endDate: '2030-06-10' });
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('INSUFFICIENT_BALANCE');
    });

    it('counts pending requests against the balance', async () => {
      expect((await api.as('can').post('/leave-requests', { ...WEEK, endDate: '2030-06-05' })).status).toBe(201); // 3 days
      const second = await api.as('can').post('/leave-requests', { type: 'ANNUAL', startDate: '2030-07-01', endDate: '2030-07-03' }); // 3 more
      expect(second.status).toBe(422);
    });

    it('allows sick leave even when the annual balance is not enough', async () => {
      const res = await api.as('can').post('/leave-requests', { ...WEEK, type: 'SICK', endDate: '2030-06-14' });
      expect(res.status).toBe(201);
    });

    it('rejects an overlapping request with 409', async () => {
      await api.as('ayse').post('/leave-requests', WEEK);
      const res = await api.as('ayse').post('/leave-requests', { type: 'SICK', startDate: '2030-06-06', endDate: '2030-06-10' });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('OVERLAPPING_REQUEST');
    });

    it('allows a new request in the same range after the old one is cancelled', async () => {
      const first = await api.as('ayse').post('/leave-requests', WEEK);
      await api.as('ayse').post(`/leave-requests/${first.body.id}/cancel`);
      expect((await api.as('ayse').post('/leave-requests', WEEK)).status).toBe(201);
    });
  });

  describe('approving and rejecting', () => {
    let requestId: number;
    beforeEach(async () => {
      requestId = (await api.as('ayse').post('/leave-requests', WEEK)).body.id;
    });

    it('lets the direct manager approve and deducts the balance', async () => {
      const res = await api.as('mert').post(`/leave-requests/${requestId}/approve`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: 'APPROVED', decidedById: 2 });
      expect(await balanceOf(api, 'ayse')).toBe(9);
    });

    it('lets HR approve', async () => {
      expect((await api.as('hulya').post(`/leave-requests/${requestId}/approve`)).status).toBe(200);
    });

    it.each([
      ['the employee themselves', 'ayse'],
      ['a colleague', 'can'],
      ['a manager of another team', 'selin'],
    ] as const)('does not let %s approve (403)', async (_, user) => {
      expect((await api.as(user).post(`/leave-requests/${requestId}/approve`)).status).toBe(403);
      expect(await balanceOf(api, 'ayse')).toBe(14);
    });

    it('does not approve the same request twice', async () => {
      await api.as('mert').post(`/leave-requests/${requestId}/approve`);
      const res = await api.as('hulya').post(`/leave-requests/${requestId}/approve`);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('INVALID_STATUS');
      expect(await balanceOf(api, 'ayse')).toBe(9);
    });

    it('deducts the balance only once when many approvals arrive at the same time', async () => {
      // Without row locking (SELECT ... FOR UPDATE) several of these would succeed and deduct the balance repeatedly.
      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) => api.as(i % 2 ? 'hulya' : 'mert').post(`/leave-requests/${requestId}/approve`)),
      );
      const statuses = results.map((r) => r.status);
      expect(statuses.filter((s) => s === 200)).toHaveLength(1);
      expect(statuses.filter((s) => s === 409)).toHaveLength(9);
      expect(await balanceOf(api, 'ayse')).toBe(9);
    });

    it('requires a reason to reject', async () => {
      expect((await api.as('mert').post(`/leave-requests/${requestId}/reject`, {})).status).toBe(400);
      const res = await api.as('mert').post(`/leave-requests/${requestId}/reject`, { reason: 'Release week' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: 'REJECTED', decisionReason: 'Release week' });
      expect(await balanceOf(api, 'ayse')).toBe(14);
    });

    it('returns 404 for a request that does not exist', async () => {
      expect((await api.as('mert').post('/leave-requests/9999/approve')).status).toBe(404);
    });
  });

  describe('cancelling', () => {
    it('refunds the balance when an approved future leave is cancelled', async () => {
      const id = (await api.as('ayse').post('/leave-requests', WEEK)).body.id;
      await api.as('mert').post(`/leave-requests/${id}/approve`);
      expect(await balanceOf(api, 'ayse')).toBe(9);

      const res = await api.as('ayse').post(`/leave-requests/${id}/cancel`);
      expect(res.body.status).toBe('CANCELLED');
      expect(await balanceOf(api, 'ayse')).toBe(14);
    });

    it('lets only the owner cancel', async () => {
      const id = (await api.as('ayse').post('/leave-requests', WEEK)).body.id;
      expect((await api.as('mert').post(`/leave-requests/${id}/cancel`)).status).toBe(403);
    });

    it('does not cancel a rejected request', async () => {
      const id = (await api.as('ayse').post('/leave-requests', WEEK)).body.id;
      await api.as('mert').post(`/leave-requests/${id}/reject`, { reason: 'Busy period' });
      expect((await api.as('ayse').post(`/leave-requests/${id}/cancel`)).status).toBe(409);
    });
  });

  describe('visibility', () => {
    beforeEach(async () => {
      await api.as('ayse').post('/leave-requests', WEEK);
      await api.as('can').post('/leave-requests', { type: 'SICK', startDate: '2030-07-01', endDate: '2030-07-02' });
      await api.as('zeynep').post('/leave-requests', { type: 'ANNUAL', startDate: '2030-08-05', endDate: '2030-08-06' });
    });

    const ownersOf = async (user: 'ayse' | 'mert' | 'selin' | 'hulya') =>
      (await api.as(user).get('/leave-requests')).body.map((r: { employeeId: number }) => r.employeeId).sort();

    it('shows employees only their own requests', async () => expect(await ownersOf('ayse')).toEqual([4]));
    it('shows managers their team', async () => {
      expect(await ownersOf('mert')).toEqual([4, 5]);
      expect(await ownersOf('selin')).toEqual([6]);
    });
    it('shows HR everything', async () => expect(await ownersOf('hulya')).toEqual([4, 5, 6]));

    it('filters by status', async () => {
      const res = await api.as('hulya').get('/leave-requests?status=APPROVED');
      expect(res.body).toEqual([]);
    });

    it("returns 403 when opening another team's request", async () => {
      const zeynepsRequest = (await api.as('selin').get('/leave-requests')).body[0].id;
      expect((await api.as('mert').get(`/leave-requests/${zeynepsRequest}`)).status).toBe(403);
      expect((await api.as('selin').get(`/leave-requests/${zeynepsRequest}`)).status).toBe(200);
    });
  });
});
