import assert from 'node:assert/strict';
import test from 'node:test';
import {
  accessRole,
  canAccessDepartment,
  isDepartmentOnly,
  normalizeDepartment,
} from './staff-access.ts';

test('normalizes department labels consistently', () => {
  assert.equal(normalizeDepartment(' — Finance '), 'finance');
  assert.equal(normalizeDepartment('- Operations'), 'operations');
  assert.equal(canAccessDepartment('Finance', '– finance'), true);
  assert.equal(canAccessDepartment('', 'Finance'), false);
});

test('maps account access levels to workflow roles', () => {
  assert.equal(accessRole('approver'), 'department_approver');
  assert.equal(accessRole('staff'), 'finance_reviewer');
  assert.equal(accessRole('finance_head'), 'finance_head');
});

test('limits department-only access without restricting elevated roles', () => {
  assert.equal(isDepartmentOnly(['department_approver']), true);
  assert.equal(isDepartmentOnly(['department_approver', 'administrator']), false);
  assert.equal(isDepartmentOnly(['finance_reviewer']), false);
  assert.equal(isDepartmentOnly(['department_approver', 'finance_head']), false);
});
