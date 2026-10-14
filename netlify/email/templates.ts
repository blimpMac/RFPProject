type RequestRecord = Record<string, unknown>;
const money = (value: unknown) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value || 0));
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[c]!));

function shell(title: string, body: string) {
  return `<!doctype html><html><body style="margin:0;background:#f4f6f8;font-family:Arial,sans-serif;color:#172033"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="620" style="max-width:100%;background:#fff;border:1px solid #dfe4ea;border-radius:10px"><tr><td style="padding:22px 28px;background:#102a43;color:#fff;border-radius:10px 10px 0 0"><strong>RFP Monitoring System</strong></td></tr><tr><td style="padding:28px"><h1 style="font-size:22px;margin:0 0 18px">${escape(title)}</h1>${body}</td></tr></table></td></tr></table></body></html>`;
}
const row = (label: string, value: unknown) => `<tr><td style="padding:7px;color:#667085;width:38%">${escape(label)}</td><td style="padding:7px;font-weight:600">${escape(value)}</td></tr>`;

export function renderEmail(template: string, request: RequestRecord, payload: Record<string, unknown>, siteUrl: string, attachmentLinks: {name:string;url?:string;cid?:string}[]) {
  const rfp = escape(request.rfp_number);
  if (template === 'supervisor_review') {
    const reviewUrl = `${siteUrl}/review/${encodeURIComponent(String(payload.reviewToken))}`;
    const documents = attachmentLinks.length ? `<h2 style="font-size:16px">Supporting documents</h2><ul>${attachmentLinks.map((a) => `<li>${a.cid ? `<img src="cid:${a.cid}" alt="${escape(a.name)}" style="max-width:180px;max-height:120px;display:block;margin:6px 0">` : ''}${a.url ? `<a href="${escape(a.url)}">${escape(a.name)}</a>` : escape(a.name)}</li>`).join('')}</ul>` : '';
    const table = `<table width="100%" cellspacing="0" style="border-collapse:collapse">${row('RFP number',request.rfp_number)}${row('Requestor',request.requestor_name)}${row('Email',request.requestor_email)}${row('Department',request.department)}${row('Project / Class',request.project_class)}${row('RFP type',request.rfp_type)}${row('Supplier / Payee',request.supplier_payee)}${row('Amount',money(request.amount))}${row('Required payment date',request.required_payment_date)}${row('Purpose',request.purpose_description)}</table>`;
    return { subject: `Review required: ${request.rfp_number}`, html: shell(`Department approval — ${rfp}`, `${table}${documents}<p style="margin-top:24px"><a href="${escape(reviewUrl)}" style="display:inline-block;background:#1f6f4a;color:#fff;text-decoration:none;padding:12px 18px;border-radius:6px">Open secure review</a></p><p style="font-size:12px;color:#667085">Opening this link does not approve or reject the request. A decision requires confirmation on the secure page.</p>`) };
  }
  const remarks = payload.remarks ? `<p><strong>Remarks:</strong> ${escape(payload.remarks)}</p>` : '';
  if (template === 'department_approved') return { subject: `${request.rfp_number} approved by department`, html: shell(`${rfp} approved`, `<p>Your request is approved, please wait for further instructions.</p>${remarks}`) };
  if (template === 'department_rejected') return { subject: `${request.rfp_number} requires your attention`, html: shell(`${rfp} not approved`, `<p>Your request is not approved, please provide documentation or clarify your reason.</p>${remarks}`) };
  if (template === 'documentation_required') return { subject: `${request.rfp_number} needs documentation`, html: shell(`Documentation required for ${rfp}`, `<p>Finance needs additional supporting documentation before continuing.</p>${remarks}`) };
  return { subject: `${request.rfp_number} finance update`, html: shell(`Update for ${rfp}`, `<p>The finance review status has changed.</p>${remarks}`) };
}
