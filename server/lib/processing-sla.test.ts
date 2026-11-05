import assert from 'node:assert/strict';
import test from 'node:test';
import { manilaReceiptSchedule, isAfterManilaCutoff, manilaCalendarDaysBetween } from '../../shared/utils/processing-sla.ts';

test('2:59 PM Philippine time starts processing Day 1 today', () => {
  const at = '2026-11-05T14:59:59+08:00';
  const plan = manilaReceiptSchedule(at);
  assert.equal(plan.afterCutoff, false);
  assert.equal(plan.day1, '2026-11-05');
  assert.equal(plan.day3, '2026-11-07');
  assert.equal(plan.dueAt, '2026-11-07T15:59:59.999Z');
  assert.equal(isAfterManilaCutoff(at), false);
});

test('3:00 PM Philippine time starts Day 1 tomorrow', () => {
  const at = '2026-11-05T15:00:00+08:00';
  const plan = manilaReceiptSchedule(at);
  assert.equal(plan.afterCutoff, true);
  assert.equal(plan.day1, '2026-11-06');
  assert.equal(plan.day3, '2026-11-08');
  assert.equal(isAfterManilaCutoff(at), true);
});

test('time-zone-independent and handles next-year rollover', () => {
  const at = '2026-12-31T08:05:00Z'; // 4:05 PM in Manila
  const plan = manilaReceiptSchedule(at);
  assert.equal(plan.day1, '2027-01-01');
  assert.equal(plan.day3, '2027-01-03');
  assert.equal(manilaCalendarDaysBetween(plan.day1, plan.day3), 2);
});
