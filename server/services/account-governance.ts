import { HttpError } from '../lib/http.js';
import { normalizeDepartment } from '../lib/staff-access.js';
import { adminClient } from '../lib/supabase.js';

type DatabaseClient = ReturnType<typeof adminClient>;

export const FINANCE_DEPARTMENT = 'Finance';

export function isFinanceDepartment(value: string | null | undefined) {
  return normalizeDepartment(value) === normalizeDepartment(FINANCE_DEPARTMENT);
}

export async function resolveDepartmentHeadTarget(
  db: DatabaseClient,
  department: string,
  excludeUserId?: string,
) {
  const settings = await db
    .from('system_settings')
    .select('value')
    .eq('key', 'submission_options')
    .single();
  if (settings.error) throw settings.error;
  const value = settings.data?.value as { departments?: unknown } | undefined;
  const departments = Array.isArray(value?.departments)
    ? value.departments.filter((item): item is string => typeof item === 'string')
    : [];
  const targetKey = normalizeDepartment(department);
  const configured = departments.find((item) => normalizeDepartment(item) === targetKey);
  if (!configured) throw new HttpError(400, 'Choose a configured department.');
  if (isFinanceDepartment(configured)) {
    throw new HttpError(
      409,
      'Finance does not use a separate Department Head. The Super Administrator is the Finance Head.',
    );
  }

  const roles = await db.from('user_roles').select('user_id').eq('role', 'department_approver');
  if (roles.error) throw roles.error;
  const ids = [...new Set((roles.data || []).map((row) => row.user_id))];
  if (!ids.length) return configured;
  const profiles = await db
    .from('profiles')
    .select('id,department,active')
    .in('id', ids)
    .eq('active', true);
  if (profiles.error) throw profiles.error;
  const occupied = (profiles.data || []).find(
    (profile) =>
      profile.id !== excludeUserId && normalizeDepartment(profile.department || '') === targetKey,
  );
  if (occupied) throw new HttpError(409, `${configured} already has a Department Head.`);
  return configured;
}

async function deactivateLegacyApprover(db: DatabaseClient, departmentKey: string) {
  const result = await db
    .from('approvers')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('normalized_department', departmentKey);
  if (result.error) throw result.error;
}

async function activateLegacyApprover(
  db: DatabaseClient,
  department: string,
  fullName: string,
  email: string,
) {
  const departmentKey = normalizeDepartment(department);
  const existing = await db
    .from('approvers')
    .select('id')
    .eq('normalized_department', departmentKey)
    .limit(1);
  if (existing.error) throw existing.error;
  await deactivateLegacyApprover(db, departmentKey);
  if (existing.data?.[0]?.id) {
    const updated = await db
      .from('approvers')
      .update({
        department,
        approver_name: fullName,
        approver_email: email.toLowerCase(),
        active: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.data[0].id);
    if (updated.error) throw updated.error;
    return;
  }
  const inserted = await db.from('approvers').insert({
    department,
    approver_name: fullName,
    approver_email: email.toLowerCase(),
    active: true,
  });
  if (inserted.error) throw inserted.error;
}

export async function clearDepartmentHeadAssignments(db: DatabaseClient, userId: string) {
  const assigned = await db
    .from('department_approving_heads')
    .select('normalized_department')
    .eq('user_id', userId);
  if (assigned.error) throw assigned.error;
  const departments = [
    ...new Set((assigned.data || []).map((row) => row.normalized_department).filter(Boolean)),
  ];
  for (const departmentKey of departments) {
    const removed = await db
      .from('department_approving_heads')
      .delete()
      .eq('normalized_department', departmentKey);
    if (removed.error) throw removed.error;
    await deactivateLegacyApprover(db, departmentKey);
  }
  return departments;
}

export async function assignDepartmentHead(
  db: DatabaseClient,
  actorUserId: string,
  userId: string,
  fullName: string,
  email: string,
  department: string,
) {
  const previousDepartments = await clearDepartmentHeadAssignments(db, userId);
  const departmentKey = normalizeDepartment(department);
  const cleared = await db
    .from('department_approving_heads')
    .delete()
    .eq('normalized_department', departmentKey);
  if (cleared.error) throw cleared.error;
  const inserted = await db.from('department_approving_heads').insert({
    department,
    user_id: userId,
    position: 1,
    created_by: actorUserId,
  });
  if (inserted.error) throw inserted.error;
  await activateLegacyApprover(db, department, fullName, email);
  return [...new Set([...previousDepartments, departmentKey])];
}
