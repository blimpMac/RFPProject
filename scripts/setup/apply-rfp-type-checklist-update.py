from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text()
    if old not in text:
        raise RuntimeError(f'Expected block not found in {path}: {old[:120]!r}')
    target.write_text(text.replace(old, new, 1))


request_types = [
    'Trade Supplier',
    'Exclusive Supplier',
    'Subcon Request',
    'TTC Request',
    'Open payment - Agency',
    'Reimbursement',
    'Open - non PO transactions',
    'Cash Advance Request',
    'CA / EF liquidation',
]

# Keep the public form and server-side validation on the same fixed RFP type list.
public_route = Path('server/routes/public.ts')
public_text = public_route.read_text()
anchor = "import type { RouteHandler } from './context.js';\n"
if 'const requestTypes = [' not in public_text:
    const_block = anchor + "\nconst requestTypes = [\n" + ''.join(
        f"  {value!r},\n" for value in request_types
    ) + "] as const;\n"
    if anchor not in public_text:
        raise RuntimeError('Could not locate RouteHandler import in server/routes/public.ts')
    public_text = public_text.replace(anchor, const_block, 1)

old_options = "      options: data?.value || {},"
new_options = "      options: { ...(data?.value || {}), requestTypes: [...requestTypes] },"
if old_options not in public_text:
    raise RuntimeError('Could not locate public config options response.')
public_text = public_text.replace(old_options, new_options, 1)

old_validation = """    const requestTypeAllowed = options.requestTypes?.some(
      (requestType) =>
        normalizeDepartment(requestType) === normalizeDepartment(input.request.rfpType),
    );"""
new_validation = """    const requestTypeAllowed = requestTypes.some(
      (requestType) => requestType === input.request.rfpType,
    );"""
if old_validation not in public_text:
    raise RuntimeError('Could not locate request type validation block.')
public_text = public_text.replace(old_validation, new_validation, 1)
public_route.write_text(public_text)

# Remove reminder copy while retaining the upload control and optional checklist.
replace_once(
    'src/pages/RequestPage.tsx',
    """          <p className=\"mt-2 max-w-2xl text-base text-slate-600\">
            Complete the request details. Supporting files are strongly recommended, but uploads
            remain optional at submission.
          </p>""",
    """          <p className=\"mt-2 max-w-2xl text-base text-slate-600\">
            Complete the request details and use the document checklist for the selected RFP type as needed.
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

# Replace the checklist with the supplied RFP-type matrix. The checklist is intentionally optional.
Path('src/components/RequestAttachmentChecklist.tsx').write_text(r"""import { ClipboardCheck } from 'lucide-react';

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
        'MRF, if any',
        'CARS, for equipment request',
      ],
    },
    {
      label: 'External documents',
      items: ['Invoice', 'Delivery Receipt, if any', 'BIR 2303, for new suppliers'],
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
        'BIR 2303, for new suppliers',
        'Bank details, for new suppliers',
      ],
    },
  ],
  'Subcon Request': [
    {
      label: 'Internal documents',
      items: [
        'Approved Request for Payment Form',
        'Signed Purchase Order',
        'Approved Quotation',
      ],
    },
    {
      label: 'External documents',
      items: ['Invoice', 'Signed Billing / Quotation / Purchase Order', 'Progress Report'],
    },
  ],
  'TTC Request': [
    {
      label: 'Internal documents',
      items: ['Approved Request for Payment Form', 'Fuel & Lube', 'SOF Copy'],
    },
  ],
  'Open payment - Agency': [
    {
      label: 'Internal documents',
      items: ['Approved Request for Payment Form', 'Signed Contract'],
    },
    {
      label: 'External documents',
      items: ['Invoice', 'ETR'],
    },
  ],
  Reimbursement: [
    {
      label: 'Internal documents',
      items: ['Approved Request for Payment Form', 'Proof of payment'],
    },
    {
      label: 'External documents',
      items: ['Invoice / receipts / AR'],
    },
  ],
  'Open - non PO transactions': [
    {
      label: 'Internal documents',
      items: ['Approved Request for Payment Form', 'Signed Contracts', 'Canvass Form'],
    },
    {
      label: 'External documents',
      items: ['Invoice', 'DR, if any'],
    },
  ],
  'Cash Advance Request': [
    {
      label: 'Internal documents',
      items: [
        'Approved Request for Payment Form',
        'Budget Estimate with budget allocation breakdown',
        'Service Request / BOM / BOQ - CA for servicing, if needed',
        'Quotation / Canvass / Invoice - CA for purchase',
        'Training agreement and form with approval - CA for training',
      ],
    },
    {
      label: 'External documents',
      items: [
        'Contract (Service / Lease Contract)',
        'MRF Form, if needed',
        'CAPEX, if needed',
      ],
    },
  ],
  'CA / EF liquidation': [
    {
      label: 'Internal documents',
      items: ['Approved Expense Summary', 'Proof of return of excess funds'],
    },
    {
      label: 'External documents',
      items: ['Invoices / receipts / AR', 'CWT / BIR 2307, if any'],
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
            <p className="mt-1 text-xs leading-5 text-slate-500">{rfpType}</p>
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
""")

print('RFP type dropdown, checklist matrix, and reminder cleanup prepared.')
