import { Check, FileQuestion } from 'lucide-react';
import { Button, Spinner } from '../../components/ui';
import type { Action } from './workflow';

export function WorkflowActionPanel({
  choices,
  action,
  remarks,
  departmentAction,
  busy,
  finance,
  department,
  onActionChange,
  onRemarksChange,
  onSave,
}: {
  choices: Action[];
  action: string;
  remarks: string;
  departmentAction: boolean;
  busy: boolean;
  finance: boolean;
  department: boolean;
  onActionChange: (value: string) => void;
  onRemarksChange: (value: string) => void;
  onSave: () => void;
}) {
  if (choices.length > 0) {
    return (
      <div className="mt-6 border-t pt-5">
        <h3 className="font-semibold">Next workflow action</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <select
            className="input sm:col-span-2"
            value={action}
            onChange={(event) => onActionChange(event.target.value)}
          >
            <option value="">Select action…</option>
            {choices.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
          <textarea
            className="input min-h-24 sm:col-span-2"
            placeholder={
              departmentAction ? 'Remarks (required when returning to requestor)' : 'Remarks'
            }
            value={remarks}
            onChange={(event) => onRemarksChange(event.target.value)}
          />
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={onSave} disabled={!action || busy}>
            {busy ? (
              <Spinner label="Saving" />
            ) : (
              <>
                <Check size={17} />
                Save action
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  if (finance || department) {
    return (
      <p className="mt-5 rounded bg-slate-50 p-3 text-sm text-slate-600">
        No further system action is available for this status.
      </p>
    );
  }

  return (
    <p className="mt-5 rounded bg-blue-50 p-3 text-sm text-blue-800">
      <FileQuestion className="mr-2 inline" size={16} />
      Department decisions are completed through the secure email review link.
    </p>
  );
}
