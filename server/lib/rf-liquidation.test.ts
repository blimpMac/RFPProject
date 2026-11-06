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
