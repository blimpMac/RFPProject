import { useCallback, useEffect, useState } from 'react';
import { Printer, Plus, Trash2 } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { get, post } from '../lib/api';
import { manilaDate, php } from '../lib/format';
import { Button, Spinner, StatusBadge } from '../components/ui';
import { DigitalRfpReceipt } from '../components/DigitalRfpReceipt';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { displayRequestStatus } from '../features/requests/sla';
import type { FinanceReceipt } from '../../shared/contracts/digital-rfp';
import type { RfLiquidation } from '../../shared/utils/rf-liquidation';

type Expense = { date: string; description: string; amount: string };
type Corrections = {
  projectClass: string;
  supplierPayee: string;
  purposeDescription: string;
  amount: string;
  requiredPaymentDate: string;
  requestType: 'Regular' | 'Emergency';
};
type Tracking = {
  request: {
    id: string;
    rfp_number: string;
    submitted_at: string;
    requestor_name: string;
    company: string | null;
    department: string;
    project_class: string;
    rfp_type: string;
    request_type?: string | null;
    supplier_payee: string;
    purpose_description: string;
    approving_head: string;
    department_approval_at: string | null;
    amount: number;
    required_payment_date: string;
    department_approval: string;
    finance_review: string;
    final_status: string;
    last_action: string;
    planned_check_date: string | null;
  };
  workflow: {
    member_status?: string | null;
    member_reviewed_at?: string | null;
    member_reviewed_by?: string | null;
    head_status?: string | null;
    head_reviewed_at?: string | null;
    head_reviewed_by?: string | null;
    hard_copy_status?: string | null;
    hard_copy_approved_at?: string | null;
    hard_copy_approved_by?: string | null;
    processing_started_at?: string | null;
    processing_due_at?: string | null;
  };
  financeOperations: {
    originals_received_date?: string | null;
    document_verification?: string | null;
    verification_remarks?: string | null;
    updated_by?: string | null;
  };
  financeReceipt?: FinanceReceipt;
  submissionChecklist: string[];
  liquidationExpenses?: { date: string; description: string; amount: number }[];
  rfLiquidation?: RfLiquidation | null;
  logs: { occurred_at: string; action: string; remarks: string | null; new_status: string }[];
  attachments: { id: string; original_filename: string; status: string }[];
};

const emptyCorrections: Corrections = {
  projectClass: '',
  supplierPayee: '',
  purposeDescription: '',
  amount: '',
  requiredPaymentDate: '',
  requestType: 'Regular',
};

export function TrackPage() {
  const { token = '' } = useParams();
  const [data, setData] = useState<Tracking>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [note, setNote] = useState('');
  const [corrections, setCorrections] = useState<Corrections>(emptyCorrections);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [busy, setBusy] = useState(false);
  const load = useCallback(
    () =>
      get<Tracking>(`track/${encodeURIComponent(token)}`)
        .then((result) => {
          setData(result);
          setError('');
        })
        .catch((e) => setError(e instanceof Error ? e.message : 'Unable to load tracking.')),
    [token],
  );
  useEffect(() => {
    void load();
  }, [load]);
  useAutoRefresh(load);

  // Initialize editable fields when opening a different RFP. Auto-refresh must
  // not overwrite a requestor's unsaved corrections or expense lines.
  useEffect(() => {
    const r = data?.request;
    if (!r) return;
    setCorrections({
      projectClass: r.project_class,
      supplierPayee: r.supplier_payee,
      purposeDescription: r.purpose_description,
      amount: String(r.amount),
      requiredPaymentDate: r.required_payment_date,
      requestType: r.request_type === 'Emergency' ? 'Emergency' : 'Regular',
    });
    setExpenses(
      (data?.liquidationExpenses || []).map((expense) => ({
        ...expense,
        amount: String(expense.amount),
      })),
    );
  }, [data?.request.id]); // only the request identity, not each background refresh

  const updateCorrections = <K extends keyof Corrections>(key: K, value: Corrections[K]) =>
    setCorrections((current) => ({ ...current, [key]: value }));

  const resubmit = async () => {
    if (!data || note.trim().length < 2) {
      setError('Describe what you corrected before resubmitting.');
      return;
    }
    if (
      !corrections.projectClass.trim() ||
      !corrections.supplierPayee.trim() ||
      corrections.purposeDescription.trim().length < 5 ||
      !(Number(corrections.amount) > 0) ||
      !corrections.requiredPaymentDate
    ) {
      setError('Complete all corrected payment details before resubmitting.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await post('submissions/resubmit', {
        requestId: data.request.id,
        trackingToken: token,
        correctionNote: note,
        corrections: { ...corrections, amount: Number(corrections.amount) },
      });
      setNote('');
      setNotice('Request corrected and resubmitted under the same reference number.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not resubmit this request.');
    } finally {
      setBusy(false);
    }
  };
  const submitExpenses = async () => {
    if (
      !data ||
      !expenses.length ||
      expenses.some(
        (row) => !row.date || row.description.trim().length < 2 || !(Number(row.amount) > 0),
      )
    ) {
      setError('Add at least one expense with date, description, and a positive amount.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await post('submissions/liquidate', {
        requestId: data.request.id,
        trackingToken: token,
        expenses: expenses.map((row) => ({
          date: row.date,
          description: row.description.trim(),
          amount: Number(row.amount),
        })),
      });
      setNotice('Expense summary submitted to Finance under the same reference number.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to submit expense liquidation.');
    } finally {
      setBusy(false);
    }
  };

  if (!data && !error)
    return (
      <div className="grid min-h-screen place-items-center">
        <Spinner />
      </div>
    );
  if (error && !data)
    return (
      <div className="grid min-h-screen place-items-center p-4">
        <div className="card p-7 text-center">
          <h1 className="text-xl font-semibold">Tracking unavailable</h1>
          <p className="mt-2 text-slate-500">{error}</p>
        </div>
      </div>
    );
  const r = data!.request;
  const displayedStatus = displayRequestStatus(r);
  return (
    <main className="track-page mx-auto min-h-screen max-w-3xl space-y-4 p-4 py-10">
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-[#102a43] p-6 text-white">
          <div>
            <p className="text-sm text-slate-300">Private request tracking</p>
            <h1 className="mt-1 text-2xl font-semibold">{r.rfp_number}</h1>
          </div>
          <span className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-bold">
            Live status · 15s
          </span>
        </div>
        <div className="grid gap-4 p-6 sm:grid-cols-2">
          {[
            ['Status', displayedStatus],
            ['Last action', r.last_action],
            ['Company', r.company || 'Not recorded'],
            ['Department', r.department],
            ['RFP type', r.rfp_type],
            ['Type of request', r.request_type || 'Not recorded'],
            ['Amount', php.format(r.amount)],
            ['Submitted', manilaDate(r.submitted_at, true)],
            ['Required date', manilaDate(r.required_payment_date)],
            ['Department approval', r.department_approval],
            ['Finance review', r.finance_review],
            ['Planned check date', manilaDate(r.planned_check_date)],
          ].map(([k, v]) => (
            <div key={k}>
              <p className="text-xs font-semibold uppercase text-slate-500">{k}</p>
              <div className="mt-1 text-sm">
                {k === 'Status' ? <StatusBadge>{v}</StatusBadge> : v}
              </div>
            </div>
          ))}
        </div>
      </section>

      {notice && (
        <p
          className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
          role="status"
        >
          {notice}
        </p>
      )}
      {error && (
        <p
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900"
          role="alert"
        >
          {error}
        </p>
      )}

      {r.final_status === 'Pending Liquidation' && (
        <section className="card p-5">
          <h2 className="text-lg font-semibold">Expense liquidation required</h2>
          <p className="mt-2 text-sm text-slate-600">
            The payment was released more than three days ago. Only the requestor with this private
            tracking link may submit the itemized expense report. The reference number remains{' '}
            {r.rfp_number}.
          </p>
          <div className="mt-4 space-y-3">
            {expenses.map((expense, index) => (
              <div
                className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_2fr_1fr_auto]"
                key={index}
              >
                <label className="text-xs font-semibold">
                  Date
                  <input
                    className="input mt-1 w-full"
                    type="date"
                    value={expense.date}
                    onChange={(e) =>
                      setExpenses((rows) =>
                        rows.map((row, i) =>
                          i === index ? { ...row, date: e.target.value } : row,
                        ),
                      )
                    }
                  />
                </label>
                <label className="text-xs font-semibold">
                  Description
                  <input
                    className="input mt-1 w-full"
                    maxLength={280}
                    value={expense.description}
                    onChange={(e) =>
                      setExpenses((rows) =>
                        rows.map((row, i) =>
                          i === index ? { ...row, description: e.target.value } : row,
                        ),
                      )
                    }
                  />
                </label>
                <label className="text-xs font-semibold">
                  Amount (PHP)
                  <input
                    className="input mt-1 w-full"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={expense.amount}
                    onChange={(e) =>
                      setExpenses((rows) =>
                        rows.map((row, i) =>
                          i === index ? { ...row, amount: e.target.value } : row,
                        ),
                      )
                    }
                  />
                </label>
                <button
                  type="button"
                  aria-label={`Remove expense ${index + 1}`}
                  className="self-end rounded border p-2"
                  onClick={() => setExpenses((rows) => rows.filter((_, i) => i !== index))}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap justify-between gap-3">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded border px-4 py-2 text-sm font-semibold"
              onClick={() =>
                setExpenses((rows) => [...rows, { date: '', description: '', amount: '' }])
              }
            >
              <Plus size={16} /> Add expense
            </button>
            <Button onClick={() => void submitExpenses()} disabled={busy}>
              {busy ? <Spinner label="Submitting expenses" /> : 'Submit expense summary'}
            </Button>
          </div>
        </section>
      )}

      {r.final_status === 'Returned to Requestor' && (
        <section className="card p-5">
          <h2 className="text-lg font-semibold">Correct and resubmit this RFP</h2>
          <p className="mt-1 text-sm text-slate-500">
            Only the holder of the original private requestor tracking link can edit and resubmit.
            Your reference <strong>{r.rfp_number}</strong> will not change.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold">
              Project / Class
              <input
                className="input mt-1 w-full"
                value={corrections.projectClass}
                onChange={(e) => updateCorrections('projectClass', e.target.value)}
              />
            </label>
            <label className="text-sm font-semibold">
              Supplier / Payee
              <input
                className="input mt-1 w-full"
                value={corrections.supplierPayee}
                onChange={(e) => updateCorrections('supplierPayee', e.target.value)}
              />
            </label>
            <label className="text-sm font-semibold">
              Amount (PHP)
              <input
                className="input mt-1 w-full"
                type="number"
                min="0.01"
                step="0.01"
                value={corrections.amount}
                onChange={(e) => updateCorrections('amount', e.target.value)}
              />
            </label>
            <label className="text-sm font-semibold">
              Date Needed
              <input
                className="input mt-1 w-full"
                type="date"
                value={corrections.requiredPaymentDate}
                onChange={(e) => updateCorrections('requiredPaymentDate', e.target.value)}
              />
            </label>
            <label className="text-sm font-semibold">
              Urgency
              <select
                className="input mt-1 w-full"
                value={corrections.requestType}
                onChange={(e) =>
                  updateCorrections('requestType', e.target.value as 'Regular' | 'Emergency')
                }
              >
                <option value="Regular">Regular</option>
                <option value="Emergency">Emergency</option>
              </select>
            </label>
            <label className="text-sm font-semibold sm:col-span-2">
              Purpose / Description
              <textarea
                className="input mt-1 w-full min-h-24"
                maxLength={3000}
                value={corrections.purposeDescription}
                onChange={(e) => updateCorrections('purposeDescription', e.target.value)}
              />
            </label>
          </div>
          <label className="mt-4 block text-sm font-semibold" htmlFor="correction-note">
            Correction note
          </label>
          <textarea
            id="correction-note"
            className="input mt-2 min-h-24 w-full"
            maxLength={1500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Describe the corrections or clarification provided."
          />
          <div className="mt-4 flex justify-end">
            <Button disabled={busy || note.trim().length < 2} onClick={() => void resubmit()}>
              {busy ? <Spinner label="Resubmitting" /> : 'Resubmit corrections for approval'}
            </Button>
          </div>
        </section>
      )}

      <section className="card">
        <h2 className="border-b p-4 font-semibold">Progress history</h2>
        <ol className="divide-y">
          {data!.logs.map((log) => (
            <li className="p-4" key={`${log.occurred_at}-${log.action}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-medium">{log.action}</p>
                <span className="text-xs text-slate-500">{manilaDate(log.occurred_at, true)}</span>
              </div>
              {log.remarks && <p className="mt-1 text-sm text-slate-600">{log.remarks}</p>}
            </li>
          ))}
        </ol>
      </section>

      {r.department_approval === 'Approved' && (
        <>
          <div className="flex items-center justify-between gap-3 rounded-lg border bg-white p-4">
            <p className="text-sm text-slate-600">
              Department Head approved. You may print your RFP.
            </p>
            <Button onClick={() => window.print()}>
              <Printer size={16} /> Print / Save PDF
            </Button>
          </div>
          <div className="tracking-receipt">
            <DigitalRfpReceipt
              request={r}
              attachments={data!.attachments}
              workflow={data!.workflow}
              financeOperations={data!.financeOperations}
              financeReceipt={data!.financeReceipt}
              submissionChecklist={data!.submissionChecklist}
              liquidationExpenses={data!.liquidationExpenses || []}
              rfLiquidation={data!.rfLiquidation}
            />
          </div>
        </>
      )}
    </main>
  );
}
