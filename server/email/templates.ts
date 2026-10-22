type RequestRecord = Record<string, unknown>;
export type EmailAttachmentLink = { name: string; url?: string; cid?: string };
export const emailTemplateKeys = [
  'submission_received',
  'supervisor_review',
  'department_approved',
  'department_rejected',
  'finance_review_required',
  'processing_started',
  'finance_returned',
  'documentation_required',
  'check_released',
  'payment_completed',
] as const;
export type EmailTemplateKey = (typeof emailTemplateKeys)[number];

const money = (value: unknown) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value || 0));
const escape = (value: unknown) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]!,
  );
const row = (label: string, value: unknown) =>
  `<tr><td style="padding:8px 7px;color:#667085;width:38%;border-bottom:1px solid #edf0f3">${escape(label)}</td><td style="padding:8px 7px;font-weight:600;border-bottom:1px solid #edf0f3">${escape(value)}</td></tr>`;
const button = (label: string, url: string, color = '#1f6f4a') =>
  `<a href="${escape(url)}" style="display:inline-block;background:${color};color:#fff;text-decoration:none;padding:12px 18px;border-radius:7px;font-weight:700">${escape(label)}</a>`;
const summary = (request: RequestRecord) =>
  `<table role="presentation" width="100%" cellspacing="0" style="margin:22px 0;border-collapse:collapse;background:#f8fafc;border:1px solid #e4e9ef;border-radius:8px">${row('RFP number', request.rfp_number)}${row('Requestor', request.requestor_name)}${row('Department', request.department)}${row('Supplier / Payee', request.supplier_payee)}${row('Amount', money(request.amount))}${row('Required payment date', request.required_payment_date)}</table>`;

function shell(title: string, body: string, preheader = title) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"></head><body style="margin:0;background:#eef2f6;font-family:Arial,sans-serif;color:#172033"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${escape(preheader)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef2f6"><tr><td align="center" style="padding:32px 12px"><table role="presentation" width="620" cellspacing="0" cellpadding="0" style="width:100%;max-width:620px;background:#fff;border:1px solid #d8e0e8;border-radius:14px;overflow:hidden;box-shadow:0 8px 30px rgba(16,42,67,.08)"><tr><td style="height:5px;background:#2f855a;font-size:0">&nbsp;</td></tr><tr><td style="padding:22px 28px;background:#102a43;color:#fff"><div style="font-size:18px;font-weight:700">RFP Monitoring System</div><div style="margin-top:4px;color:#c9d5e2;font-size:12px">GREENLIGHT POWER &times; GEMCOR</div></td></tr><tr><td style="padding:30px 28px"><h1 style="font-size:23px;line-height:1.3;margin:0 0 18px;color:#102a43">${escape(title)}</h1>${body}</td></tr><tr><td style="padding:18px 28px;background:#f7f9fb;border-top:1px solid #e4e9ef;color:#667085;font-size:12px;line-height:1.55">This is an automated workflow notification. Please keep the RFP number in the subject when following up.<br><span style="color:#8793a3">RFP Monitoring System &bull; Asia/Manila</span></td></tr></table></td></tr></table></body></html>`;
}

export function renderEmail(
  template: string,
  request: RequestRecord,
  payload: Record<string, unknown>,
  siteUrl: string,
  attachmentLinks: EmailAttachmentLink[],
) {
  const rfp = escape(request.rfp_number);
  const remarks = payload.remarks
    ? `<div style="margin:20px 0;padding:14px 16px;border-left:4px solid #d39b22;background:#fff8e5"><strong>Remarks</strong><div style="margin-top:5px">${escape(payload.remarks)}</div></div>`
    : '';
  if (template === 'submission_received') {
    const trackingUrl =
      typeof payload.trackingToken === 'string'
        ? `${siteUrl}/track/${encodeURIComponent(payload.trackingToken)}`
        : '';
    return {
      subject: `${request.rfp_number} was submitted`,
      html: shell(
        `${rfp} received`,
        `<p>Your payment request was submitted successfully and is now waiting for department approval.</p>${summary(request)}${trackingUrl ? `<p style="margin-top:24px">${button('View live request status', trackingUrl, '#315c93')}</p>` : ''}<p style="font-size:12px;color:#667085;line-height:1.5">Keep your private tracking link secure. It can be used to view updates and respond to correction requests.</p>`,
        `Request ${request.rfp_number} was received`,
      ),
    };
  }
  if (template === 'supervisor_review') {
    const reviewUrl = `${siteUrl}/review/${encodeURIComponent(String(payload.reviewToken))}`;
    const documents = attachmentLinks.length
      ? `<h2 style="font-size:16px;margin-top:24px;color:#102a43">Supporting documents</h2>${attachmentLinks.map((attachment) => `<div style="margin:14px 0 24px">${attachment.cid ? `<img src="cid:${attachment.cid}" alt="${escape(attachment.name)}" style="width:100%;max-width:540px;max-height:720px;object-fit:contain;display:block;margin:8px auto;border:1px solid #dfe4ea;border-radius:8px">` : ''}<div style="margin-top:8px;font-size:13px;text-align:center">${attachment.url ? `<a href="${escape(attachment.url)}" style="color:#315c93">${escape(attachment.name)}</a>` : escape(attachment.name)}</div></div>`).join('')}`
      : '';
    const details = `<table role="presentation" width="100%" cellspacing="0" style="border-collapse:collapse">${row('RFP number', request.rfp_number)}${row('Requestor', request.requestor_name)}${row('Email', request.requestor_email)}${row('Department', request.department)}${row('Project / Class', request.project_class)}${row('Type', request.rfp_type)}${row('Supplier / Payee', request.supplier_payee)}${row('Amount', money(request.amount))}${row('Required payment date', request.required_payment_date)}${row('Purpose', request.purpose_description)}</table>`;
    const correction = payload.correctionNote
      ? `<div style="margin-top:20px;padding:14px 16px;border-left:4px solid #315c93;background:#f1f6fc"><strong>Requestor correction note</strong><div style="margin-top:5px">${escape(payload.correctionNote)}</div></div>`
      : '';
    return {
      subject: `Review required: ${request.rfp_number}`,
      html: shell(
        `Department approval — ${rfp}`,
        `<p style="margin-top:0;color:#526174">A payment request is ready for your review.</p>${details}${correction}${documents}<p style="margin-top:26px">${button('Open secure review', reviewUrl)}</p><p style="font-size:12px;color:#667085;line-height:1.5">Opening this link does not approve or reject the request. A decision requires confirmation on the secure page.</p>`,
        `Review required for ${request.rfp_number}`,
      ),
    };
  }
  if (template === 'department_approved')
    return {
      subject: `${request.rfp_number} approved by department`,
      html: shell(
        `${rfp} approved`,
        `<p>Your request is approved, please wait for further instructions.</p>${summary(request)}${remarks}`,
      ),
    };
  if (template === 'department_rejected')
    return {
      subject: `${request.rfp_number} requires your attention`,
      html: shell(
        `${rfp} not approved`,
        `<p>Your request is not approved. Please provide the requested documentation or clarify the reason.</p>${summary(request)}${remarks}`,
      ),
    };
  if (template === 'finance_review_required')
    return {
      subject: `Finance review required: ${request.rfp_number}`,
      html: shell(
        `Finance review — ${rfp}`,
        `<p>Department approval is complete. A finance approver may now review and act on this request.</p>${summary(request)}<p style="margin-top:24px">${button('Open finance approvals', `${siteUrl}/admin/approvals`, '#315c93')}</p>`,
      ),
    };
  if (template === 'processing_started')
    return {
      subject: `${request.rfp_number} is processing`,
      html: shell(
        `${rfp} is processing`,
        `<p>Finance approved this request and processing has started.</p>${summary(request)}<div style="margin:20px 0;padding:14px 16px;background:#edf8f2;border-radius:8px"><strong>Target release date:</strong> ${escape(payload.plannedCheckDate || 'To be confirmed')}</div>${remarks}`,
      ),
    };
  if (template === 'finance_returned')
    return {
      subject: `${request.rfp_number} returned for attention`,
      html: shell(
        `${rfp} returned`,
        `<p>Finance returned this request to the Department Approver for correction or clarification.</p>${summary(request)}${remarks}<p style="margin-top:24px">${button('Open department re-review', `${siteUrl}/admin/approvals`, '#315c93')}</p>`,
      ),
    };
  if (template === 'documentation_required')
    return {
      subject: `${request.rfp_number} needs documentation`,
      html: shell(
        `Documentation required for ${rfp}`,
        `<p>Finance needs additional supporting documentation before continuing.</p>${summary(request)}${remarks}`,
      ),
    };
  if (template === 'check_released')
    return {
      subject: `${request.rfp_number} check released`,
      html: shell(
        `Check released for ${rfp}`,
        `<p>The check has been released. Please coordinate with the responsible finance staff for receipt.</p>${summary(request)}`,
      ),
    };
  if (template === 'payment_completed')
    return {
      subject: `${request.rfp_number} payment completed`,
      html: shell(
        `Payment completed for ${rfp}`,
        `<p>The payment process is complete and this request is now marked Paid.</p>${summary(request)}`,
      ),
    };
  return {
    subject: `${request.rfp_number} finance update`,
    html: shell(
      `Update for ${rfp}`,
      `<p>The finance review status has changed.</p>${summary(request)}${remarks}`,
    ),
  };
}

export function renderEmailPreview(template: EmailTemplateKey, siteUrl: string) {
  const request = {
    rfp_number: 'RFP-0248',
    requestor_name: 'Juan Dela Cruz',
    requestor_email: 'juan@example.com',
    department: 'Operations',
    project_class: 'Plant Maintenance',
    rfp_type: 'Supplier Payment',
    supplier_payee: 'Sample Industrial Supplies',
    amount: 48750,
    required_payment_date: '2026-10-30',
    purpose_description: 'Replacement parts and preventive maintenance materials.',
  };
  const payload = {
    trackingToken: 'preview-only-not-valid',
    reviewToken: 'preview-only-not-valid',
    remarks: 'Please review the attached supporting documents.',
    plannedCheckDate: '2026-10-30',
  };
  return renderEmail(
    template,
    request,
    payload,
    siteUrl,
    template === 'supervisor_review' ? [{ name: 'sample-invoice.pdf', url: '#' }] : [],
  );
}
