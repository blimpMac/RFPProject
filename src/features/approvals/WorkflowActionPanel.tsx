import { Check, FileQuestion } from 'lucide-react';
import { Button, Spinner } from '../../components/ui';
import type { Action } from './workflow';

const workflowSteps = [
  'Submit RFP / Department Head review',
  'Finance Member review',
  'Finance Head approval',
  'Hard-copy receipt and verification',
  '3-day processing window (3 PM Philippine-time cutoff)',
  'Check preparation and approval',
  'Check or payment release',
  'Payment completed',
  'CA / RF expense liquidation follow-up, where applicable',
];

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
  return (
    <section className="mt-6 border-t pt-5" aria-label="Workflow actions and stages">
      <h3 className="font-semibold">Next workflow actions</h3>
      {choices.length ? (
        <>
          <p className="mt-1 text-xs text-slate-500">Choose an available action below. All choices are visible.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Available workflow action">
            {choices.map((choice) => (
              <label
                key={choice.value}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm font-medium transition ${action === choice.value ? 'border-blue-500 bg-blue-50 text-blue-900' : 'border-slate-200 hover:border-blue-300'}`}
              >
                <input
                  type="radio"
                  name="workflow-action"
                  value={choice.value}
                  checked={action === choice.value}
                  onChange={() => onActionChange(choice.value)}
                />
                {choice.label}
              </label>
            ))}
          </div>
          <textarea
            className="input mt-3 min-h-24 w-full"
            placeholder={departmentAction ? 'Remarks (required when returning to requestor)' : 'Remarks'}
            value={remarks}
            onChange={(event) => onRemarksChange(event.target.value)}
          />
          <div className="mt-3 flex justify-end">
            <Button onClick={onSave} disabled={!action || busy}>
              {busy ? <Spinner label="Saving" /> : <><Check size={17} /> Save action</>}
            </Button>
          </div>
        </>
      ) : (
        <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
          {finance || department
            ? 'No action is available to your account at this stage. The complete workflow remains visible below.'
            : <><FileQuestion className="mr-2 inline" size={16} /> Department decisions use the secure review link.</>}
        </p>
      )}
      <div className="mt-5 rounded-lg border border-slate-200 p-4">
        <h4 className="text-sm font-semibold">Full approval and payment workflow</h4>
        <ol className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
          {workflowSteps.map((step, index) => (
            <li key={step} className="flex min-w-0 items-start gap-2">
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-700">{index + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
