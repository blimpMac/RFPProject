const DAY_MS = 86_400_000;

const weekdayFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Manila',
  weekday: 'short',
});

function isManilaBusinessDay(timestamp: number) {
  const weekday = weekdayFormatter.format(new Date(timestamp));
  return weekday !== 'Sat' && weekday !== 'Sun';
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

export function manilaBusinessDaysElapsed(
  receivedAt: string | number | Date,
  completedAt: string | number | Date,
): number {
  const received = new Date(receivedAt).getTime();
  const completed = new Date(completedAt).getTime();
  if (!Number.isFinite(received) || !Number.isFinite(completed) || completed <= received) {
    return 0;
  }

  let cursor = received;
  let elapsed = 0;
  while (cursor + DAY_MS <= completed) {
    cursor += DAY_MS;
    if (isManilaBusinessDay(cursor)) elapsed += 1;
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
