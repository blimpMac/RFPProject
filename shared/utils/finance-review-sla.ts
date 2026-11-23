const DAY_MS = 86_400_000;
const NOON_MS = 12 * 60 * 60 * 1000;

const weekdayFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Manila',
  weekday: 'short',
});

const datePartsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function isManilaBusinessDay(timestamp: number) {
  const weekday = weekdayFormatter.format(new Date(timestamp));
  return weekday !== 'Sat' && weekday !== 'Sun';
}

function manilaDateOrdinal(timestamp: number) {
  const parts = datePartsFormatter.formatToParts(new Date(timestamp));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((entry) => entry.type === type)?.value);
  return Date.UTC(part('year'), part('month') - 1, part('day'));
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

  let cursor = received.getTime();
  let remaining = Math.max(0, Math.floor(businessDays));
  while (remaining > 0) {
    cursor += DAY_MS;
    if (isManilaBusinessDay(cursor)) remaining -= 1;
  }
  return new Date(cursor).toISOString();
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
    if (isManilaBusinessDay(date + NOON_MS)) elapsed += 1;
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
