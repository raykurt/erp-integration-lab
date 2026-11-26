import { expect, PASSWORD, test } from './fixtures';

test.describe('Login', () => {
  test('shows an error for a wrong password', async ({ loginPage, page }) => {
    await loginPage.open();
    await loginPage.login('ayse', 'wrong-password');
    await expect(loginPage.error).toHaveText('Invalid username or password');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('signs in and shows the user; employees do not see the Stock menu', async ({ loginPage, leavePage, page }) => {
    await loginPage.open();
    await loginPage.login('ayse', PASSWORD);
    await expect(page).toHaveURL(/\/leave$/);
    await expect(leavePage.currentUser).toHaveText('Ayşe Yılmaz (EMPLOYEE)');
    await expect(page.getByRole('link', { name: 'Stock' })).toHaveCount(0);
  });

  test('shows the Stock menu to warehouse staff', async ({ loginPage, page }) => {
    await loginPage.open();
    await loginPage.login('deniz', PASSWORD);
    await expect(page.getByRole('link', { name: 'Stock' })).toBeVisible();
  });

  test('sends visitors without a session to the login page', async ({ page }) => {
    await page.goto('/leave');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('logs out', async ({ signInAs, leavePage, page }) => {
    await signInAs('ayse');
    await leavePage.open();
    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/leave');
    await expect(page).toHaveURL(/\/login$/);
  });
});
