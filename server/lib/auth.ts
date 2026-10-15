import type { User } from '@supabase/supabase-js';
import { adminClient } from './supabase.js';
import { HttpError, type ApplicationEvent } from './http.js';

export type Staff = { user: User; roles: string[] };
export async function requireStaff(event: ApplicationEvent, allowed?: string[]): Promise<Staff> {
  const token = event.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Please sign in.');
  const db = adminClient();
  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) throw new HttpError(401, 'Your session is invalid or expired.');
  const { data, error: roleError } = await db.from('user_roles').select('role').eq('user_id', user.id);
  if (roleError) throw roleError;
  const roles = (data || []).map((row) => row.role as string);
  if (!roles.length || (allowed && !roles.some((r) => allowed.includes(r)))) throw new HttpError(403, 'You do not have access to this action.');
  return { user, roles };
}
