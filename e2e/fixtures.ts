import { test as base, expect, Page } from '@playwright/test';
import { LeavePage } from './pages/leave.page';
import { LoginPage } from './pages/login.page';
import { StockPage } from './pages/stock.page';

export const API = 'http://localhost:3000';
export const PASSWORD = 'Passw0rd!';
export type User = 'hulya' | 'mert' | 'selin' | 'ayse' | 'can' | 'zeynep' | 'deniz';

type Fixtures = {
  loginPage: LoginPage;
  leavePage: LeavePage;
  stockPage: StockPage;
  /** Fast login: gets a token from the API and puts it in sessionStorage, skipping the login form. */
  signInAs: (user: User) => Promise<void>;
};

export const test = base.extend<Fixtures>({
  page: async ({ page, request }, use) => {
    // Every test starts from the same seeded data.
    const reset = await request.post(`${API}/test-support/reset`);
    expect(reset.status(), 'API must run with NODE_ENV=test').toBe(204);
    await use(page);
  },
  loginPage: async ({ page }, use) => use(new LoginPage(page)),
  leavePage: async ({ page }, use) => use(new LeavePage(page)),
  stockPage: async ({ page }, use) => use(new StockPage(page)),
  signInAs: async ({ page, request }, use) => {
    await use(async (user) => signInAs(page, request, user));
  },
});

async function signInAs(page: Page, request: import('@playwright/test').APIRequestContext, user: User) {
  const res = await request.post(`${API}/auth/login`, { data: { username: user, password: PASSWORD } });
  expect(res.ok()).toBeTruthy();
  const { accessToken } = await res.json();
  // sessionStorage is per tab, so open the app once, store the token, then continue.
  await page.goto('/login');
  await page.evaluate((token) => sessionStorage.setItem('erp-lab-token', token), accessToken);
}

export { expect };
