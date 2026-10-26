import { useEffect, useMemo, useState } from 'react';
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
  (value || '')
    .replace(/^[-–—\s]+/, '')
    .trim()
    .toLowerCase();
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
          [
            user.fullName,
            user.email,
            user.department,
            ...user.assignedDepartments,
            ...user.roles,
          ].some((value) => value?.toLowerCase().includes(query));
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
    if (!window.confirm(`Delete ${user.fullName || 'this account'}? This cannot be undone.`))
      return;
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
            The Finance Head is the Super Admin. Create Finance Members for Finance, or one
            Department Head for each non-Finance department. Edit a Department Head to transfer that
            account to another available department.
          </p>
        </div>
        <Button onClick={() => setAccount('new')}>
          <UserPlus size={16} />
          Add account
        </Button>
      </div>
      {error && (
        <p className="rounded bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded bg-emerald-50 p-3 text-sm text-emerald-800" role="status">
          {notice}
        </p>
      )}
      <section className="card overflow-hidden">
        <div className="grid gap-3 border-b p-4 md:grid-cols-[minmax(14rem,1fr)_12rem_12rem]">
          <div className="field">
            <label htmlFor="account-search">Search</label>
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                size={16}
              />
              <input
                id="account-search"
                className="input !pl-10"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Name, department, or email"
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="account-access-filter">Access</label>
            <select
              id="account-access-filter"
              className="input"
              value={accessFilter}
              onChange={(event) => setAccessFilter(event.target.value as AccessFilter)}
            >
              <option value="all">All access</option>
              <option value="administrator">Administrators</option>
              <option value="approver">Department Heads</option>
              <option value="staff">Finance Members</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="account-status-filter">Status</label>
            <select
              id="account-status-filter"
              className="input"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
        <div className="divide-y">
          {paginatedUsers.map((user) => (
            <AccountRow
              key={user.id}
              user={user}
              busy={busyId === user.id}
              onEdit={() => setAccount(user)}
              onReset={() => void sendReset(user)}
              onRemove={() => void removeUser(user)}
            />
          ))}
          {!paginatedUsers.length && (
            <p className="p-10 text-center text-sm text-slate-500">No matching accounts.</p>
          )}
        </div>
        <AccountPagination
          currentPage={currentPage}
          totalPages={totalPages}
          firstVisible={firstVisible}
          itemCount={filteredUsers.length}
          pageSize={PAGE_SIZE}
          itemLabel="accounts"
          onPageChange={setPage}
        />
      </section>
      {account && (
        <AccountForm
          value={account}
          users={users}
          departments={departments}
          onClose={() => setAccount(undefined)}
          onSaved={async () => {
            const added = account === 'new';
            setAccount(undefined);
            setNotice(added ? 'Account invitation sent.' : 'Account updated.');
            await load();
          }}
        />
      )}
    </div>
  );
}

function AccountRow({
  user,
  busy,
  onEdit,
  onReset,
  onRemove,
}: {
  user: StaffUser;
  busy: boolean;
  onEdit: () => void;
  onReset: () => void;
  onRemove: () => void;
}) {
  const isAdministrator = user.roles.some((role) =>
    ['super_administrator', 'administrator'].includes(role),
  );
  const accessLabel = user.roles.includes('super_administrator')
    ? 'Finance Head (Super Admin)'
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
          {user.roles.includes('super_administrator')
            ? ' · Finance'
            : user.department
              ? ` · ${user.department}`
              : ''}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={busy} onClick={onReset}>
          <KeyRound size={16} />
          Reset password
        </Button>
        {!isAdministrator && !user.protected && user.accessLevel && (
          <Button variant="secondary" disabled={busy} onClick={onEdit}>
            {user.accessLevel === 'approver' ? 'Edit / Transfer' : 'Edit'}
          </Button>
        )}
        {!user.protected && !isAdministrator && (
          <Button variant="danger" disabled={busy} onClick={onRemove}>
            <Trash2 size={16} />
            Delete
          </Button>
        )}
      </div>
    </article>
  );
}

function AccountForm({
  value,
  users,
  departments,
  onClose,
  onSaved,
}: {
  value: StaffUser | 'new';
  users: StaffUser[];
  departments: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = value !== 'new';
  const editingId = editing ? value.id : '';
  const [email, setEmail] = useState(editing ? value.email : '');
  const [fullName, setFullName] = useState(editing ? value.fullName || '' : '');
  const [accessLevel, setAccessLevel] = useState<AccessLevel>(
    editing ? value.accessLevel || 'staff' : 'staff',
  );
  const [department, setDepartment] = useState(editing ? value.department || '' : '');
  const [active, setActive] = useState(editing ? value.active : true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const occupiedDepartments = new Set(
    users
      .filter(
        (user) =>
          user.id !== editingId &&
          user.accessLevel === 'approver' &&
          user.active &&
          user.department,
      )
      .map((user) => normalizeDepartment(user.department)),
  );
  const headDepartments = departments.filter((item) => !isFinance(item));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body = {
        fullName,
        accessLevel,
        department: accessLevel === 'approver' ? department : undefined,
      };
      if (editing) await patch('staff-users', { ...body, userId: value.id, active });
      else await post('staff-users', { ...body, email });
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the account.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={editing ? 'Edit account' : 'Add account'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Text label="Full name" value={fullName} onChange={setFullName} />
        <Text
          label="Work email"
          type="email"
          value={email}
          onChange={setEmail}
          disabled={editing}
        />
        <div className="field">
          <label htmlFor="account-access-level">Account type</label>
          <select
            id="account-access-level"
            className="input"
            value={accessLevel}
            onChange={(event) => {
              const next = event.target.value as AccessLevel;
              setAccessLevel(next);
              if (next === 'staff') setDepartment('Finance');
              else if (isFinance(department)) setDepartment('');
            }}
          >
            <option value="staff">Finance Member</option>
            <option value="approver">Department Head</option>
          </select>
        </div>
        {accessLevel === 'staff' ? (
          <div className="rounded border bg-slate-50 p-3 text-sm text-slate-700">
            Department: <strong>Finance</strong>. Finance Head approval belongs only to the Super
            Admin account.
          </div>
        ) : (
          <div className="field">
            <label htmlFor="account-department">Department</label>
            <select
              className="input"
              id="account-department"
              required
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
            >
              <option value="">Select department</option>
              {headDepartments.map((item) => {
                const occupied = occupiedDepartments.has(normalizeDepartment(item));
                return (
                  <option key={item} value={item} disabled={occupied}>
                    {item}
                    {occupied ? ' — Department Head already assigned' : ''}
                  </option>
                );
              })}
            </select>
            <p className="mt-1 text-xs text-slate-500">
              Only one Department Head can be assigned to each department. Changing this selection
              transfers the account and releases its previous department.
            </p>
          </div>
        )}
        {editing && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={active}
              onChange={(event) => setActive(event.target.checked)}
            />
            Active
          </label>
        )}
        {error && <p className="error">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy || !fullName || !email || (accessLevel === 'approver' && !department)}
          >
            {busy ? <Spinner /> : editing ? 'Save changes' : 'Send invite'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function Text({
  label,
  value,
  onChange,
  type = 'text',
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <input
        className="input"
        type={type}
        required
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
