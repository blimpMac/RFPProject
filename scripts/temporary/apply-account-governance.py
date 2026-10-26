from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text()
    if old not in text:
        raise RuntimeError(f"Could not locate patch target in {path}: {old[:100]!r}")
    target.write_text(text.replace(old, new, 1))


Path("server/services/account-governance.ts").write_text(r'''import { HttpError } from '../lib/http.js';
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
}

export async function assignDepartmentHead(
  db: DatabaseClient,
  actorUserId: string,
  userId: string,
  fullName: string,
  email: string,
  department: string,
) {
  await clearDepartmentHeadAssignments(db, userId);
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
}
''')

replace_once(
    "server/routes/administration.ts",
    "import { accessRole } from '../lib/staff-access.js';\nimport {\n  getApprovingHeadOverview,\n  saveApprovingHeadAssignments,\n} from '../services/approving-heads.js';",
    "import { accessRole } from '../lib/staff-access.js';\nimport { getApprovingHeadOverview } from '../services/approving-heads.js';\nimport {\n  assignDepartmentHead,\n  clearDepartmentHeadAssignments,\n  FINANCE_DEPARTMENT,\n  resolveDepartmentHeadTarget,\n} from '../services/account-governance.js';",
)
replace_once(
    "server/routes/administration.ts",
    "    if (event.httpMethod === 'POST') {\n      const staff = await requireStaff(event, ['super_administrator']);\n      await saveApprovingHeadAssignments(db, staff.user.id, readJson(event));\n      return json(200, { ok: true });\n    }",
    "    if (event.httpMethod === 'POST') {\n      await requireStaff(event, ['super_administrator']);\n      throw new HttpError(\n        409,\n        'Department Heads are managed from Account Management. Each department can have only one head.',\n      );\n    }",
)
old_post = """    if (event.httpMethod === 'POST') {\n      const input = staffAccountSchema.parse(readJson(event));\n      const role = accessRole(input.accessLevel);\n      const email = input.email.toLowerCase();\n      const invited = await db.auth.admin.inviteUserByEmail(email, {\n        redirectTo: `${config.SITE_URL}/admin/reset-password`,\n        data: {\n          full_name: input.fullName,\n          department: input.accessLevel === 'approver' ? input.department : null,\n          access_level: input.accessLevel,\n        },\n      });\n      if (invited.error) throw new HttpError(409, invited.error.message);\n      const department = input.accessLevel === 'approver' ? input.department : null;\n      const profile = await db.from('profiles').upsert(\n        {\n          id: invited.data.user.id,\n          email,\n          full_name: input.fullName,\n          department,\n          active: true,\n        },\n        { onConflict: 'id' },\n      );\n      if (profile.error) {\n        await db.auth.admin.deleteUser(invited.data.user.id);\n        throw profile.error;\n      }\n      const assigned = await db\n        .from('user_roles')\n        .insert({ user_id: invited.data.user.id, role, granted_by: staff.user.id });\n      if (assigned.error) {\n        await db.auth.admin.deleteUser(invited.data.user.id);\n        throw assigned.error;\n      }\n      return json(201, {\n        ok: true,\n        user: {\n          id: invited.data.user.id,\n          email: invited.data.user.email,\n          roles: [role],\n          fullName: input.fullName,\n          department,\n          active: true,\n          protected: false,\n          accessLevel: input.accessLevel,\n        },\n      });\n    }"""
new_post = """    if (event.httpMethod === 'POST') {\n      const input = staffAccountSchema.parse(readJson(event));\n      const role = accessRole(input.accessLevel);\n      const email = input.email.toLowerCase();\n      const department =\n        input.accessLevel === 'approver'\n          ? await resolveDepartmentHeadTarget(db, input.department)\n          : FINANCE_DEPARTMENT;\n      const invited = await db.auth.admin.inviteUserByEmail(email, {\n        redirectTo: `${config.SITE_URL}/admin/reset-password`,\n        data: { full_name: input.fullName, department, access_level: input.accessLevel },\n      });\n      if (invited.error) throw new HttpError(409, invited.error.message);\n      const profile = await db.from('profiles').upsert(\n        { id: invited.data.user.id, email, full_name: input.fullName, department, active: true },\n        { onConflict: 'id' },\n      );\n      if (profile.error) {\n        await db.auth.admin.deleteUser(invited.data.user.id);\n        throw profile.error;\n      }\n      const assigned = await db\n        .from('user_roles')\n        .insert({ user_id: invited.data.user.id, role, granted_by: staff.user.id });\n      if (assigned.error) {\n        await db.auth.admin.deleteUser(invited.data.user.id);\n        throw assigned.error;\n      }\n      try {\n        if (input.accessLevel === 'approver') {\n          await assignDepartmentHead(\n            db,\n            staff.user.id,\n            invited.data.user.id,\n            input.fullName,\n            email,\n            department,\n          );\n        }\n      } catch (cause) {\n        await db.auth.admin.deleteUser(invited.data.user.id);\n        throw cause;\n      }\n      return json(201, {\n        ok: true,\n        user: {\n          id: invited.data.user.id,\n          email: invited.data.user.email,\n          roles: [role],\n          fullName: input.fullName,\n          department,\n          active: true,\n          protected: false,\n          accessLevel: input.accessLevel,\n        },\n      });\n    }"""
replace_once("server/routes/administration.ts", old_post, new_post)

admin = Path("server/routes/administration.ts").read_text()
patch_start = admin.index("    if (event.httpMethod === 'PATCH') {")
delete_start = admin.index("    if (event.httpMethod === 'DELETE') {", patch_start)
new_patch = r'''    if (event.httpMethod === 'PATCH') {
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
        throw new HttpError(403, 'Administrative accounts cannot be converted or transferred here.');
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

'''
Path("server/routes/administration.ts").write_text(admin[:patch_start] + new_patch + admin[delete_start:])

admin = Path("server/routes/administration.ts").read_text()
replace_once(
    "server/routes/administration.ts",
    """      const [target, profile, targetRoles, assignments] = await Promise.all([\n        db.auth.admin.getUserById(input.userId),\n        db.from('profiles').select('*').eq('id', input.userId).maybeSingle(),\n        db.from('user_roles').select('role').eq('user_id', input.userId),\n        db.from('department_approving_heads').select('id').eq('user_id', input.userId).limit(1),\n      ]);\n      if (target.error || !target.data.user) throw new HttpError(404, 'Account not found.');\n      if (profile.error) throw profile.error;\n      if (targetRoles.error) throw targetRoles.error;\n      if (assignments.error) throw assignments.error;""",
    """      const [target, profile, targetRoles] = await Promise.all([\n        db.auth.admin.getUserById(input.userId),\n        db.from('profiles').select('*').eq('id', input.userId).maybeSingle(),\n        db.from('user_roles').select('role').eq('user_id', input.userId),\n      ]);\n      if (target.error || !target.data.user) throw new HttpError(404, 'Account not found.');\n      if (profile.error) throw profile.error;\n      if (targetRoles.error) throw targetRoles.error;""",
)
replace_once(
    "server/routes/administration.ts",
    """      if (targetRoles.data?.some((row) => row.role === 'super_administrator')) {\n        throw new HttpError(409, 'The Super Administrator account cannot be removed.');\n      }\n      if (assignments.data?.length) {\n        throw new HttpError(\n          409,\n          'Replace this account in the approving-head roster before deleting it.',\n        );\n      }\n      const removed = await db.auth.admin.deleteUser(input.userId);""",
    """      if (\n        targetRoles.data?.some((row) => ['super_administrator', 'administrator'].includes(row.role))\n      ) {\n        throw new HttpError(409, 'Administrative accounts cannot be removed here.');\n      }\n      await clearDepartmentHeadAssignments(db, input.userId);\n      const removed = await db.auth.admin.deleteUser(input.userId);""",
)

Path("src/pages/SettingsPage.tsx").write_text(r'''import { useEffect, useMemo, useState } from 'react';
import { KeyRound, Search, Trash2, UserPlus } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import type { AccessLevel, StaffUser } from '../../shared/contracts/accounts';
import { useAuth } from '../components/AuthProvider';
import { Button, Modal, Spinner, StatusBadge } from '../components/ui';
import { AccountPagination } from '../features/accounts/AccountPagination';
import { useAccountDirectory } from '../features/accounts/useAccountDirectory';
import { del, patch, post } from '../lib/api';

type AccessFilter = 'all' | 'administrator' | 'approver' | 'staff';
const PAGE_SIZE = 6;
const normalizeDepartment = (value: string | null | undefined) =>
  (value || '').replace(/^[-–—\s]+/, '').trim().toLowerCase();
const isFinance = (value: string | null | undefined) => normalizeDepartment(value) === 'finance';

export function SettingsPage() {
  const { roles } = useAuth();
  const isSuper = roles.includes('super_administrator');
  const { users, departments, loading, error, setError, load } = useAccountDirectory(isSuper);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [accessFilter, setAccessFilter] = useState<AccessFilter>('all');
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState('');
  const [notice, setNotice] = useState('');
  const [account, setAccount] = useState<StaffUser | 'new'>();

  useEffect(() => setPage(1), [accessFilter, search, statusFilter]);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return users
      .filter((user) => {
        const statusMatches =
          statusFilter === 'all' || (statusFilter === 'active' ? user.active : !user.active);
        const accessMatches =
          accessFilter === 'all' ||
          (accessFilter === 'administrator' &&
            user.roles.some((role) => ['super_administrator', 'administrator'].includes(role))) ||
          (accessFilter === 'approver' && user.accessLevel === 'approver') ||
          (accessFilter === 'staff' && user.accessLevel === 'staff');
        const searchMatches =
          !query ||
          [user.fullName, user.email, user.department, ...user.assignedDepartments, ...user.roles].some(
            (value) => value?.toLowerCase().includes(query),
          );
        return statusMatches && accessMatches && searchMatches;
      })
      .sort((a, b) => (a.fullName || a.email).localeCompare(b.fullName || b.email));
  }, [accessFilter, search, statusFilter, users]);
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const firstVisible = (currentPage - 1) * PAGE_SIZE;
  const paginatedUsers = filteredUsers.slice(firstVisible, firstVisible + PAGE_SIZE);

  async function sendReset(user: StaffUser) {
    setBusyId(user.id);
    setError('');
    setNotice('');
    try {
      await post('staff-users/reset-password', { userId: user.id });
      setNotice('Password-reset email sent.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send the password-reset email.');
    } finally {
      setBusyId('');
    }
  }

  async function removeUser(user: StaffUser) {
    if (!window.confirm(`Delete ${user.fullName || 'this account'}? This cannot be undone.`)) return;
    setBusyId(user.id);
    setError('');
    setNotice('');
    try {
      await del('staff-users', { userId: user.id });
      setNotice('Account deleted. Its department is now available for another Department Head.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete the account.');
    } finally {
      setBusyId('');
    }
  }

  if (!isSuper) return <Navigate to="/admin" replace />;
  if (loading) return <Spinner label="Loading accounts" />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Account Management</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            The single Super Administrator is automatically the Finance Head. Create Finance Members
            for Finance, or one Department Head for each non-Finance department. Edit a Department
            Head to transfer that account to another available department.
          </p>
        </div>
        <Button onClick={() => setAccount('new')}>
          <UserPlus size={16} />
          Add account
        </Button>
      </div>
      {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
      {notice && <p className="rounded bg-emerald-50 p-3 text-sm text-emerald-800" role="status">{notice}</p>}
      <section className="card overflow-hidden">
        <div className="grid gap-3 border-b p-4 md:grid-cols-[minmax(14rem,1fr)_12rem_12rem]">
          <div className="field">
            <label htmlFor="account-search">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input id="account-search" className="input !pl-10" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, department, or email" />
            </div>
          </div>
          <div className="field">
            <label htmlFor="account-access-filter">Access</label>
            <select id="account-access-filter" className="input" value={accessFilter} onChange={(event) => setAccessFilter(event.target.value as AccessFilter)}>
              <option value="all">All access</option>
              <option value="administrator">Administrators</option>
              <option value="approver">Department Heads</option>
              <option value="staff">Finance Members</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="account-status-filter">Status</label>
            <select id="account-status-filter" className="input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
        <div className="divide-y">
          {paginatedUsers.map((user) => (
            <AccountRow key={user.id} user={user} busy={busyId === user.id} onEdit={() => setAccount(user)} onReset={() => void sendReset(user)} onRemove={() => void removeUser(user)} />
          ))}
          {!paginatedUsers.length && <p className="p-10 text-center text-sm text-slate-500">No matching accounts.</p>}
        </div>
        <AccountPagination currentPage={currentPage} totalPages={totalPages} firstVisible={firstVisible} itemCount={filteredUsers.length} pageSize={PAGE_SIZE} itemLabel="accounts" onPageChange={setPage} />
      </section>
      {account && (
        <AccountForm value={account} users={users} departments={departments} onClose={() => setAccount(undefined)} onSaved={async () => { const added = account === 'new'; setAccount(undefined); setNotice(added ? 'Account invitation sent.' : 'Account updated.'); await load(); }} />
      )}
    </div>
  );
}

function AccountRow({ user, busy, onEdit, onReset, onRemove }: { user: StaffUser; busy: boolean; onEdit: () => void; onReset: () => void; onRemove: () => void }) {
  const isAdministrator = user.roles.some((role) => ['super_administrator', 'administrator'].includes(role));
  const accessLabel = user.roles.includes('super_administrator')
    ? 'Super Administrator · Finance Head'
    : user.roles.includes('administrator')
      ? 'Administrator'
      : user.accessLevel === 'approver'
        ? 'Department Head'
        : 'Finance Member';
  return (
    <article className="flex flex-col gap-3 p-4 xl:flex-row xl:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold">{user.fullName || 'Account'}</p>
          <StatusBadge>{accessLabel}</StatusBadge>
          <StatusBadge>{user.active ? 'Active' : 'Inactive'}</StatusBadge>
          {user.protected && <StatusBadge>Protected</StatusBadge>}
        </div>
        <p className="mt-1 truncate text-xs text-slate-500">
          {user.protected ? 'Email hidden' : user.email}
          {user.roles.includes('super_administrator') ? ' · Finance' : user.department ? ` · ${user.department}` : ''}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={busy} onClick={onReset}><KeyRound size={16} />Reset password</Button>
        {!isAdministrator && !user.protected && user.accessLevel && <Button variant="secondary" disabled={busy} onClick={onEdit}>{user.accessLevel === 'approver' ? 'Edit / Transfer' : 'Edit'}</Button>}
        {!user.protected && !isAdministrator && <Button variant="danger" disabled={busy} onClick={onRemove}><Trash2 size={16} />Delete</Button>}
      </div>
    </article>
  );
}

function AccountForm({ value, users, departments, onClose, onSaved }: { value: StaffUser | 'new'; users: StaffUser[]; departments: string[]; onClose: () => void; onSaved: () => void }) {
  const editing = value !== 'new';
  const editingId = editing ? value.id : '';
  const [email, setEmail] = useState(editing ? value.email : '');
  const [fullName, setFullName] = useState(editing ? value.fullName || '' : '');
  const [accessLevel, setAccessLevel] = useState<AccessLevel>(editing ? value.accessLevel || 'staff' : 'staff');
  const [department, setDepartment] = useState(editing ? value.department || '' : '');
  const [active, setActive] = useState(editing ? value.active : true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const occupiedDepartments = new Set(users.filter((user) => user.id !== editingId && user.accessLevel === 'approver' && user.active && user.department).map((user) => normalizeDepartment(user.department)));
  const headDepartments = departments.filter((item) => !isFinance(item));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const body = { fullName, accessLevel, department: accessLevel === 'approver' ? department : undefined };
      if (editing) await patch('staff-users', { ...body, userId: value.id, active }); else await post('staff-users', { ...body, email });
      onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save the account.'); } finally { setBusy(false); }
  };
  return (
    <Modal title={editing ? 'Edit account' : 'Add account'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Text label="Full name" value={fullName} onChange={setFullName} />
        <Text label="Work email" type="email" value={email} onChange={setEmail} disabled={editing} />
        <div className="field">
          <label htmlFor="account-access-level">Account type</label>
          <select id="account-access-level" className="input" value={accessLevel} onChange={(event) => { const next = event.target.value as AccessLevel; setAccessLevel(next); if (next === 'staff') setDepartment('Finance'); else if (isFinance(department)) setDepartment(''); }}>
            <option value="staff">Finance Member</option><option value="approver">Department Head</option>
          </select>
        </div>
        {accessLevel === 'staff' ? (
          <div className="rounded border bg-slate-50 p-3 text-sm text-slate-700">Department: <strong>Finance</strong>. Finance Head approval belongs only to the Super Administrator.</div>
        ) : (
          <div className="field">
            <label htmlFor="account-department">Department</label>
            <select className="input" id="account-department" required value={department} onChange={(event) => setDepartment(event.target.value)}>
              <option value="">Select department</option>
              {headDepartments.map((item) => { const occupied = occupiedDepartments.has(normalizeDepartment(item)); return <option key={item} value={item} disabled={occupied}>{item}{occupied ? ' — Department Head already assigned' : ''}</option>; })}
            </select>
            <p className="mt-1 text-xs text-slate-500">Only one Department Head can be assigned to each department. Changing this selection transfers the account and releases its previous department.</p>
          </div>
        )}
        {editing && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />Active</label>}
        {error && <p className="error">{error}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={busy || !fullName || !email || (accessLevel === 'approver' && !department)}>{busy ? <Spinner /> : editing ? 'Save changes' : 'Send invite'}</Button></div>
      </form>
    </Modal>
  );
}

function Text({ label, value, onChange, type = 'text', disabled = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; disabled?: boolean }) {
  return <div className="field"><label>{label}</label><input className="input" type={type} required disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}
''')

replace_once(
    "server/services/finance-stage-workflow.ts",
    "function isFinanceHead(roles: string[]) {\n  return roles.some((role) => administrativeRoles.includes(role));\n}",
    "function isFinanceHead(roles: string[]) {\n  return roles.includes('super_administrator');\n}",
)
replace_once(
    "server/services/finance-stage-workflow.ts",
    "throw new HttpError(403, 'Only a Finance Head / Administrator can approve this stage.');",
    "throw new HttpError(403, 'Only the Super Administrator, acting as Finance Head, can approve this stage.');",
)
replace_once(
    "server/services/finance-stage-workflow.ts",
    "throw new HttpError(403, 'Only a Finance Head / Administrator can decline this stage.');",
    "throw new HttpError(403, 'Only the Super Administrator, acting as Finance Head, can decline this stage.');",
)
replace_once(
    "server/services/finance-stage-workflow.ts",
    "    const heads = await emailsForRoles(db, administrativeRoles);",
    "    const heads = await emailsForRoles(db, ['super_administrator']);",
)
replace_once(
    "src/pages/ApprovalsPage.tsx",
    "  const financeHead = roles.some((role) => ['super_administrator', 'administrator'].includes(role));",
    "  const financeHead = roles.includes('super_administrator');",
)

layout = Path("src/layouts/AdminLayout.tsx").read_text()
layout = layout.replace("  UserCog,\n", "").replace("  UsersRound,\n", "")
for block in [
    """  {\n    to: '/admin/approver-management',\n    label: 'Approver access',\n    description: 'Manage approver accounts',\n    group: 'Administration',\n    icon: UserCog,\n    allowedRoles: ['super_administrator'],\n  },\n""",
    """  {\n    to: '/admin/approving-heads',\n    label: 'Approval team',\n    description: 'Departments and signatories',\n    group: 'Administration',\n    icon: UsersRound,\n    allowedRoles: ['super_administrator'],\n  },\n""",
]:
    if block not in layout:
        raise RuntimeError("Could not locate duplicate administration navigation block")
    layout = layout.replace(block, "", 1)
layout = layout.replace("  super_administrator: 'Super administrator',", "  super_administrator: 'Super administrator · Finance Head',", 1)
layout = layout.replace("  department_approver: 'Department approver',", "  department_approver: 'Department Head',", 1)
layout = layout.replace("  finance_reviewer: 'Finance reviewer',", "  finance_reviewer: 'Finance Member',", 1)
Path("src/layouts/AdminLayout.tsx").write_text(layout)

Path("src/pages/ApprovingHeadsPage.tsx").write_text(r'''import { Navigate } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';

export function ApprovingHeadsPage() {
  const { roles } = useAuth();
  if (!roles.includes('super_administrator')) return <Navigate to="/admin" replace />;
  return <Navigate to="/admin/settings" replace />;
}
''')

replace_once(
    "scripts/setup/promote-superadmin.ts",
    """const demoted = await db\n  .from('user_roles')\n  .delete()\n  .eq('user_id', administrator.id)\n  .eq('role', 'super_administrator');\nif (demoted.error) throw demoted.error;""",
    """const demoted = await db\n  .from('user_roles')\n  .delete()\n  .eq('role', 'super_administrator')\n  .neq('user_id', superadmin.id);\nif (demoted.error) throw demoted.error;""",
)
