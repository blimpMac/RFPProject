import { addPhilippineWorkingDaysToDate, isPhilippineWorkingDay, manilaDateKey } from './philippine-holidays.js';

const DAY_MS = 86_400_000;
const NOON_MS = 12 * 60 * 60 * 1000;

function manilaDateOrdinal(timestamp: number) {
  const [year, month, day] = manilaDateKey(timestamp).split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

/**
 * Adds working days to a Finance handoff timestamp using the Philippine
 * calendar. The receipt time is preserved and Saturday/Sunday are excluded.
 */
export function addManilaBusinessDays(
  receivedAt: string | number | Date,
  businessDays: number,
): string {
  const received = new Date(receivedAt);
  if (!Number.isFinite(received.getTime())) {
    throw new RangeError('A valid Finance handoff timestamp is required.');
  }

  const receivedDate = manilaDateKey(received);
  const [year, month, day] = receivedDate.split('-').map(Number);
  let cursor = Date.UTC(year, month - 1, day);
  let remaining = Math.max(0, Math.floor(businessDays));
  while (remaining > 0) {
    cursor += DAY_MS;
    if (isPhilippineWorkingDay(new Date(cursor + NOON_MS))) remaining -= 1;
  }
  const resultDay = new Date(cursor).toISOString().slice(0, 10);
  const [resultYear, resultMonth, resultDate] = resultDay.split('-').map(Number);
  const manilaOffsetMs = 8 * 60 * 60 * 1000;
  const receivedTimeOfDay = ((received.getTime() + manilaOffsetMs) % DAY_MS + DAY_MS) % DAY_MS;
  return new Date(Date.UTC(resultYear, resultMonth - 1, resultDate) + receivedTimeOfDay - manilaOffsetMs).toISOString();
}

/**
 * Counts elapsed Manila business dates, not completed 24-hour blocks.
 * For example, a Friday handoff approved on Monday counts one business day
 * even when the approval happens before Friday's original clock time.
 */
export function manilaBusinessDaysElapsed(
  receivedAt: string | number | Date,
  completedAt: string | number | Date,
): number {
  const received = new Date(receivedAt).getTime();
  const completed = new Date(completedAt).getTime();
  if (!Number.isFinite(received) || !Number.isFinite(completed) || completed <= received) {
    return 0;
  }

  const firstDate = manilaDateOrdinal(received);
  const lastDate = manilaDateOrdinal(completed);
  let elapsed = 0;
  for (let date = firstDate + DAY_MS; date <= lastDate; date += DAY_MS) {
    if (isPhilippineWorkingDay(new Date(date + NOON_MS))) elapsed += 1;
  }
  return elapsed;
}

export function isWithinManilaBusinessDaySla(
  receivedAt: string | number | Date,
  completedAt: string | number | Date,
  targetBusinessDays: number,
): boolean {
  const completed = new Date(completedAt).getTime();
  const deadline = new Date(addManilaBusinessDays(receivedAt, targetBusinessDays)).getTime();
  return Number.isFinite(completed) && completed <= deadline;
}
