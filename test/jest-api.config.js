/** API tests: the real NestJS app + a real PostgreSQL database (see docker-compose.yml). */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '..',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.api-spec.ts'],
  testTimeout: 30000,
};
