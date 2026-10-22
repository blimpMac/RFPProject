import { useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, LockKeyhole, ShieldCheck } from 'lucide-react';
import { useAuth } from '../components/AuthProvider';
import { ThemeToggle } from '../components/ThemeToggle';
import { Button, Spinner } from '../components/ui';
import { supabase, isConfigured } from '../lib/supabase';

export function LoginPage() {
  const { session, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (loading)
    return (
      <div className="grid min-h-screen place-items-center">
        <Spinner />
      </div>
    );
  if (session) return <Navigate to="/admin" replace />;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setBusy(false);
  };
  return (
    <main className="min-h-screen bg-slate-100 lg:grid lg:grid-cols-[minmax(20rem,0.9fr)_minmax(28rem,1.1fr)]">
      <section
        className="relative hidden overflow-hidden bg-[#102a43] p-10 text-white lg:flex lg:flex-col lg:justify-between"
        aria-label="RFP workspace introduction"
      >
        <div className="absolute -right-24 -top-20 h-80 w-80 rounded-full bg-blue-400/10 blur-2xl" />
        <div className="relative">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/12">
            <ShieldCheck size={25} />
          </div>
          <p className="mt-8 text-sm font-bold uppercase tracking-[0.16em] text-blue-200">
            Staff workspace
          </p>
          <h1 className="mt-3 max-w-lg text-4xl font-semibold leading-tight">
            Review every payment request with clarity.
          </h1>
          <p className="mt-4 max-w-md text-base leading-7 text-slate-200">
            Secure access for department approvers, finance reviewers, and administrators.
          </p>
        </div>
        <ul className="relative space-y-3 text-sm text-slate-100">
          {[
            'Live request status and history',
            'Role-based approvals and finance review',
            'Private document access',
          ].map((item) => (
            <li key={item} className="flex items-center gap-3">
              <CheckCircle2 className="text-emerald-300" size={18} />
              {item}
            </li>
          ))}
        </ul>
      </section>
      <section className="relative grid min-h-screen place-items-center p-4 sm:p-8">
        <div className="absolute right-4 top-4 sm:right-8 sm:top-6">
          <ThemeToggle />
        </div>
        <form
          onSubmit={submit}
          className="card page-enter w-full max-w-md p-6 shadow-lg sm:p-9"
          aria-labelledby="staff-login-title"
        >
          <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-[#173f6b] text-white">
            <LockKeyhole size={23} />
          </div>
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-[#315c93]">
            Authorized staff
          </p>
          <h1 id="staff-login-title" className="mt-2 text-3xl font-semibold tracking-tight">
            Sign in to your account
          </h1>
          <p className="mt-2 text-base leading-6 text-slate-600">
            Enter your organization email and password to open the operations workspace.
          </p>
          {!isConfigured && (
            <p
              className="mt-5 rounded-md bg-amber-50 p-3 text-sm font-medium text-amber-900"
              role="status"
            >
              Frontend environment variables are not configured.
            </p>
          )}
          <div className="mt-7 space-y-5">
            <div className="field">
              <label htmlFor="email">Work email</label>
              <input
                className="input"
                id="email"
                type="email"
                required
                autoComplete="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="field">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="password">Password</label>
                <Link
                  to="/admin/forgot-password"
                  className="text-sm font-bold text-[#23558a] hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <input
                className="input"
                id="password"
                type="password"
                required
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>
          {error && (
            <p
              className="mt-4 rounded-md bg-red-50 p-3 text-sm font-semibold text-red-800"
              role="alert"
            >
              {error}
            </p>
          )}
          <Button className="mt-6 w-full" disabled={busy}>
            {busy ? <Spinner label="Signing in" /> : 'Sign in securely'}
          </Button>
          <Link
            to="/"
            className="mt-6 flex items-center justify-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft size={16} />
            Back to request form
          </Link>
        </form>
      </section>
    </main>
  );
}
