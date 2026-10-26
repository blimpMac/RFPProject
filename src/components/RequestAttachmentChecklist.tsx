import { ClipboardCheck, Info } from 'lucide-react';

type ChecklistGroup = {
  label: string;
  items: string[];
};

type ChecklistPreset = {
  match: RegExp;
  groups: ChecklistGroup[];
};

const presets: ChecklistPreset[] = [
  {
    match: /trade supplier/i,
    groups: [
      {
        label: 'Internal documents',
        items: [
          'Approved Request for Payment Form',
          'Signed / Approved Purchase Order',
          'Material Receiving Report',
          'Canvass Form',
          'Contract / warranty support, if applicable',
        ],
      },
      {
        label: 'External documents',
        items: ['Invoice', 'Delivery Receipt, if any', 'BIR / tax support, if applicable'],
      },
    ],
  },
  {
    match: /exclusive supplier/i,
    groups: [
      {
        label: 'Internal documents',
        items: [
          'Approved Request for Payment Form',
          'Signed Purchase Order',
          'Canvass / sole-source support',
        ],
      },
      {
        label: 'External documents',
        items: ['Invoice', 'Delivery Receipt / Service Report'],
      },
    ],
  },
  {
    match: /subcon|subcontract/i,
    groups: [
      {
        label: 'Internal documents',
        items: [
          'Approved Request for Payment Form',
          'Signed Purchase Order',
          'Approved Quotation / Contract',
        ],
      },
      {
        label: 'External documents',
        items: ['Invoice', 'Progress Billing / Accomplishment', 'Progress Report'],
      },
    ],
  },
  {
    match: /ttc|tcc/i,
    groups: [
      {
        label: 'Internal documents',
        items: ['Approved Request for Payment Form', 'Approved billing / request support'],
      },
      {
        label: 'External documents',
        items: ['Invoice', 'Official Receipt / supporting copy'],
      },
    ],
  },
  {
    match: /open payment.*agency|agency/i,
    groups: [
      {
        label: 'Internal documents',
        items: [
          'Approved Request for Payment Form',
          'Approved authority / officer endorsement',
          'Signed Contract',
        ],
      },
      {
        label: 'External documents',
        items: ['Invoice / agency billing', 'Official Receipt, if available'],
      },
    ],
  },
  {
    match: /reimbursement/i,
    groups: [
      {
        label: 'Internal documents',
        items: ['Approved Request for Payment Form', 'Proof of payment'],
      },
      {
        label: 'External documents',
        items: ['Invoice / receipt', 'Other supporting proof, as applicable'],
      },
    ],
  },
  {
    match: /non.?po|open.*transaction/i,
    groups: [
      {
        label: 'Internal documents',
        items: [
          'Approved Request for Payment Form',
          'Department Head approval',
          'Signed Contract / supporting agreement',
        ],
      },
      {
        label: 'External documents',
        items: ['Invoice', 'Delivery Receipt, if any', 'Contract / external support'],
      },
    ],
  },
  {
    match: /cash advance(?!.*liquid)/i,
    groups: [
      {
        label: 'Internal documents',
        items: [
          'Approved Request for Payment Form',
          'Budget Estimate / allocation breakdown',
          'Service Request / activity support',
        ],
      },
      {
        label: 'External documents',
        items: ['Quotation / supporting invoice, if available'],
      },
    ],
  },
  {
    match: /liquidation|liquidate/i,
    groups: [
      {
        label: 'Internal documents',
        items: ['Approved Expense Summary', 'Proof of return of excess funds, if any'],
      },
      {
        label: 'External documents',
        items: ['Invoices / receipts', 'Acknowledgement / liquidation support'],
      },
    ],
  },
];

const fallbackGroups: ChecklistGroup[] = [
  {
    label: 'Suggested documents',
    items: [
      'Approved Request for Payment Form',
      'Invoice / billing support',
      'Purchase Order / contract, if applicable',
      'Proof of receipt / completion, if applicable',
    ],
  },
];

function groupsForType(rfpType: string) {
  return presets.find((preset) => preset.match.test(rfpType))?.groups || fallbackGroups;
}

export function RequestAttachmentChecklist({
  rfpType,
  selected,
  onChange,
}: {
  rfpType: string;
  selected: string[];
  onChange: (items: string[]) => void;
}) {
  if (!rfpType) return null;
  const groups = groupsForType(rfpType);
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
            <h2 className="text-sm font-semibold">Suggested attachment checklist</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Optional reminder for {rfpType}. Check items as you prepare them; this does not
              validate the uploaded file type.
            </p>
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
      <p className="mt-4 flex gap-2 text-xs leading-5 text-slate-500">
        <Info className="mt-0.5 shrink-0" size={14} />
        Your department or Finance team may still request other documents based on the transaction.
      </p>
    </section>
  );
}
