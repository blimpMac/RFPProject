import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Spinner, StatusBadge } from '../components/ui';
import { api } from '../lib/api';
import { manilaDate, php } from '../lib/format';
import {
  AttachmentPreviewSection,
  type PreviewAttachment,
} from '../components/AttachmentPreviewSection';

type Review = {
  request: {
    id: string;
    rfp_number: string;
    requestor_name: string;
    requestor_email: string;
    department: string;
    project_class: string;
    rfp_type: string;
    supplier_payee: string;
    purpose_description: string;
    amount: number;
    required_payment_date: string;
    final_status: string;
  };
  attachments: PreviewAttachment[];
};
export function ReviewPage() {
  const { token = '' } = useParams();
  const [data, setData] = useState<Review>();
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  useEffect(() => {
    api<Review>(`review/${encodeURIComponent(token)}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [token]);
  const decide = async (decision: 'approve' | 'reject') => {
    if (decision === 'reject' && !remarks.trim()) {
      setError('Rejection remarks are required.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api(`review/${encodeURIComponent(token)}`, {
        method: 'POST',
        body: JSON.stringify({ decision, remarks }),
      });
      setDone(decision);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Decision failed.');
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
  if (done)
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 p-4">
        <div className="card max-w-lg p-8 text-center">
          <h1 className="text-2xl font-semibold">Decision recorded</h1>
          <p className="mt-2 text-slate-600">
            This request was{' '}
            {done === 'approve'
              ? 'approved and sent to finance'
              : 'rejected and returned to the requestor'}
            .
          </p>
        </div>
      </div>
    );
  if (error && !data)
    return (
      <div className="grid min-h-screen place-items-center p-4">
        <div className="card max-w-lg p-7 text-center">
          <h1 className="text-xl font-semibold">Review unavailable</h1>
          <p className="mt-2 text-slate-500">{error}</p>
        </div>
      </div>
    );
  const r = data!.request;
  return (
    <main className="mx-auto min-h-screen max-w-5xl p-4 py-10">
      <div className="card overflow-hidden">
        <div className="bg-[#102a43] px-6 py-5 text-white">
          <p className="text-sm text-slate-300">Secure department review</p>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{r.rfp_number}</h1>
            <StatusBadge>{r.final_status}</StatusBadge>
          </div>
        </div>
        <dl className="grid gap-x-6 gap-y-4 p-6 sm:grid-cols-2">
          {[
            ['Requestor', `${r.requestor_name} (${r.requestor_email})`],
            ['Department', r.department],
            ['Project / Class', r.project_class],
            ['Type', r.rfp_type],
            ['Supplier / Payee', r.supplier_payee],
            ['Amount', php.format(r.amount)],
            ['Required Payment Date', manilaDate(r.required_payment_date)],
            ['Purpose', r.purpose_description],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k}</dt>
              <dd className="mt-1 text-sm">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="px-6">
          <AttachmentPreviewSection attachments={data!.attachments} />
        </div>
        <div className="mt-5 border-t bg-slate-50 p-6">
          <label className="text-sm font-semibold">
            Remarks <span className="font-normal text-slate-500">(required for rejection)</span>
          </label>
          <textarea
            className="input mt-2 min-h-24"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            maxLength={1500}
          />
          {error && <p className="mt-2 error">{error}</p>}
          <div className="mt-4 flex flex-wrap justify-end gap-3">
            <Button variant="danger" disabled={busy} onClick={() => decide('reject')}>
              Reject
            </Button>
            <Button disabled={busy} onClick={() => decide('approve')}>
              {busy ? <Spinner label="Saving" /> : 'Approve'}
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}
