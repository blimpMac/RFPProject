import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
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
    company: string | null;
    department: string;
    project_class: string;
    rfp_type: string;
    request_type?: string | null;
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
  const [searchParams] = useSearchParams();
  const preferredAction = searchParams.get('action');
  const [selectedAction, setSelectedAction] = useState<'approve' | 'reject' | 'return' | null>(
    preferredAction === 'approve' || preferredAction === 'reject' || preferredAction === 'return'
      ? preferredAction : null,
  );
  const [data, setData] = useState<Review>();
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  useEffect(() => {
    setSelectedAction(
      preferredAction === 'approve' || preferredAction === 'reject' || preferredAction === 'return'
        ? preferredAction : null,
    );
    setError('');
    setDone('');
    let current = true;
    api<Review>(`review/${encodeURIComponent(token)}`)
      .then((review) => { if (current) setData(review); })
      .catch((e) => { if (current) setError(e instanceof Error ? e.message : 'Review could not be loaded.'); });
    return () => { current = false; };
  }, [token, preferredAction]);
  const decide = async () => {
    if (!selectedAction) {
      setError('Select Approve, Reject or Return for Correction first.');
      return;
    }
    if (selectedAction !== 'approve' && !remarks.trim()) {
      setError('Remarks are required for a rejection or correction return.');
      return;
    }
    const decision = selectedAction;
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
              ? 'approved and sent to Finance'
              : done === 'return'
                ? 'returned to the requestor for correction under the same reference number'
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
          <h1 className="text-xl font-semibold">Review link unavailable</h1>
          <p className="mt-2 text-slate-500">{error}</p>
          <p className="mt-4 text-sm text-slate-600">
            The link may be expired, already used, or no longer assigned to the current Department Approver.
            Sign in to your workspace to check the request, or ask an administrator to issue a new invitation.
          </p>
          <Link to="/admin/login" className="btn btn-primary mt-5">Open Department Head sign in</Link>
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
            ['Company', r.company || 'Not recorded'],
            ['Department', r.department],
            ['Project / Class', r.project_class],
            ['Type', r.rfp_type],
            ['Type of Request', r.request_type || 'Not recorded'],
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
          <h2 className="text-base font-semibold text-slate-900">Department Head decision</h2>
          <p className="mt-1 text-sm text-slate-600">
            Choose an action, review the details, then confirm. Email links never submit decisions automatically.
          </p>
          <div role="group" aria-label="Choose Department Head decision"
            className="mt-4 grid gap-2 sm:grid-cols-3">
            {([
              { value: 'approve', label: 'Approve', note: 'Forward to Finance' },
              { value: 'reject', label: 'Reject', note: 'Decline the request' },
              { value: 'return', label: 'Return for Correction', note: 'Request changes' },
            ] as const).map((item) => (
              <button
                type="button"
                key={item.value}
                aria-pressed={selectedAction === item.value}
                disabled={busy}
                onClick={() => { setSelectedAction(item.value); setError(''); }}
                className={`min-h-20 rounded-lg border p-3 text-left transition focus-visible:outline-offset-2 ${selectedAction === item.value
                  ? 'border-[#315c93] bg-[#edf4fb] ring-2 ring-[#315c93]/25'
                  : 'border-slate-300 bg-white hover:border-[#315c93]'}`}
              >
                <span className="block text-sm font-semibold text-slate-900">{item.label}</span>
                <span className="mt-1 block text-xs text-slate-600">{item.note}</span>
              </button>
            ))}
          </div>
          <label className="mt-4 block text-sm font-semibold" htmlFor="review-remarks">
            Remarks <span className="font-normal text-slate-500">
              ({selectedAction === 'approve' ? 'optional' : 'required for Reject / Return'})
            </span>
          </label>
          <textarea
            id="review-remarks"
            className="input mt-2 min-h-24"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            maxLength={1500}
            placeholder="Explain the decision or required corrections"
          />
          {error && <p className="mt-2 error" role="alert">{error}</p>}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-slate-600">
              {selectedAction ? `Selected: ${selectedAction === 'return' ? 'Return for Correction' : selectedAction === 'approve' ? 'Approve' : 'Reject'}` : 'Select an action above'}
            </span>
            <Button disabled={busy || !selectedAction || (selectedAction !== 'approve' && !remarks.trim())}
              onClick={() => void decide()}>
              {busy ? <Spinner label="Saving decision" /> : 'Confirm decision'}
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}
