import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  allFinanceEmailTypeIds,
  financeEmailCategory,
  financeEmailTypes,
  financeMemberNotificationTemplates,
  isValidFinanceEmailType,
} from '../../shared/constants/finance-email-types.ts';

test('Finance Manager checklist uses unique valid categories', () => {
  assert.equal(financeEmailTypes.length, 11);
  assert.equal(new Set(allFinanceEmailTypeIds).size, allFinanceEmailTypeIds.length);
  assert.ok(allFinanceEmailTypeIds.includes('revolving_fund'));
  assert.equal(isValidFinanceEmailType('arbitrary'), false);
});

test('RF-only checklist includes both Revolving Fund and RF Liquidation', () => {
  for (const text of ['Revolving Fund (RF)', 'RF Liquidation', 'RF', 'Revolving Fund']) {
    assert.equal(financeEmailCategory(text), 'revolving_fund', text);
  }
  for (const text of ['Trade Suppliers', 'CA Liquidation', 'Opex - non PO transactions', 'Supplier Payment']) {
    assert.notEqual(financeEmailCategory(text), 'revolving_fund', text);
  }
});

test('Cash Advance and historical classifications remain recognized', () => {
  assert.equal(financeEmailCategory('Cash Advance (CA)'), 'cash_advance');
  assert.equal(financeEmailCategory('CA / EF Liquidation'), 'cash_advance');
  assert.equal(financeEmailCategory('Supplier Payment'), 'supplier_payment');
  assert.equal(financeEmailCategory('Unclassified'), 'other');
});

test('Only Finance Member work alerts are in the gated email list', () => {
  assert.deepEqual([...financeMemberNotificationTemplates], [
    'finance_review_required',
    'hard_copy_verification_required',
    'liquidation_submitted',
  ]);
  assert.ok(!financeMemberNotificationTemplates.some((key) =>
    ['submission_received', 'supervisor_review', 'finance_head_review_required', 'payment_completed'].includes(key),
  ));
});

test('Finance Head-only endpoint and send-time protection are present', () => {
  const api = readFileSync('server/routes/administration/accounts.ts', 'utf8');
  const queue = readFileSync('server/email/service.ts', 'utf8');
  assert.ok(api.includes("route === 'staff-users/email-preferences'"));
  assert.match(api, /staff-users\/email-preferences'[\s\S]*?requireStaff\(event, \['super_administrator'\]\)/);
  assert.match(api, /role === 'finance_reviewer'/);
  assert.ok(queue.includes('shouldSkipForFinancePreference(db, item)'));
  assert.ok(queue.includes("status: 'cancelled'"));
  assert.ok(queue.includes("p_template_key: notification.template_key"));
});
