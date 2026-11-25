import { Role } from '../common/roles';
import { canDecide, canView, ensureEnoughBalance, workingDaysFor } from './leave-rules';

const TODAY = '2030-06-01';
const employee = { id: 10, username: 'ayse', role: Role.EMPLOYEE };
const owner = { id: 10, managerId: 2 };
const manager = { id: 2, username: 'mert', role: Role.MANAGER };
const otherManager = { id: 3, username: 'selin', role: Role.MANAGER };
const hr = { id: 1, username: 'hulya', role: Role.HR };

describe('workingDaysFor', () => {
  it('returns the working days of a valid range', () => {
    expect(workingDaysFor('2030-06-03', '2030-06-07', TODAY)).toBe(5);
  });

  it.each([
    ['2030-06-07', '2030-06-03', 'END_BEFORE_START'],
    ['2030-05-30', '2030-06-03', 'START_IN_PAST'],
    ['2030-06-08', '2030-06-09', 'NO_WORKING_DAYS'],
    ['2030-02-30', '2030-03-01', 'INVALID_DATE'],
  ])('rejects %s → %s with %s', (start, end, code) => {
    expect(() => workingDaysFor(start, end, TODAY)).toThrow(expect.objectContaining({ code }));
  });
});

describe('ensureEnoughBalance', () => {
  it('accepts a request that fits the available balance', () => {
    expect(() => ensureEnoughBalance(14, 4, 10)).not.toThrow();
  });

  it('counts pending days against the balance', () => {
    expect(() => ensureEnoughBalance(14, 10, 5)).toThrow(expect.objectContaining({ code: 'INSUFFICIENT_BALANCE' }));
  });
});

describe('canDecide / canView', () => {
  it('lets the direct manager decide', () => expect(canDecide(manager, owner)).toBe(true));
  it('lets HR decide', () => expect(canDecide(hr, owner)).toBe(true));
  it('does not let another team manager decide', () => expect(canDecide(otherManager, owner)).toBe(false));
  it('does not let anyone decide on their own request', () => {
    expect(canDecide(employee, owner)).toBe(false);
    expect(canDecide(hr, { id: hr.id, managerId: null })).toBe(false);
  });
  it('lets the owner view but not another team manager', () => {
    expect(canView(employee, owner)).toBe(true);
    expect(canView(otherManager, owner)).toBe(false);
  });
});
