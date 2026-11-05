import { z } from 'zod';
import { administrativeRoles, protectedAccountLabel } from '../domain/access.js';
import { processEmailQueue, sendEmailPreview } from '../email/service.js';
import { emailTemplateKeys, renderEmailPreview } from '../email/templates.js';
import { requireStaff } from '../lib/auth.js';
import { HttpError, json, readJson } from '../lib/http.js';
import { getApprovingHeadOverview } from '../services/approving-heads.js';
import { handleAccountAdministrationRoutes } from './administration/accounts.js';
import type { RouteHandler } from './context.js';

export const handleAdministrationRoutes: RouteHandler = async ({ event, route, db, config }) => {
  if (route === 'approving-heads') {
    if (event.httpMethod === 'GET') {
      await requireStaff(event, administrativeRoles);
      return json(200, { ok: true, ...(await getApprovingHeadOverview(db)) });
    }
    if (event.httpMethod === 'POST') {
      await requireStaff(event, ['super_administrator']);
      throw new HttpError(
        409,
        'Department Heads are managed from Account Management. Each department can have only one head.',
      );
    }
    throw new HttpError(405, 'Method not allowed.');
  }

  const accountResponse = await handleAccountAdministrationRoutes({ event, route, db, config });
  if (accountResponse) return accountResponse;

  if (route === 'settings') {
    const settingsStaff = await requireStaff(event, administrativeRoles);
    if (event.httpMethod === 'GET') {
      const settings = await db.from('system_settings').select('*').order('key');
      if (settings.error) throw settings.error;
      return json(200, { ok: true, settings: settings.data || [] });
    }
    if (event.httpMethod === 'PATCH') {
      const input = z
        .object({
          key: z.enum(['workflow_targets', 'submission_options', 'upload_limits']),
          value: z.record(z.string(), z.unknown()),
        })
        .parse(readJson(event));
      const setting = await db
        .from('system_settings')
        .update({ value: input.value, updated_by: settingsStaff.user.id })
        .eq('key', input.key)
        .select()
        .single();
      if (setting.error) throw setting.error;
      return json(200, { ok: true, setting: setting.data });
    }
    throw new HttpError(405, 'Method not allowed.');
  }

  if (route === 'email-queue') {
    await requireStaff(event, ['super_administrator']);
    const validateRfp = z.string().regex(/^(RFP|CA|RF)-\\d{4,}$/i);
    const rfpNumber = event.httpMethod === 'GET'
      ? validateRfp.parse(event.queryStringParameters?.rfpNumber)
      : validateRfp.parse(z.object({ rfpNumber: z.string() }).parse(readJson(event)).rfpNumber);
    const request = await db.from('rfp_requests').select('id,rfp_number,final_status')
      .eq('rfp_number',rfpNumber).single();
    if (request.error || !request.data) throw new HttpError(404, 'Request reference not found.');
    if (event.httpMethod === 'GET') {
      const jobs = await db.from('email_notifications')
        .select('template_key,recipient_email,status,attempt_count,max_attempts,sent_at,last_error')
        .eq('request_id',request.data.id).order('created_at');
      if (jobs.error) throw jobs.error;
      return json(200,{ ok:true, reference:request.data.rfp_number, status:request.data.final_status,
        notifications: jobs.data || [] });
    }
    if (event.httpMethod === 'POST') {
      if (request.data.final_status !== 'Pending Department Approval') {
        // An obsolete supervisor-review URL must never be reissued after its decision.
        await db.from('email_notifications').update({
          status: 'cancelled', last_error: 'Request is no longer awaiting department approval',
        }).eq('request_id',request.data.id).eq('template_key','supervisor_review').in('status',['queued','retry','failed']);
      }
      await db.from('email_notifications').update({
        status: 'retry',attempt_count:0,next_attempt_at:new Date().toISOString(),
        last_error: null,
      }).eq('request_id',request.data.id).eq('status','failed');
      await db.from('email_notifications').update({next_attempt_at:new Date().toISOString()})
        .eq('request_id',request.data.id).in('status',['queued','retry']);
      const attempts = await processEmailQueue({requestId:request.data.id,limit:25});
      return json(200,{ ok:true, reference:rfpNumber,attempts,
        sent:attempts.filter((row)=>row.status==='sent').length,
        retrying:attempts.filter((row)=>row.status==='retry').length,
        failed:attempts.filter((row)=>row.status==='failed').length });
    }
    throw new HttpError(405, 'Method not allowed.');
  }

  if (route !== 'email-preview') return undefined;

  const staff = await requireStaff(event, administrativeRoles);
  const templateSchema = z.enum(emailTemplateKeys);
  if (event.httpMethod === 'GET') {
    const template = templateSchema.parse(
      event.queryStringParameters?.template || 'supervisor_review',
    );
    const deliveryConfigured = Boolean(
      config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASSWORD && config.SMTP_FROM_EMAIL,
    );
    return json(200, {
      ok: true,
      ...renderEmailPreview(template, config.SITE_URL),
      recipientLabel: protectedAccountLabel(staff.user.email),
      deliveryConfigured,
    });
  }
  if (event.httpMethod === 'POST') {
    const input = z.object({ template: templateSchema }).parse(readJson(event));
    if (!staff.user.email) {
      throw new HttpError(409, 'Your staff account does not have an email address.');
    }
    const messageId = await sendEmailPreview(input.template, staff.user.email);
    return json(200, {
      ok: true,
      recipientLabel: protectedAccountLabel(staff.user.email),
      messageId,
    });
  }
  throw new HttpError(405, 'Method not allowed.');
};
