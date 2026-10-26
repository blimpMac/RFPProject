export type FinanceReceipt = {
  hardCopy: {
    receivedDate: string | null;
    status: 'Complete' | 'Incomplete' | null;
    remarks: string | null;
    verifiedBy: string | null;
    verifiedAt: string | null;
  };
  processing: {
    approvedBy: string | null;
    approvedAt: string | null;
    targetReleaseDate: string | null;
    checkNumber: string | null;
    paymentReference: string | null;
    status: string | null;
  };
  lateDocuments: string[];
};

type ReceiptFallback = {
  finalStatus?: string | null;
  plannedCheckDate?: string | null;
};

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const text = (value: unknown) => {
  const normalized = String(value ?? '').trim();
  return normalized || null;
};

export function normalizeFinanceReceipt(
  rawRecord: unknown,
  fallback: ReceiptFallback = {},
): FinanceReceipt {
  const raw = record(rawRecord);
  const operations = record(raw.finance_operations);
  const workflow = record(raw.finance_workflow);
  const receipt = record(raw.finance_receipt);
  const hardCopy = record(receipt.hard_copy);
  const processing = record(receipt.processing);
  const verification = text(hardCopy.status ?? operations.document_verification);
  const lateDocuments = Array.isArray(receipt.late_documents)
    ? receipt.late_documents
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

  return {
    hardCopy: {
      receivedDate: text(hardCopy.received_date ?? operations.originals_received_date),
      status:
        verification === 'Complete' || verification === 'Incomplete' ? verification : null,
      remarks: text(hardCopy.remarks ?? operations.verification_remarks),
      verifiedBy: text(hardCopy.verified_by ?? operations.updated_by),
      verifiedAt: text(hardCopy.verified_at ?? operations.updated_at),
    },
    processing: {
      approvedBy: text(processing.approved_by ?? workflow.head_reviewed_by),
      approvedAt: text(processing.approved_at ?? workflow.head_reviewed_at),
      targetReleaseDate: text(processing.target_release_date ?? fallback.plannedCheckDate),
      checkNumber: text(processing.check_number),
      paymentReference: text(processing.payment_reference),
      status: text(processing.status ?? fallback.finalStatus),
    },
    lateDocuments,
  };
}

export function companyBrand(company: string | null | undefined) {
  return /greenmetal|gemcor/i.test(company || '')
    ? {
        name: 'Greenmetal Electric Manufacturing Corp.',
        logo: '/brands/gemcor.png',
      }
    : {
        name: 'Greenlight Power Inc.',
        logo: '/brands/greenlight-power.png',
      };
}
