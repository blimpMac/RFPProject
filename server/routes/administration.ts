import { z } from 'zod';
import type { StaffUser } from '../../shared/contracts/accounts.js';
import {
  administrativeRoles,
  isLegacyProtectedStaffEmail,
  protectedAccountLabel,
} from '../domain/access.js';
import { sendEmailPreview } from '../email/service.js';
import { emailTemplateKeys, renderEmailPreview } from '../email/templates.js';
import { requireStaff } from '../lib/auth.js';
import { ensureMethod, HttpError, json, readJson } from '../lib/http.js';
import { accessRole } from '../lib/staff-access.js';
import { getApprovingHeadOverview } from '../services/approving-heads.js';
import {
  assignDepartmentHead,
  clearDepartmentHeadAssignments,
  FINANCE_DEPARTMENT,
  resolveDepartmentHeadTarget,
} from '../services/account-governance.js';
import type { RouteHandler } from './context.js';

const staffAccountSchema = z.discriminatedUnion('accessLevel', [
  z.object({
    email: z.email(),
    fullName: z.string().min(2).max(160),
    accessLevel: z.literal('staff'),
    department: z.string().max(100).optional(),
  }),
  z.object({
    email: z.email(),
    fullName: z.string().min(2).max(160),
    accessLevel: z.literal('approver'),
    department: z.string().min(1).max(100),
  }),
]);

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

  if (route === 'staff-users/reset-password') {
    ensureMethod(event, 'POST');
    await requireStaff(event, ['super_administrator']);
    const input = z.object({ userId: z.uuid() }).parse(readJson(event));
    const target = await db.auth.admin.getUserById(input.userId);
    if (target.error || !target.data.user?.email) throw new HttpError(404, 'Account not found.');
    const reset = await db.auth.resetPasswordForEmail(target.data.user.email, {
      redirectTo: `${config.SITE_URL}/admin/reset-password`,
    });
    if (reset.error) throw new HttpError(409, reset.error.message);
    return json(200, { ok: true });
  }

  if (route === 'staff-users') {
    const staff = await requireStaff(event, ['super_administrator']);
    if (event.httpMethod === 'GET') {
      const listed = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (listed.error) throw listed.error;
      const [roleResult, profileResult, headResult] = await Promise.all([
        db.from('user_roles').select('user_id,role'),
        db.from('profiles').select('*'),
        db.from('department_approving_heads').select('user_id,department').order('position'),
      ]);
      if (roleResult.error) throw roleResult.error;
      if (profileResult.error) throw profileResult.error;
      if (headResult.error) throw headResult.error;

      const rolesByUser = new Map<string, string[]>();
      for (const row of roleResult.data || []) {
        rolesByUser.set(row.user_id, [...(rolesByUser.get(row.user_id) || []), row.role]);
      }
      const profilesById = new Map(
        (profileResult.data || []).map((profile) => [profile.id, profile]),
      );
      const departmentsByUser = new Map<string, string[]>();
      for (const row of headResult.data || []) {
        const departments = departmentsByUser.get(row.user_id) || [];
        if (!departments.includes(row.department)) departments.push(row.department);
        departmentsByUser.set(row.user_id, departments);
      }

      const users: StaffUser[] = listed.data.users.map((user) => {
        const roles = rolesByUser.get(user.id) || [];
        const profile = profilesById.get(user.id);
        return {
          id: user.id,
          email: user.email || '',
          createdAt: user.created_at,
          lastSignInAt: user.last_sign_in_at || null,
          roles,
          fullName: profile?.full_name || null,
          department: profile?.department || null,
          assignedDepartments: departmentsByUser.get(user.id) || [],
          active: profile?.active ?? true,
          accessLevel: roles.includes('department_approver')
            ? 'approver'
            : roles.includes('finance_reviewer')
              ? 'staff'
              : null,
          protected: profile?.protected_account ?? isLegacyProtectedStaffEmail(user.email),
        };
      });
      return json(200, { ok: true, users, canRemove: true });
    }

    if (event.httpMethod === 'POST') {
      const input = staffAccountSchema.parse(readJson(event));
      const role = accessRole(input.accessLevel);
      const email = input.email.toLowerCase();
      const department =
        input.accessLevel === 'approver'
          ? await resolveDepartmentHeadTarget(db, input.department)
          : FINANCE_DEPARTMENT;
      const invited = await db.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${config.SITE_URL}/admin/reset-password`,
        data: { full_name: input.fullName, department, access_level: input.accessLevel },
      });
      if (invited.error) throw new HttpError(409, invited.error.message);
      const profile = await db
        .from('profiles')
        .upsert(
          { id: invited.data.user.id, email, full_name: input.fullName, department, active: true },
          { onConflict: 'id' },
        );
      if (profile.error) {
        await db.auth.admin.deleteUser(invited.data.user.id);
        throw profile.error;
      }
      const assigned = await db
        .from('user_roles')
        .insert({ user_id: invited.data.user.id, role, granted_by: staff.user.id });
      if (assigned.error) {
        await db.auth.admin.deleteUser(invited.data.user.id);
        throw assigned.error;
      }
      try {
        if (input.accessLevel === 'approver') {
          await assignDepartmentHead(
            db,
            staff.user.id,
            invited.data.user.id,
            input.fullName,
            email,
            department,
          );
        }
      } catch (cause) {
        await db.auth.admin.deleteUser(invited.data.user.id);
        throw cause;
      }
      return json(201, {
        ok: true,
        user: {
          id: invited.data.user.id,
          email: invited.data.user.email,
          roles: [role],
          fullName: input.fullName,
          department,
          active: true,
          protected: false,
          accessLevel: input.accessLevel,
        },
      });
    }

    if (event.httpMethod === 'PATCH') {
      const input = z
        .object({
          userId: z.uuid(),
          fullName: z.string().min(2).max(160),
          accessLevel: z.enum(['staff', 'approver']),
          department: z.string().max(100).optional(),
          active: z.boolean(),
        })
        .refine((value) => value.accessLevel !== 'approver' || Boolean(value.department?.trim()), {
          message: 'Department is required for Department Heads.',
          path: ['department'],
        })
        .parse(readJson(event));
      const [existing, target] = await Promise.all([
        db.from('user_roles').select('role').eq('user_id', input.userId),
        db.auth.admin.getUserById(input.userId),
      ]);
      if (existing.error) throw existing.error;
      if (target.error || !target.data.user?.email) throw new HttpError(404, 'Account not found.');
      if (
        existing.data?.some((row) => ['super_administrator', 'administrator'].includes(row.role))
      ) {
        throw new HttpError(
          403,
          'Administrative accounts cannot be converted or transferred here.',
        );
      }
      const department =
        input.accessLevel === 'approver'
          ? await resolveDepartmentHeadTarget(db, input.department || '', input.userId)
          : FINANCE_DEPARTMENT;
      const removedRoles = await db.from('user_roles').delete().eq('user_id', input.userId);
      if (removedRoles.error) throw removedRoles.error;
      const assignedRole = await db.from('user_roles').insert({
        user_id: input.userId,
        role: accessRole(input.accessLevel),
        granted_by: staff.user.id,
      });
      if (assignedRole.error) throw assignedRole.error;
      const profile = await db
        .from('profiles')
        .update({ full_name: input.fullName, department, active: input.active })
        .eq('id', input.userId);
      if (profile.error) throw profile.error;
      if (input.accessLevel === 'approver' && input.active) {
        await assignDepartmentHead(
          db,
          staff.user.id,
          input.userId,
          input.fullName,
          target.data.user.email,
          department,
        );
      } else {
        await clearDepartmentHeadAssignments(db, input.userId);
      }
      return json(200, { ok: true });
    }

    if (event.httpMethod === 'DELETE') {
      const input = z.object({ userId: z.uuid() }).parse(readJson(event));
      if (input.userId === staff.user.id)
        throw new HttpError(409, 'You cannot remove your own account.');
      const [target, profile, targetRoles] = await Promise.all([
        db.auth.admin.getUserById(input.userId),
        db.from('profiles').select('*').eq('id', input.userId).maybeSingle(),
        db.from('user_roles').select('role').eq('user_id', input.userId),
      ]);
      if (target.error || !target.data.user) throw new HttpError(404, 'Account not found.');
      if (profile.error) throw profile.error;
      if (targetRoles.error) throw targetRoles.error;
      if (profile.data?.protected_account ?? isLegacyProtectedStaffEmail(target.data.user.email)) {
        throw new HttpError(409, 'This protected operational account cannot be removed.');
      }
      if (
        targetRoles.data?.some((row) => ['super_administrator', 'administrator'].includes(row.role))
      ) {
        throw new HttpError(409, 'Administrative accounts cannot be removed here.');
      }
      await clearDepartmentHeadAssignments(db, input.userId);
      const removed = await db.auth.admin.deleteUser(input.userId);
      if (removed.error) throw removed.error;
      return json(200, { ok: true });
    }

    throw new HttpError(405, 'Method not allowed.');
  }

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
