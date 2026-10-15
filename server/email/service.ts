import nodemailer from 'nodemailer';
import { adminClient } from '../lib/supabase.js';
import { config } from '../lib/config.js';
import { renderEmail } from './templates.js';
import { openSealed } from '../lib/crypto.js';

type Notification = { id:string; request_id:string; template_key:string; recipient_email:string; payload:Record<string,unknown>; attempt_count:number; max_attempts:number };
export function retryUpdate(attempt:number,maxAttempts:number,now=Date.now()){const terminal=attempt>=maxAttempts;const delayMinutes=Math.min(60,2**Math.max(0,attempt-1));return{status:terminal?'failed':'retry',nextAttemptAt:new Date(now+delayMinutes*60_000).toISOString()}}

export async function deliverNotification(notification: Notification) {
  const c = config();
  if (!c.SMTP_HOST || !c.SMTP_USER || !c.SMTP_PASSWORD || !c.SMTP_FROM_EMAIL) throw new Error('SMTP configuration is incomplete');
  const db = adminClient();
  const { data: request, error } = await db.from('rfp_requests').select('*').eq('id', notification.request_id).single();
  if (error) throw error;
  const { data: rows } = await db.from('request_attachments').select('*').eq('request_id', notification.request_id).eq('status','available');
  const attachments: { filename:string; content:Buffer; cid:string; contentType?:string }[] = [];
  const links: { name:string;url?:string;cid?:string }[] = [];
  for (const item of rows || []) {
    if (!item.storage_path) continue;
    if (String(item.mime_type).startsWith('image/') && Number(item.size_bytes || 0) <= 2_000_000) {
      const downloaded = await db.storage.from('rfp-attachments').download(item.storage_path);
      if (!downloaded.error) {
        const cid = `${item.id}@rfp.local`;
        attachments.push({ filename:item.original_filename, content:Buffer.from(await downloaded.data.arrayBuffer()), cid, contentType:item.mime_type });
        links.push({ name:item.original_filename, cid });
        continue;
      }
    }
    const signed = await db.storage.from('rfp-attachments').createSignedUrl(item.storage_path, 60 * 60 * 24 * 3);
    links.push({ name:item.original_filename, url:signed.data?.signedUrl });
  }
  const payload={...(notification.payload||{})};
  if(typeof payload.reviewTokenCiphertext==='string'){payload.reviewToken=openSealed(payload.reviewTokenCiphertext);delete payload.reviewTokenCiphertext}
  const rendered = renderEmail(notification.template_key, request, payload, c.SITE_URL, links);
  const transport = nodemailer.createTransport({ host:c.SMTP_HOST, port:c.SMTP_PORT, secure:c.SMTP_SECURE, auth:{ user:c.SMTP_USER, pass:c.SMTP_PASSWORD } });
  const result = await transport.sendMail({ from:c.SMTP_FROM_EMAIL, to:notification.recipient_email, subject:rendered.subject, html:rendered.html, attachments });
  return result.messageId;
}

export async function processEmailQueue(limit = 10) {
  const db = adminClient();
  const { data, error } = await db.rpc('claim_email_notifications', { p_limit:limit });
  if (error) throw error;
  const results = [];
  for (const item of (data || []) as Notification[]) {
    try {
      const messageId = await deliverNotification(item);
      await db.from('email_notifications').update({ status:'sent', sent_at:new Date().toISOString(), provider_message_id:messageId, last_error:null }).eq('id',item.id);
      results.push({ id:item.id, status:'sent' });
    } catch (error) {
      const retry=retryUpdate(item.attempt_count,item.max_attempts);
      await db.from('email_notifications').update({ status:retry.status, next_attempt_at:retry.nextAttemptAt, last_error:error instanceof Error?error.message:'Delivery failed' }).eq('id',item.id);
      results.push({ id:item.id, status:retry.status });
    }
  }
  return results;
}
