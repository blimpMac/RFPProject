import { useEffect, useMemo, useState } from 'react';
import { Eye, FileText, FilterX } from 'lucide-react';
import {
  AttachmentPreviewModal,
  type PreviewAttachment,
} from '../components/AttachmentPreviewSection';
import { Button, EmptyState, Spinner, StatusBadge } from '../components/ui';
import { get, post } from '../lib/api';
import { manilaDate } from '../lib/format';

type DocumentRow = {
  id: string;
  request_id: string;
  rfp_number: string;
  requestor_name: string;
  requestor_email: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  status: string;
  created_at: string;
  request_date: string;
};

const dateKey = (value: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));

export function DocumentsPage() {
  const [rows, setRows] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewingId, setPreviewingId] = useState('');
  const [preview, setPreview] = useState<PreviewAttachment>();
  const [requestorFilter, setRequestorFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    get<{ rows: DocumentRow[] }>('documents')
      .then((result) => setRows(result.rows))
      .catch((cause) => setError(cause.message))
      .finally(() => setLoading(false));
  }, []);

  const requestors = useMemo(
    () =>
      [
        ...new Map(
          rows
            .filter((row) => row.requestor_email)
            .map((row) => [row.requestor_email.toLowerCase(), row.requestor_name]),
        ).entries(),
      ].sort((a, b) => a[1].localeCompare(b[1])),
    [rows],
  );
  const invalidDateRange = Boolean(fromDate && toDate && fromDate > toDate);
  const filteredRows = useMemo(
    () =>
      invalidDateRange
        ? []
        : rows.filter((row) => {
            const requestDate = dateKey(row.request_date);
            return (
              (requestorFilter === 'all' ||
                row.requestor_email.toLowerCase() === requestorFilter) &&
              (!fromDate || requestDate >= fromDate) &&
              (!toDate || requestDate <= toDate)
            );
          }),
    [fromDate, invalidDateRange, requestorFilter, rows, toDate],
  );

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
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Document Management</h1>
        <p className="text-sm text-slate-500">
          Preview private supporting documents and filter them by requestor or an inclusive request
          date range.
        </p>
      </div>
      {error && (
        <p className="rounded bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-end gap-3 border-b p-4">
          <div className="field min-w-56">
            <label htmlFor="document-requestor-filter">Requestor</label>
            <select
              id="document-requestor-filter"
              className="input"
              value={requestorFilter}
              onChange={(event) => setRequestorFilter(event.target.value)}
            >
              <option value="all">All requestors</option>
              {requestors.map(([email, name]) => (
                <option value={email} key={email}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="field min-w-44">
            <label htmlFor="document-date-from">From</label>
            <input
              id="document-date-from"
              className="input"
              type="date"
              value={fromDate}
              max={toDate || undefined}
              onChange={(event) => setFromDate(event.target.value)}
            />
          </div>
          <div className="field min-w-44">
            <label htmlFor="document-date-to">To</label>
            <input
              id="document-date-to"
              className="input"
              type="date"
              value={toDate}
              min={fromDate || undefined}
              onChange={(event) => setToDate(event.target.value)}
            />
          </div>
          <Button
            variant="secondary"
            disabled={requestorFilter === 'all' && !fromDate && !toDate}
            onClick={() => {
              setRequestorFilter('all');
              setFromDate('');
              setToDate('');
            }}
          >
            <FilterX size={16} />
            Clear filters
          </Button>
          <p className="pb-3 text-sm text-slate-500">
            Showing {filteredRows.length} of {rows.length} attachments
          </p>
        </div>
        {invalidDateRange && (
          <p className="border-b bg-amber-50 px-4 py-3 text-sm text-amber-800" role="alert">
            The From date must be earlier than or equal to the To date.
          </p>
        )}
        <div className="divide-y">
          {filteredRows.map((document) => (
            <article className="flex flex-wrap items-center gap-3 p-4" key={document.id}>
              <div className="rounded bg-slate-100 p-2">
                <FileText size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="max-w-full truncate font-medium">{document.original_filename}</p>
                  <span className="text-xs font-bold text-[#315c93]">{document.rfp_number}</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {document.requestor_name} · {manilaDate(document.request_date, true)} ·{' '}
                  {document.mime_type} · {(document.size_bytes / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
              <StatusBadge>{document.status}</StatusBadge>
              {document.status === 'available' && (
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
              )}
            </article>
          ))}
          {filteredRows.length === 0 && (
            <EmptyState
              title="No matching documents"
              body="Change the requestor or date range to see other attachments."
            />
          )}
        </div>
      </section>
      {preview && (
        <AttachmentPreviewModal attachments={[preview]} onClose={() => setPreview(undefined)} />
      )}
    </div>
  );
}
