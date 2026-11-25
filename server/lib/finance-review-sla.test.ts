import assert from 'node:assert/strict';
import testCase from 'node:test';
import {
  addManilaBusinessDays,
  isWithinManilaBusinessDaySla,
  manilaBusinessDaysElapsed,
} from '../../shared/utils/finance-review-sla.ts';

testCase('Finance review deadline counts two business days and preserves Manila time', () => {
  const receivedAt = '2026-11-23T09:00:00+08:00';
  const deadline = addManilaBusinessDays(receivedAt, 2);
  assert.equal(deadline, '2026-11-25T01:00:00.000Z');
  assert.equal(isWithinManilaBusinessDaySla(receivedAt, deadline, 2), true);
  assert.equal(isWithinManilaBusinessDaySla(receivedAt, '2026-11-25T09:00:01+08:00', 2), false);
});

testCase('Finance review SLA skips Saturday and Sunday', () => {
  const receivedAt = '2026-11-20T09:00:00+08:00';
  const deadline = addManilaBusinessDays(receivedAt, 2);
  assert.equal(deadline, '2026-11-24T01:00:00.000Z');
  assert.equal(manilaBusinessDaysElapsed(receivedAt, deadline), 2);
});

testCase('three-business-day Finance SLA applies the configured deadline', () => {
  const receivedAt = '2026-11-23T09:00:00+08:00';
  const deadline = addManilaBusinessDays(receivedAt, 3);
  assert.equal(deadline, '2026-11-26T01:00:00.000Z');
  assert.equal(isWithinManilaBusinessDaySla(receivedAt, deadline, 3), true);
  assert.equal(
    isWithinManilaBusinessDaySla(receivedAt, '2026-11-26T09:00:01+08:00', 3),
    false,
  );
});

testCase('same-day Finance approval remains within SLA', () => {
  const receivedAt = '2026-11-23T09:00:00+08:00';
  const approvedAt = '2026-11-23T16:30:00+08:00';
  assert.equal(manilaBusinessDaysElapsed(receivedAt, approvedAt), 0);
  assert.equal(isWithinManilaBusinessDaySla(receivedAt, approvedAt, 2), true);
});

testCase(
  'Friday handoff approved Monday before the handoff clock time counts one business day',
  () => {
    const receivedAt = '2026-11-20T17:00:00+08:00';
    const approvedAt = '2026-11-23T09:00:00+08:00';
    assert.equal(manilaBusinessDaysElapsed(receivedAt, approvedAt), 1);
    assert.equal(isWithinManilaBusinessDaySla(receivedAt, approvedAt, 2), true);
  },
);


testCase('Finance SLA skips Philippine regular and special non-working holidays', () => {
  const receivedAt = '2026-12-23T09:00:00+08:00';
  const deadline = addManilaBusinessDays(receivedAt, 3);
  assert.equal(deadline, '2027-01-04T01:00:00.000Z');
  assert.equal(manilaBusinessDaysElapsed(receivedAt, deadline), 3);
});
