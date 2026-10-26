import assert from 'node:assert/strict';
import test from 'node:test';
import {
  accessRole,
  canAccessFinance,
  canActAsFinanceHead,
  canPerformFinanceStageAction,
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

test('keeps legacy administrators outside Finance permissions', () => {
  assert.equal(canAccessFinance(['administrator']), false);
  assert.equal(canAccessFinance(['finance_reviewer']), true);
  assert.equal(canAccessFinance(['super_administrator']), true);
  assert.equal(canActAsFinanceHead(['finance_reviewer']), false);
  assert.equal(canActAsFinanceHead(['administrator']), false);
  assert.equal(canActAsFinanceHead(['super_administrator']), true);
  assert.equal(canPerformFinanceStageAction('member_approve', ['finance_reviewer']), true);
  assert.equal(canPerformFinanceStageAction('member_approve', ['administrator']), false);
  assert.equal(canPerformFinanceStageAction('head_approve', ['finance_reviewer']), false);
  assert.equal(canPerformFinanceStageAction('head_approve', ['super_administrator']), true);
});

test('maps account access levels to workflow roles', () => {
  assert.equal(accessRole('approver'), 'department_approver');
  assert.equal(accessRole('staff'), 'finance_reviewer');
});

test('limits department-only access without restricting elevated roles', () => {
  assert.equal(isDepartmentOnly(['department_approver']), true);
  assert.equal(isDepartmentOnly(['department_approver', 'administrator']), false);
  assert.equal(isDepartmentOnly(['finance_reviewer']), false);
});
