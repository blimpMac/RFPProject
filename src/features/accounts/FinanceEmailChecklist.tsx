import { useState } from 'react';
import { BellRing, CheckCheck } from 'lucide-react';
import type { StaffUser } from '../../../shared/contracts/accounts';
import {
  allFinanceEmailTypeIds,
  financeEmailTypes,
  type FinanceEmailType,
} from '../../../shared/constants/finance-email-types';
import { Button, Modal, Spinner } from '../../components/ui';
import { patch } from '../../lib/api';

export function FinanceEmailChecklist({
  user,
  onClose,
  onSaved,
}: {
  user: StaffUser;
  onClose: () => void;
  onSaved: (allowedTypes: string[]) => Promise<void>;
}) {
  const [chosen, setChosen] = useState<FinanceEmailType[]>(() =>
    user.financeNotificationTypes === null
      ? [...allFinanceEmailTypeIds]
      : user.financeNotificationTypes.filter((type): type is FinanceEmailType =>
          allFinanceEmailTypeIds.includes(type as FinanceEmailType),
        ),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const selected = new Set(chosen);
  const allSelected = chosen.length === allFinanceEmailTypeIds.length;
  const description =
    chosen.length === 0
      ? 'This member will receive no Finance request-type notifications.'
      : allSelected
        ? 'This member will receive Finance request notifications for all request types.'
        : `This member will receive Finance request notifications for ${chosen.length} selected type(s) only.`;

  const toggle = (id: FinanceEmailType, checked: boolean) => {
    setChosen((current) =>
      checked
        ? [...current.filter((value) => value !== id), id]
        : current.filter((value) => value !== id),
    );
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const types = allFinanceEmailTypeIds.filter((type) => selected.has(type));
      await patch('staff-users/email-preferences', {
        userId: user.id,
        allowedTypes: types,
      });
      await onSaved(types);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not save the notification checklist.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Finance email checklist" onClose={onClose}>
      <form onSubmit={(event) => void save(event)} className="space-y-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-800/50">
          <p className="flex items-center gap-2 font-semibold">
            <BellRing size={17} /> {user.fullName || user.email}
          </p>
          <p className="mt-1 break-words text-xs text-slate-500">{user.email}</p>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Select which RFP request types may generate Finance Member emails for this person. RF
            includes RF Liquidations. These choices do not change workflow access, Finance Head
            notifications, or requestor and Department Head emails.
          </p>
        </div>

        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-semibold">Allowed request types</legend>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-slate-500" aria-live="polite">
              {chosen.length} of {financeEmailTypes.length} selected
            </span>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={busy || allSelected}
                onClick={() => setChosen([...allFinanceEmailTypeIds])}
              >
                <CheckCheck size={15} /> Select all
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={busy || chosen.length === 0}
                onClick={() => setChosen([])}
              >
                Clear all
              </Button>
            </div>
          </div>
          <div className="grid max-h-[22rem] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
            {financeEmailTypes.map((type) => (
              <label
                key={type.id}
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm transition-colors hover:border-emerald-400 dark:border-slate-700"
              >
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-700"
                  checked={selected.has(type.id)}
                  disabled={busy}
                  onChange={(event) => toggle(type.id, event.target.checked)}
                />
                <span className="leading-5">{type.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <p
          className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300"
          role="status"
        >
          {description}
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy}>
            {busy ? <Spinner label="Saving preferences" /> : 'Save email checklist'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
