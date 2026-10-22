import { useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { useAuth } from '../components/AuthProvider';
import { ThemeToggle } from '../components/ThemeToggle';
import { Button, Spinner } from '../components/ui';
import { supabase, isConfigured } from '../lib/supabase';

export function LoginPage() {
  const { session, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) setError(error.message);
    setBusy(false);
  };

  return (
    <main className="flex min-h-screen flex-col bg-slate-100">
      <header className="flex items-center justify-between px-4 py-4 sm:px-8">
        <Link
          to="/"
          className="focus-ring inline-flex items-center gap-2 rounded-lg font-semibold text-[#173f6b]"
          aria-label="RFP Monitoring request form"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#173f6b] text-white">
            <LockKeyhole size={18} aria-hidden="true" />
          </span>
          <span>RFP Monitoring</span>
        </Link>
        <ThemeToggle compact />
      </header>

      <section className="grid flex-1 place-items-center px-4 py-8 sm:py-12">
        <form
          onSubmit={submit}
          className="card page-enter w-full max-w-sm p-6 shadow-lg sm:p-8"
          aria-labelledby="staff-login-title"
        >
          <h1 id="staff-login-title" className="text-2xl font-semibold tracking-tight">
            Staff sign in
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Use your assigned account to access the workspace.
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
                autoFocus
                autoComplete="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError('');
                }}
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
              <div className="relative">
                <input
                  className="input pr-12"
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError('');
                  }}
                />
                <button
                  type="button"
                  className="focus-ring absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-slate-500 hover:text-slate-800"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? (
                    <EyeOff size={18} aria-hidden="true" />
                  ) : (
                    <Eye size={18} aria-hidden="true" />
                  )}
                </button>
              </div>
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
            {busy ? <Spinner label="Signing in" /> : 'Sign in'}
          </Button>
        </form>
      </section>

      <footer className="px-4 pb-6 text-center sm:pb-8">
        <Link
          to="/"
          className="focus-ring inline-flex items-center gap-2 rounded-md text-sm font-semibold text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Back to request form
        </Link>
      </footer>
    </main>
  );
}
