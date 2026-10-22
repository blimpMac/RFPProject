import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { KeyRound, ShieldCheck, Trash2, UserCheck, UserPlus, Users } from 'lucide-react';
import { useAuth } from '../components/AuthProvider';
import { Button, Modal, Spinner, StatusBadge } from '../components/ui';
import { del, patch, post } from '../lib/api';
import { manilaDate } from '../lib/format';
import type { StaffUser } from '../../shared/contracts/accounts';
import { AccountPagination } from '../features/accounts/AccountPagination';
import { useAccountDirectory } from '../features/accounts/useAccountDirectory';
const PAGE_SIZE = 10;

export function ApproverManagementPage() {
  const { roles } = useAuth();
  const isSuper = roles.includes('super_administrator');
  const { users, departments, loading, error, setError, load } = useAccountDirectory(isSuper);
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [notice, setNotice] = useState('');

  const approvers = useMemo(
    () =>
      users.filter(
        (user) => user.roles.includes('department_approver') || user.assignedDepartments.length > 0,
      ),
    [users],
  );
  const visible = useMemo(
    () =>
      approvers.filter((user) => {
        const statusMatches =
          statusFilter === 'all' || (statusFilter === 'active' ? user.active : !user.active);
        const departmentsForUser = [...user.assignedDepartments, user.department]
          .filter(Boolean)
          .map((item) => String(item).toLowerCase());
        return (
          statusMatches &&
          (departmentFilter === 'all' ||
            departmentsForUser.includes(departmentFilter.toLowerCase()))
        );
      }),
    [approvers, departmentFilter, statusFilter],
  );
  useEffect(() => setPage(1), [departmentFilter, statusFilter]);
  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const firstVisible = (currentPage - 1) * PAGE_SIZE;
  const paginatedUsers = visible.slice(firstVisible, firstVisible + PAGE_SIZE);
  const activeCount = approvers.filter((user) => user.active).length;
  const assignedCount = approvers.filter((user) => user.assignedDepartments.length > 0).length;

  async function sendReset(user: StaffUser) {
    if (
      !window.confirm(`Send a secure password-reset link to ${user.fullName || 'this approver'}?`)
    )
      return;
    setBusyId(user.id);
    setError('');
    setNotice('');
    try {
      await post('staff-users/reset-password', { userId: user.id });
      setNotice('Password-reset email sent. The existing password was not requested or displayed.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send the password-reset email.');
    } finally {
      setBusyId('');
    }
  }

  async function toggleActive(user: StaffUser) {
    setBusyId(user.id);
    setError('');
    setNotice('');
    try {
      await patch('staff-users', {
        userId: user.id,
        fullName: user.fullName || 'Department Approver',
        accessLevel: 'approver',
        department: user.department || user.assignedDepartments[0] || departments[0],
        active: !user.active,
      });
      setNotice(`${user.fullName || 'Approver'} is now ${user.active ? 'inactive' : 'active'}.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update the account.');
    } finally {
      setBusyId('');
    }
  }

  async function remove(user: StaffUser) {
    if (
      !window.confirm(
        `Permanently delete ${user.fullName || 'this approver'}? This cannot be undone.`,
      )
    )
      return;
    setBusyId(user.id);
    setError('');
    setNotice('');
    try {
      await del('staff-users', { userId: user.id });
      setNotice('Approver account deleted.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete the account.');
    } finally {
      setBusyId('');
    }
  }

  if (!isSuper) return <Navigate to="/admin" replace />;
  if (loading) return <Spinner label="Loading approver management" />;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-[#315c93]" size={24} />
            <h1 className="text-2xl font-semibold">Approver Management</h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Super Administrator controls for invitations, active access, password recovery, and
            account deletion.
          </p>
        </div>
        <Button onClick={() => setAdding(true)}>
          <UserPlus size={17} />
          Add an approver
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
      <section className="grid gap-3 sm:grid-cols-3">
        <Summary icon={<Users size={19} />} label="Approver accounts" value={approvers.length} />
        <Summary icon={<UserCheck size={19} />} label="Active accounts" value={activeCount} />
        <Summary icon={<ShieldCheck size={19} />} label="Assigned heads" value={assignedCount} />
      </section>
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-end gap-3 border-b p-4">
          <div className="field min-w-52">
            <label htmlFor="approver-status-filter">Account status</label>
            <select
              id="approver-status-filter"
              className="input"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div className="field min-w-52">
            <label htmlFor="approver-department-filter">Department</label>
            <select
              id="approver-department-filter"
              className="input"
              value={departmentFilter}
              onChange={(event) => setDepartmentFilter(event.target.value)}
            >
              <option value="all">All departments</option>
              {departments.map((department) => (
                <option key={department}>{department}</option>
              ))}
            </select>
          </div>
          <p className="pb-3 text-sm text-slate-500">
            Showing {visible.length} of {approvers.length} approver accounts
          </p>
        </div>
        <div className="divide-y">
          {paginatedUsers.map((user) => (
            <article className="flex flex-col gap-4 p-4 xl:flex-row xl:items-center" key={user.id}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{user.fullName || 'Approver account'}</p>
                  <StatusBadge>{user.active ? 'Active' : 'Inactive'}</StatusBadge>
                  {user.assignedDepartments.length > 0 && <StatusBadge>Assigned head</StatusBadge>}
                  {user.protected && <StatusBadge>Protected</StatusBadge>}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {user.protected ? 'Email hidden' : user.email}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  Departments:{' '}
                  {user.assignedDepartments.length
                    ? user.assignedDepartments.join(', ')
                    : user.department || 'Not assigned'}{' '}
                  · Last sign-in: {manilaDate(user.lastSignInAt, true)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  disabled={busyId === user.id}
                  onClick={() => void sendReset(user)}
                >
                  <KeyRound size={16} />
                  Reset password
                </Button>
                {user.accessLevel === 'approver' && !user.protected && (
                  <Button
                    variant="secondary"
                    disabled={busyId === user.id}
                    onClick={() => void toggleActive(user)}
                  >
                    {user.active ? 'Deactivate' : 'Activate'}
                  </Button>
                )}
                <Button
                  variant="danger"
                  disabled={
                    busyId === user.id ||
                    user.protected ||
                    user.roles.includes('super_administrator')
                  }
                  title={user.protected ? 'Protected accounts cannot be deleted.' : undefined}
                  onClick={() => void remove(user)}
                >
                  <Trash2 size={16} />
                  Delete
                </Button>
              </div>
            </article>
          ))}
          {visible.length === 0 && (
            <div className="p-10 text-center text-sm text-slate-500">
              No approver accounts match these filters.
            </div>
          )}
        </div>
        <AccountPagination
          currentPage={currentPage}
          totalPages={totalPages}
          firstVisible={firstVisible}
          itemCount={visible.length}
          pageSize={PAGE_SIZE}
          itemLabel="accounts"
          onPageChange={setPage}
        />
      </section>
      {adding && (
        <AddApproverModal
          departments={departments}
          onClose={() => setAdding(false)}
          onSaved={async () => {
            setAdding(false);
            setNotice('Secure approver invitation sent.');
            await load();
          }}
        />
      )}
    </div>
  );
}

function Summary({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="card flex items-center gap-3 p-4">
      <span className="rounded-lg bg-blue-50 p-2 text-[#315c93]">{icon}</span>
      <div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
    </div>
  );
}

function AddApproverModal({
  departments,
  onClose,
  onSaved,
}: {
  departments: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [department, setDepartment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await post('staff-users', { email, fullName, accessLevel: 'approver', department });
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add the approver.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Add an approver" onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        <div className="field">
          <label htmlFor="approver-name">Full name</label>
          <input
            id="approver-name"
            className="input"
            required
            minLength={2}
            maxLength={160}
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="approver-email">Work email</label>
          <input
            id="approver-email"
            className="input"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="approver-department">Primary department</label>
          <select
            id="approver-department"
            className="input"
            required
            value={department}
            onChange={(event) => setDepartment(event.target.value)}
          >
            <option value="">Select department</option>
            {departments.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </div>
        <p className="rounded bg-blue-50 p-3 text-sm text-blue-900">
          A secure invitation will be emailed to the approver. They create their own password; no
          password is exposed to the Super Administrator.
        </p>
        {error && <p className="error">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || !fullName || !email || !department}>
            {busy ? (
              <Spinner label="Sending invite" />
            ) : (
              <>
                <UserPlus size={16} />
                Send invitation
              </>
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
