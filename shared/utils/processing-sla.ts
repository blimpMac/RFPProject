/** Philippine calendar-day SLA. Day 1 is the receipt date before 3:00 PM;
 * receipts at/after 3:00 PM count as Day 1 the following calendar day.
 * Day 3 is the end of the third counted day (Asia/Manila, UTC+08:00).
 */
const DAY_MS = 86_400_000;
const formatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const partsFor = (date: Date) => {
  const pieces = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    day: `${pieces.year}-${pieces.month}-${pieces.day}`,
    hour: Number(pieces.hour),
    minute: Number(pieces.minute),
  };
};
export function addManilaCalendarDays(day: string, offset: number): string {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date) + offset * DAY_MS).toISOString().slice(0, 10);
}
export function manilaReceiptSchedule(receivedAt: string | number | Date) {
  const received = partsFor(new Date(receivedAt));
  const afterCutoff = received.hour >= 15;
  const day1 = addManilaCalendarDays(received.day, afterCutoff ? 1 : 0);
  const day3 = addManilaCalendarDays(day1, 2);
  return {
    afterCutoff,
    day1,
    day3,
    dueAt: new Date(`${day3}T23:59:59.999+08:00`).toISOString(),
  };
}
export function isAfterManilaCutoff(at: string | number | Date = Date.now()) {
  return partsFor(new Date(at)).hour >= 15;
}
export function manilaCalendarDaysBetween(fromDay: string, toDay: string): number {
  const parse = (value: string) => Date.parse(`${value}T00:00:00Z`);
  return Math.round((parse(toDay) - parse(fromDay)) / DAY_MS);
}
