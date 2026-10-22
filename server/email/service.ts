import nodemailer from 'nodemailer';
import { adminClient } from '../lib/supabase.js';
import { config } from '../lib/config.js';
import { renderEmail, renderEmailPreview, type EmailTemplateKey } from './templates.js';
import { openSealed } from '../lib/crypto.js';

type Notification = {
  id: string;
  request_id: string;
  template_key: string;
  recipient_email: string;
  payload: Record<string, unknown>;
  attempt_count: number;
  max_attempts: number;
};
type QueueOptions = { limit?: number; requestId?: string };
export type QueueDeliverySummary = {
  configured: boolean;
  sent: number;
  retrying: number;
  failed: number;
};
export function retryUpdate(attempt: number, maxAttempts: number, now = Date.now()) {
  const terminal = attempt >= maxAttempts;
  const delayMinutes = Math.min(60, 2 ** Math.max(0, attempt - 1));
  return {
    status: terminal ? 'failed' : 'retry',
    nextAttemptAt: new Date(now + delayMinutes * 60_000).toISOString(),
  };
}

export function isEmailDeliveryConfigured() {
  const c = config();
  return Boolean(c.SMTP_HOST && c.SMTP_USER && c.SMTP_PASSWORD && c.SMTP_FROM_EMAIL);
}

function smtpTransport() {
  const c = config();
  if (!c.SMTP_HOST || !c.SMTP_USER || !c.SMTP_PASSWORD || !c.SMTP_FROM_EMAIL)
    throw new Error('SMTP configuration is incomplete');
  return {
    c,
    transport: nodemailer.createTransport({
      host: c.SMTP_HOST,
      port: c.SMTP_PORT,
      secure: c.SMTP_SECURE,
      auth: { user: c.SMTP_USER, pass: c.SMTP_PASSWORD },
    }),
  };
}

export async function deliverNotification(notification: Notification) {
  const { c, transport } = smtpTransport();
  const db = adminClient();
  const { data: request, error } = await db
    .from('rfp_requests')
    .select('*')
    .eq('id', notification.request_id)
    .single();
  if (error) throw error;
  const { data: rows } = await db
    .from('request_attachments')
    .select('*')
    .eq('request_id', notification.request_id)
    .eq('status', 'available');
  const attachments: { filename: string; content: Buffer; cid: string; contentType?: string }[] =
    [];
  const links: { name: string; url?: string; cid?: string }[] = [];
  for (const item of rows || []) {
    if (!item.storage_path) continue;
    if (String(item.mime_type).startsWith('image/') && Number(item.size_bytes || 0) <= 2_000_000) {
      const downloaded = await db.storage.from('rfp-attachments').download(item.storage_path);
      if (!downloaded.error) {
        const cid = `${item.id}@rfp.local`;
        attachments.push({
          filename: item.original_filename,
          content: Buffer.from(await downloaded.data.arrayBuffer()),
          cid,
          contentType: item.mime_type,
        });
        links.push({ name: item.original_filename, cid });
        continue;
      }
    }
    const signed = await db.storage
      .from('rfp-attachments')
      .createSignedUrl(item.storage_path, 60 * 60 * 24 * 3);
    links.push({ name: item.original_filename, url: signed.data?.signedUrl });
  }
  const payload = { ...(notification.payload || {}) };
  if (typeof payload.reviewTokenCiphertext === 'string') {
    payload.reviewToken = openSealed(payload.reviewTokenCiphertext);
    delete payload.reviewTokenCiphertext;
  }
  if (typeof payload.trackingTokenCiphertext === 'string') {
    payload.trackingToken = openSealed(payload.trackingTokenCiphertext);
    delete payload.trackingTokenCiphertext;
  }
  const rendered = renderEmail(notification.template_key, request, payload, c.SITE_URL, links);
  const result = await transport.sendMail({
    from: c.SMTP_FROM_EMAIL,
    to: notification.recipient_email,
    subject: rendered.subject,
    html: rendered.html,
    attachments,
  });
  return result.messageId;
}

export async function sendEmailPreview(template: EmailTemplateKey, recipient: string) {
  const { c, transport } = smtpTransport();
  const rendered = renderEmailPreview(template, c.SITE_URL);
  const result = await transport.sendMail({
    from: c.SMTP_FROM_EMAIL,
    to: recipient,
    subject: `[PREVIEW] ${rendered.subject}`,
    html: rendered.html,
  });
  return result.messageId;
}

export async function processEmailQueue(options: number | QueueOptions = 10) {
  if (!isEmailDeliveryConfigured())
    throw new Error('Email delivery is not configured; queued notifications were left untouched.');
  const normalized = typeof options === 'number' ? { limit: options } : options;
  const limit = normalized.limit ?? 10;
  const db = adminClient();
  await db
    .from('email_notifications')
    .update({
      status: 'retry',
      next_attempt_at: new Date().toISOString(),
      last_error: 'Delivery worker stopped before completion',
      updated_at: new Date().toISOString(),
    })
    .eq('status', 'sending')
    .lt('last_attempt_at', new Date(Date.now() - 15 * 60_000).toISOString());
  let data: Notification[] = [];
  if (normalized.requestId) {
    const candidates = await db
      .from('email_notifications')
      .select('*')
      .eq('request_id', normalized.requestId)
      .in('status', ['queued', 'retry'])
      .lte('next_attempt_at', new Date().toISOString())
      .order('created_at')
      .limit(limit);
    if (candidates.error) throw candidates.error;
    for (const candidate of (candidates.data || []) as Notification[]) {
      const now = new Date().toISOString();
      const claimed = await db
        .from('email_notifications')
        .update({
          status: 'sending',
          attempt_count: candidate.attempt_count + 1,
          last_attempt_at: now,
          updated_at: now,
        })
        .eq('id', candidate.id)
        .eq('attempt_count', candidate.attempt_count)
        .in('status', ['queued', 'retry'])
        .select()
        .maybeSingle();
      if (claimed.error) throw claimed.error;
      if (claimed.data) data.push(claimed.data as Notification);
    }
  } else {
    const claimed = await db.rpc('claim_email_notifications', { p_limit: limit });
    if (claimed.error) throw claimed.error;
    data = (claimed.data || []) as Notification[];
  }
  const results = [];
  for (const item of data) {
    try {
      const messageId = await deliverNotification(item);
      await db
        .from('email_notifications')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          provider_message_id: messageId,
          last_error: null,
        })
        .eq('id', item.id);
      results.push({ id: item.id, status: 'sent' });
    } catch (error) {
      const retry = retryUpdate(item.attempt_count, item.max_attempts);
      await db
        .from('email_notifications')
        .update({
          status: retry.status,
          next_attempt_at: retry.nextAttemptAt,
          last_error: error instanceof Error ? error.message : 'Delivery failed',
        })
        .eq('id', item.id);
      results.push({ id: item.id, status: retry.status });
    }
  }
  return results;
}

export async function flushEmailQueueForRequest(requestId: string): Promise<QueueDeliverySummary> {
  if (!isEmailDeliveryConfigured()) return { configured: false, sent: 0, retrying: 0, failed: 0 };
  try {
    const results = await processEmailQueue({ requestId, limit: 25 });
    return {
      configured: true,
      sent: results.filter((item) => item.status === 'sent').length,
      retrying: results.filter((item) => item.status === 'retry').length,
      failed: results.filter((item) => item.status === 'failed').length,
    };
  } catch (error) {
    console.error(
      'Immediate email delivery failed; notifications remain available for retry.',
      error,
    );
    return { configured: true, sent: 0, retrying: 0, failed: 1 };
  }
}
