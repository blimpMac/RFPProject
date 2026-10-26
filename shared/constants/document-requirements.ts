export type DocumentRequirementGroup = { label: string; items: string[] };

export const documentRequirements: Record<string, DocumentRequirementGroup[]> = {
  'Trade Supplier': [
    {
      label: 'Internal documents',
      items: [
        'Approved Request for Payment Form',
        'Signed / Approved Purchase Order',
        'Material Receiving Report',
        'Canvass Form',
        'MRR, if any',
        'CAPEX for equipment request',
      ],
    },
    {
      label: 'External documents',
      items: ['Invoice', 'Delivery Receipt, if any', 'BIR 2303 for new suppliers'],
    },
  ],
  'Exclusive Supplier': [
    {
      label: 'Internal documents',
      items: ['Approved Request for Payment Form', 'Signed Purchase Order', 'Canvass Form'],
    },
    {
      label: 'External documents',
      items: [
        'Proforma / Quotation Invoice',
        'BIR 2303 for new suppliers',
        'Bank details for new suppliers',
      ],
    },
  ],
  'Subcon Request': [
    {
      label: 'Internal documents',
      items: ['Approved Request for Payment Form', 'Signed Purchase Order', 'Approved Quotation'],
    },
    {
      label: 'External documents',
      items: ['Invoice', 'Signed Billing / Quotation / Purchase Order', 'Progress Report'],
    },
  ],
  'TTC Request': [
    { label: 'Internal documents', items: ['Approved Request for Payment Form', 'SOF Copy'] },
    { label: 'External documents', items: ['Invoice'] },
  ],
  'Open payment - Agency': [
    {
      label: 'Internal documents',
      items: ['Approved Request for Payment Form', 'Signed Contract'],
    },
    { label: 'External documents', items: ['Invoice'] },
  ],
  Reimbursement: [
    {
      label: 'Internal documents',
      items: ['Approved Request for Payment Form', 'Proof of payment'],
    },
    { label: 'External documents', items: ['Invoice, receipts, AR'] },
  ],
  'Open - non PO transactions': [
    {
      label: 'Internal documents',
      items: ['Approved Request for Payment Form', 'Signed Contract', 'Canvass Form'],
    },
    { label: 'External documents', items: ['Invoice', 'OR, if any'] },
  ],
  'Cash Advance Request': [
    {
      label: 'Internal documents',
      items: [
        'Approved Request for Payment Form',
        'Budget Estimate with budget allocation breakdown',
        'Service Request / BOQ / SOQ - CA for servicing, if needed',
        'Quotation / Canvass / Proforma Invoice',
        'Training agreement and form with approval - CA for training',
      ],
    },
    {
      label: 'External documents',
      items: ['Contract (terms / Lease Contract)', 'MTR Form, if needed', 'CAPEX, if needed'],
    },
  ],
  'CA / EF Liquidation': [
    {
      label: 'Internal documents',
      items: ['Approved Expense Summary', 'Proof of return of excess funds'],
    },
    { label: 'External documents', items: ['Invoice, receipts / AR', 'CAPEX, if any'] },
  ],
};

export const documentRequirementsFor = (rfpType: string) =>
  documentRequirements[rfpType] || [];
