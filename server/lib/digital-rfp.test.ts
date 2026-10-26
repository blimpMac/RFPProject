import assert from 'node:assert/strict';
import test from 'node:test';
import { companyBrand, normalizeFinanceReceipt } from '../../shared/contracts/digital-rfp.ts';

test('normalizes historical requests that have no receipt metadata', () => {
  assert.deepEqual(normalizeFinanceReceipt(undefined), {
    hardCopy: {
      receivedDate: null,
      status: null,
      remarks: null,
      verifiedBy: null,
      verifiedAt: null,
    },
    processing: {
      approvedBy: null,
      approvedAt: null,
      targetReleaseDate: null,
      checkNumber: null,
      paymentReference: null,
      status: null,
    },
    lateDocuments: [],
  });
});

test('reuses legacy operations and workflow fields while preferring receipt metadata', () => {
  const receipt = normalizeFinanceReceipt(
    {
      finance_operations: {
        originals_received_date: '2026-10-24',
        document_verification: 'Complete',
        updated_by: 'finance@example.com',
      },
      finance_workflow: { head_reviewed_by: 'head@example.com' },
      finance_receipt: {
        late_documents: ['Original invoice'],
        processing: { check_number: 'CHK-1042' },
      },
    },
    { finalStatus: 'Processing', plannedCheckDate: '2026-10-29' },
  );
  assert.equal(receipt.hardCopy.status, 'Complete');
  assert.equal(receipt.processing.approvedBy, 'head@example.com');
  assert.equal(receipt.processing.checkNumber, 'CHK-1042');
  assert.deepEqual(receipt.lateDocuments, ['Original invoice']);
});

test('maps the supported company names to the correct logos', () => {
  assert.equal(companyBrand('Greenlight Power Inc.').logo, '/brands/greenlight-power.png');
  assert.equal(companyBrand('Greenmetal Electric Manufacturing Corp.').logo, '/brands/gemcor.png');
});
