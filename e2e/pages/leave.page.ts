import { Locator, Page } from '@playwright/test';

export class LeavePage {
  readonly balance: Locator;
  readonly error: Locator;
  readonly notice: Locator;
  readonly currentUser: Locator;

  constructor(private readonly page: Page) {
    this.balance = page.getByTestId('balance');
    this.error = page.getByRole('main').getByRole('alert');
    this.notice = page.getByRole('main').getByRole('status');
    this.currentUser = page.getByTestId('current-user');
  }

  async open() {
    await this.page.goto('/leave');
    await this.balance.waitFor();
  }

  async request(type: 'ANNUAL' | 'SICK' | 'UNPAID', startDate: string, endDate: string) {
    await this.page.getByLabel('Leave type').selectOption(type);
    await this.page.getByLabel('Start date').fill(startDate);
    await this.page.getByLabel('End date').fill(endDate);
    await this.page.getByRole('button', { name: 'Submit request' }).click();
  }

  /** A row in "My requests", found by its date range. */
  myRequest(startDate: string, endDate: string): Locator {
    return this.page.getByTestId('my-request').filter({ hasText: `${startDate} → ${endDate}` });
  }

  /** A row in "Team requests" / "All requests", found by employee name. */
  teamRequest(employee: string): Locator {
    return this.page.getByTestId('team-request').filter({ hasText: employee });
  }

  async approve(employee: string) {
    await this.teamRequest(employee).getByRole('button', { name: 'Approve' }).click();
  }

  async reject(employee: string, reason: string) {
    const row = this.teamRequest(employee);
    await row.getByRole('button', { name: 'Reject' }).click();
    await row.getByLabel('Rejection reason').fill(reason);
    await row.getByRole('button', { name: 'Confirm reject' }).click();
  }
}
