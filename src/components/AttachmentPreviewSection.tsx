import { useEffect, useMemo, useState } from 'react';
import { Download, Eye, FileText } from 'lucide-react';
import { get } from '../lib/api';
import { Button, Modal, Spinner } from './ui';

export type PreviewAttachment = {
  id: string;
  original_filename: string;
  mime_type: string;
  url: string | null;
  download_url?: string | null;
};

type Props = { requestId?: string; attachments?: PreviewAttachment[] };

export function AttachmentPreviewModal({
  attachments,
  onClose,
}: {
  attachments: PreviewAttachment[];
  onClose: () => void;
}) {
  const [selectedId, setSelectedId] = useState(attachments[0]?.id || '');
  const selected = useMemo(
    () => attachments.find((attachment) => attachment.id === selectedId) || attachments[0],
    [attachments, selectedId],
  );
  useEffect(() => {
    if (!attachments.some((attachment) => attachment.id === selectedId))
      setSelectedId(attachments[0]?.id || '');
  }, [attachments, selectedId]);
  if (!selected) return null;

  return (
    <Modal title={`Attachments (${attachments.length})`} size="wide" onClose={onClose}>
      <div className="grid gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
            Files provided by requestor
          </p>
          <div className="grid max-h-[65vh] gap-2 overflow-auto pr-1" role="list">
            {attachments.map((attachment) => (
              <button
                className={`flex min-w-0 items-center gap-3 rounded-lg border p-3 text-left transition ${attachment.id === selected.id ? 'border-[#315c93] bg-blue-50 text-blue-900' : 'bg-white hover:bg-slate-50'}`}
                key={attachment.id}
                onClick={() => setSelectedId(attachment.id)}
                aria-pressed={attachment.id === selected.id}
              >
                <FileText className="shrink-0" size={19} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">
                    {attachment.original_filename}
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {attachment.mime_type}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </aside>
        <section className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-semibold">{selected.original_filename}</p>
              <p className="text-xs text-slate-500">
                Attachment {attachments.indexOf(selected) + 1} of {attachments.length}
              </p>
            </div>
            {(selected.download_url || selected.url) && (
              <a
                className="btn btn-secondary focus-ring"
                href={selected.download_url || selected.url || undefined}
                target="_blank"
                rel="noreferrer"
              >
                <Download size={16} />
                Download
              </a>
            )}
          </div>
          {!selected.url ? (
            <div className="grid min-h-96 place-items-center rounded-lg border bg-slate-50 p-6 text-center text-sm text-slate-500">
              A preview link is unavailable for this attachment.
            </div>
          ) : selected.mime_type.startsWith('image/') ? (
            <div className="grid min-h-96 place-items-center overflow-hidden rounded-lg border bg-slate-50">
              <img
                className="max-h-[65vh] w-full object-contain"
                src={selected.url}
                alt={selected.original_filename}
              />
            </div>
          ) : selected.mime_type === 'application/pdf' ? (
            <iframe
              className="attachment-preview-frame"
              src={selected.url}
              title={`Preview ${selected.original_filename}`}
            />
          ) : (
            <div className="grid min-h-96 place-items-center rounded-lg border bg-slate-50 p-6 text-center">
              <a
                className="font-semibold text-[#173f6b] hover:underline"
                href={selected.url}
                target="_blank"
                rel="noreferrer"
              >
                Open attachment in a new tab
              </a>
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}

export function AttachmentPreviewSection({ requestId, attachments: providedAttachments }: Props) {
  const [loadedAttachments, setLoadedAttachments] = useState<PreviewAttachment[]>(
    providedAttachments || [],
  );
  const [loading, setLoading] = useState(Boolean(requestId && !providedAttachments));
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (providedAttachments) {
      setLoadedAttachments(providedAttachments);
      setLoading(false);
      setError('');
      return;
    }
    if (!requestId) {
      setLoadedAttachments([]);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError('');
    get<{ attachments: PreviewAttachment[] }>(
      `request-attachments?requestId=${encodeURIComponent(requestId)}`,
    )
      .then((result) => {
        if (active) setLoadedAttachments(result.attachments);
      })
      .catch((cause) => {
        if (active)
          setError(cause instanceof Error ? cause.message : 'Could not load attachments.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [providedAttachments, requestId]);

  return (
    <section className="mt-6 border-t pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">Attachments</h3>
          <p className="mt-1 text-sm text-slate-500">
            Preview every file supplied by the requestor before recording a workflow decision.
          </p>
        </div>
        <Button
          variant="secondary"
          disabled={loading || loadedAttachments.length === 0}
          onClick={() => setOpen(true)}
        >
          {loading ? (
            <Spinner label="Loading attachments" />
          ) : (
            <>
              <Eye size={17} />
              Preview all attachments
              {loadedAttachments.length ? ` (${loadedAttachments.length})` : ''}
            </>
          )}
        </Button>
      </div>
      {error && (
        <p className="mt-3 rounded bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      {!loading && !error && loadedAttachments.length === 0 && (
        <p className="mt-3 rounded bg-slate-50 p-3 text-sm text-slate-500">
          No attachments were provided with this request.
        </p>
      )}
      {!loading && loadedAttachments.length > 0 && (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {loadedAttachments.map((attachment) => (
            <li
              className="flex min-w-0 items-center gap-2 rounded-lg border bg-slate-50 px-3 py-2"
              key={attachment.id}
            >
              <FileText className="shrink-0 text-slate-500" size={17} />
              <span className="truncate text-sm font-medium">{attachment.original_filename}</span>
            </li>
          ))}
        </ul>
      )}
      {open && (
        <AttachmentPreviewModal attachments={loadedAttachments} onClose={() => setOpen(false)} />
      )}
    </section>
  );
}
