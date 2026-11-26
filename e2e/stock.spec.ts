import { expect, test } from './fixtures';

test.describe('Stock and ERP sync', () => {
  test('employees have no access to stock, even with a direct link', async ({ signInAs, stockPage }) => {
    await signInAs('ayse');
    await stockPage.open();
    await expect(stockPage.error).toHaveText('You do not have access to stock.');
  });

  test('managers can read stock but cannot book or sync', async ({ signInAs, stockPage }) => {
    await signInAs('mert');
    await stockPage.open();
    await expect(stockPage.quantity('MAIN', 'GEN-100')).toHaveText('5 pcs');
    await expect(stockPage.bookButton).toHaveCount(0);
    await expect(stockPage.syncButton).toHaveCount(0);
  });

  test('warehouse staff transfers stock and both warehouses update', async ({ signInAs, stockPage }) => {
    await signInAs('deniz');
    await stockPage.open();
    await stockPage.transfer('GEN-100', 'MAIN', 'SHIP', 2);

    await expect(stockPage.notice).toHaveText('Movement booked');
    await expect(stockPage.quantity('MAIN', 'GEN-100')).toHaveText('3 pcs');
    await expect(stockPage.quantity('SHIP', 'GEN-100')).toHaveText('2 pcs');
  });

  test('cannot transfer more than available', async ({ signInAs, stockPage }) => {
    await signInAs('deniz');
    await stockPage.open();
    await stockPage.transfer('GEN-100', 'MAIN', 'SHIP', 6);

    await expect(stockPage.error).toHaveText('Only 5 of GEN-100 in MAIN, requested 6');
    await expect(stockPage.quantity('MAIN', 'GEN-100')).toHaveText('5 pcs');
    await expect(stockPage.movements).toHaveCount(0);
  });

  test('a booked movement is PENDING until synced, then SYNCED with an ERP document number', async ({ signInAs, stockPage }) => {
    await signInAs('deniz');
    await stockPage.open();
    await stockPage.transfer('CBL-16', 'PROD', 'SHIP', 25);

    const movement = stockPage.movements.first();
    await expect(movement.getByTestId('status')).toHaveText('PENDING');
    await expect(movement.getByTestId('erp-doc')).toHaveText('');

    await stockPage.syncButton.click();
    await expect(stockPage.notice).toHaveText('ERP sync finished: 1 synced, 0 failed, 0 dead');
    await expect(movement.getByTestId('status')).toHaveText('SYNCED');
    await expect(movement.getByTestId('erp-doc')).toHaveText(/^\d+$/);
  });
});
