import assert from 'node:assert/strict';
import test from 'node:test';
import { approvingHeadTeamSchema } from '../domain/approving-team.ts';

const ids = {
  head: '11111111-1111-4111-8111-111111111111',
  first: '22222222-2222-4222-8222-222222222222',
  second: '33333333-3333-4333-8333-333333333333',
  third: '44444444-4444-4444-8444-444444444444',
  fourth: '55555555-5555-4555-8555-555555555555',
};

test('accepts one head and two or three unique co-approvers', () => {
  assert.equal(
    approvingHeadTeamSchema.safeParse({
      headUserId: ids.head,
      coApproverUserIds: [ids.first, ids.second],
    }).success,
    true,
  );
  assert.equal(
    approvingHeadTeamSchema.safeParse({
      headUserId: ids.head,
      coApproverUserIds: [ids.first, ids.second, ids.third],
    }).success,
    true,
  );
});

test('rejects invalid team sizes, duplicates, and a head selected as co-approver', () => {
  const invalidTeams = [
    { headUserId: ids.head, coApproverUserIds: [ids.first] },
    {
      headUserId: ids.head,
      coApproverUserIds: [ids.first, ids.second, ids.third, ids.fourth],
    },
    { headUserId: ids.head, coApproverUserIds: [ids.first, ids.first] },
    { headUserId: ids.head, coApproverUserIds: [ids.head, ids.first] },
  ];

  for (const team of invalidTeams) {
    assert.equal(approvingHeadTeamSchema.safeParse(team).success, false);
  }
});
