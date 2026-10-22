import { useCallback, useEffect, useState } from 'react';
import { Mail, RefreshCw, Send } from 'lucide-react';
import { get, post } from '../lib/api';
import { Button, Spinner } from './ui';

const templates = [
  ['submission_received', 'Request submitted'],
  ['supervisor_review', 'Department review request'],
  ['department_approved', 'Department approved'],
  ['department_rejected', 'Department rejected'],
  ['finance_review_required', 'Finance review request'],
  ['processing_started', 'Payment processing started'],
  ['finance_returned', 'Returned by finance'],
  ['documentation_required', 'Documentation required'],
  ['check_released', 'Check released'],
  ['payment_completed', 'Payment completed'],
] as const;

type TemplateKey = (typeof templates)[number][0];
type Preview = {
  subject: string;
  html: string;
  recipientLabel: string;
  deliveryConfigured: boolean;
};

export function EmailPreviewPanel() {
  const [template, setTemplate] = useState<TemplateKey>('supervisor_review');
  const [preview, setPreview] = useState<Preview>();
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setPreview(await get<Preview>(`email-preview?template=${encodeURIComponent(template)}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the email preview.');
    } finally {
      setLoading(false);
    }
  }, [template]);
  useEffect(() => {
    void load();
  }, [load]);
  const send = async () => {
    setSending(true);
    setError('');
    setNotice('');
    try {
      const result = await post<{ recipientLabel: string }>('email-preview', { template });
      setNotice(
        `Preview sent to the ${result.recipientLabel.toLowerCase()}. Check the inbox and spam folder.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the preview email.');
    } finally {
      setSending(false);
    }
  };
  return (
    <section className="card overflow-hidden">
      <div className="flex flex-col gap-4 border-b p-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Mail size={20} className="text-[#315c93]" />
            <h2 className="font-semibold">Workflow email preview</h2>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Preview the exact responsive template used by the live workflow, then send a safe sample
            to your signed-in email address.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={16} />
            Refresh
          </Button>
          <Button
            onClick={() => void send()}
            disabled={sending || loading || !preview?.deliveryConfigured}
          >
            <Send size={16} />
            {sending ? 'Sending...' : 'Send preview to me'}
          </Button>
        </div>
      </div>
      <div className="grid lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="border-b bg-slate-50 p-3 lg:border-b-0 lg:border-r">
          <p className="px-2 pb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
            Notification type
          </p>
          <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-1">
            {templates.map(([key, label]) => (
              <button
                key={key}
                className={`rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition ${template === key ? 'bg-[#173f6b] text-white shadow-sm' : 'hover:bg-slate-100'}`}
                onClick={() => setTemplate(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </aside>
        <div className="min-w-0 p-4 sm:p-5">
          {error && (
            <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="mb-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-800" role="status">
              {notice}
            </p>
          )}
          {preview && !preview.deliveryConfigured && (
            <p className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-800" role="status">
              Preview mode is available, but delivery is disabled until SMTP_HOST, SMTP_USER,
              SMTP_PASSWORD, and SMTP_FROM_EMAIL are configured.
            </p>
          )}
          {loading ? (
            <div className="grid min-h-96 place-items-center">
              <Spinner label="Rendering preview" />
            </div>
          ) : (
            preview && (
              <>
                <div className="mb-3 rounded-lg border bg-slate-50 px-4 py-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                    Subject
                  </p>
                  <p className="mt-1 break-words text-sm font-semibold">{preview.subject}</p>
                  <p className="mt-2 text-xs text-slate-500">
                    Test recipient: {preview.recipientLabel}. Address hidden for privacy.
                  </p>
                </div>
                <iframe
                  className="email-preview-frame"
                  title={`${templates.find(([key]) => key === template)?.[1]} email preview`}
                  srcDoc={preview.html}
                  sandbox=""
                />
              </>
            )
          )}
        </div>
      </div>
    </section>
  );
}
