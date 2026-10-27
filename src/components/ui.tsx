import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
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
  initialFocusRef,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  size?: 'compact' | 'default' | 'wide';
  initialFocusRef?: RefObject<HTMLElement | null>;
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
      if (initialFocusRef?.current) initialFocusRef.current.focus({ preventScroll: true });
      else closeRef.current?.focus({ preventScroll: true });
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.getAttribute('aria-hidden') !== 'true');
      if (!focusable.length) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus({ preventScroll: true });
    };
  }, [initialFocusRef]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-slate-950/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className={clsx(
          'modal-panel max-h-[calc(100dvh-2rem)] w-full overflow-auto rounded-xl bg-white shadow-2xl',
          size === 'wide' ? 'max-w-6xl' : size === 'compact' ? 'max-w-lg' : 'max-w-3xl',
        )}
      >
        <div className="modal-header sticky top-0 z-10 flex items-center justify-between border-b bg-white px-5 py-4">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          <button
            ref={closeRef}
            type="button"
            className="focus-ring modal-close-button text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
