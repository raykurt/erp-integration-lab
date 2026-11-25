/**
 * Read lazily (getters), so tests can point the app at a mock ERP started on a random port.
 * Every default below is for local development only.
 */
export const config = {
  get databaseUrl() {
    return process.env.DATABASE_URL ?? 'postgres://lab:lab@localhost:5432/erplab';
  },
  get jwtSecret() {
    return process.env.JWT_SECRET ?? 'change-me-local-only';
  },
  get seedPassword() {
    return process.env.SEED_PASSWORD ?? 'Passw0rd!';
  },
  get port() {
    return Number(process.env.PORT ?? 3000);
  },
  erp: {
    get baseUrl() {
      return process.env.ERP_BASE_URL ?? 'http://localhost:50000/b1s/v1';
    },
    get companyDb() {
      return process.env.ERP_COMPANY_DB ?? 'DEMO_COMPANY';
    },
    get user() {
      return process.env.ERP_USER ?? 'manager';
    },
    get password() {
      return process.env.ERP_PASSWORD ?? 'demo-only';
    },
    get timeoutMs() {
      return Number(process.env.ERP_TIMEOUT_MS ?? 5000);
    },
  },
  sync: {
    /** 0 = no background worker; sync runs only via POST /erp-sync/run. */
    get intervalMs() {
      return Number(process.env.SYNC_INTERVAL_MS ?? 0);
    },
    get maxAttempts() {
      return Number(process.env.SYNC_MAX_ATTEMPTS ?? 5);
    },
    /** First retry waits this long, then it doubles (capped at 1 hour). */
    get backoffMs() {
      return Number(process.env.SYNC_BACKOFF_MS ?? 30000);
    },
  },
};
