export type DocumentRequirementGroup = { label: string; items: string[] };

/** Synchronized with the "Documentary Requirements" worksheet of
 * RFP Request Form (Responses), reviewed 2026-11-04.
 * Conditional requirements retain "if any / if needed / for new suppliers".
 */
export const documentRequirements: Record<string, DocumentRequirementGroup[]> = {
  'Trade Suppliers': [
    { label: 'Internal documents', items: [
      'Approved Request for Payment Form',
      'Signed / Approved Purchase Order',
      'Material Receiving Report',
      'Canvass form',
      'MRF (for e-works), if any',
      'CAPEX, if for equipment request',
    ] },
    { label: 'External documents', items: [
      'Invoice',
      'Delivery Receipt, if any',
      'BIR 2303, if new supplier',
    ] },
  ],
  'Kaliwaan Suppliers': [
    { label: 'Internal documents', items: [
      'Approved Request for Payment Form',
      'Signed Purchase Order',
      'Canvass form',
    ] },
    { label: 'External documents', items: [
      'Proforma / Quotation invoice',
      'BIR 2303, if new supplier',
      'Bank details, if new supplier',
    ] },
  ],
  'Subcon Payment Request': [
    { label: 'Internal documents', items: [
      'Approved Request for Payment Form',
      'Signed Purchase Order',
      'Approved Quotation',
    ] },
    { label: 'External documents', items: [
      'Invoice',
      'Signed Billing / Quotation / Purchase Order',
      'Progress report',
    ] },
  ],
  'TPC Request': [
    { label: 'Internal documents', items: [
      'Approved Request for Payment Form',
      'Profit & Loss',
      'SOF Copy',
    ] },
    { label: 'External documents', items: [] },
  ],
  'Manpower Agency Payments': [
    { label: 'Internal documents', items: [
      'Approved Request for Payment Form',
      'Signed Contract',
    ] },
    { label: 'External documents', items: [
      'Invoice',
      'DTRs',
    ] },
  ],
  'Reimbursement': [
    { label: 'Internal documents', items: [
      'Approved Request for Payment Form',
      'Proof of payment',
    ] },
    { label: 'External documents', items: [
      'Invoice, receipts, AR',
    ] },
  ],
  'Opex - non PO transactions': [
    { label: 'Internal documents', items: [
      'Approved Request for Payment Form',
      'Signed Contracts',
      'Canvass Form',
    ] },
    { label: 'External documents', items: [
      'Invoice',
      'Delivery Receipt, if any',
    ] },
  ],
  'Cash Advance Request': [
    { label: 'Internal documents', items: [
      'Approved Request for Payment Form',
      'Budget Estimate with budget allocation breakdown',
      'Service Request / BOM / BOQ, if needed for servicing',
      'Quotation / Canvass / DR / PO, if needed',
      'Training agreement and signed form, if CA for training',
    ] },
    { label: 'External documents', items: [
      'Contract (Rental / Lease Contract)',
      'MNT Form, if needed',
      'CAPEX, if needed',
    ] },
  ],
  'CA / RF Liquidation': [
    { label: 'Internal documents', items: [
      'Approved Expense Summary',
      'Proof of return of excess funds',
    ] },
    { label: 'External documents', items: [
      'Invoices, Receipts / AR',
      'CAPEX, if any',
    ] },
  ],
};

export const documentRequirementsFor = (rfpType: string): DocumentRequirementGroup[] =>
  documentRequirements[rfpType] || [];
