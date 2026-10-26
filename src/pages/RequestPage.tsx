import { useEffect, useMemo, useState } from 'react';
import { Check, CheckCircle2, ClipboardList, Copy } from 'lucide-react';
import { FileDropzone } from '../components/FileDropzone';
import { RequestAttachmentChecklist } from '../components/RequestAttachmentChecklist';
import { ThemeToggle } from '../components/ThemeToggle';
import { Button, Spinner } from '../components/ui';
import { get, post } from '../lib/api';
import { supabase } from '../lib/supabase';
import type { PublicOptions } from '../types';
import { companies } from '../../shared/constants/companies';

type FormState = {
  requestorName: string;
  requestorEmail: string;
  company: string;
  department: string;
  projectClass: string;
  rfpType: string;
  supplierPayee: string;
  purposeDescription: string;
  amount: string;
  requiredPaymentDate: string;
  approvingHead: string;
};
const initial: FormState = {
  requestorName: '',
  requestorEmail: '',
  company: '',
  department: '',
  projectClass: '',
  rfpType: '',
  supplierPayee: '',
  purposeDescription: '',
  amount: '',
  requiredPaymentDate: '',
  approvingHead: '',
};
type StartResult = {
  requestId: string;
  rfpNumber: string;
  trackingToken: string;
  uploads: { id: string; name: string; path: string; token: string }[];
};
export function RequestPage() {
  const [form, setForm] = useState(initial);
  const [files, setFiles] = useState<File[]>([]);
  const [attachmentChecklist, setAttachmentChecklist] = useState<string[]>([]);
  const [options, setOptions] = useState<PublicOptions>({ departments: [], requestTypes: [] });
  const [approvers, setApprovers] = useState<{ department: string; approver_name: string }[]>([]);
  const [limits, setLimits] = useState({ maxFiles: 10, maxSizeMb: 10 });
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<{ rfpNumber: string; trackingToken: string }>();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    get<{
      options: PublicOptions;
      approvers: { department: string; approver_name: string }[];
      limits: { maxFiles: number; maxSizeMb: number };
    }>('public-config')
      .then((r) => {
        setOptions(r.options);
        setApprovers(r.approvers);
        setLimits(r.limits);
      })
      .catch((e) => setError(e.message));
  }, []);
  const selectedApprover = useMemo(
    () =>
      approvers.find(
        (a) =>
          a.department.replace(/^[- ]+/, '').toLowerCase() ===
          form.department.replace(/^[- ]+/, '').toLowerCase(),
      ),
    [approvers, form.department],
  );
  useEffect(() => {
    if (selectedApprover) setForm((f) => ({ ...f, approvingHead: selectedApprover.approver_name }));
  }, [selectedApprover]);
  const update = (key: keyof FormState, value: string) => setForm((f) => ({ ...f, [key]: value }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const started = await post<StartResult>('submissions/start', {
        request: {
          ...form,
          amount: Number(form.amount),
          attachmentChecklist,
        },
        attachments: files.map((f) => ({ name: f.name, type: f.type, size: f.size })),
        idempotencyKey: crypto.randomUUID(),
      });
      for (const upload of started.uploads) {
        const file = files.find((f) => f.name === upload.name);
        if (!file) throw new Error(`Missing local file ${upload.name}`);
        setProgress((p) => ({ ...p, [upload.id]: 15 }));
        const { error: uploadError } = await supabase.storage
          .from('rfp-attachments')
          .uploadToSignedUrl(upload.path, upload.token, file, { contentType: file.type });
        if (uploadError) throw uploadError;
        setProgress((p) => ({ ...p, [upload.id]: 85 }));
        await post('submissions/attachment-complete', {
          requestId: started.requestId,
          trackingToken: started.trackingToken,
          attachmentId: upload.id,
        });
        setProgress((p) => ({ ...p, [upload.id]: 100 }));
      }
      const result = await post<{ rfpNumber: string }>('submissions/finalize', {
        requestId: started.requestId,
        trackingToken: started.trackingToken,
      });
      setSuccess({ rfpNumber: result.rfpNumber, trackingToken: started.trackingToken });
      setForm(initial);
      setFiles([]);
      setAttachmentChecklist([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submission failed.');
    } finally {
      setBusy(false);
    }
  };
  if (success) {
    const trackingPath = `/track/${encodeURIComponent(success.trackingToken)}`;
    const copyLink = async () => {
      await navigator.clipboard.writeText(`${window.location.origin}${trackingPath}`);
      setCopied(true);
    };
    return (
      <div className="flex min-h-screen flex-col bg-slate-50">
        <main className="grid flex-1 place-items-center p-4 py-10">
          <div className="card w-full max-w-3xl overflow-hidden shadow-lg">
            <div className="grid md:grid-cols-[1.25fr_.75fr]">
              <div className="p-7 text-center sm:p-10">
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50">
                  <CheckCircle2 className="text-emerald-600" size={38} />
                </div>
                <p className="mt-5 text-sm font-bold uppercase tracking-[.16em] text-emerald-700">
                  Successfully submitted
                </p>
                <h1 className="mt-2 text-3xl font-semibold">Request received</h1>
                <p className="mt-5 text-sm text-slate-500">Your RFP number</p>
                <p className="mt-1 text-4xl font-bold tracking-tight text-[#173f6b]">
                  {success.rfpNumber}
                </p>
                <p className="mx-auto mt-4 max-w-md text-sm text-slate-600">
                  Save the private tracking link. It is the fastest way to see approvals, finance
                  updates, and any requested corrections.
                </p>
                <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
                  <a className="btn btn-primary" href={trackingPath}>
                    View live status
                  </a>
                  <Button variant="secondary" onClick={() => void copyLink()}>
                    {copied ? <Check size={17} /> : <Copy size={17} />}{' '}
                    {copied ? 'Link copied' : 'Copy tracking link'}
                  </Button>
                </div>
                <button
                  className="mt-5 text-sm font-bold text-[#315c93] hover:underline"
                  onClick={() => {
                    setSuccess(undefined);
                    setCopied(false);
                  }}
                >
                  Submit another request
                </button>
              </div>
              <div className="bg-[#102a43] p-7 text-white sm:p-8">
                <h2 className="font-semibold">What happens next</h2>
                <ol className="mt-5 space-y-5 text-sm">
                  <li className="flex gap-3">
                    <span className="step-dot">1</span>
                    <span>
                      <strong className="block">Department review</strong>
                      <span className="text-slate-300">
                        The assigned approving heads can review this request.
                      </span>
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span className="step-dot">2</span>
                    <span>
                      <strong className="block">Finance processing</strong>
                      <span className="text-slate-300">
                        Approved requests move through finance and payment preparation.
                      </span>
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span className="step-dot">3</span>
                    <span>
                      <strong className="block">Status updates</strong>
                      <span className="text-slate-300">
                        Follow every action from your private tracking page.
                      </span>
                    </span>
                  </li>
                </ol>
              </div>
            </div>
          </div>
        </main>
        <SiteFooter />
      </div>
    );
  }
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="public-header border-b">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:gap-5">
          <div className="brand-lockup" aria-label="GREENLIGHT POWER and GEMCOR">
            <img className="brand-logo" src="/brands/greenlight-power.png" alt="GREENLIGHT POWER" />
            <span className="h-8 w-px bg-slate-300" aria-hidden="true" />
            <img
              className="brand-logo brand-logo-gemcor"
              src="/brands/gemcor.png"
              alt="GEMCOR — Greenmetal Electric Manufacturing Corporation"
            />
          </div>
          <div className="hidden items-center gap-3 border-l border-slate-300 pl-5 md:flex">
            <ClipboardList />
            <div>
              <p className="font-semibold">RFP Monitoring System</p>
              <p className="text-xs text-slate-600">Request for payment submission</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle compact />
            <a
              className="public-header-link rounded-md px-3 py-2 text-sm font-bold text-[#173f6b] hover:bg-slate-100"
              href="/admin"
            >
              Staff Login
            </a>
          </div>
        </div>
      </header>
      <main className="page-enter mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <div className="mb-6">
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-[#315c93]">
            Payment request
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">New RFP request</h1>
          <p className="mt-2 max-w-2xl text-base text-slate-600">
            Complete the request details. Supporting files are strongly recommended, but uploads
            remain optional at submission.
          </p>
        </div>
        <form onSubmit={submit} className="card p-5 shadow-sm sm:p-7">
          <div className="grid gap-5 md:grid-cols-2">
            <Field
              label="Requestor Name"
              value={form.requestorName}
              onChange={(v) => update('requestorName', v)}
            />
            <Field
              label="Requestor Email"
              type="email"
              value={form.requestorEmail}
              onChange={(v) => update('requestorEmail', v)}
            />
            <Select
              label="Company"
              value={form.company}
              options={[...companies]}
              onChange={(v) => update('company', v)}
            />
            <Select
              label="Department"
              value={form.department}
              options={options.departments}
              onChange={(v) => update('department', v)}
            />
            <Field
              label="Project / Class"
              value={form.projectClass}
              onChange={(v) => update('projectClass', v)}
            />
            <Select
              label="Type"
              value={form.rfpType}
              options={options.requestTypes}
              onChange={(v) => {
                update('rfpType', v);
                setAttachmentChecklist([]);
              }}
            />
            <Field
              label="Supplier / Payee"
              value={form.supplierPayee}
              onChange={(v) => update('supplierPayee', v)}
            />
            <Field
              label="Amount (PHP)"
              type="number"
              min="0.01"
              step="0.01"
              value={form.amount}
              onChange={(v) => update('amount', v)}
            />
            <Field
              label="Required Payment Date"
              type="date"
              value={form.requiredPaymentDate}
              onChange={(v) => update('requiredPaymentDate', v)}
            />
            <Field
              label="Approving Head"
              value={form.approvingHead}
              readOnly
              onChange={(v) => update('approvingHead', v)}
              placeholder="Selected from active department approver"
            />
            <div className="field md:col-span-2">
              <label htmlFor="purpose-description">Purpose / Description</label>
              <textarea
                id="purpose-description"
                className="input min-h-28"
                required
                maxLength={3000}
                value={form.purposeDescription}
                onChange={(e) => update('purposeDescription', e.target.value)}
              />
            </div>
            <RequestAttachmentChecklist
              rfpType={form.rfpType}
              selected={attachmentChecklist}
              onChange={setAttachmentChecklist}
            />
            <div className="md:col-span-2">
              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <strong>Attachment reminder:</strong> Upload supporting documents when available.
                Files are not mandatory to submit because the system cannot reliably determine each
                document type, but missing support may cause the request to be returned during
                approval.
              </div>
              <FileDropzone
                files={files}
                onChange={setFiles}
                maxFiles={limits.maxFiles}
                maxSizeMb={limits.maxSizeMb}
              />
              {Object.entries(progress).map(([id, value]) => (
                <div key={id} className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full bg-emerald-600 transition-all"
                    style={{ width: `${value}%` }}
                  />
                </div>
              ))}
            </div>
          </div>
          {error && (
            <p className="mt-5 rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
              {error}
            </p>
          )}
          <div className="mt-6 flex justify-end">
            <Button disabled={busy || !selectedApprover}>
              {busy ? <Spinner label="Submitting" /> : 'Submit request'}
            </Button>
          </div>
        </form>
      </main>
      <SiteFooter />
    </div>
  );
}

function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-5 text-center sm:flex-row sm:text-left">
        <div>
          <p className="text-sm font-bold">RFP Monitoring System</p>
          <div className="footer-company-list">
            <p>© {new Date().getFullYear()} Greenlight Power Inc.</p>
            <p>© {new Date().getFullYear()} Greenmetal Electric Manufacturing Corp.</p>
          </div>
        </div>
        <a
          className="github-link focus-ring"
          href="https://github.com/blimpMac/RFPProject"
          target="_blank"
          rel="noreferrer"
          aria-label="View RFPProject repository on GitHub"
        >
          <GithubMark />
          <span>View source on GitHub</span>
        </a>
      </div>
    </footer>
  );
}
function GithubMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
      <path d="M12 .7A11.3 11.3 0 0 0 8.43 22.72c.57.1.78-.25.78-.55v-2.18c-3.18.69-3.85-1.35-3.85-1.35-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.68 1.25 3.33.96.1-.74.4-1.25.73-1.54-2.54-.29-5.21-1.27-5.21-5.65 0-1.25.45-2.27 1.18-3.07-.12-.29-.51-1.45.11-3.02 0 0 .96-.31 3.11 1.17A10.8 10.8 0 0 1 12 5.9c.96 0 1.92.13 2.83.38 2.15-1.48 3.11-1.17 3.11-1.17.62 1.57.23 2.73.11 3.02.73.8 1.18 1.82 1.18 3.07 0 4.39-2.68 5.36-5.22 5.64.41.35.77 1.05.77 2.12v3.2c0 .31.21.66.79.55A11.3 11.3 0 0 0 12 .7Z" />
    </svg>
  );
}
function Field({
  label,
  onChange,
  ...props
}: { label: string; onChange: (v: string) => void } & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'onChange'
>) {
  const id = props.id || label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="input"
        required
        maxLength={180}
        {...props}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        className="input"
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Select...</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o.replace(/^[- ]+/, '')}
          </option>
        ))}
      </select>
    </div>
  );
}
