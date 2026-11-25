import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { config } from '../src/config';
import { SeedService } from '../src/seed/seed.service';
import { configureApp } from '../src/setup';

process.env.NODE_ENV = 'test';

export type User = 'hulya' | 'mert' | 'selin' | 'ayse' | 'can' | 'zeynep';

/** Boots the real application (same pipes and guards as production) against the test database. */
export async function createApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = configureApp(moduleRef.createNestApplication());
  // listen(0) on a random free port: supertest then reuses this server, which keeps parallel requests stable.
  await app.listen(0);
  return app;
}

/** Truncates all tables and loads the demo users again, so every test starts from the same state. */
export async function resetDatabase(app: INestApplication): Promise<void> {
  await app.get(SeedService).reset();
}

export async function tokenFor(app: INestApplication, username: User): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ username, password: config.seedPassword })
    .expect(200);
  return res.body.accessToken;
}

/** Small client so tests read like the business flow: api.as('ayse').post(...). */
export function client(app: INestApplication) {
  const tokens = new Map<User, string>();
  const auth = async (user: User) => {
    if (!tokens.has(user)) tokens.set(user, await tokenFor(app, user));
    return `Bearer ${tokens.get(user)}`;
  };
  const server = () => request(app.getHttpServer());
  return {
    as: (user: User) => ({
      get: async (url: string) => server().get(url).set('Authorization', await auth(user)),
      post: async (url: string, body: object = {}) => server().post(url).set('Authorization', await auth(user)).send(body),
    }),
    anonymous: server,
    clearTokens: () => tokens.clear(),
  };
}

export async function balanceOf(api: ReturnType<typeof client>, user: User): Promise<number> {
  const res = await api.as(user).get('/employees/me');
  return res.body.annualLeaveBalance;
}
