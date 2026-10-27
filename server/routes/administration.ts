import { z } from 'zod';
import { administrativeRoles, protectedAccountLabel } from '../domain/access.js';
import { sendEmailPreview } from '../email/service.js';
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
