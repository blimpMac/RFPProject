import type { User } from '@supabase/supabase-js';
import { adminClient } from './supabase.js';
import { HttpError, type ApplicationEvent } from './http.js';

export type Staff = {
  user: User;
  roles: string[];
  profile: { fullName: string | null; department: string | null; active: boolean };
};
export async function requireStaff(event: ApplicationEvent, allowed?: string[]): Promise<Staff> {
  const token = event.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Please sign in.');
  const db = adminClient();
  const {
    data: { user },
    error,
  } = await db.auth.getUser(token);
  if (error || !user) throw new HttpError(401, 'Your session is invalid or expired.');
  // These lookups are independent. Run them together instead of waiting
  // for the profile query before checking IT access.
  const [{ data, error: roleError }, { data: profile, error: profileError }, itAccess] =
    await Promise.all([
      db.from('user_roles').select('role').eq('user_id', user.id),
      db.from('profiles').select('full_name,department,active').eq('id', user.id).single(),
      db.from('it_administrators').select('active').eq('user_id', user.id).maybeSingle(),
    ]);
  if (roleError) throw roleError;
  if (profileError || !profile) throw new HttpError(403, 'Your staff profile is not configured.');
  if (!profile.active) throw new HttpError(403, 'This staff account is inactive.');
  // Preserve legacy compatibility when the IT table has not been migrated.
  if (itAccess.error && !['42P01', 'PGRST205', 'PGRST116'].includes(itAccess.error.code)) {
    throw itAccess.error;
  }
  const isIT = itAccess.data?.active === true;
  const roles = isIT ? ['it_administrator'] : (data || []).map((row) => row.role as string);
  if (!roles.length || (isIT && !allowed) || (allowed && !roles.some((r) => allowed.includes(r))))
    throw new HttpError(403, 'You do not have access to this action.');
  return {
    user,
    roles,
    profile: {
      fullName: profile.full_name,
      department: profile.department,
      active: profile.active,
    },
  };
}
