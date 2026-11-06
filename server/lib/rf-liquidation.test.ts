import assert from 'node:assert/strict';
import test from 'node:test';
import {
  rfExpenseRowsPerCopy,
  rfCopies,
  rfTotals,
  sumRfAmounts,
  type RfLiquidation,
} from '../../shared/utils/rf-liquidation.ts';
import { requestSchema } from './validation.ts';
import {
  blankRfExpense, blankRfAdvance, rfExpenseRowComplete, rfAdvanceRowComplete,
  updateRfExpenseRow, updateRfAdvanceRow, removeRfExpenseRow,
} from '../../shared/utils/rf-entry-rows.ts';

const expense = (i: number, amount = 0.1) => ({
  date: '2026-11-06',
  invoiceOrNo: `OR-${i}`,
  name: 'Sample Supplier',
  itemDescription: `Expense ${i}`,
  account: 'Operations',
  amount,
});
const base: RfLiquidation = {
  custodianName: 'Juan Dela Cruz',
  periodCovered: 'Nov 1–15, 2026',
  projectSof: 'SOF-123',
  revolvingFundAmount: 10000,
  previousReplenishment: 350,
  cashOnHandAsOf: '2026-11-06',
  expenses: [expense(1, 750), expense(2, 500)],
  unliquidatedAdvances: [
    { date: '2026-11-05', name: 'Maria Santos', purpose: 'Advance for site', amount: 200 },
  ],
};
const request = {
  requestorName: 'Juan Dela Cruz',
  requestorEmail: 'juan@example.com',
  company: 'Greenlight Power Inc.',
  department: 'Finance',
  projectClass: 'Operations',
  rfpType: 'RF Liquidation',
  requestType: 'Regular',
  supplierPayee: 'Revolving Fund',
  purposeDescription: 'Replenishment for completed site expenses.',
  amount: 1250,
  requiredPaymentDate: '2026-11-10',
  approvingHead: 'Maria Santos',
};
test('template limits are GPI 49, GEMCOR 35 expense lines', () => {
  assert.equal(rfExpenseRowsPerCopy('Greenlight Power Inc.'), 49);
  assert.equal(rfExpenseRowsPerCopy('Greenmetal Electric Manufacturing Corp.'), 35);
});
test('GPI expense 50 produces two copies and preserves all totals', () => {
  const form = { ...base, expenses: Array.from({ length: 50 }, (_, i) => expense(i + 1, 1.25)) };
  const copies = rfCopies(form, 'Greenlight Power Inc.');
  assert.deepEqual(
    copies.map((x) => x.expenses.length),
    [49, 1],
  );
  assert.equal(
    copies.reduce((t, x) => t + x.expenseTotal, 0),
    62.5,
  );
  assert.equal(rfTotals(form).expenses, 62.5);
});
test('GEMCOR 71 expenses produces 35 + 35 + 1 copies', () => {
  const form = { ...base, expenses: Array.from({ length: 71 }, (_, i) => expense(i + 1, 2)) };
  const copies = rfCopies(form, 'GEMCOR');
  assert.deepEqual(
    copies.map((x) => x.expenses.length),
    [35, 35, 1],
  );
  assert.equal(rfTotals(form).expenses, 142);
});
test('unliquidated CA lines also generate copies without losing entries', () => {
  const form = {
    ...base,
    expenses: [expense(1, 2)],
    unliquidatedAdvances: Array.from({ length: 5 }, (_, i) => ({
      date: '2026-11-05',
      name: 'Jan Doe',
      purpose: `Advance ${i}`,
      amount: 10,
    })),
  };
  const copies = rfCopies(form, 'GEMCOR');
  assert.deepEqual(
    copies.map((x) => x.unliquidatedAdvances.length),
    [2, 2, 1],
  );
  assert.equal(rfTotals(form).unliquidatedAdvances, 50);
});
test('centavo-safe calculation and cash-on-hand reconciliation', () => {
  assert.equal(sumRfAmounts([{ amount: 0.1 }, { amount: 0.2 }]), 0.3);
  const totals = rfTotals(base);
  assert.equal(totals.expenses, 1250);
  assert.equal(totals.unliquidatedAdvances, 200);
  assert.equal(totals.cashOnHand, 8550);
});
test('RF Liquidation cannot be submitted without RF form or with mismatched total', () => {
  assert.equal(requestSchema.safeParse(request).success, false);
  assert.equal(
    requestSchema.safeParse({ ...request, rfLiquidation: base, amount: 1251 }).success,
    false,
  );
  assert.equal(requestSchema.safeParse({ ...request, rfLiquidation: base }).success, true);
});

test('expense editor creates exactly one new row as soon as last row is complete', () => {
  const base = blankRfExpense();
  const entries = [
    ['date', '2026-11-06'],
    ['invoiceOrNo', 'OR-0082'],
    ['name', 'Sample Vendor'],
    ['itemDescription', 'Site supplies'],
    ['account', 'Site Expenses'],
    ['amount', '157.25'],
  ] as const;
  let rows = [base];
  for (const [field, value] of entries) {
    rows = updateRfExpenseRow(rows, 0, field, value);
  }
  assert.equal(rows.length, 2);
  assert.equal(rfExpenseRowComplete(rows[0]), true);
  assert.deepEqual(rows[1], blankRfExpense());
  assert.equal(rfExpenseRowComplete(rows[1]), false);
  rows = updateRfExpenseRow(rows, 0, 'account', 'Repairs and Maintenance');
  assert.equal(rows.length, 2, 'editing completed prior row must not create duplicates');
  rows = removeRfExpenseRow(rows, 0);
  assert.equal(rows.length, 1, 'removing row preserves one blank editing row');
});

test('advance editor automatically inserts the next row and rejects incomplete amount', () => {
  let rows = [blankRfAdvance()];
  const fields = [
    ['date', '2026-11-06'],
    ['name', 'Juan Santos'],
    ['purpose', 'Site transfer'],
    ['amount', '55.555'],
  ] as const;
  for (const [field, value] of fields) rows = updateRfAdvanceRow(rows, 0, field, value);
  assert.equal(rows.length, 1, 'non-centavo amounts are not complete');
  rows = updateRfAdvanceRow(rows, 0, 'amount', '55.55');
  assert.equal(rfAdvanceRowComplete(rows[0]), true);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[1], blankRfAdvance());
});

test('editing last completed row does not create another form when a trailing blank already exists', () => {
  const original = {
    date: '2026-11-06', invoiceOrNo: 'OR-18', name: 'Vendor',
    itemDescription: 'Expense', account: 'Operations', amount: '12.34',
  };
  let rows = [original];
  rows = updateRfExpenseRow(rows, 0, 'amount', '12.34');
  assert.equal(rows.length, 2);
  rows = updateRfExpenseRow(rows, 1, 'date', '2026-11-07');
  assert.equal(rows.length, 2);
});
