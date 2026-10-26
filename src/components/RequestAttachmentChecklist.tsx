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
  selected,
  onChange,
}: {
  rfpType: string;
  selected: string[];
  onChange: (items: string[]) => void;
}) {
  const groups = checklistByType[rfpType];
  if (!groups) return null;
  const toggle = (item: string) =>
    onChange(
      selected.includes(item) ? selected.filter((value) => value !== item) : [...selected, item],
    );

  return (
    <section className="md:col-span-2 rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-900/30">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-[#315c93] shadow-sm dark:bg-slate-800">
            <ClipboardCheck size={18} />
          </span>
          <div>
            <h2 className="text-sm font-semibold">Document checklist</h2>
            <p className="mt-1 text-xs text-slate-500">{rfpType}</p>
          </div>
        </div>
        <span className="rounded-full border px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-wide text-slate-500">
          Optional
        </span>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              {group.label}
            </p>
            <div className="mt-2 space-y-2">
              {group.items.map((item) => (
                <label
                  key={item}
                  className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                >
                  <input
                    className="mt-0.5"
                    type="checkbox"
                    checked={selected.includes(item)}
                    onChange={() => toggle(item)}
                  />
                  <span>{item}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
