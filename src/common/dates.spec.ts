import { countWorkingDays, parseIsoDate } from './dates';

describe('countWorkingDays', () => {
  it('counts Monday to Friday as 5 days', () => {
    expect(countWorkingDays('2030-06-03', '2030-06-07')).toBe(5);
  });

  it('skips weekends', () => {
    // Monday 2030-06-03 to Monday 2030-06-10
    expect(countWorkingDays('2030-06-03', '2030-06-10')).toBe(6);
  });

  it('returns 0 for a weekend-only range', () => {
    expect(countWorkingDays('2030-04-20', '2030-04-21')).toBe(0);
  });

  it('skips fixed public holidays (23 April)', () => {
    expect(countWorkingDays('2030-04-22', '2030-04-26')).toBe(4);
  });

  it('works across the new year and skips 1 January', () => {
    expect(countWorkingDays('2030-12-30', '2031-01-03')).toBe(4);
  });

  it('counts a single working day as 1', () => {
    expect(countWorkingDays('2030-06-03', '2030-06-03')).toBe(1);
  });
});

describe('parseIsoDate', () => {
  it.each(['2030-02-30', '2030-13-01', '03-06-2030', 'tomorrow'])('rejects %s', (value) => {
    expect(() => parseIsoDate(value)).toThrow('Invalid date');
  });
});
