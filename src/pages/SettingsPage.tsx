import { useEffect, useMemo, useState } from 'react';
import { Search, UserPlus } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import type { StaffUser } from '../../shared/contracts/accounts';
import { useAuth } from '../components/AuthProvider';
import { Button, Spinner } from '../components/ui';
import { AccountPagination } from '../features/accounts/AccountPagination';
import { AccountForm, AccountRow, EmailForm } from '../features/accounts/AccountManagementForms';
import { useAccountDirectory } from '../features/accounts/useAccountDirectory';
import { del, post } from '../lib/api';

type AccessFilter = 'all' | 'approver' | 'staff';
const PAGE_SIZE = 6;
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
  const [emailAccount, setEmailAccount] = useState<StaffUser>();

  useEffect(() => setPage(1), [accessFilter, search, statusFilter]);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return users
      .filter((user) => {
        const statusMatches =
          statusFilter === 'all' || (statusFilter === 'active' ? user.active : !user.active);
        const accessMatches =
          accessFilter === 'all' ||
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
            The Finance Head is the Super Admin. Create and delete managed users, change their login
            email, reset passwords, or transfer a Department Head to another available non-Finance
            department.
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
              onEmail={() => setEmailAccount(user)}
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
      {emailAccount && (
        <EmailForm
          user={emailAccount}
          onClose={() => setEmailAccount(undefined)}
          onSaved={async () => {
            setEmailAccount(undefined);
            setNotice('Login email updated. The user must sign in with the new email address.');
            await load();
          }}
        />
      )}
    </div>
  );
}
