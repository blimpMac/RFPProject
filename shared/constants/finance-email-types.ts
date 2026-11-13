/** Finance Manager-controlled request categories for Finance Member email notifications.
 * Unconfigured members receive all existing request notifications until a manager saves a checklist.
 */
export const financeEmailTypes = [
  { id: 'trade_suppliers', label: 'Trade Suppliers' },
  { id: 'kaliwaan_suppliers', label: 'Kaliwaan Suppliers' },
  { id: 'supplier_payment', label: 'Supplier Payment (legacy)' },
  { id: 'subcon_payment', label: 'Subcon Payment Request' },
  { id: 'tpc_request', label: 'TPC Request' },
  { id: 'manpower_agency', label: 'Manpower Agency Payments' },
  { id: 'reimbursement', label: 'Reimbursement' },
  { id: 'opex', label: 'Opex – non-PO transactions' },
  { id: 'cash_advance', label: 'Cash Advance (CA) and CA Liquidation' },
  { id: 'revolving_fund', label: 'Revolving Fund (RF) and RF Liquidation' },
  { id: 'other', label: 'Other / unclassified request types' },
] as const;

export type FinanceEmailType = (typeof financeEmailTypes)[number]['id'];
export const allFinanceEmailTypeIds: FinanceEmailType[] = financeEmailTypes.map((type) => type.id);

export function isValidFinanceEmailType(value: string): value is FinanceEmailType {
  return allFinanceEmailTypeIds.some((type) => type === value);
}

/** Used for plain-language previews and unit regression tests.
 * The database's finance_request_email_category() mirrors these categories.
 */
export function financeEmailCategory(requestType: string | null | undefined): FinanceEmailType {
  const value = (requestType || '').trim().toLowerCase();
  if (/revolving fund|(^|[^a-z])rf([^a-z]|$)/i.test(value)) return 'revolving_fund';
  if (/cash advance|(^|[^a-z])ca([^a-z]|$)/i.test(value)) return 'cash_advance';
  if (value.includes('kaliwaan')) return 'kaliwaan_suppliers';
  if (value.includes('trade supplier')) return 'trade_suppliers';
  if (value.includes('subcon')) return 'subcon_payment';
  if (value.includes('tpc')) return 'tpc_request';
  if (value.includes('manpower')) return 'manpower_agency';
  if (value.includes('reimburse')) return 'reimbursement';
  if (value.includes('opex')) return 'opex';
  if (value.includes('supplier')) return 'supplier_payment';
  return 'other';
}

export const financeMemberNotificationTemplates = [
  'finance_review_required',
  'hard_copy_verification_required',
  'liquidation_submitted',
] as const;
