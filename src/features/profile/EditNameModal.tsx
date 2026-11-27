import { useEffect, useRef, useState } from 'react';
import { Button, Modal, Spinner } from '../../components/ui';
import { patch, post } from '../../lib/api';
import { supabase } from '../../lib/supabase';

type RequestEmailResponse = { sentTo?: string; expiresInSeconds?: number; financeNotified?: boolean };
type VerifyEmailResponse = { email?: string; financeNotified?: boolean; verificationConsumed?: boolean };

function formatRemaining(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

export function EditNameModal({
  currentName,
  currentEmail,
  onClose,
  onSaved,
}: {
  currentName: string;
  currentEmail: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [fullName, setFullName] = useState(currentName);
  const [newEmail, setNewEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [stage, setStage] = useState<'email' | 'otp'>('email');
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [nameError, setNameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [emailSuccess, setEmailSuccess] = useState('');
  const changed = fullName.trim() !== currentName.trim();

  useEffect(() => {
    if (!expiresAt) return;
    const update = () => setRemainingSeconds(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  async function submitName(event: React.FormEvent) {
    event.preventDefault();
    if (!changed || fullName.trim().length < 2) return;
    setBusy(true);
    setNameError('');
    try {
      await patch('profile/name', { fullName: fullName.trim() });
      await onSaved();
    } catch (cause) {
      setNameError(cause instanceof Error ? cause.message : 'Could not update your name.');
    } finally {
      setBusy(false);
    }
  }

  async function requestCode(event: React.FormEvent) {
    event.preventDefault();
    const address = newEmail.trim().toLowerCase();
    if (!address) return;
    setBusy(true);
    setEmailError('');
    setEmailSuccess('');
    try {
      const result = await post<RequestEmailResponse>('profile/email/request', { newEmail: address });
      const deliveredTo = String(result.sentTo || address).trim().toLowerCase();
      const ttl = Math.max(1, Math.min(600, Number(result.expiresInSeconds || 600)));
      setNewEmail(deliveredTo);
      setOtp('');
      setExpiresAt(Date.now() + ttl * 1000);
      setRemainingSeconds(ttl);
      setStage('otp');
      setEmailSuccess(
        result.financeNotified === false
          ? `A verification code was sent to the new mailbox: ${deliveredTo}. Finance notification could not be delivered; IT should be informed.`
          : `A verification code was sent to the new mailbox: ${deliveredTo}. Check that inbox and its spam folder.`,
      );
    } catch (cause) {
      setEmailError(cause instanceof Error ? cause.message : 'Could not send a verification code.');
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: React.FormEvent) {
    event.preventDefault();
    if (otp.length !== 6 || remainingSeconds <= 0) return;
    setBusy(true);
    setEmailError('');
    setEmailSuccess('');
    try {
      const result = await post<VerifyEmailResponse>('profile/email/verify', { otp });
      const refreshed = await supabase.auth.refreshSession();
      await onSaved();
      if (refreshed.error || result.financeNotified === false || result.verificationConsumed === false) {
        const messages = [
          refreshed.error ? 'Your email was updated. Please sign out and sign in again using your new email address.' : '',
          result.financeNotified === false ? 'Finance could not be notified of the change. Please contact IT.' : '',
          result.verificationConsumed === false ? 'Your email was updated, but verification cleanup needs IT review.' : '',
        ].filter(Boolean);
        setEmailSuccess(messages.join(' '));
        setStage('email');
        setNewEmail('');
        setOtp('');
        setExpiresAt(null);
      } else {
        onClose();
      }
    } catch (cause) {
      setEmailError(cause instanceof Error ? cause.message : 'Could not verify the code.');
    } finally {
      setBusy(false);
    }
  }

  async function requestCodeFromOtpStage() {
    const address = newEmail.trim().toLowerCase();
    if (!address) return;
    setBusy(true);
    setEmailError('');
    setEmailSuccess('');
    try {
      const result = await post<RequestEmailResponse>('profile/email/request', { newEmail: address });
      const deliveredTo = String(result.sentTo || address).trim().toLowerCase();
      const ttl = Math.max(1, Math.min(600, Number(result.expiresInSeconds || 600)));
      setNewEmail(deliveredTo);
      setOtp('');
      setExpiresAt(Date.now() + ttl * 1000);
      setRemainingSeconds(ttl);
      setEmailSuccess(
        result.financeNotified === false
          ? `A new code was sent to the new mailbox: ${deliveredTo}. Finance notification could not be delivered; IT should be informed.`
          : `A new verification code was sent to the new mailbox: ${deliveredTo}.`,
      );
    } catch (cause) {
      setEmailError(cause instanceof Error ? cause.message : 'Could not send a new verification code.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Edit profile" onClose={onClose} size="compact" initialFocusRef={nameInputRef}>
      <div className="space-y-5">
        <form className="space-y-3" onSubmit={submitName}>
          <div>
            <p className="text-sm text-slate-600">
              Update the name shown in the RFP workspace. Your role and department will not change.
            </p>
          </div>
          <div className="field">
            <label htmlFor="profile-full-name">Profile name</label>
            <input
              ref={nameInputRef}
              id="profile-full-name"
              className="input"
              autoComplete="name"
              minLength={2}
              maxLength={160}
              required
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
            />
            <p className="mt-1 text-xs text-slate-500">
              This name is used in the RFP workspace and future approval records.
            </p>
          </div>
          {nameError && <p className="error">{nameError}</p>}
          <div className="flex justify-end">
            <Button type="submit" disabled={busy || !changed || fullName.trim().length < 2}>
              {busy ? <Spinner label="Saving" /> : 'Save name'}
            </Button>
          </div>
        </form>

        <div className="border-t border-slate-200 pt-4">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-slate-900">Email address</h3>
            <p className="mt-1 text-xs text-slate-500">
              Verify access to your new mailbox before changing your RFP login.
            </p>
          </div>
          <div className="field">
            <label htmlFor="profile-current-email">Current email</label>
            <input id="profile-current-email" className="input" value={currentEmail} readOnly />
          </div>

          {stage === 'email' ? (
            <form className="mt-3 space-y-3" onSubmit={requestCode}>
              <div className="field">
                <label htmlFor="profile-new-email">New email address</label>
                <input
                  id="profile-new-email"
                  className="input"
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  required
                  value={newEmail}
                  onChange={(event) => setNewEmail(event.target.value)}
                  placeholder="name@example.com"
                />
              </div>
              <p className="text-xs text-slate-500">
                A six-digit code will be sent only to the new address. The Finance notification email will not contain the code. Maximum 3 code requests per day.
              </p>
              {emailError && <p className="error">{emailError}</p>}
              {emailSuccess && <p className="text-sm text-emerald-700">{emailSuccess}</p>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
                  Close
                </Button>
                <Button type="submit" disabled={busy || !newEmail.trim()}>
                  {busy ? <Spinner label="Sending" /> : 'Send verification code'}
                </Button>
              </div>
            </form>
          ) : (
            <form className="mt-3 space-y-3" onSubmit={verifyCode}>
              <p className="text-sm text-slate-600">
                Enter the six-digit code sent to <strong>{newEmail}</strong>.
              </p>
              <div className="field">
                <label htmlFor="profile-email-otp">One-time verification code</label>
                <input
                  id="profile-email-otp"
                  className="input text-center text-lg font-semibold tracking-[0.35em]"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  minLength={6}
                  maxLength={6}
                  required
                  value={otp}
                  onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  disabled={remainingSeconds <= 0}
                />
                <p className="mt-1 text-xs text-slate-500" aria-live="polite">
                  {remainingSeconds > 0
                    ? `Code expires in ${formatRemaining(remainingSeconds)}`
                    : 'This code has expired. Request a new one.'}
                </p>
              </div>
              {emailError && <p className="error">{emailError}</p>}
              {emailSuccess && <p className="text-sm text-emerald-700">{emailSuccess}</p>}
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    setStage('email');
                    setOtp('');
                    setEmailError('');
                    setEmailSuccess('');
                    setExpiresAt(null);
                  }}
                >
                  Change address
                </Button>
                {remainingSeconds > 0 ? (
                  <Button type="submit" disabled={busy || otp.length !== 6}>
                    {busy ? <Spinner label="Verifying" /> : 'Verify and update email'}
                  </Button>
                ) : (
                  <Button type="button" disabled={busy} onClick={() => void requestCodeFromOtpStage()}>
                    {busy ? <Spinner label="Sending" /> : 'Send a new code'}
                  </Button>
                )}
              </div>
            </form>
          )}
        </div>
      </div>
    </Modal>
  );

}
