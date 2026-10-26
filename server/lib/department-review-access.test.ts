import assert from 'node:assert/strict';
import test from 'node:test';
import { reviewerIsCurrentDepartmentHead } from './department-review-access.ts';

const currentHead = {
  reviewerEmail: 'new.head@example.com',
  requestStatus: 'Pending Department Approval',
  requestDepartment: 'operations',
  profile: { id: 'new-head', email: 'new.head@example.com', active: true },
  roles: ['department_approver'],
  assignedDepartments: ['operations'],
};

test('accepts only the active replacement Department Head', () => {
  assert.equal(reviewerIsCurrentDepartmentHead(currentHead), true);
  assert.equal(
    reviewerIsCurrentDepartmentHead({ ...currentHead, reviewerEmail: 'old.head@example.com' }),
    false,
  );
});

test('rejects stale links after deactivation, transfer, or workflow completion', () => {
  assert.equal(
    reviewerIsCurrentDepartmentHead({
      ...currentHead,
      profile: { ...currentHead.profile, active: false },
    }),
    false,
  );
  assert.equal(
    reviewerIsCurrentDepartmentHead({ ...currentHead, assignedDepartments: ['engineering'] }),
    false,
  );
  assert.equal(
    reviewerIsCurrentDepartmentHead({ ...currentHead, requestStatus: 'Pending Finance Review' }),
    false,
  );
});
