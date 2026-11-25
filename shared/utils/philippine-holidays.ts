/**
 * Philippine nationwide non-working holidays used by Finance SLA calculations.
 * Source calendars: Proclamation No. 1006 (2026) and Proclamation No. 1427 (2027).
 * Eid'l Fitr / Eid'l Adha are intentionally not guessed; add them when separately
 * proclaimed by the Office of the President.
 */
const PH_NON_WORKING_HOLIDAYS = new Set([
  // 2026 — regular and special non-working days
  '2026-01-01', '2026-02-17', '2026-04-02', '2026-04-03', '2026-04-04',
  '2026-04-09', '2026-05-01', '2026-06-12', '2026-08-21', '2026-08-31',
  '2026-11-01', '2026-11-02', '2026-11-30', '2026-12-08', '2026-12-24',
  '2026-12-25', '2026-12-30', '2026-12-31',
  // 2027 — regular and special non-working days
  '2027-01-01', '2027-02-06', '2027-03-25', '2027-03-26', '2027-03-27',
  '2027-04-09', '2027-05-01', '2027-06-12', '2027-08-21', '2027-08-30',
  '2027-11-01', '2027-11-02', '2027-11-30', '2027-12-08', '2027-12-24',
  '2027-12-25', '2027-12-30', '2027-12-31',
]);

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const weekdayFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Manila',
  weekday: 'short',
});

export function manilaDateKey(value: string | number | Date): string {
  return dateFormatter.format(new Date(value));
}

export function isPhilippineWorkingDay(value: string | number | Date): boolean {
  const date = new Date(value);
  const weekday = weekdayFormatter.format(date);
  const key = manilaDateKey(date);
  return weekday !== 'Sat' && weekday !== 'Sun' && !PH_NON_WORKING_HOLIDAYS.has(key);
}

export function addPhilippineWorkingDaysToDate(day: string, days: number): string {
  const [year, month, date] = day.split('-').map(Number);
  let cursor = Date.UTC(year, month - 1, date);
  let remaining = Math.max(0, Math.floor(days));
  while (remaining > 0) {
    cursor += 86_400_000;
    if (isPhilippineWorkingDay(new Date(cursor + 12 * 60 * 60 * 1000))) remaining -= 1;
  }
  return new Date(cursor).toISOString().slice(0, 10);
}

export function nextPhilippineWorkingDay(day: string, includeToday = true): string {
  const [year, month, date] = day.split('-').map(Number);
  let cursor = Date.UTC(year, month - 1, date);
  if (!includeToday) cursor += 86_400_000;
  while (!isPhilippineWorkingDay(new Date(cursor + 12 * 60 * 60 * 1000))) {
    cursor += 86_400_000;
  }
  return new Date(cursor).toISOString().slice(0, 10);
}

export function philippineWorkingDaysBetween(fromDay: string, toDay: string): number {
  const [fromYear, fromMonth, fromDate] = fromDay.split('-').map(Number);
  const [toYear, toMonth, toDate] = toDay.split('-').map(Number);
  let cursor = Date.UTC(fromYear, fromMonth - 1, fromDate) + 86_400_000;
  const end = Date.UTC(toYear, toMonth - 1, toDate);
  let count = 0;
  while (cursor <= end) {
    if (isPhilippineWorkingDay(new Date(cursor + 12 * 60 * 60 * 1000))) count += 1;
    cursor += 86_400_000;
  }
  return count;
}
