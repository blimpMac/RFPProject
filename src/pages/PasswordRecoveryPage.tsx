import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Eye, EyeOff, KeyRound, Mail, ShieldCheck } from 'lucide-react';
import { Button, Spinner } from '../components/ui';
import { supabase } from '../lib/supabase';

function RecoveryLayout({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-[100dvh] flex-col bg-[#081824] px-4 py-8 text-slate-100 sm:px-6">
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center">
        <Link
          to="/admin/login"
          className="focus-ring mb-6 inline-flex w-fit items-center gap-2 rounded-lg text-sm font-semibold text-slate-300 transition-colors hover:text-white"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Back to Staff Login
        </Link>

        <section
          className="overflow-hidden rounded-2xl border border-[#294358] bg-[#102334] shadow-[0_25px_70px_rgba(0,0,0,0.28)]"
          aria-labelledby="password-recovery-title"
        >
          <div className="border-b border-[#294358] bg-[#0b1c2b] px-6 py-6 sm:px-8">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-[#2a7c79] bg-[#123d48] text-base font-extrabold tracking-tight text-[#8af1d8]">
                RFP
              </span>
              <div className="min-w-0">
                <p className="text-base font-bold leading-5 tracking-tight text-white">
                  RFP Monitoring System
                </p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#89b9b9]">
                  GPI · GEMCOR
                </p>
              </div>
            </div>
          </div>
          <div className="px-6 pb-7 pt-7 sm:px-8 sm:pb-8">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-[#173c4a] text-[#8af1d8]">
              <KeyRound size={23} aria-hidden="true" />
            </div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#60cbb3]">
              Account security
            </p>
            <h1
              id="password-recovery-title"
              className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-[1.7rem]"
            >
              {title}
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-300">{description}</p>
            {children}
          </div>
        </section>
        <div className="mt-5 flex items-center justify-center gap-2 text-center text-xs text-slate-400">
          <ShieldCheck size={15} aria-hidden="true" />
          Secure account recovery · RFP Monitoring System
        </div>
      </div>
    </main>
  );
}

export function PasswordRecoveryPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/auth/recover', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!response.ok) {
        const body: { error?: string } = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Unable to request a recovery email right now.');
      }
      setSent(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to request a reset email.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <RecoveryLayout
      title={sent ? 'Check your email' : 'Forgot your password?'}
      description={
        sent
          ? 'If this address belongs to an RFP staff account, password recovery instructions will arrive shortly.'
          : 'Enter the work email linked to your RFP account. We will send you a secure link to choose a new password.'
      }
    >
      {sent ? (
        <div className="mt-6 space-y-5">
          <div
            className="flex items-start gap-3 rounded-xl border border-[#256e66] bg-[#12382f] p-4"
            role="status"
          >
            <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-[#8af1d8]" aria-hidden="true" />
            <div>
              <p className="font-semibold text-[#d5fff2]">Recovery request received</p>
              <p className="mt-1 text-sm leading-6 text-slate-200">
                Check your inbox and spam folder. For your security, we do not confirm whether an
                email address is registered.
              </p>
            </div>
          </div>
          <Link
            to="/admin/login"
            className="btn btn-primary focus-ring flex w-full items-center justify-center text-center"
          >
            Return to Staff Login
          </Link>
          <button
            type="button"
            className="focus-ring block w-full rounded-md py-2 text-center text-sm font-semibold text-[#8af1d8] hover:underline"
            onClick={() => {
              setSent(false);
              setError('');
            }}
          >
            Try another email address
          </button>
        </div>
      ) : (
        <form onSubmit={(event) => void submit(event)} className="mt-6 space-y-5">
          <div className="field">
            <label
              htmlFor="recovery-email"
              className="mb-2 block text-sm font-semibold text-slate-100"
            >
              Work email address
            </label>
            <div className="relative">
              <Mail
                size={18}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                className="input w-full pl-11"
                id="recovery-email"
                type="email"
                autoComplete="email"
                placeholder="name@company.com"
                required
                disabled={busy}
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setError('');
                }}
              />
            </div>
          </div>
          {error && (
            <p className="error rounded-lg p-3 text-sm" role="alert">
              {error}
            </p>
          )}
          <Button className="w-full" disabled={busy}>
            {busy ? <Spinner label="Sending recovery email" /> : 'Email me a reset link'}
          </Button>
          <p className="text-center text-xs leading-5 text-slate-400">
            We will never ask you to share your password by email.
          </p>
        </form>
      )}
    </RecoveryLayout>
  );
}

export function PasswordResetPage() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { error: authError } = await supabase.auth.updateUser({ password });
      if (authError) throw authError;
      setDone(true);
      await supabase.auth.signOut({ scope: 'local' });
    } catch (cause) {
      if (!done) {
        setError(cause instanceof Error ? cause.message : 'Unable to update the password.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <RecoveryLayout
      title={done ? 'Password updated' : 'Create a new password'}
      description={
        done
          ? 'Your RFP account password has been changed. Sign in again using your new password.'
          : 'Set a new password to restore access to your RFP Monitoring System account.'
      }
    >
      {done ? (
        <div className="mt-6 space-y-5">
          <div
            role="status"
            className="flex items-center gap-3 rounded-xl border border-[#256e66] bg-[#12382f] p-4 text-[#d5fff2]"
          >
            <CheckCircle2 size={22} aria-hidden="true" />
            <p className="font-semibold">Your password has been reset successfully.</p>
          </div>
          <Link
            to="/admin/login"
            className="btn btn-primary focus-ring flex w-full items-center justify-center"
          >
            Continue to Staff Login
          </Link>
        </div>
      ) : (
        <form onSubmit={(event) => void submit(event)} className="mt-6 space-y-5">
          <p className="rounded-lg border border-[#304c5e] bg-[#142b3a] px-4 py-3 text-xs leading-5 text-slate-300">
            Use at least 8 characters. A longer, unique password is recommended.
          </p>
          <div className="field">
            <label
              className="mb-2 block text-sm font-semibold text-slate-100"
              htmlFor="new-password"
            >
              New password
            </label>
            <div className="relative">
              <input
                id="new-password"
                className="input w-full pr-12"
                type={showPassword ? 'text' : 'password'}
                minLength={8}
                required
                autoComplete="new-password"
                disabled={busy}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                type="button"
                className="focus-ring absolute inset-y-0 right-2 grid w-10 place-items-center rounded-lg text-slate-400 hover:text-white"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          <div className="field">
            <label
              className="mb-2 block text-sm font-semibold text-slate-100"
              htmlFor="confirm-password"
            >
              Confirm new password
            </label>
            <div className="relative">
              <input
                id="confirm-password"
                className="input w-full pr-12"
                type={showConfirm ? 'text' : 'password'}
                minLength={8}
                required
                autoComplete="new-password"
                disabled={busy}
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
              />
              <button
                type="button"
                className="focus-ring absolute inset-y-0 right-2 grid w-10 place-items-center rounded-lg text-slate-400 hover:text-white"
                aria-label={
                  showConfirm ? 'Hide confirmation password' : 'Show confirmation password'
                }
                onClick={() => setShowConfirm((value) => !value)}
              >
                {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          {confirm && password !== confirm && (
            <p className="text-xs font-medium text-[#ffb3b3]" role="status">
              Passwords do not match yet.
            </p>
          )}
          {error && (
            <p className="error rounded-lg p-3 text-sm" role="alert">
              {error}
            </p>
          )}
          <Button className="w-full" disabled={busy || password.length < 8 || confirm !== password}>
            {busy ? <Spinner label="Updating password" /> : 'Save new password'}
          </Button>
        </form>
      )}
    </RecoveryLayout>
  );
}
