export const config = {
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://lab:lab@localhost:5432/erplab',
  // Local development default only. Set JWT_SECRET in every shared environment.
  jwtSecret: process.env.JWT_SECRET ?? 'change-me-local-only',
  seedPassword: process.env.SEED_PASSWORD ?? 'Passw0rd!',
  port: Number(process.env.PORT ?? 3000),
};
