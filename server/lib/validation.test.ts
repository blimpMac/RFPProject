import assert from 'node:assert/strict';
import test from 'node:test';
import { requestSchema } from './validation.ts';

const validRequest = {
  requestorName: 'Demo Requestor',
  requestorEmail: 'demo@example.com',
  company: 'Greenlight Power Inc.',
  department: 'Finance',
  projectClass: 'Demo Project',
  rfpType: 'Supplier Payment',
  supplierPayee: 'Demo Supplier',
  purposeDescription: 'Validation test request.',
  amount: 1000,
  requiredPaymentDate: '2026-11-01',
  approvingHead: 'Demo Approver',
};

test('accepts each configured company', () => {
  assert.equal(requestSchema.parse(validRequest).company, 'Greenlight Power Inc.');
  assert.equal(
    requestSchema.parse({
      ...validRequest,
      company: 'Greenmetal Electric Manufacturing Corp.',
    }).company,
    'Greenmetal Electric Manufacturing Corp.',
  );
});

test('rejects companies outside the configured list', () => {
  assert.equal(
    requestSchema.safeParse({ ...validRequest, company: 'Unknown Company' }).success,
    false,
  );
});
