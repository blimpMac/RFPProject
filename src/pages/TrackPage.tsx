import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { get, post } from '../lib/api';
import { manilaDate, php } from '../lib/format';
import { Button, Spinner, StatusBadge } from '../components/ui';
import { useAutoRefresh } from '../hooks/useAutoRefresh';

type Tracking = {
  request: {
    id: string;
    rfp_number: string;
    submitted_at: string;
    requestor_name: string;
    department: string;
    amount: number;
    required_payment_date: string;
    department_approval: string;
    finance_review: string;
    final_status: string;
    last_action: string;
    planned_check_date: string | null;
  };
  logs: { occurred_at: string; action: string; remarks: string | null; new_status: string }[];
  attachments: { id: string; original_filename: string; status: string }[];
};

export function TrackPage() {
  const { token = '' } = useParams();
  const [data, setData] = useState<Tracking>();
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [resubmitted, setResubmitted] = useState(false);
  const load = useCallback(
    () =>
      get<Tracking>(`track/${encodeURIComponent(token)}`)
        .then((result) => {
          setData(result);
          setError('');
        })
        .catch((e) => setError(e.message)),
    [token],
  );
  useEffect(() => {
    void load();
  }, [load]);
  useAutoRefresh(load);
  const resubmit = async () => {
    if (!data || note.trim().length < 2) {
      setError('Describe what you corrected before resubmitting.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await post('submissions/resubmit', {
        requestId: data.request.id,
        trackingToken: token,
        correctionNote: note,
      });
      setNote('');
      setResubmitted(true);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not resubmit this request.');
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
  return (
    <main className="mx-auto min-h-screen max-w-3xl space-y-4 p-4 py-10">
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
            ['Status', r.final_status],
            ['Last action', r.last_action],
            ['Department', r.department],
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
      {r.final_status === 'Returned to Requestor' && (
        <section className="card p-5">
          <h2 className="font-semibold">Correct and resubmit this RFP</h2>
          <p className="mt-1 text-sm text-slate-500">
            The same RFP number will be retained and sent back to the Department Approver.
          </p>
          <label className="mt-4 block text-sm font-semibold" htmlFor="correction-note">
            Correction note
          </label>
          <textarea
            id="correction-note"
            className="input mt-2 min-h-24"
            maxLength={1500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Describe the corrections or clarification provided."
          />
          {error && <p className="mt-2 error">{error}</p>}
          <div className="mt-4 flex justify-end">
            <Button disabled={busy || note.trim().length < 2} onClick={resubmit}>
              {busy ? <Spinner label="Resubmitting" /> : 'Resubmit for approval'}
            </Button>
          </div>
        </section>
      )}
      {resubmitted && (
        <p className="rounded bg-emerald-50 p-4 text-sm text-emerald-800">
          This RFP was resubmitted with the same number and sent to the Department Approver.
        </p>
      )}
      <section className="card">
        <h2 className="border-b p-4 font-semibold">Progress history</h2>
        <ol className="divide-y">
          {data!.logs.map((log) => (
            <li className="p-4" key={`${log.occurred_at}-${log.action}`}>
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">{log.action}</p>
                <span className="text-xs text-slate-500">{manilaDate(log.occurred_at, true)}</span>
              </div>
              {log.remarks && <p className="mt-1 text-sm text-slate-600">{log.remarks}</p>}
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
