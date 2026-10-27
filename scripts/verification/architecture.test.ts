import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');
const lineCount = (path: string) => read(path).split(/\r?\n/).length;

test('staff route stays a thin dispatcher', () => {
  const staff = read('server/routes/staff.ts');
  assert.ok(lineCount('server/routes/staff.ts') <= 70, 'staff.ts should remain a thin dispatcher');
  for (const route of ['finance/action', 'finance/update', 'department/action', 'audit-trail']) {
    assert.equal(staff.includes(route), false, `${route} must stay in a focused route module`);
  }
});

test('approval workspace stays feature-oriented', () => {
  assert.ok(
    lineCount('src/pages/ApprovalsPage.tsx') <= 750,
    'ApprovalsPage.tsx should compose feature modules instead of becoming a god component',
  );
  for (const path of [
    'src/features/approvals/workflow.ts',
    'src/features/approvals/ApprovalQueueFilters.tsx',
    'src/features/approvals/ApprovalQueueTable.tsx',
    'src/features/approvals/FinanceUpdateForm.tsx',
    'server/routes/staff/finance.ts',
    'server/routes/staff/monitoring.ts',
    'server/routes/staff/attachments.ts',
  ]) {
    assert.ok(read(path).length > 0, `${path} must exist`);
  }
});
