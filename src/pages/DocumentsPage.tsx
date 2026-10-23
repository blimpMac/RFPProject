import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Eye, FileText, Files, FilterX, FolderOpen, Search } from 'lucide-react';
import {
  AttachmentPreviewModal,
  type PreviewAttachment,
} from '../components/AttachmentPreviewSection';
import { Button, EmptyState, Spinner, StatusBadge } from '../components/ui';
import { get, post } from '../lib/api';
import { manilaDate, php } from '../lib/format';

type DocumentRow = {
  id: string;
  request_id: string;
  rfp_number: string;
  requestor_name: string;
  requestor_email: string;
  company: string | null;
  department: string;
  supplier_payee: string;
  amount: number;
  required_payment_date: string | null;
  final_status: string;
  last_action: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  status: string;
  created_at: string;
  request_date: string;
};

type RequestDocuments = {
  requestId: string;
  rfpNumber: string;
  requestorName: string;
  requestorEmail: string;
  company: string | null;
  department: string;
  supplierPayee: string;
  amount: number;
  requiredPaymentDate: string | null;
  finalStatus: string;
  lastAction: string;
  requestDate: string;
  documents: DocumentRow[];
};

const dateKey = (value: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));

function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function fileType(mime: string) {
  if (mime === 'application/pdf') return 'PDF';
  if (mime.startsWith('image/')) return mime.slice(6).toUpperCase();
  return mime || 'File';
}

export function DocumentsPage() {
  const [rows, setRows] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewingId, setPreviewingId] = useState('');
  const [preview, setPreview] = useState<PreviewAttachment>();
  const [search, setSearch] = useState('');
  const [requestorFilter, setRequestorFilter] = useState('all');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    get<{ rows: DocumentRow[] }>('documents')
      .then((result) => setRows(result.rows))
      .catch((cause) => setError(cause.message))
      .finally(() => setLoading(false));
  }, []);

  const groups = useMemo(() => {
    const byRequest = new Map<string, RequestDocuments>();
    rows.forEach((row) => {
      const current = byRequest.get(row.request_id) || {
        requestId: row.request_id,
        rfpNumber: row.rfp_number,
        requestorName: row.requestor_name,
        requestorEmail: row.requestor_email,
        company: row.company,
        department: row.department,
        supplierPayee: row.supplier_payee,
        amount: row.amount,
        requiredPaymentDate: row.required_payment_date,
        finalStatus: row.final_status,
        lastAction: row.last_action,
        requestDate: row.request_date,
        documents: [],
      };
      current.documents.push(row);
      byRequest.set(row.request_id, current);
    });
    return [...byRequest.values()].sort(
      (a, b) => new Date(b.requestDate).getTime() - new Date(a.requestDate).getTime(),
    );
  }, [rows]);

  const requestors = useMemo(
    () =>
      [
        ...new Map(
          groups
            .filter((group) => group.requestorEmail)
            .map((group) => [group.requestorEmail.toLowerCase(), group.requestorName]),
        ).entries(),
      ].sort((a, b) => a[1].localeCompare(b[1])),
    [groups],
  );
  const companies = useMemo(
    () => [...new Set(groups.flatMap((group) => (group.company ? [group.company] : [])))].sort(),
    [groups],
  );
  const statuses = useMemo(
    () => [...new Set(groups.map((group) => group.finalStatus).filter(Boolean))].sort(),
    [groups],
  );
  const invalidDateRange = Boolean(fromDate && toDate && fromDate > toDate);
  const filteredGroups = useMemo(() => {
    if (invalidDateRange) return [];
    const needle = search.trim().toLowerCase();
    return groups.filter((group) => {
      const requestDate = dateKey(group.requestDate);
      const matchesSearch =
        !needle ||
        [
          group.rfpNumber,
          group.requestorName,
          group.requestorEmail,
          group.company,
          group.department,
          group.supplierPayee,
          ...group.documents.map((document) => document.original_filename),
        ].some((value) =>
          String(value || '')
            .toLowerCase()
            .includes(needle),
        );
      return (
        matchesSearch &&
        (requestorFilter === 'all' || group.requestorEmail.toLowerCase() === requestorFilter) &&
        (companyFilter === 'all' || group.company === companyFilter) &&
        (statusFilter === 'all' || group.finalStatus === statusFilter) &&
        (!fromDate || requestDate >= fromDate) &&
        (!toDate || requestDate <= toDate)
      );
    });
  }, [
    companyFilter,
    fromDate,
    groups,
    invalidDateRange,
    requestorFilter,
    search,
    statusFilter,
    toDate,
  ]);

  const availableCount = rows.filter((row) => row.status === 'available').length;
  const attentionCount = rows.length - availableCount;
  const filtersActive = Boolean(
    search ||
    requestorFilter !== 'all' ||
    companyFilter !== 'all' ||
    statusFilter !== 'all' ||
    fromDate ||
    toDate,
  );
  const summaryCards = [
    ['Requests with files', groups.length, FolderOpen],
    ['Total documents', rows.length, Files],
    ['Ready to preview', availableCount, Eye],
    ['Needs attention', attentionCount, FileText],
  ] as const;

  const clearFilters = () => {
    setSearch('');
    setRequestorFilter('all');
    setCompanyFilter('all');
    setStatusFilter('all');
    setFromDate('');
    setToDate('');
  };

  const openPreview = async (document: DocumentRow) => {
    setPreviewingId(document.id);
    setError('');
    try {
      const result = await post<{ url: string }>('attachments/url', { attachmentId: document.id });
      setPreview({
        id: document.id,
        original_filename: document.original_filename,
        mime_type: document.mime_type,
        url: result.url,
        download_url: result.url,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not preview the document.');
    } finally {
      setPreviewingId('');
    }
  };

  if (loading) return <Spinner label="Loading documents" />;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Document Management</h1>
        <p className="text-sm text-slate-500">
          Review supporting files in their company, request, and workflow context.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map(([label, value, Icon]) => (
          <section className="card p-4" key={String(label)}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {label}
                </p>
                <p className="mt-2 text-2xl font-semibold">{value}</p>
              </div>
              <div className="rounded-lg bg-blue-50 p-2.5 text-[#315c93]">
                <Icon size={20} />
              </div>
            </div>
          </section>
        ))}
      </div>

      {error && (
        <p className="rounded bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      <section className="card p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="field md:col-span-2">
            <label htmlFor="document-search">Search requests and files</label>
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                size={17}
              />
              <input
                id="document-search"
                className="input !pl-10"
                placeholder="RFP number, requestor, supplier, or filename"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>
          <FilterSelect
            id="document-company-filter"
            label="Company"
            value={companyFilter}
            onChange={setCompanyFilter}
            allLabel="All companies"
            options={companies}
          />
          <FilterSelect
            id="document-status-filter"
            label="Workflow status"
            value={statusFilter}
            onChange={setStatusFilter}
            allLabel="All statuses"
            options={statuses}
          />
          <FilterSelect
            id="document-requestor-filter"
            label="Requestor"
            value={requestorFilter}
            onChange={setRequestorFilter}
            allLabel="All requestors"
            options={requestors.map(([email, name]) => ({ value: email, label: name }))}
          />
          <div className="field">
            <label htmlFor="document-date-from">Submitted from</label>
            <input
              id="document-date-from"
              className="input"
              type="date"
              value={fromDate}
              max={toDate || undefined}
              onChange={(event) => setFromDate(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="document-date-to">Submitted to</label>
            <input
              id="document-date-to"
              className="input"
              type="date"
              value={toDate}
              min={fromDate || undefined}
              onChange={(event) => setToDate(event.target.value)}
            />
          </div>
          <div className="flex items-end">
            <Button
              className="w-full"
              variant="secondary"
              disabled={!filtersActive}
              onClick={clearFilters}
            >
              <FilterX size={16} />
              Clear filters
            </Button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm text-slate-500">
          <span>
            Showing {filteredGroups.length} of {groups.length} requests
          </span>
          <span>
            {filteredGroups.reduce((total, group) => total + group.documents.length, 0)} files
          </span>
        </div>
      </section>

      {invalidDateRange && (
        <p className="rounded bg-amber-50 px-4 py-3 text-sm text-amber-800" role="alert">
          The start date must be earlier than or equal to the end date.
        </p>
      )}

      <div className="space-y-4">
        {filteredGroups.map((group) => (
          <article className="card overflow-hidden" key={group.requestId}>
            <div className="border-b bg-slate-50/70 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold text-[#173f6b]">{group.rfpNumber}</h2>
                    <StatusBadge>{group.finalStatus}</StatusBadge>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    {group.company || 'Company not recorded'} · {group.department}
                  </p>
                </div>
                <div className="text-right text-sm">
                  <p className="font-semibold">
                    {group.documents.length} {group.documents.length === 1 ? 'file' : 'files'}
                  </p>
                  <p className="text-slate-500">
                    {fileSize(
                      group.documents.reduce((total, document) => total + document.size_bytes, 0),
                    )}
                  </p>
                </div>
              </div>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
                <RequestDetail label="Requestor" value={group.requestorName} />
                <RequestDetail label="Supplier / Payee" value={group.supplierPayee} />
                <RequestDetail label="Amount" value={php.format(group.amount)} />
                <RequestDetail
                  label="Submitted"
                  value={manilaDate(group.requestDate, true)}
                  icon={<CalendarDays size={14} />}
                />
                <RequestDetail
                  label="Last action"
                  value={group.lastAction || 'No action recorded'}
                />
                <RequestDetail
                  label="Required payment"
                  value={manilaDate(group.requiredPaymentDate)}
                />
              </dl>
            </div>
            <div className="divide-y">
              {group.documents.map((document) => (
                <div className="flex flex-wrap items-center gap-3 p-4" key={document.id}>
                  <div className="rounded-lg bg-slate-100 p-2.5 text-slate-600">
                    <FileText size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium" title={document.original_filename}>
                      {document.original_filename}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {fileType(document.mime_type)} · {fileSize(document.size_bytes)} · Added{' '}
                      {manilaDate(document.created_at, true)}
                    </p>
                  </div>
                  <StatusBadge>{document.status}</StatusBadge>
                  {document.status === 'available' ? (
                    <Button
                      variant="secondary"
                      disabled={previewingId === document.id}
                      onClick={() => void openPreview(document)}
                    >
                      {previewingId === document.id ? (
                        <Spinner label="Opening" />
                      ) : (
                        <>
                          <Eye size={16} />
                          Preview
                        </>
                      )}
                    </Button>
                  ) : (
                    <span className="text-xs text-slate-500">Preview unavailable</span>
                  )}
                </div>
              ))}
            </div>
          </article>
        ))}
        {!filteredGroups.length && (
          <div className="card">
            <EmptyState
              title="No matching documents"
              body="Change the company, workflow status, requestor, search, or date filters."
            />
          </div>
        )}
      </div>

      {preview && (
        <AttachmentPreviewModal attachments={[preview]} onClose={() => setPreview(undefined)} />
      )}
    </div>
  );
}

function FilterSelect({
  id,
  label,
  value,
  onChange,
  allLabel,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  allLabel: string;
  options: Array<string | { value: string; label: string }>;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        className="input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="all">{allLabel}</option>
        {options.map((option) => {
          const item = typeof option === 'string' ? { value: option, label: option } : option;
          return (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          );
        })}
      </select>
    </div>
  );
}

function RequestDetail({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 flex items-center gap-1.5 text-slate-800">
        {icon}
        {value}
      </dd>
    </div>
  );
}
