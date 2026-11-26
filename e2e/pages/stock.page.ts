import { Locator, Page } from '@playwright/test';

export class StockPage {
  readonly error: Locator;
  readonly notice: Locator;
  readonly movements: Locator;
  readonly bookButton: Locator;
  readonly syncButton: Locator;

  constructor(private readonly page: Page) {
    this.error = page.getByRole('main').getByRole('alert');
    this.notice = page.getByRole('main').getByRole('status');
    this.movements = page.getByTestId('movement');
    this.bookButton = page.getByRole('button', { name: 'Book movement' });
    this.syncButton = page.getByRole('button', { name: 'Sync to ERP' });
  }

  async open() {
    await this.page.goto('/stock');
    await this.page.getByRole('heading', { name: 'Stock', exact: true }).waitFor();
  }

  quantity(warehouse: string, itemCode: string): Locator {
    return this.page.getByTestId(`stock-${warehouse}-${itemCode}`).getByTestId('quantity');
  }

  async transfer(itemCode: string, from: string, to: string, quantity: number) {
    await this.page.getByLabel('Movement type').selectOption('TRANSFER');
    await this.page.getByLabel('Item').selectOption(itemCode);
    await this.page.getByLabel('From warehouse').selectOption(from);
    await this.page.getByLabel('To warehouse').selectOption(to);
    await this.page.getByLabel('Quantity').fill(String(quantity));
    await this.bookButton.click();
  }
}
