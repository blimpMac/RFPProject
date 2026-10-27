import assert from 'node:assert/strict';
import test from 'node:test';
import { administrativeRoles, departmentDecisionRoles, financeRoles } from './access.ts';

test('Finance authority excludes the legacy administrator role', () => {
  assert.deepEqual(financeRoles, ['super_administrator', 'finance_reviewer']);
  assert.equal(financeRoles.includes('administrator'), false);
});

test('department decisions keep administrator compatibility without granting Finance authority', () => {
  assert.equal(administrativeRoles.includes('administrator'), true);
  assert.equal(departmentDecisionRoles.includes('department_approver'), true);
  assert.equal(departmentDecisionRoles.includes('administrator'), true);
});
