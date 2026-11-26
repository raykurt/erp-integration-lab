import { expect, test } from './fixtures';

// Mon 3 – Fri 7 June 2030 = 5 working days
const START = '2030-06-03';
const END = '2030-06-07';

test.describe('Leave flow', () => {
  test('employee submits a request; balance is not touched before approval', async ({ signInAs, leavePage }) => {
    await signInAs('ayse');
    await leavePage.open();
    await leavePage.request('ANNUAL', START, END);

    await expect(leavePage.notice).toHaveText('Leave request submitted');
    const row = leavePage.myRequest(START, END);
    await expect(row.getByTestId('status')).toHaveText('PENDING');
    await expect(row.getByTestId('working-days')).toHaveText('5');
    await expect(leavePage.balance).toHaveText('14');
  });

  test('shows the business error from the API when the balance is too low', async ({ signInAs, leavePage }) => {
    await signInAs('can'); // can has 5 days
    await leavePage.open();
    await leavePage.request('ANNUAL', START, '2030-06-10'); // 6 working days
    await expect(leavePage.error).toHaveText('Requested 6 day(s), available 5 day(s)');
    await expect(leavePage.myRequest(START, '2030-06-10')).toHaveCount(0);
  });

  test('shows a validation error for an end date before the start date', async ({ signInAs, leavePage }) => {
    await signInAs('ayse');
    await leavePage.open();
    await leavePage.request('ANNUAL', END, START);
    await expect(leavePage.error).toHaveText('End date is before start date');
  });

  test('manager approves; the employee sees APPROVED and the new balance', async ({ signInAs, leavePage }) => {
    await signInAs('ayse');
    await leavePage.open();
    await leavePage.request('ANNUAL', START, END);
    await expect(leavePage.notice).toBeVisible();

    await signInAs('mert');
    await leavePage.open();
    await leavePage.approve('Ayşe Yılmaz');
    await expect(leavePage.teamRequest('Ayşe Yılmaz').getByTestId('status')).toHaveText('APPROVED');

    await signInAs('ayse');
    await leavePage.open();
    await expect(leavePage.myRequest(START, END).getByTestId('status')).toHaveText('APPROVED');
    await expect(leavePage.balance).toHaveText('9');
  });

  test('manager rejects with a reason; the employee sees it', async ({ signInAs, leavePage }) => {
    await signInAs('ayse');
    await leavePage.open();
    await leavePage.request('ANNUAL', START, END);
    await expect(leavePage.notice).toBeVisible();

    await signInAs('mert');
    await leavePage.open();
    await leavePage.reject('Ayşe Yılmaz', 'Release week');
    await expect(leavePage.notice).toHaveText('Request rejected');

    await signInAs('ayse');
    await leavePage.open();
    const row = leavePage.myRequest(START, END);
    await expect(row.getByTestId('status')).toHaveText('REJECTED');
    await expect(row.getByTestId('reason')).toHaveText('Release week');
  });

  test("a manager does not see another team's requests", async ({ signInAs, leavePage, page }) => {
    await signInAs('zeynep'); // reports to selin
    await leavePage.open();
    await leavePage.request('ANNUAL', START, END);
    await expect(leavePage.notice).toBeVisible();

    await signInAs('mert');
    await leavePage.open();
    await expect(page.getByTestId('team-request')).toHaveCount(0);
  });

  test('employee cancels a pending request', async ({ signInAs, leavePage }) => {
    await signInAs('ayse');
    await leavePage.open();
    await leavePage.request('SICK', START, END);
    const row = leavePage.myRequest(START, END);
    await row.getByRole('button', { name: 'Cancel' }).click();
    await expect(row.getByTestId('status')).toHaveText('CANCELLED');
  });
});
