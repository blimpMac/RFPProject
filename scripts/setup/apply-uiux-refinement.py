from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    if old not in text:
        raise RuntimeError(f"Could not find expected text in {path}: {old[:120]!r}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")


# Shared modal accessibility: trap focus, preserve Escape behavior, and use a real icon button.
replace_once(
    "src/components/ui.tsx",
    '''import { createPortal } from 'react-dom';
import clsx from 'clsx';''',
    '''import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import clsx from 'clsx';''',
)
replace_once(
    "src/components/ui.tsx",
    '''    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', closeOnEscape);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', closeOnEscape);''',
    '''    const handleKeyDown = (event: KeyboardEvent) => {
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
      document.removeEventListener('keydown', handleKeyDown);''',
)
replace_once(
    "src/components/ui.tsx",
    '''          <button
            ref={closeRef}
            className="rounded p-2 text-slate-500 hover:bg-slate-100"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>''',
    '''          <button
            ref={closeRef}
            type="button"
            className="focus-ring modal-close-button text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={18} aria-hidden="true" />
          </button>''',
)

# Admin shell: keyboard skip link and a reliable main-content focus target.
replace_once(
    "src/layouts/AdminLayout.tsx",
    '''  return (
    <div className={`admin-shell min-h-screen ${collapsed ? 'admin-shell-collapsed' : ''}`}>''',
    '''  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <div className={`admin-shell min-h-screen ${collapsed ? 'admin-shell-collapsed' : ''}`}>''',
)
replace_once(
    "src/layouts/AdminLayout.tsx",
    '''      <button
        className="admin-mobile-menu fixed left-3 top-3 z-40 p-2 lg:hidden"''',
    '''      <button
        type="button"
        className="admin-mobile-menu fixed left-3 top-3 z-40 p-2 lg:hidden"''',
)
replace_once(
    "src/layouts/AdminLayout.tsx",
    '''        <button
          className="fixed inset-0 z-20 bg-slate-950/45 backdrop-blur-[2px] lg:hidden"''',
    '''        <button
          type="button"
          className="fixed inset-0 z-20 bg-slate-950/45 backdrop-blur-[2px] lg:hidden"''',
)
replace_once(
    "src/layouts/AdminLayout.tsx",
    '''          <button
            className="admin-collapse hidden rounded-xl p-2 lg:block"''',
    '''          <button
            type="button"
            className="admin-collapse hidden rounded-xl p-2 lg:block"''',
)
replace_once(
    "src/layouts/AdminLayout.tsx",
    '''          <button
            className={`admin-sidebar-link mt-2 w-full ${collapsed ? 'justify-center' : ''}`}''',
    '''          <button
            type="button"
            className={`admin-sidebar-link mt-2 w-full ${collapsed ? 'justify-center' : ''}`}''',
)
replace_once(
    "src/layouts/AdminLayout.tsx",
    '''        <main className="page-enter mx-auto w-full max-w-[100rem] p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );''',
    '''        <main
          id="main-content"
          tabIndex={-1}
          className="page-enter mx-auto w-full max-w-[100rem] p-4 sm:p-6 lg:p-8"
        >
          <Outlet />
        </main>
      </div>
    </div>
    </>
  );''',
)

# Data table: expose sorting state, improve touch targets, and add accessible table context.
replace_once(
    "src/components/DataTable.tsx",
    '''          <button
            className="rounded p-1.5 text-[#173f6b] hover:bg-blue-50"''',
    '''          <button
            type="button"
            className="focus-ring table-icon-button text-[#173f6b] hover:bg-blue-50"''',
)
replace_once(
    "src/components/DataTable.tsx",
    '''            <button
              className="focus-ring absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:text-slate-700"''',
    '''            <button
              type="button"
              className="focus-ring table-search-clear absolute right-0 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"''',
)
replace_once(
    "src/components/DataTable.tsx",
    '''          <Button
            className="w-full sm:w-auto"
            variant="secondary"
            disabled={!hideableColumns.length}
            onClick={() => setColumnsOpen(!columnsOpen)}''',
    '''          <Button
            className="w-full sm:w-auto"
            variant="secondary"
            disabled={!hideableColumns.length}
            aria-expanded={columnsOpen}
            aria-haspopup="menu"
            onClick={() => setColumnsOpen(!columnsOpen)}''',
)
replace_once(
    "src/components/DataTable.tsx",
    '''                <label key={column.id} className="flex items-center gap-2 py-1 text-sm">''',
    '''                <label key={column.id} className="flex min-h-11 items-center gap-2 py-2 text-sm">''',
)
replace_once(
    "src/components/DataTable.tsx",
    '''        <table className="data-grid min-w-full border-separate border-spacing-0 text-left text-sm">
          <thead className="sticky top-0 z-10 bg-slate-100">''',
    '''        <table className="data-grid min-w-full border-separate border-spacing-0 text-left text-sm">
          <caption className="sr-only">
            {title}. Use the column headings to sort the currently loaded records.
          </caption>
          <thead className="sticky top-0 z-10 bg-slate-100">''',
)
replace_once(
    "src/components/DataTable.tsx",
    '''                {group.headers.map((header, index) => (
                  <th
                    key={header.id}
                    className={`whitespace-nowrap border-b border-r px-3 py-3 font-semibold text-slate-600 ${index === 0 ? 'sticky left-0 z-10 bg-slate-100' : ''}`}
                  >
                    <button
                      className="flex items-center gap-1"
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getCanSort() && <ChevronDown size={13} />}
                    </button>
                  </th>
                ))}''',
    '''                {group.headers.map((header, index) => {
                  const sorted = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      aria-sort={
                        sorted === 'asc'
                          ? 'ascending'
                          : sorted === 'desc'
                            ? 'descending'
                            : header.column.getCanSort()
                              ? 'none'
                              : undefined
                      }
                      className={`whitespace-nowrap border-b border-r px-3 py-2 font-semibold text-slate-600 ${index === 0 ? 'sticky left-0 z-10 bg-slate-100' : ''}`}
                    >
                      <button
                        type="button"
                        className="focus-ring flex min-h-11 items-center gap-1 rounded-md px-1 text-left"
                        onClick={header.column.getToggleSortingHandler()}
                        disabled={!header.column.getCanSort()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getCanSort() && (
                          <ChevronDown
                            aria-hidden="true"
                            size={14}
                            className={`transition-transform ${sorted === 'asc' ? 'rotate-180 text-[#087ea4]' : sorted === 'desc' ? 'text-[#087ea4]' : 'opacity-50'}`}
                          />
                        )}
                      </button>
                    </th>
                  );
                })}''',
)
replace_once(
    "src/components/DataTable.tsx",
    '''            {table.getRowModel().rows.map((row, rowIndex) => (
              <tr key={row.id} className={rowIndex % 2 ? 'bg-slate-50/60' : 'bg-white'}>''',
    '''            {table.getRowModel().rows.map((row, rowIndex) => (
              <tr
                key={row.id}
                className={`data-grid-row ${rowIndex % 2 ? 'bg-slate-50/60' : 'bg-white'}`}
              >''',
)
replace_once(
    "src/components/DataTable.tsx",
    '''        <span>
          {total
            ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`
            : '0 rows'}
        </span>''',
    '''        <span aria-live="polite">
          {total
            ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`
            : '0 rows'}
          {search ? ' · filtered view' : ''}
        </span>''',
)
replace_once(
    "src/components/DataTable.tsx",
    '''            <select
              className="rounded border px-2 py-1"''',
    '''            <select
              className="input !min-h-11 !w-auto !py-1 !pl-2 !pr-8"
              aria-label="Rows per page"''',
)
replace_once(
    "src/components/DataTable.tsx",
    '''          <button
            className="rounded border p-1.5 disabled:opacity-40"
            aria-label="Previous page"''',
    '''          <button
            type="button"
            className="focus-ring table-page-button disabled:opacity-40"
            aria-label="Previous page"''',
)
replace_once(
    "src/components/DataTable.tsx",
    '''          <button
            className="rounded border p-1.5 disabled:opacity-40"
            aria-label="Next page"''',
    '''          <button
            type="button"
            className="focus-ring table-page-button disabled:opacity-40"
            aria-label="Next page"''',
)

# Public request form: add clear progressive section landmarks without altering submission behavior.
replace_once(
    "src/pages/RequestPage.tsx",
    '''          <div className="grid gap-5 md:grid-cols-2">
            <Field''',
    '''          <div className="grid gap-5 md:grid-cols-2">
            <FormSection
              number="1"
              title="Requestor & organization"
              description="Tell us who is requesting payment and which company and department own the request."
            />
            <Field''',
)
replace_once(
    "src/pages/RequestPage.tsx",
    '''            <Field
              label="Requestor Name"
              value={form.requestorName}''',
    '''            <Field
              label="Requestor Name"
              autoComplete="name"
              value={form.requestorName}''',
)
replace_once(
    "src/pages/RequestPage.tsx",
    '''            <Field
              label="Requestor Email"
              type="email"
              value={form.requestorEmail}''',
    '''            <Field
              label="Requestor Email"
              type="email"
              autoComplete="email"
              value={form.requestorEmail}''',
)
replace_once(
    "src/pages/RequestPage.tsx",
    '''            <Field
              label="Project / Class"''',
    '''            <FormSection
              number="2"
              title="Payment details"
              description="Classify the request, identify the payee, and provide the amount and required payment date."
            />
            <Field
              label="Project / Class"''',
)
replace_once(
    "src/pages/RequestPage.tsx",
    '''            <Field
              label="Amount (PHP)"
              type="number"''',
    '''            <Field
              label="Amount (PHP)"
              type="number"
              inputMode="decimal"''',
)
replace_once(
    "src/pages/RequestPage.tsx",
    '''            <RequestAttachmentChecklist
              rfpType={form.rfpType}''',
    '''            <FormSection
              number="3"
              title="Supporting documents"
              description="Review the requirements for the selected Type and attach any files already available. Attachments remain optional at submission."
            />
            <RequestAttachmentChecklist
              rfpType={form.rfpType}''',
)
replace_once(
    "src/pages/RequestPage.tsx",
    '''function SiteFooter() {''',
    '''function FormSection({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="form-section-heading md:col-span-2">
      <span className="form-step-badge" aria-hidden="true">
        {number}
      </span>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </div>
  );
}

function SiteFooter() {''',
)

# Keep the refinement layer isolated and easy to review/revert.
replace_once(
    "src/main.tsx",
    '''import './styles/digital-rfp.css';''',
    '''import './styles/digital-rfp.css';
import './styles/ux-refinement.css';''',
)

Path("src/styles/ux-refinement.css").write_text(
    '''/* UI/UX Pro Max refinement layer: accessibility, touch targets, scanning, and form hierarchy. */
html {
  scroll-padding-top: 6rem;
}

body,
#root,
.admin-shell,
.admin-content {
  min-height: 100dvh;
}

button,
a,
[role='button'] {
  touch-action: manipulation;
}

button:focus-visible {
  outline: 3px solid rgba(49, 115, 219, 0.38);
  outline-offset: 2px;
}

.btn {
  min-height: 2.75rem;
}

.skip-link {
  position: fixed;
  left: 1rem;
  top: 0.75rem;
  z-index: 1000;
  transform: translateY(-160%);
  border-radius: 0.65rem;
  background: #ffffff;
  padding: 0.7rem 0.9rem;
  color: #082638;
  font-size: 0.875rem;
  font-weight: 800;
  box-shadow: 0 8px 28px rgba(8, 38, 56, 0.2);
  transition: transform 0.16s ease;
}

.skip-link:focus {
  transform: translateY(0);
}

#main-content:focus {
  outline: none;
}

.admin-mobile-menu,
.admin-collapse,
.modal-close-button,
.table-icon-button,
.table-page-button {
  min-height: 2.75rem;
  min-width: 2.75rem;
}

.modal-close-button,
.table-icon-button,
.table-page-button,
.table-search-clear {
  display: inline-grid;
  place-items: center;
  border-radius: 0.65rem;
}

.table-search-clear {
  width: 2.75rem;
  height: 2.75rem;
}

.table-page-button {
  border: 1px solid #ccd9df;
  background: #ffffff;
  color: #29404e;
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease,
    color 0.16s ease;
}

.table-page-button:hover:not(:disabled),
.table-icon-button:hover:not(:disabled) {
  border-color: #9db2bd;
  background: #eef7f5;
  color: #08705f;
}

.data-grid-row {
  transition: background-color 0.14s ease;
}

.data-grid-row:hover {
  background: #f0f8f6;
}

.data-grid tbody td {
  vertical-align: middle;
}

.form-section-heading {
  display: flex;
  align-items: flex-start;
  gap: 0.85rem;
  margin-top: 0.2rem;
  border-top: 1px solid #e2eaee;
  padding-top: 1.25rem;
}

.form-section-heading:first-child {
  margin-top: 0;
  border-top: 0;
  padding-top: 0;
}

.form-section-heading h2 {
  margin: 0;
  color: #142432;
  font-size: 1rem;
  font-weight: 800;
  letter-spacing: -0.01em;
}

.form-section-heading p {
  max-width: 46rem;
  margin: 0.2rem 0 0;
  color: #667785;
  font-size: 0.82rem;
  line-height: 1.5;
}

.form-step-badge {
  display: grid;
  width: 2rem;
  height: 2rem;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid #b9e2d8;
  border-radius: 0.65rem;
  background: #eaf8f4;
  color: #08705f;
  font-size: 0.78rem;
  font-weight: 900;
}

.dark .skip-link {
  background: #e7edf6;
  color: #08111f;
}

.dark .table-page-button {
  border-color: #536176;
  background: #162235;
  color: #eef3f9;
}

.dark .table-page-button:hover:not(:disabled),
.dark .table-icon-button:hover:not(:disabled) {
  border-color: #5c8177;
  background: #17372f;
  color: #9ee8d5;
}

.dark .data-grid-row:hover {
  background: #142738;
}

.dark .form-section-heading {
  border-color: #334155;
}

.dark .form-section-heading h2 {
  color: #edf3f9;
}

.dark .form-section-heading p {
  color: #aebacd;
}

.dark .form-step-badge {
  border-color: #286b5a;
  background: #12382f;
  color: #9ee8d5;
}

@media (max-width: 640px) {
  .table-toolbar .btn {
    min-height: 2.75rem;
  }

  .form-section-heading {
    gap: 0.7rem;
  }

  .form-section-heading p {
    font-size: 0.8rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .skip-link,
  .data-grid-row,
  .table-page-button {
    transition: none;
  }
}
''',
    encoding="utf-8",
)

print("UI/UX refinement patch applied.")
