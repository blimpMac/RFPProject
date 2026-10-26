from pathlib import Path


def read(path: str) -> str:
    return Path(path).read_text()


def write(path: str, content: str) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content)


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    if old not in text:
        raise RuntimeError(f'Expected block not found in {path}: {old[:120]!r}')
    write(path, text.replace(old, new, 1))


write(
    'shared/constants/request-types.ts',
    """export const rfpRequestTypes = [
  'Trade Supplier',
  'Exclusive Supplier',
  'Subcon Request',
  'TTC Request',
  'Open payment - Agency',
  'Reimbursement',
  'Open - non PO transactions',
  'Cash Advance Request',
  'CA / EF Liquidation',
] as const;
""",
)

write(
    'src/components/RequestAttachmentChecklist.tsx',
    r'''import { ClipboardCheck } from 'lucide-react';

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
''',
)

replace_once(
    'server/routes/public.ts',
    "import { getPublicApprovers } from '../services/approving-heads.js';",
    "import { getPublicApprovers } from '../services/approving-heads.js';\nimport { rfpRequestTypes } from '../../shared/constants/request-types.js';",
)

replace_once(
    'server/routes/public.ts',
    """    return json(200, {
      ok: true,
      options: data?.value || {},
      approvers,
      limits: { maxFiles: config.MAX_UPLOAD_FILES, maxSizeMb: config.MAX_UPLOAD_SIZE_MB },
    });""",
    """    const configuredOptions = (data?.value || {}) as { departments?: string[] };
    return json(200, {
      ok: true,
      options: { ...configuredOptions, requestTypes: [...rfpRequestTypes] },
      approvers,
      limits: { maxFiles: config.MAX_UPLOAD_FILES, maxSizeMb: config.MAX_UPLOAD_SIZE_MB },
    });""",
)

replace_once(
    'server/routes/public.ts',
    """    const options = optionRow.data.value as { departments?: string[]; requestTypes?: string[] };
    const departmentAllowed = options.departments?.some(
      (department) =>
        normalizeDepartment(department) === normalizeDepartment(input.request.department),
    );
    const requestTypeAllowed = options.requestTypes?.some(
      (requestType) =>
        normalizeDepartment(requestType) === normalizeDepartment(input.request.rfpType),
    );""",
    """    const options = optionRow.data.value as { departments?: string[] };
    const departmentAllowed = options.departments?.some(
      (department) =>
        normalizeDepartment(department) === normalizeDepartment(input.request.department),
    );
    const requestTypeAllowed = rfpRequestTypes.some(
      (requestType) =>
        normalizeDepartment(requestType) === normalizeDepartment(input.request.rfpType),
    );""",
)

replace_once(
    'src/pages/RequestPage.tsx',
    """          <p className=\"mt-2 max-w-2xl text-base text-slate-600\">
            Complete the request details. Supporting files are strongly recommended, but uploads
            remain optional at submission.
          </p>""",
    """          <p className=\"mt-2 max-w-2xl text-base text-slate-600\">
            Complete the request details and review the document checklist for the selected type.
          </p>""",
)

replace_once(
    'src/pages/RequestPage.tsx',
    """              <div className=\"mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900\">
                <strong>Attachment reminder:</strong> Upload supporting documents when available.
                Files are not mandatory to submit because the system cannot reliably determine each
                document type, but missing support may cause the request to be returned during
                approval.
              </div>
""",
    '',
)

print('Request type dropdown, checklist, and reminder updates prepared.')
