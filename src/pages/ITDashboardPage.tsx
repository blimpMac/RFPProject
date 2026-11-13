import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BookOpen,
  CheckCircle2,
  CircleAlert,
  Clock3,
  History,
  LockKeyhole,
  Mail,
  RefreshCw,
  Server,
  Settings2,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';
import { Button, Spinner } from '../components/ui';
import { EmailQueueDiagnostics } from '../components/EmailQueueDiagnostics';
import { get, post } from '../lib/api';

type ITUser = {
  id: string;
  email: string;
  name: string;
  department: string;
  roles: string[];
  active: boolean;
  protected: boolean;
  lastSignInAt: string | null;
};
type Presence = {
  userId: string;
  signedInAt: string;
  lastSeenAt: string;
  signedOutAt: string | null;
  lastPath: string | null;
  online: boolean;
};
type SecurityEvent = {
  id: number;
  action: string;
  occurred_at: string;
  actor_user_id: string;
  target_user_id: string | null;
};
type Overview = {
  users: ITUser[];
  summary: {
    totalUsers: number;
    activeUsers: number;
    onlineSessions: number;
    emailCounts: Record<string, number>;
  };
  services: {
    database: string;
    smtp: string;
    sender: string;
    vercelApi: string;
    lastEmailSent: string | null;
  };
  recentLogins: Presence[];
  securityEvents: SecurityEvent[];
};
type SmtpStatus = { ready: boolean; checked: boolean; keys: string[] };
type TabId = 'users' | 'services' | 'logins' | 'smtp' | 'passwords';
const items: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: 'users', label: 'Users', icon: Users },
  { id: 'services', label: 'Services', icon: Server },
  { id: 'logins', label: 'Login monitoring', icon: Activity },
  { id: 'smtp', label: 'SMTP sender', icon: Mail },
  { id: 'passwords', label: 'Password reset', icon: LockKeyhole },
];
const localTime = (input: string | null | undefined) =>
  input
    ? new Intl.DateTimeFormat('en-PH', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Manila',
      }).format(new Date(input))
    : '—';

export function ITDashboardPage() {
  const { roles } = useAuth();
  const [tab, setTab] = useState<TabId>('users');
  const [data, setData] = useState<Overview>();
  const [smtpStatus, setSmtpStatus] = useState<SmtpStatus>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [targetId, setTargetId] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [operatorPassword, setOperatorPassword] = useState('');
  const [smtp, setSmtp] = useState({
    user: '',
    password: '',
    fromEmail: '',
  });
  const [smtpOperatorPassword, setSmtpOperatorPassword] = useState('');
  const isIT = roles.includes('it_administrator');

  const reload = useCallback(async () => {
    setError('');
    try {
      const result = await get<Overview>('it/overview');
      setData(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the IT dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (!isIT) return;
    void reload();
    const timer = window.setInterval(() => void reload(), 60_000);
    return () => window.clearInterval(timer);
  }, [isIT, reload]);
  useEffect(() => {
    if (!isIT || tab !== 'smtp') return;
    void get<SmtpStatus>('it/smtp')
      .then(setSmtpStatus)
      .catch((cause) =>
        setError(cause instanceof Error ? cause.message : 'Cannot read Vercel configuration.'),
      );
  }, [isIT, tab]);

  const userById = useMemo(
    () => new Map((data?.users || []).map((user) => [user.id, user])),
    [data],
  );
  const users = useMemo(
    () =>
      (data?.users || []).filter((user) =>
        [user.name, user.email, user.department, ...user.roles]
          .join(' ')
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      ),
    [data, query],
  );

  if (!isIT) return <Navigate to="/admin" replace />;

  const resetPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setNotice('');
    setError('');
    if (newPassword !== confirmNewPassword) {
      setError('The new passwords do not match.');
      return;
    }
    const target = userById.get(targetId);
    if (
      !target ||
      !window.confirm(
        `Reset the password for ${target.name} (${target.email})? This takes effect immediately without an email OTP.`,
      )
    )
      return;
    setBusy(true);
    try {
      const answer = await post<{ message: string }>('it/password-reset', {
        userId: targetId,
        newPassword,
        operatorPassword,
        confirmation: 'RESET PASSWORD',
      });
      setNotice(answer.message);
      setNewPassword('');
      setConfirmNewPassword('');
      setOperatorPassword('');
      setTargetId('');
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not reset password.');
    } finally {
      setBusy(false);
    }
  };

  const configureSMTP = async (event: React.FormEvent) => {
    event.preventDefault();
    setNotice('');
    setError('');
    if (
      !window.confirm(
        'Apply these sender settings to the RFP production Vercel environment and request a redeploy? Existing notifications may use the previous sender until deployment completes.',
      )
    )
      return;
    setBusy(true);
    try {
      const result = await post<{ saved: boolean; redeployStarted: boolean; note: string }>(
        'it/smtp',
        {
          user: smtp.user,
          password: smtp.password,
          fromEmail: smtp.fromEmail,
          operatorPassword: smtpOperatorPassword,
          confirmation: 'APPLY SMTP',
        },
      );
      setNotice(result.note);
      setSmtpOperatorPassword('');
      setSmtp((value) => ({ ...value, password: '' }));
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update sender settings.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <section className="dashboard-hero flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Restricted operations workspace</p>
          <h1 className="mt-2 flex items-center gap-3 text-2xl font-semibold sm:text-3xl">
            <ShieldCheck size={26} /> IT Administration
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            Account visibility, service health, login activity, SMTP configuration and audited
            password assistance. This role cannot approve or release RFP payments.
          </p>
        </div>
        <div className="flex gap-2">
          <Link className="btn btn-secondary" to="/admin/audit-trail">
            <History size={16} /> Audit trail
          </Link>
          <Button variant="secondary" onClick={() => void reload()}>
            <RefreshCw size={16} /> Refresh
          </Button>
        </div>
      </section>
      <div className="grid gap-3 sm:grid-cols-3">
        {(
          [
            ['Registered users', data?.summary.totalUsers ?? '—', Users],
            ['Active accounts', data?.summary.activeUsers ?? '—', CheckCircle2],
            ['Active login sessions', data?.summary.onlineSessions ?? '—', Activity],
          ] as const
        ).map(([label, value, Icon]) => (
          <div key={String(label)} className="card flex items-center gap-3 p-4">
            <span className="rounded-xl bg-slate-100 p-3 text-[#315c93]">
              <Icon size={21} />
            </span>
            <div>
              <p className="text-xs text-slate-500">{label as string}</p>
              <p className="text-2xl font-bold">{value as string | number}</p>
            </div>
          </div>
        ))}
      </div>
      <section className="card p-3 sm:p-4">
        <div
          className="flex flex-wrap gap-2"
          role="tablist"
          aria-label="IT administration sections"
        >
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                type="button"
                role="tab"
                key={item.id}
                aria-selected={tab === item.id}
                onClick={() => {
                  setTab(item.id);
                  setError('');
                  setNotice('');
                }}
                className={`btn ${tab === item.id ? 'btn-primary' : 'btn-secondary'}`}
              >
                <Icon size={16} /> {item.label}
              </button>
            );
          })}
        </div>
      </section>
      {error && (
        <p
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          role="alert"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
          role="status"
        >
          {notice}
        </p>
      )}
      {loading ? (
        <div className="card grid min-h-72 place-items-center">
          <Spinner label="Checking IT services" />
        </div>
      ) : (
        <>
          {tab === 'users' && (
            <section className="card overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
                <div>
                  <h2 className="font-semibold">User overview</h2>
                  <p className="text-sm text-slate-500">
                    Assigned roles, departments and last successful sign-ins
                  </p>
                </div>
                <input
                  className="input max-w-xs"
                  aria-label="Search users"
                  placeholder="Search name, email or department"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[44rem] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="p-3">Name / Email</th>
                      <th className="p-3">Department</th>
                      <th className="p-3">Role</th>
                      <th className="p-3">Account</th>
                      <th className="p-3">Last sign-in</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id} className="border-t">
                        <td className="p-3">
                          <strong className="block">{user.name}</strong>
                          <span className="text-xs text-slate-500">{user.email}</span>
                        </td>
                        <td className="p-3">{user.department || '—'}</td>
                        <td className="p-3">{user.roles.join(', ') || 'Unassigned'}</td>
                        <td className="p-3">{user.active ? 'Active' : 'Inactive'}</td>
                        <td className="p-3">{localTime(user.lastSignInAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {tab === 'services' && (
            <div className="grid gap-3 lg:grid-cols-2">
              {(
                [
                  [
                    'Supabase database',
                    data?.services.database,
                    'Database connectivity and account records',
                  ],
                  [
                    'Notification SMTP',
                    data?.services.smtp,
                    'Sender: ' + (data?.services.sender || '—'),
                  ],
                  [
                    'Vercel management API',
                    data?.services.vercelApi,
                    'Required for editing sender without visiting Vercel',
                  ],
                  [
                    'Last accepted notification',
                    localTime(data?.services.lastEmailSent),
                    'Delivery is provider acceptance, not inbox read confirmation',
                  ],
                ] as const
              ).map(([label, status, detail]) => (
                <div className="card p-5" key={label}>
                  <p className="flex items-center gap-2 font-semibold">
                    <Server size={17} /> {label}
                  </p>
                  <p className="mt-2 break-words text-lg font-bold">{status}</p>
                  <p className="mt-1 text-sm text-slate-500">{detail}</p>
                </div>
              ))}
              <div className="card p-5 lg:col-span-2">
                <h3 className="font-semibold">Recent notification queue (latest 1,000 jobs)</h3>
                <div className="mt-3 flex flex-wrap gap-3">
                  {Object.entries(data?.summary.emailCounts || {}).map(([status, count]) => (
                    <span key={status} className="rounded-lg border px-3 py-2 text-sm">
                      {status}: <strong>{count}</strong>
                    </span>
                  ))}
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  Queue statistics are a recent sample, not the entire database. Daily processing
                  and upload-cleanup jobs are configured in Vercel.
                </p>
                <div className="mt-4">
                  <EmailQueueDiagnostics />
                </div>
                <div className="mt-6 border-t pt-5">
                  <h3 className="font-semibold">Recent IT security actions</h3>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[34rem] text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                        <tr>
                          <th className="p-2">Action</th>
                          <th className="p-2">Performed by</th>
                          <th className="p-2">Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(data?.securityEvents || []).map((entry) => (
                          <tr key={entry.id} className="border-t">
                            <td className="p-2">{entry.action.replaceAll('_', ' ')}</td>
                            <td className="p-2">
                              {userById.get(entry.actor_user_id)?.name || 'IT operator'}
                            </td>
                            <td className="p-2">{localTime(entry.occurred_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}
          {tab === 'logins' && (
            <section className="card overflow-hidden">
              <div className="p-5">
                <h2 className="font-semibold">Login monitoring</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Active means an authenticated browser sent a heartbeat within the last three
                  minutes. Closing a browser without signing out expires from the active list
                  automatically.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[44rem] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="p-3">Account</th>
                      <th className="p-3">Session</th>
                      <th className="p-3">Signed in</th>
                      <th className="p-3">Last seen</th>
                      <th className="p-3">Area</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.recentLogins || []).map((session, index) => (
                      <tr
                        key={session.userId + ':' + session.signedInAt + ':' + index}
                        className="border-t"
                      >
                        <td className="p-3">
                          {userById.get(session.userId)?.name || 'Unknown user'}
                        </td>
                        <td className="p-3">
                          {session.online ? (
                            <span className="font-semibold text-emerald-700">Active</span>
                          ) : (
                            'Offline'
                          )}
                        </td>
                        <td className="p-3">{localTime(session.signedInAt)}</td>
                        <td className="p-3">{localTime(session.lastSeenAt)}</td>
                        <td className="p-3">{session.lastPath || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="p-4 text-xs text-slate-500">
                Activity is collected after this feature is deployed; earlier website sessions
                cannot be reconstructed retroactively.
              </p>
            </section>
          )}
          {tab === 'smtp' && (
            <section className="card p-5">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Settings2 size={20} /> Configure RFP notification sender
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                Change only the notification email, its SMTP password, and the From email.
                The SMTP host, port and security mode are managed separately by IT and cannot
                be changed here. Saving updates the RFP project's settings and requests a
                production redeployment. Secret values are never returned by the server.
              </p>
              {smtpStatus && !smtpStatus.ready && (
                <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <CircleAlert size={16} className="mr-1 inline" /> One-time IT setup required:
                  configure server-only VERCEL_API_TOKEN, VERCEL_RFP_PROJECT_ID and
                  VERCEL_RFP_TEAM_ID in the RFP deployment. Afterwards sender updates can be
                  completed here.
                </p>
              )}
              {smtpStatus?.ready && (
                <p className="mt-3 text-xs text-slate-500">
                  Existing production SMTP keys: {smtpStatus.keys.join(', ') || 'None detected'}.
                  Secret values are never displayed.
                </p>
              )}
              <form
                onSubmit={(e) => void configureSMTP(e)}
                className="mt-5 grid max-w-3xl gap-4 sm:grid-cols-2"
              >
                <label className="field sm:col-span-2">
                  <span>Email (SMTP username)</span>
                  <input
                    className="input"
                    type="email"
                    autoComplete="off"
                    required
                    value={smtp.user}
                    onChange={(e) => setSmtp({ ...smtp, user: e.target.value })}
                    placeholder="rfp.notifications@yourcompany.com"
                  />
                </label>
                <label className="field sm:col-span-2">
                  <span>SMTP Password (app password)</span>
                  <input
                    className="input"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={smtp.password}
                    onChange={(e) => setSmtp({ ...smtp, password: e.target.value })}
                    placeholder="Enter SMTP app password"
                  />
                </label>
                <label className="field sm:col-span-2">
                  <span>SMTP From Email</span>
                  <input
                    className="input"
                    type="email"
                    required
                    value={smtp.fromEmail}
                    onChange={(e) => setSmtp({ ...smtp, fromEmail: e.target.value })}
                    placeholder="rfp.notifications@yourcompany.com"
                  />
                  <span className="text-xs text-slate-500">
                    The From email should be authorized by your email provider for this SMTP account.
                  </span>
                </label>
                <div className="sm:col-span-2 border-t pt-4">
                  <p className="mb-2 text-sm font-semibold">Security confirmation</p>
                  <label className="field">
                    <span>Confirm your IT account password</span>
                    <input
                      className="input"
                      type="password"
                      autoComplete="current-password"
                      required
                      value={smtpOperatorPassword}
                      onChange={(e) => setSmtpOperatorPassword(e.target.value)}
                    />
                  </label>
                  <p className="mt-2 text-xs text-slate-500">
                    This verifies permission to change production settings. It is not an SMTP setting.
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <Button disabled={busy || !smtpStatus?.ready}>
                    {busy ? (
                      <Spinner label="Applying settings" />
                    ) : (
                      'Save SMTP and request redeploy'
                    )}
                  </Button>
                </div>
                <p className="text-xs text-slate-500 sm:col-span-2">
                  A successful API request means the deployment has been started, not that the
                  sender is live. Verify the resulting deployment and send a test notification
                  before closing the change ticket.
                </p>
              </form>
            </section>
          )}
          {tab === 'passwords' && (
            <section className="card p-5">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <LockKeyhole size={20} /> Direct password reset — IT only
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                Resets the selected user's Supabase password directly, without an email OTP. The
                action requires re-entering your own IT password, has rate limiting and creates an
                audit record. Protected and other IT accounts cannot be reset here.
              </p>
              <form className="mt-5 grid max-w-3xl gap-4" onSubmit={(e) => void resetPassword(e)}>
                <label className="field">
                  <span>Account to reset</span>
                  <select
                    required
                    className="input"
                    value={targetId}
                    onChange={(e) => setTargetId(e.target.value)}
                  >
                    <option value="">Choose a user</option>
                    {(data?.users || [])
                      .filter((user) => !user.protected && !user.roles.includes('it_administrator'))
                      .map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name} — {user.email}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="field">
                  <span>New temporary password</span>
                  <input
                    className="input"
                    type="password"
                    minLength={14}
                    autoComplete="new-password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Repeat new password</span>
                  <input
                    className="input"
                    type="password"
                    minLength={14}
                    autoComplete="new-password"
                    required
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Confirm your own IT password</span>
                  <input
                    className="input"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={operatorPassword}
                    onChange={(e) => setOperatorPassword(e.target.value)}
                  />
                </label>
                <p className="text-xs text-slate-500">
                  Use at least 14 characters with upper/lowercase, number and symbol. Share
                  temporary credentials through an approved secure channel, never by public email or
                  screenshots. The user should change it promptly.
                </p>
                <div>
                  <Button disabled={busy || !targetId || !newPassword || !operatorPassword}>
                    {busy ? <Spinner label="Updating password" /> : 'Reset selected password'}
                  </Button>
                </div>
              </form>
            </section>
          )}
        </>
      )}
      <p className="flex items-center gap-2 text-xs text-slate-500">
        <Clock3 size={15} /> All displayed times use Philippine time.{' '}
        <Link to="/admin/manual" className="font-semibold underline">
          <BookOpen size={14} className="inline" /> User manual
        </Link>
      </p>
    </div>
  );
}
