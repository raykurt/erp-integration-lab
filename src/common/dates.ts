/**
 * Fixed-date public holidays in Türkiye (MM-DD).
 * Religious holidays move every year, so a real system would load them from a table.
 */
export const FIXED_HOLIDAYS = ['01-01', '04-23', '05-01', '05-19', '07-15', '08-30', '10-29'];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseIsoDate(value: string): Date {
  if (!ISO_DATE.test(value)) throw new Error(`Invalid date: ${value}`);
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`Invalid date: ${value}`);
  }
  return date;
}

export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Counts the working days between two dates (both included), skipping weekends and holidays. */
export function countWorkingDays(start: string, end: string, holidays: string[] = FIXED_HOLIDAYS): number {
  const from = parseIsoDate(start);
  const to = parseIsoDate(end);
  let days = 0;
  for (const d = new Date(from); d <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    const weekday = d.getUTCDay();
    const monthDay = d.toISOString().slice(5, 10);
    if (weekday !== 0 && weekday !== 6 && !holidays.includes(monthDay)) days++;
  }
  return days;
}
