import { useState } from 'react';
import { KeyRound, Mail, Trash2 } from 'lucide-react';
import type { AccessLevel, StaffUser } from '../../../shared/contracts/accounts';
import { Button, Modal, Spinner, StatusBadge } from '../../components/ui';
import { patch, post } from '../../lib/api';

const normalizeDepartment = (value: string | null | undefined) =>
  (value || '')
    .replace(/^[-–—\s]+/, '')
    .trim()
    .toLowerCase();
const isFinance = (value: string | null | undefined) => normalizeDepartment(value) === 'finance';

export function AccountRow({
  user,
  busy,
  onEdit,
  onEmail,
  onReset,
  onRemove,
}: {
  user: StaffUser;
  busy: boolean;
  onEdit: () => void;
  onEmail: () => void;
  onReset: () => void;
  onRemove: () => void;
}) {
  const isSuperAdministrator = user.roles.includes('super_administrator');
  const accessLabel = user.roles.includes('super_administrator')
    ? 'Finance Head (Super Admin)'
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
        {!isSuperAdministrator && !user.protected && user.accessLevel && (
          <Button variant="secondary" disabled={busy} onClick={onEmail}>
            <Mail size={16} />
            Change email
          </Button>
        )}
        {!isSuperAdministrator && !user.protected && user.accessLevel && (
          <Button variant="secondary" disabled={busy} onClick={onEdit}>
            {user.accessLevel === 'approver' ? 'Edit / Transfer' : 'Edit'}
          </Button>
        )}
        {!user.protected && !user.roles.includes('super_administrator') && (
          <Button variant="danger" disabled={busy} onClick={onRemove}>
            <Trash2 size={16} />
            Delete
          </Button>
        )}
      </div>
    </article>
  );
}

export function EmailForm({
  user,
  onClose,
  onSaved,
}: {
  user: StaffUser;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [email, setEmail] = useState(user.email);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const changed = email.trim().toLowerCase() !== user.email.toLowerCase();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextEmail = email.trim().toLowerCase();
    if (!changed) return;
    if (
      !window.confirm(
        `Change the login email for ${user.fullName || 'this account'} from ${user.email} to ${nextEmail}?`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      await patch('staff-users/email', { userId: user.id, email: nextEmail });
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not change the login email.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Change login email" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded border bg-slate-50 p-3 text-sm text-slate-700">
          Changing this address changes the user's sign-in email immediately. Their password and
          account history remain unchanged.
        </div>
        <Text label="Current email" type="email" value={user.email} onChange={() => {}} disabled />
        <Text label="New work email" type="email" value={email} onChange={setEmail} />
        {user.accessLevel === 'approver' && (
          <p className="text-xs text-slate-500">
            Pending Department Head approval links will be revoked and reissued to the new email.
          </p>
        )}
        {error && <p className="error">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || !changed || !email.trim()}>
            {busy ? <Spinner /> : 'Update email'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function AccountForm({
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
