import { z } from 'zod';
import { protectedStaffEmails } from '../domain/access.js';
import { HttpError } from '../lib/http.js';
import { normalizeDepartment } from '../lib/staff-access.js';
import { adminClient } from '../lib/supabase.js';

type DatabaseClient = ReturnType<typeof adminClient>;

export const approvingHeadTeamSchema = z
  .object({
    headUserId: z.uuid(),
    coApproverUserIds: z
      .array(z.uuid())
      .min(2)
      .max(3)
      .refine((items) => new Set(items).size === items.length, 'Co-Approvers must be unique.'),
  })
  .refine((value) => !value.coApproverUserIds.includes(value.headUserId), {
    message: 'An account cannot be both Approver Head and Co-Approver.',
    path: ['coApproverUserIds'],
  });

export async function getAssignedDepartments(db: DatabaseClient, userId: string) {
  const rows = await db
    .from('department_approving_heads')
    .select('normalized_department')
    .eq('user_id', userId);
  if (rows.error) throw rows.error;
  return [...new Set((rows.data || []).map((row) => row.normalized_department))];
}

export async function getPublicApprovers(db: DatabaseClient) {
  const [{ data: legacyApprovers, error: legacyError }, { data: headRows, error: headError }] =
    await Promise.all([
      db
        .from('approvers')
        .select('department,approver_name')
        .eq('active', true)
        .order('department'),
      db.from('department_approving_heads').select('department,user_id,position').order('position'),
    ]);
  if (legacyError) throw legacyError;
  if (headError) throw headError;

  const headIds = [...new Set((headRows || []).map((row) => row.user_id))];
  const headProfiles = headIds.length
    ? await db.from('profiles').select('id,full_name,active').in('id', headIds).eq('active', true)
    : { data: [], error: null };
  if (headProfiles.error) throw headProfiles.error;

  const profileRows = (headProfiles.data || []) as Array<{
    id: string;
    full_name: string | null;
    active: boolean;
  }>;
  const profileMap = new Map(profileRows.map((profile) => [profile.id, profile]));
  const rosters = new Map<string, { department: string; names: string[] }>();
  for (const row of headRows || []) {
    const profile = profileMap.get(row.user_id);
    if (!profile) continue;
    const key = normalizeDepartment(row.department);
    const roster: { department: string; names: string[] } = rosters.get(key) || {
      department: row.department,
      names: [],
    };
    roster.names.push(profile.full_name?.trim() || 'Approving Head');
    rosters.set(key, roster);
  }

  const assigned = [...rosters.values()]
    .filter((roster) => roster.names.length >= 1 && roster.names.length <= 2)
    .map((roster) => ({ department: roster.department, approver_name: roster.names.join(', ') }));
  const assignedKeys = new Set(assigned.map((row) => normalizeDepartment(row.department)));
  return [
    ...assigned,
    ...(legacyApprovers || []).filter(
      (row) => !assignedKeys.has(normalizeDepartment(row.department)),
    ),
  ];
}

export async function getApprovingHeadOverview(db: DatabaseClient) {
  const [profilesResult, rolesResult, headsResult, optionsResult] = await Promise.all([
    db
      .from('profiles')
      .select('id,email,full_name,department,active')
      .eq('active', true)
      .order('full_name'),
    db.from('user_roles').select('user_id,role'),
    db
      .from('department_approving_heads')
      .select('department,user_id,position')
      .order('department')
      .order('position'),
    db.from('system_settings').select('value').eq('key', 'submission_options').single(),
  ]);
  for (const result of [profilesResult, rolesResult, headsResult, optionsResult])
    if (result.error) throw result.error;

  const eligibleRoles = new Set(['super_administrator', 'administrator', 'department_approver']);
  const rolesByUser = new Map<string, string[]>();
  for (const row of rolesResult.data || []) {
    const roles = rolesByUser.get(row.user_id) || [];
    roles.push(row.role);
    rolesByUser.set(row.user_id, roles);
  }

  const candidates = (profilesResult.data || [])
    .map((profile) => {
      const roles = rolesByUser.get(profile.id) || [];
      const protectedAccount = protectedStaffEmails.has(profile.email.toLowerCase());
      return {
        id: profile.id,
        displayName:
          profile.full_name?.trim() ||
          (protectedAccount
            ? 'Protected Administrator'
            : `Approver account ${profile.id.slice(0, 6)}`),
        department: profile.department?.trim() || null,
        roles,
        protected: protectedAccount,
      };
    })
    .filter((profile) => profile.roles.some((role) => eligibleRoles.has(role)))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  const optionValue = optionsResult.data?.value as { departments?: string[] } | undefined;
  const departments = Array.isArray(optionValue?.departments) ? optionValue.departments : [];
  return {
    candidates,
    departments: departments.map((department) => ({
      department,
      headUserIds: (headsResult.data || [])
        .filter((row) => normalizeDepartment(row.department) === normalizeDepartment(department))
        .sort((a, b) => a.position - b.position)
        .map((row) => row.user_id),
    })),
  };
}

export async function saveApprovingHeadAssignments(
  db: DatabaseClient,
  actorUserId: string,
  input: unknown,
) {
  const parsed = approvingHeadTeamSchema.parse(input);
  const settings = await db
    .from('system_settings')
    .select('value')
    .eq('key', 'submission_options')
    .single();
  if (settings.error) throw settings.error;
  const configured = (settings.data.value as { departments?: string[] }).departments || [];
  if (!configured.length)
    throw new HttpError(
      400,
      'Configure at least one department before assigning the approval team.',
    );
  const configuredByKey = new Map(
    configured.map((department) => [normalizeDepartment(department), department]),
  );
  const selectedIds = [parsed.headUserId, ...parsed.coApproverUserIds];
  const [profilesResult, rolesResult] = await Promise.all([
    db.from('profiles').select('id,department,active').in('id', selectedIds),
    db.from('user_roles').select('user_id,role').in('user_id', selectedIds),
  ]);
  if (profilesResult.error) throw profilesResult.error;
  if (rolesResult.error) throw rolesResult.error;
  const profiles = new Map((profilesResult.data || []).map((profile) => [profile.id, profile]));
  const rolesByUser = new Map<string, string[]>();
  for (const row of rolesResult.data || [])
    rolesByUser.set(row.user_id, [...(rolesByUser.get(row.user_id) || []), row.role]);
  const eligibleHeadRoles = new Set([
    'super_administrator',
    'administrator',
    'department_approver',
  ]);
  const headProfile = profiles.get(parsed.headUserId);
  if (
    !headProfile?.active ||
    !(rolesByUser.get(parsed.headUserId) || []).some((role) => eligibleHeadRoles.has(role))
  ) {
    throw new HttpError(
      400,
      'The Approver Head must be an active Administrator or Department Approver.',
    );
  }
  const coDepartments = new Set<string>();
  const assignments = [{ userId: parsed.headUserId, departments: configured }];
  for (const userId of parsed.coApproverUserIds) {
    const profile = profiles.get(userId);
    const roles = rolesByUser.get(userId) || [];
    if (!profile?.active || !roles.includes('department_approver'))
      throw new HttpError(400, 'Every Co-Approver must be an active Department Approver.');
    const departmentKey = normalizeDepartment(profile.department || '');
    const configuredDepartment = configuredByKey.get(departmentKey);
    if (!configuredDepartment)
      throw new HttpError(400, 'Every Co-Approver must have one configured primary department.');
    if (coDepartments.has(departmentKey))
      throw new HttpError(400, 'Choose only one Co-Approver for each department.');
    coDepartments.add(departmentKey);
    assignments.push({ userId, departments: [configuredDepartment] });
  }
  const saved = await db.rpc('set_approving_head_assignments', {
    p_assignments: assignments,
    p_actor_user_id: actorUserId,
  });
  if (saved.error) throw new HttpError(409, saved.error.message);
}
