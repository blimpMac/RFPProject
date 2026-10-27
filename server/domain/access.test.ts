import assert from 'node:assert/strict';
import test from 'node:test';
import { administrativeRoles, departmentDecisionRoles, financeRoles } from './access.ts';

test('Finance authority excludes the legacy administrator role', () => {
  assert.deepEqual(financeRoles, ['super_administrator', 'finance_reviewer']);
  assert.equal(financeRoles.includes('administrator'), false);
});

test('legacy administrator has no application authority', () => {
  assert.deepEqual(administrativeRoles, ['super_administrator']);
  assert.deepEqual(departmentDecisionRoles, ['super_administrator', 'department_approver']);
  assert.equal(administrativeRoles.includes('administrator'), false);
  assert.equal(departmentDecisionRoles.includes('administrator'), false);
});
