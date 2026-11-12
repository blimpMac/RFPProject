import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  RF_UNLIQUIDATED_ROWS_PER_FORM,
  rfExpenseRowsPerForm,
  rfTotals,
  sumRfAmounts,
  type RfLiquidation,
} from '../../shared/utils/rf-liquidation.ts';
import {
  blankRfAdvance,
  blankRfExpense,
  removeRfExpenseRow,
  rfAdvanceRowComplete,
  rfExpenseRowComplete,
  updateRfAdvanceRow,
  updateRfExpenseRow,
} from '../../shared/utils/rf-entry-rows.ts';
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
  periodCovered: 'Nov 1-15, 2026',
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
  company: 'Greenlight Power Inc.' as const,
  department: 'Finance',
  projectClass: 'Operations',
  rfpType: 'RF Liquidation',
  requestType: 'Regular' as const,
  supplierPayee: 'Revolving Fund',
  purposeDescription: 'Replenishment for completed site expenses.',
  amount: 1250,
  requiredPaymentDate: '2026-11-10',
  approvingHead: 'Maria Santos',
};

test('workbook row limits are GPI 49, GEMCOR 35, and two advances', () => {
  assert.equal(rfExpenseRowsPerForm('Greenlight Power Inc.'), 49);
  assert.equal(rfExpenseRowsPerForm('Greenmetal Electric Manufacturing Corp.'), 35);
  assert.equal(RF_UNLIQUIDATED_ROWS_PER_FORM, 2);
});

test('centavo-safe calculation matches workbook reconciliation', () => {
  assert.equal(sumRfAmounts([{ amount: 0.1 }, { amount: 0.2 }]), 0.3);
  const totals = rfTotals(base);
  assert.equal(totals.expenses, 1250);
  assert.equal(totals.unliquidatedAdvances, 200);
  assert.equal(totals.cashOnHand, 8550);
});

test('RF submission requires the form and an amount matching its expense total', () => {
  assert.equal(requestSchema.safeParse(request).success, false);
  assert.equal(
    requestSchema.safeParse({ ...request, rfLiquidation: base, amount: 1251 }).success,
    false,
  );
  assert.equal(requestSchema.safeParse({ ...request, rfLiquidation: base }).success, true);
});

test('validation rejects data beyond the single workbook sheet', () => {
  const tooManyGpi = { ...base, expenses: Array.from({ length: 50 }, (_, i) => expense(i + 1)) };
  assert.equal(
    requestSchema.safeParse({ ...request, rfLiquidation: tooManyGpi, amount: 5 }).success,
    false,
  );
  const tooManyGemcor = {
    ...base,
    expenses: Array.from({ length: 36 }, (_, i) => expense(i + 1)),
  };
  assert.equal(
    requestSchema.safeParse({
      ...request,
      company: 'Greenmetal Electric Manufacturing Corp.',
      rfLiquidation: tooManyGemcor,
      amount: 3.6,
    }).success,
    false,
  );
  const tooManyAdvances = {
    ...base,
    unliquidatedAdvances: Array.from({ length: 3 }, (_, i) => ({
      date: '2026-11-05',
      name: 'Maria Santos',
      purpose: `Advance ${i + 1}`,
      amount: 10,
    })),
  };
  assert.equal(
    requestSchema.safeParse({ ...request, rfLiquidation: tooManyAdvances }).success,
    false,
  );
});

test('expense editor adds one blank row and obeys a company-specific limit', () => {
  const entries = [
    ['date', '2026-11-06'],
    ['invoiceOrNo', 'OR-0082'],
    ['name', 'Sample Vendor'],
    ['itemDescription', 'Site supplies'],
    ['account', 'Site Expenses'],
    ['amount', '157.25'],
  ] as const;
  let rows = [blankRfExpense()];
  for (const [field, value] of entries) rows = updateRfExpenseRow(rows, 0, field, value, 2);
  assert.equal(rows.length, 2);
  assert.equal(rfExpenseRowComplete(rows[0]), true);
  for (const [field, value] of entries) rows = updateRfExpenseRow(rows, 1, field, value, 2);
  assert.equal(rows.length, 2, 'the form must not create a third row');
  rows = removeRfExpenseRow(rows, 0, 2);
  assert.equal(rows.length, 2, 'removal preserves a blank entry row within the limit');
});

test('advance editor permits exactly two complete form rows', () => {
  const fields = [
    ['date', '2026-11-06'],
    ['name', 'Juan Santos'],
    ['purpose', 'Site transfer'],
    ['amount', '55.55'],
  ] as const;
  let rows = [blankRfAdvance()];
  for (const [field, value] of fields) rows = updateRfAdvanceRow(rows, 0, field, value);
  assert.equal(rows.length, 2);
  assert.equal(rfAdvanceRowComplete(rows[0]), true);
  for (const [field, value] of fields) rows = updateRfAdvanceRow(rows, 1, field, value);
  assert.equal(rows.length, 2);
});

test('print source contains workbook labels and no invented packet sections', () => {
  const source = readFileSync('src/components/RfLiquidationPrint.tsx', 'utf8');
  for (const label of [
    'Revolving Fund Liquidation for Replenishment/Close-out',
    'Invoice/OR No.',
    'Purpose',
    'Total Expenses/For Replenishment',
    'Unliquidated Cash Advance from RF',
    'Previous Replenishment (not yet received)',
    'Custodian Name:',
    'Prepared by:',
    'Checked by:',
    'Approved by:',
    'departmentHead.toUpperCase()',
    'form.custodianName.toUpperCase()',
    'reference',
  ])
    assert.match(source, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  for (const invented of ['REFERENCE NO.', 'RF FORM COPY', 'CONSOLIDATED SUMMARY', 'Page {']) {
    assert.equal(source.includes(invented), false);
  }
  assert.equal(source.includes('>Account</th>'), false);
  assert.equal(source.includes('RF No.'), false);
  assert.equal(source.includes('Prepared by Custodian:'), false);
});

test('RF print stylesheet keeps the enlarged readable form scale', () => {
  const stylesheet = readFileSync('src/styles/rf-print-a4.css', 'utf8');
  assert.match(stylesheet, /\.rf-form-page\s*\{[\s\S]*?font-size: 10\.5px;/);
  assert.match(stylesheet, /\.rf-workbook-header img\s*\{[\s\S]*?width: 75mm;/);
  assert.match(stylesheet, /\.rf-workbook-header img\s*\{[\s\S]*?height: 22mm;/);
  assert.match(stylesheet, /\.rf-workbook-expense-total,[\s\S]*?font-size: 11px;/);
  assert.match(stylesheet, /\.rf-form-gpi \.rf-workbook-expenses tbody td\s*\{\s*height: 3\.3mm;/);
});
