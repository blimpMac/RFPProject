import { useRef, useState } from 'react';
import { Button, Modal, Spinner } from '../../components/ui';
import { patch } from '../../lib/api';

export function EditNameModal({
  currentName,
  onClose,
  onSaved,
}: {
  currentName: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [fullName, setFullName] = useState(currentName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const changed = fullName.trim() !== currentName.trim();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!changed || fullName.trim().length < 2) return;
    setBusy(true);
    setError('');
    try {
      await patch('profile/name', { fullName: fullName.trim() });
      await onSaved();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update your name.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Edit profile" onClose={onClose} size="compact" initialFocusRef={nameInputRef}>
      <form className="space-y-4" onSubmit={submit}>
        <div>
          <p className="text-sm text-slate-600">
            Update the name shown in the RFP workspace. Your email, role, and department will not
            change.
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
        {error && <p className="error">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || !changed || fullName.trim().length < 2}>
            {busy ? <Spinner label="Saving" /> : 'Save profile'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
