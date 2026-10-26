import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { statusTone } from '../lib/format';

export function Button({
  className,
  variant = 'primary',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  return <button className={clsx('btn focus-ring', `btn-${variant}`, className)} {...props} />;
}
export function StatusBadge({ children }: { children: ReactNode }) {
  const text = String(children ?? '');
  return <span className={`status status-${statusTone(text)}`}>{text || '—'}</span>;
}
export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
      <span>{label}</span>
    </span>
  );
}
export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="px-6 py-14 text-center">
      <h3 className="font-semibold text-slate-700">{title}</h3>
      <p className="mt-1 text-sm text-slate-500">{body}</p>
    </div>
  );
}
export function Modal({
  title,
  onClose,
  children,
  size = 'default',
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  size?: 'default' | 'wide';
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const frame = window.requestAnimationFrame(() => {
      panelRef.current?.scrollTo({ top: 0 });
      closeRef.current?.focus({ preventScroll: true });
    });
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', closeOnEscape);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', closeOnEscape);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus({ preventScroll: true });
    };
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/45 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className={clsx(
          'modal-panel max-h-[90vh] w-full overflow-auto rounded-xl bg-white shadow-2xl',
          size === 'wide' ? 'max-w-6xl' : 'max-w-3xl',
        )}
      >
        <div className="modal-header sticky top-0 z-10 flex items-center justify-between border-b bg-white px-5 py-4">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          <button
            ref={closeRef}
            className="rounded p-2 text-slate-500 hover:bg-slate-100"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
