from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text()
    if old not in text:
        raise RuntimeError(f'Expected block not found in {path}: {old[:160]!r}')
    target.write_text(text.replace(old, new, 1))


# Public request form: add a second dropdown that is distinct from the existing RFP Type.
replace_once(
    'src/pages/RequestPage.tsx',
    "  rfpType: string;\n  supplierPayee: string;",
    "  rfpType: string;\n  requestType: string;\n  supplierPayee: string;",
)
replace_once(
    'src/pages/RequestPage.tsx',
    "  rfpType: '',\n  supplierPayee: '',",
    "  rfpType: '',\n  requestType: '',\n  supplierPayee: '',",
)
replace_once(
    'src/pages/RequestPage.tsx',
    """            <Select
              label=\"Type\"
              value={form.rfpType}
              options={options.requestTypes}
              onChange={(v) => {
                update('rfpType', v);
                setAttachmentChecklist([]);
              }}
            />
            <Field
              label=\"Supplier / Payee\"""",
    """            <Select
              label=\"Type\"
              value={form.rfpType}
              options={options.requestTypes}
              onChange={(v) => {
                update('rfpType', v);
                setAttachmentChecklist([]);
              }}
            />
            <Select
              label=\"Type of Request\"
              value={form.requestType}
              options={['Regular', 'Emergency']}
              onChange={(v) => update('requestType', v)}
            />
            <Field
              label=\"Supplier / Payee\"""",
)

# Server validation: only allow the two requested values.
replace_once(
    'server/lib/validation.ts',
    "  rfpType: z.string().trim().min(1).max(100),\n  supplierPayee:",
    "  rfpType: z.string().trim().min(1).max(100),\n  requestType: z.enum(['Regular', 'Emergency']),\n  supplierPayee:",
)
replace_once(
    'server/lib/validation.test.ts',
    "  rfpType: 'Supplier Payment',\n  supplierPayee:",
    "  rfpType: 'Supplier Payment',\n  requestType: 'Regular',\n  supplierPayee:",
)

# Persist Type of Request inside the existing request metadata so no production schema migration is needed.
replace_once(
    'server/routes/public.ts',
    """        raw_record: {
          ...existingRaw,
          submission_checklist: input.request.attachmentChecklist || [],
        },""",
    """        raw_record: {
          ...existingRaw,
          request_type: input.request.requestType,
          submission_checklist: input.request.attachmentChecklist || [],
        },""",
)
replace_once(
    'server/routes/public.ts',
    "      request: { ...request.data, raw_record: undefined },",
    """      request: {
        ...request.data,
        request_type: typeof rawRecord.request_type === 'string' ? rawRecord.request_type : null,
        raw_record: undefined,
      },""",
)
replace_once(
    'server/routes/public.ts',
    """        'id,rfp_number,requestor_name,requestor_email,company,department,project_class,rfp_type,supplier_payee,purpose_description,amount,required_payment_date,final_status',""",
    """        'id,rfp_number,requestor_name,requestor_email,company,department,project_class,rfp_type,supplier_payee,purpose_description,amount,required_payment_date,final_status,raw_record',""",
)
replace_once(
    'server/routes/public.ts',
    """    if (request.error) throw request.error;
    const attachments = await db""",
    """    if (request.error) throw request.error;
    const reviewRaw =
      request.data.raw_record &&
      typeof request.data.raw_record === 'object' &&
      !Array.isArray(request.data.raw_record)
        ? (request.data.raw_record as Record<string, unknown>)
        : {};
    const attachments = await db""",
)
replace_once(
    'server/routes/public.ts',
    "    return json(200, { ok: true, request: request.data, attachments: previews });",
    """    return json(200, {
      ok: true,
      request: {
        ...request.data,
        request_type: typeof reviewRaw.request_type === 'string' ? reviewRaw.request_type : null,
        raw_record: undefined,
      },
      attachments: previews,
    });""",
)

# Shared request type model for staff and print views.
replace_once(
    'src/types/index.ts',
    "  rfp_type: string;\n  supplier_payee:",
    "  rfp_type: string;\n  request_type?: string | null;\n  supplier_payee:",
)
replace_once(
    'src/types/index.ts',
    "  raw_record?: {\n    submission_checklist?: string[];",
    "  raw_record?: {\n    request_type?: 'Regular' | 'Emergency';\n    submission_checklist?: string[];",
)

# Digital RFP: show both fields clearly and independently.
replace_once(
    'src/components/DigitalRfpReceipt.tsx',
    "  rfp_type: string;\n  supplier_payee:",
    "  rfp_type: string;\n  request_type?: string | null;\n  raw_record?: { request_type?: string | null } | null;\n  supplier_payee:",
)
replace_once(
    'src/components/DigitalRfpReceipt.tsx',
    "  const availableAttachments = attachments.filter((attachment) => attachment.status !== 'deleted');",
    """  const availableAttachments = attachments.filter((attachment) => attachment.status !== 'deleted');
  const typeOfRequest = request.request_type || request.raw_record?.request_type || 'Not recorded';""",
)
replace_once(
    'src/components/DigitalRfpReceipt.tsx',
    """          <Detail label=\"Requestor\" value={request.requestor_name} />
          <Detail label=\"Payment Type\" value={request.rfp_type} />""",
    """          <Detail label=\"Requestor\" value={request.requestor_name} />
          <Detail label=\"Type\" value={request.rfp_type} />
          <Detail label=\"Type of Request\" value={typeOfRequest} />""",
)

# Requestor tracking: surface the new field in the request summary and Digital RFP.
replace_once(
    'src/pages/TrackPage.tsx',
    "    rfp_type: string;\n    supplier_payee:",
    "    rfp_type: string;\n    request_type?: string | null;\n    supplier_payee:",
)
replace_once(
    'src/pages/TrackPage.tsx',
    "            ['Department', r.department],\n            ['Amount', php.format(r.amount)],",
    "            ['Department', r.department],\n            ['Type of request', r.request_type || 'Not recorded'],\n            ['Amount', php.format(r.amount)],",
)

# Department review: show urgency before an approver makes a decision.
replace_once(
    'src/pages/ReviewPage.tsx',
    "    rfp_type: string;\n    supplier_payee:",
    "    rfp_type: string;\n    request_type?: string | null;\n    supplier_payee:",
)
replace_once(
    'src/pages/ReviewPage.tsx',
    "            ['Type', r.rfp_type],\n            ['Supplier / Payee', r.supplier_payee],",
    "            ['Type', r.rfp_type],\n            ['Type of Request', r.request_type || 'Not recorded'],\n            ['Supplier / Payee', r.supplier_payee],",
)

# Finance detail popup: keep the two meanings visibly separate.
replace_once(
    'src/pages/ApprovalsPage.tsx',
    "              ['RFP type', selected.rfp_type],\n              ['Supplier / Payee', selected.supplier_payee],",
    "              ['RFP type', selected.rfp_type],\n              ['Type of request', String(selected.raw_record?.request_type || 'Not recorded')],\n              ['Supplier / Payee', selected.supplier_payee],",
)

print('Type of Request field prepared across submission, review, tracking, finance, and digital RFP.')
