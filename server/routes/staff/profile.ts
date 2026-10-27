import { z } from 'zod';
import { requireStaff } from '../../lib/auth.js';
import { ensureMethod, HttpError, json, readJson } from '../../lib/http.js';
import { normalizeDepartment } from '../../lib/staff-access.js';
import type { RouteHandler } from '../context.js';

export const handleProfileRoutes: RouteHandler = async ({ event, route, db }) => {
  if (route !== 'profile/name') return undefined;

  ensureMethod(event, 'PATCH');
  const staff = await requireStaff(event);
  const input = z.object({ fullName: z.string().trim().min(2).max(160) }).parse(readJson(event));
  const fullName = input.fullName.trim();

  const profile = await db
    .from('profiles')
    .update({ full_name: fullName, updated_at: new Date().toISOString() })
    .eq('id', staff.user.id)
    .select('department')
    .single();
  if (profile.error || !profile.data) throw profile.error || new HttpError(404, 'Profile not found.');

  const authUpdate = await db.auth.admin.updateUserById(staff.user.id, {
    user_metadata: { ...staff.user.user_metadata, full_name: fullName, name: fullName },
  });
  if (authUpdate.error) throw new HttpError(409, authUpdate.error.message);

  if (staff.roles.includes('department_approver') && profile.data.department) {
    const legacy = await db
      .from('approvers')
      .update({ approver_name: fullName, updated_at: new Date().toISOString() })
      .eq('normalized_department', normalizeDepartment(profile.data.department))
      .eq('active', true);
    if (legacy.error) throw legacy.error;
  }

  return json(200, { ok: true, fullName });
};
