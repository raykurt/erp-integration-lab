import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { client, closeApp, createApp, resetDatabase } from './helpers';

describe('Authentication and authorization', () => {
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

  it('returns a JWT for valid credentials', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'ayse', password: 'Passw0rd!' })
      .expect(200);
    expect(res.body.accessToken.split('.')).toHaveLength(3);
  });

  it.each([
    ['wrong password', { username: 'ayse', password: 'wrong' }],
    ['unknown user', { username: 'nobody', password: 'Passw0rd!' }],
  ])('returns the same 401 for %s', async (_, body) => {
    const res = await request(app.getHttpServer()).post('/auth/login').send(body).expect(401);
    expect(res.body.message).toBe('Invalid username or password');
  });

  it('rejects requests without a token', async () => {
    await api.anonymous().get('/leave-requests').expect(401);
  });

  it('rejects a tampered token', async () => {
    await api.anonymous().get('/leave-requests').set('Authorization', 'Bearer abc.def.ghi').expect(401);
  });

  it('never returns the password hash', async () => {
    const res = await api.as('ayse').get('/employees/me');
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('passwordHash');
  });

  it('allows the employee list only for HR', async () => {
    expect((await api.as('ayse').get('/employees')).status).toBe(403);
    expect((await api.as('mert').get('/employees')).status).toBe(403);
    const res = await api.as('hulya').get('/employees');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(7);
  });
});

describe('Test support endpoint', () => {
  it('is not available outside NODE_ENV=test', async () => {
    const app = await createApp();
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await request(app.getHttpServer()).post('/test-support/reset').expect(404);
    } finally {
      process.env.NODE_ENV = previous;
      await closeApp(app);
    }
  });
});
