import { ClipboardCheck } from 'lucide-react';

type ChecklistGroup = {
  label: string;
  items: string[];
};

const checklistByType: Record<string, ChecklistGroup[]> = {
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
    {
      label: 'Internal documents',
      items: ['Approved Request for Payment Form', 'SOF Copy'],
    },
    {
      label: 'External documents',
      items: ['Invoice'],
    },
  ],
  'Open payment - Agency': [
    {
      label: 'Internal documents',
      items: ['Approved Request for Payment Form', 'Signed Contract'],
    },
    {
      label: 'External documents',
      items: ['Invoice'],
    },
  ],
  Reimbursement: [
    {
      label: 'Internal documents',
      items: ['Approved Request for Payment Form', 'Proof of payment'],
    },
    {
      label: 'External documents',
      items: ['Invoice, receipts, AR'],
    },
  ],
  'Open - non PO transactions': [
    {
      label: 'Internal documents',
      items: ['Approved Request for Payment Form', 'Signed Contract', 'Canvass Form'],
    },
    {
      label: 'External documents',
      items: ['Invoice', 'OR, if any'],
    },
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
    {
      label: 'External documents',
      items: ['Invoice, receipts / AR', 'CAPEX, if any'],
    },
  ],
};

export function RequestAttachmentChecklist({
  rfpType,
}: {
  rfpType: string;
  selected: string[];
  onChange: (items: string[]) => void;
}) {
  const groups = checklistByType[rfpType];
  if (!groups) return null;

  return (
    <section className="md:col-span-2 rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-900/30">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-[#315c93] shadow-sm dark:bg-slate-800">
            <ClipboardCheck size={18} />
          </span>
          <div>
            <h2 className="text-sm font-semibold">Documents to check before submitting</h2>
            <p className="mt-1 text-xs text-slate-500">{rfpType}</p>
          </div>
        </div>
        <span className="rounded-full border px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-wide text-slate-500">
          Reference only
        </span>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {groups.map((group) => (
          <div
            key={group.label}
            className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"
          >
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              {group.label}
            </p>
            <ul className="mt-2 space-y-2 text-sm">
              {group.items.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span
                    className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400"
                    aria-hidden="true"
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
        Remember to check and prepare the documents listed above before submitting your request.
      </p>
    </section>
  );
}
