import assert from 'node:assert/strict';
import test from 'node:test';
import {
  financeSchema,
  financeUpdateSchema,
  requestSchema,
  resubmitSchema,
} from './validation.ts';

const validRequest = {
  requestorName: 'Demo Requestor',
  requestorEmail: 'demo@example.com',
  company: 'Greenlight Power Inc.',
  department: 'Finance',
  projectClass: 'SOF12',
  rfpType: 'Supplier Payment',
  requestType: 'Regular',
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

test('accepts variable-length numeric SOF values and normalizes lowercase input', () => {
  for (const digits of ['12', '123', '12345678901234567']) {
    const parsed = requestSchema.parse({ ...validRequest, projectClass: ' sof' + digits + ' ' });
    assert.equal(parsed.projectClass, 'SOF' + digits);
  }
  for (const projectClass of ['SOF', 'SOF12A', 'SOF-12', '12345', 'Plant Maintenance']) {
    assert.equal(requestSchema.saftest('applies variable-length SOF validation to returned-request corrections', () => {
  const input = {
    requestId: 'fe835b06-227f-4e9e-b4db-101833657814',
    trackingToken: 'tracking-token-value-that-is-long-enough',
    correctionNote: 'Updated the SOF number.',
    corrections: {
      projectClass: 'sof12345678901234567',
      supplierPayee: 'Demo Supplier',
      purposeDescription: 'Updated payment purpose.',
      amount: 1000,
      requiredPaymentDate: '2026-11-25',
      requestType: 'Regular' as const,
    },
  };
  const parsed = resubmitSchema.parse(input);
  assert.equal(parsed.corrections?.projectClass, 'SOF12345678901234567');
  assert.equal(resubmitSchema.safeParse({
    ...input, corrections: { ...input.corrections, projectClass: 'SOF12A' },
  }).success, false);
});

test('rejects companies outside the configured list', () => {
  assert.equal(
    requestSchema.safeParse({ ...validRequest, company: 'Unknown Company' }).success,
    false,
  );
});

test('accepts Finance operations record updates', () => {
  const result = financeUpdateSchema.parse({
    requestId: 'fe835b06-227f-4e9e-b4db-101833657814',
    originalsReceivedDate: '2026-10-26',
    documentVerification: 'Complete',
    verificationRemarks: '',
    financeRemarks: 'Documents checked by Finance.',
    plannedCheckDate: '2026-10-30',
    changeReason: null,
  });
  assert.equal(result.documentVerification, 'Complete');
});

test('rejects unsupported document verification states', () => {
  assert.equal(
    financeUpdateSchema.safeParse({
      requestId: 'fe835b06-227f-4e9e-b4db-101833657814',
      documentVerification: 'Pending',
    }).success,
    false,
  );
});

test('requires the requestor first and last name for check purposes', () => {
  assert.equal(requestSchema.safeParse({ ...validRequest, requestorName: 'Juan' }).success, false);
  assert.equal(
    requestSchema.safeParse({ ...validRequest, requestorName: 'Juan Dela Cruz' }).success,
    true,
  );
});

test('allows review and return of submitted liquidation but not obsolete For Processing', () => {
  const requestId = 'fe835b06-227f-4e9e-b4db-101833657814';
  for (const action of ['liquidation_approve', 'liquidation_return']) {
    assert.equal(financeSchema.safeParse({ requestId, action }).success, true);
  }
  assert.equal(
    financeUpdateSchema.safeParse({ requestId, processingStatus: 'For Processing' }).success,
    false,
  );
});
