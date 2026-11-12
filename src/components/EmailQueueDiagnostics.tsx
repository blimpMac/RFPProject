import { useState } from 'react';
import { MailCheck, RefreshCw, Send } from 'lucide-react';
import { get, post } from '../lib/api';
import { Button, Spinner } from './ui';

type EmailJob = {
  template_key: string;
  recipient_email: string;
  status: string;
  attempt_count: number;
  max_attempts: number;
  sent_at: string | null;
  last_error: string | null;
};
type Diagnostics = {
  reference: string;
  status: string;
  notifications: EmailJob[];
};
type RetryResult = { reference: string; sent: number; retrying: number; failed: number; regeneratedReview?: boolean };

export function EmailQueueDiagnostics() {
  const [reference, setReference] = useState('');
  const [results, setResults] = useState<Diagnostics>();
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  async function inspect() {
    const value = reference.trim().toUpperCase();
    if (!/^(RFP|CA|RF)-\d{4,}$/.test(value)) {
      setError('Enter a valid RFP-0001, CA-0001, or RF-0001 reference.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      setResults(await get<Diagnostics>(`email-queue?rfpNumber=${encodeURIComponent(value)}`));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to read email queue.');
    } finally {
      setLoading(false);
    }
  }
  async function retry(regenerateDepartmentReview = false) {
    if (!results) return;
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const result = await post<RetryResult>('email-queue', {
        rfpNumber: results.reference,
        regenerateDepartmentReview,
      });
      setNotice(
        `${result.regeneratedReview ? 'A fresh secure Department Head invitation was issued. ' : ''}Delivery attempts finished: ${result.sent} accepted, ${result.retrying} queued for retry, ${result.failed} failed. Check recipient inbox/spam after provider acceptance.`,
      );
      setResults(
        await get<Diagnostics>(`email-queue?rfpNumber=${encodeURIComponent(results.reference)}`),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Email retry failed.');
    } finally {
      setLoading(false);
    }
  }
  return (
    <section className="card overflow-hidden">
      <div className="border-b p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <MailCheck size={18} /> RFP email delivery diagnostics
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          Inspect which emails were queued for one request and retry only those messages. Obsolete
          Department Head approval links are never resent after approval.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <input
            className="input min-w-0 flex-1 sm:max-w-64"
            placeholder="RFP-0002, CA-0001 or RF-0001"
            aria-label="Request reference"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void inspect();
            }}
          />
          <Button onClick={() => void inspect()} disabled={loading}>
            <RefreshCw size={16} /> Inspect
          </Button>
          {results && (
            <Button variant="secondary" onClick={() => void retry()} disabled={loading}>
              <Send size={16} /> Retry pending
            </Button>
          )}
          {results?.status === 'Pending Department Approval' && (
            <Button variant="secondary" onClick={() => void retry(true)} disabled={loading}>
              <MailCheck size={16} /> Regenerate Department Head link
            </Button>
          )}
        </div>
      </div>
      {loading && (
        <div className="p-4">
          <Spinner label="Checking delivery" />
        </div>
      )}
      {error && (
        <p
          className="m-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          role="alert"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          className="m-4 rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800"
          role="status"
        >
          {notice}
        </p>
      )}
      {results && (
        <div className="overflow-x-auto p-4">
          <p className="mb-3 text-sm font-semibold">
            {results.reference} · {results.status}
          </p>
          <table className="w-full min-w-[38rem] border-collapse text-left text-xs">
            <thead className="bg-slate-50">
              <tr>
                <th className="p-2">Notification</th>
                <th className="p-2">Recipient</th>
                <th className="p-2">Delivery</th>
                <th className="p-2">Attempts</th>
                <th className="p-2">Detail</th>
              </tr>
            </thead>
            <tbody>
              {results.notifications.map((job, index) => (
                <tr
                  className="border-t"
                  key={`${job.template_key}-${job.recipient_email}-${index}`}
                >
                  <td className="p-2">{job.template_key.replaceAll('_', ' ')}</td>
                  <td className="p-2">{job.recipient_email}</td>
                  <td className="p-2 font-semibold">{job.status}</td>
                  <td className="p-2">
                    {job.attempt_count} / {job.max_attempts}
                  </td>
                  <td className="max-w-72 break-words p-2">
                    {job.last_error?.slice(0, 150) || (job.sent_at ? 'Provider accepted' : '—')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
