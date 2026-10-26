from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    if old not in text:
        raise RuntimeError(f"Could not find expected text in {path}: {old[:120]!r}")
    file.write_text(text.replace(old, new, 1))


# Shared modal accessibility: trap focus, preserve Escape behavior, and use a real icon button.
replace_once(
    "src/components/ui.tsx",
    "import { createPortal } from 'react-dom';\nimport clsx from 'clsx';",
    "import { createPortal } from 'react-dom';\nimport { X } from 'lucide-react';\nimport clsx from 'clsx';",
)
replace_once(
    "src/components/ui.tsx",
    """    const closeOnEscape = (event: KeyboardEvent) => {\n      if (event.key === 'Escape') onCloseRef.current();\n    };\n    document.addEventListener('keydown', closeOnEscape);\n\n    return () => {\n      window.cancelAnimationFrame(frame);\n      document.removeEventListener('keydown', closeOnEscape);""",
    """    const handleKeyDown = (event: KeyboardEvent) => {\n      if (event.key === 'Escape') {\n        onCloseRef.current();\n        return;\n      }\n      if (event.key !== 'Tab' || !panelRef.current) return;\n\n      const focusable = Array.from(\n        panelRef.current.querySelectorAll<HTMLElement>(\n          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex=\"-1\"])',\n        ),\n      ).filter((element) => element.getAttribute('aria-hidden') !== 'true');\n      if (!focusable.length) {\n        event.preventDefault();\n        panelRef.current.focus();\n        return;\n      }\n      const first = focusable[0];\n      const last = focusable[focusable.length - 1];\n      if (event.shiftKey && document.activeElement === first) {\n        event.preventDefault();\n        last.focus();\n      } else if (!event.shiftKey && document.activeElement === last) {\n        event.preventDefault();\n        first.focus();\n      }\n    };\n    document.addEventListener('keydown', handleKeyDown);\n\n    return () => {\n      window.cancelAnimationFrame(frame);\n      document.removeEventListener('keydown', handleKeyDown);""",
)
replace_once(
    "src/components/ui.tsx",
    """          <button\n            ref={closeRef}\n            className=\"rounded p-2 text-slate-500 hover:bg-slate-100\"\n            onClick={onClose}\n            aria-label=\"Close\"\n          >\n            ×\n          </button>""",
    """          <button\n            ref={closeRef}\n            type=\"button\"\n            className=\"focus-ring modal-close-button text-slate-500 hover:bg-slate-100 hover:text-slate-800\"\n            onClick={onClose}\n            aria-label=\"Close dialog\"\n          >\n            <X size={18} aria-hidden=\"true\" />\n          </button>""",
)

# Admin shell: keyboard skip link and a reliable main-content focus target.
replace_once(
    "src/layouts/AdminLayout.tsx",
    """  return (\n    <div className={`admin-shell min-h-screen ${collapsed ? 'admin-shell-collapsed' : ''}`}>""",
    """  return (\n    <>\n      <a className=\"skip-link\" href=\"#main-content\">\n        Skip to main content\n      </a>\n      <div className={`admin-shell min-h-screen ${collapsed ? 'admin-shell-collapsed' : ''}`}>""",
)
replace_once(
    "src/layouts/AdminLayout.tsx",
    """      <button\n        className=\"admin-mobile-menu fixed left-3 top-3 z-40 p-2 lg:hidden\"""",
    """      <button\n        type=\"button\"\n        className=\"admin-mobile-menu fixed left-3 top-3 z-40 p-2 lg:hidden\"""",
)
replace_once(
    "src/layouts/AdminLayout.tsx",
    """        <button\n          className=\"fixed inset-0 z-20 bg-slate-950/45 backdrop-blur-[2px] lg:hidden\"""",
    """        <button\n          type=\"button\"\n          className=\"fixed inset-0 z-20 bg-slate-950/45 backdrop-blur-[2px] lg:hidden\""",
)
replace_once(
    "src/layouts/AdminLayout.tsx",
    """          <button\n            className=\"admin-collapse hidden rounded-xl p-2 lg:block\"""",
    """          <button\n            type=\"button\"\n            className=\"admin-collapse hidden rounded-xl p-2 lg:block\""",
)
replace_once(
    "src/layouts/AdminLayout.tsx",
    """          <button\n            className={`admin-sidebar-link mt-2 w-full ${collapsed ? 'justify-center' : ''}`}""",
    """          <button\n            type=\"button\"\n            className={`admin-sidebar-link mt-2 w-full ${collapsed ? 'justify-center' : ''}`}""",
)
replace_once(
    "src/layouts/AdminLayout.tsx",
    """        <main className=\"page-enter mx-auto w-full max-w-[100rem] p-4 sm:p-6 lg:p-8\">\n          <Outlet />\n        </main>\n      </div>\n    </div>\n  );""",
    """        <main\n          id=\"main-content\"\n          tabIndex={-1}\n          className=\"page-enter mx-auto w-full max-w-[100rem] p-4 sm:p-6 lg:p-8\"\n        >\n          <Outlet />\n        </main>\n      </div>\n    </div>\n    </>\n  );""",
)

# Data table: expose sorting state, improve touch targets, and add accessible table context.
replace_once(
    "src/components/DataTable.tsx",
    """          <button\n            className=\"rounded p-1.5 text-[#173f6b] hover:bg-blue-50\"""",
    """          <button\n            type=\"button\"\n            className=\"focus-ring table-icon-button text-[#173f6b] hover:bg-blue-50\"""",
)
replace_once(
    "src/components/DataTable.tsx",
    """            <button\n              className=\"focus-ring absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:text-slate-700\"""",
    """            <button\n              type=\"button\"\n              className=\"focus-ring table-search-clear absolute right-0 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700\""",
)
replace_once(
    "src/components/DataTable.tsx",
    """          <Button\n            className=\"w-full sm:w-auto\"\n            variant=\"secondary\"\n            disabled={!hideableColumns.length}\n            onClick={() => setColumnsOpen(!columnsOpen)}""",
    """          <Button\n            className=\"w-full sm:w-auto\"\n            variant=\"secondary\"\n            disabled={!hideableColumns.length}\n            aria-expanded={columnsOpen}\n            aria-haspopup=\"menu\"\n            onClick={() => setColumnsOpen(!columnsOpen)}""",
)
replace_once(
    "src/components/DataTable.tsx",
    """                <label key={column.id} className=\"flex items-center gap-2 py-1 text-sm\">""",
    """                <label key={column.id} className=\"flex min-h-11 items-center gap-2 py-2 text-sm\">""",
)
replace_once(
    "src/components/DataTable.tsx",
    """        <table className=\"data-grid min-w-full border-separate border-spacing-0 text-left text-sm\">\n          <thead className=\"sticky top-0 z-10 bg-slate-100\">""",
    """        <table className=\"data-grid min-w-full border-separate border-spacing-0 text-left text-sm\">\n          <caption className=\"sr-only\">\n            {title}. Use the column headings to sort the currently loaded records.\n          </caption>\n          <thead className=\"sticky top-0 z-10 bg-slate-100\">""",
)
replace_once(
    "src/components/DataTable.tsx",
    """                {group.headers.map((header, index) => (\n                  <th\n                    key={header.id}\n                    className={`whitespace-nowrap border-b border-r px-3 py-3 font-semibold text-slate-600 ${index === 0 ? 'sticky left-0 z-10 bg-slate-100' : ''}`}\n                  >\n                    <button\n                      className=\"flex items-center gap-1\"\n                      onClick={header.column.getToggleSortingHandler()}\n                    >\n                      {flexRender(header.column.columnDef.header, header.getContext())}\n                      {header.column.getCanSort() && <ChevronDown size={13} />}\n                    </button>\n                  </th>\n                ))}""",
    """                {group.headers.map((header, index) => {\n                  const sorted = header.column.getIsSorted();\n                  return (\n                    <th\n                      key={header.id}\n                      aria-sort={\n                        sorted === 'asc'\n                          ? 'ascending'\n                          : sorted === 'desc'\n                            ? 'descending'\n                            : header.column.getCanSort()\n                              ? 'none'\n                              : undefined\n                      }\n                      className={`whitespace-nowrap border-b border-r px-3 py-2 font-semibold text-slate-600 ${index === 0 ? 'sticky left-0 z-10 bg-slate-100' : ''}`}\n                    >\n                      <button\n                        type=\"button\"\n                        className=\"focus-ring flex min-h-11 items-center gap-1 rounded-md px-1 text-left\"\n                        onClick={header.column.getToggleSortingHandler()}\n                        disabled={!header.column.getCanSort()}\n                      >\n                        {flexRender(header.column.columnDef.header, header.getContext())}\n                        {header.column.getCanSort() && (\n                          <ChevronDown\n                            aria-hidden=\"true\"\n                            size={14}\n                            className={`transition-transform ${sorted === 'asc' ? 'rotate-180 text-[#087ea4]' : sorted === 'desc' ? 'text-[#087ea4]' : 'opacity-50'}`}\n                          />\n                        )}\n                      </button>\n                    </th>\n                  );\n                })}""",
)
replace_once(
    "src/components/DataTable.tsx",
    """            {table.getRowModel().rows.map((row, rowIndex) => (\n              <tr key={row.id} className={rowIndex % 2 ? 'bg-slate-50/60' : 'bg-white'}>""",
    """            {table.getRowModel().rows.map((row, rowIndex) => (\n              <tr\n                key={row.id}\n                className={`data-grid-row ${rowIndex % 2 ? 'bg-slate-50/60' : 'bg-white'}`}\n              >""",
)
replace_once(
    "src/components/DataTable.tsx",
    """        <span>\n          {total\n            ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`\n            : '0 rows'}\n        </span>""",
    """        <span aria-live=\"polite\">\n          {total\n            ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`\n            : '0 rows'}\n          {search ? ' · filtered view' : ''}\n        </span>""",
)
replace_once(
    "src/components/DataTable.tsx",
    """            <select\n              className=\"rounded border px-2 py-1\"""",
    """            <select\n              className=\"input !min-h-11 !w-auto !py-1 !pl-2 !pr-8\"\n              aria-label=\"Rows per page\"""",
)
replace_once(
    "src/components/DataTable.tsx",
    """          <button\n            className=\"rounded border p-1.5 disabled:opacity-40\"\n            aria-label=\"Previous page\"""",
    """          <button\n            type=\"button\"\n            className=\"focus-ring table-page-button disabled:opacity-40\"\n            aria-label=\"Previous page\"""",
)
replace_once(
    "src/components/DataTable.tsx",
    """          <button\n            className=\"rounded border p-1.5 disabled:opacity-40\"\n            aria-label=\"Next page\"""",
    """          <button\n            type=\"button\"\n            className=\"focus-ring table-page-button disabled:opacity-40\"\n            aria-label=\"Next page\""",
)

# Public request form: add clear progressive section landmarks without altering submission behavior.
replace_once(
    "src/pages/RequestPage.tsx",
    """          <div className=\"grid gap-5 md:grid-cols-2\">\n            <Field""",
    """          <div className=\"grid gap-5 md:grid-cols-2\">\n            <FormSection\n              number=\"1\"\n              title=\"Requestor & organization\"\n              description=\"Tell us who is requesting payment and which company and department own the request.\"\n            />\n            <Field""",
)
replace_once(
    "src/pages/RequestPage.tsx",
    """            <Field\n              label=\"Requestor Name\"\n              value={form.requestorName}""",
    """            <Field\n              label=\"Requestor Name\"\n              autoComplete=\"name\"\n              value={form.requestorName}""",
)
replace_once(
    "src/pages/RequestPage.tsx",
    """            <Field\n              label=\"Requestor Email\"\n              type=\"email\"\n              value={form.requestorEmail}""",
    """            <Field\n              label=\"Requestor Email\"\n              type=\"email\"\n              autoComplete=\"email\"\n              value={form.requestorEmail}""",
)
replace_once(
    "src/pages/RequestPage.tsx",
    """            <Field\n              label=\"Project / Class\"""",
    """            <FormSection\n              number=\"2\"\n              title=\"Payment details\"\n              description=\"Classify the request, identify the payee, and provide the amount and required payment date.\"\n            />\n            <Field\n              label=\"Project / Class\"""",
)
replace_once(
    "src/pages/RequestPage.tsx",
    """            <Field\n              label=\"Amount (PHP)\"\n              type=\"number\"""",
    """            <Field\n              label=\"Amount (PHP)\"\n              type=\"number\"\n              inputMode=\"decimal\"""",
)
replace_once(
    "src/pages/RequestPage.tsx",
    """            <RequestAttachmentChecklist\n              rfpType={form.rfpType}""",
    """            <FormSection\n              number=\"3\"\n              title=\"Supporting documents\"\n              description=\"Review the requirements for the selected Type and attach any files already available. Attachments remain optional at submission.\"\n            />\n            <RequestAttachmentChecklist\n              rfpType={form.rfpType}""",
)
replace_once(
    "src/pages/RequestPage.tsx",
    """function SiteFooter() {""",
    """function FormSection({\n  number,\n  title,\n  description,\n}: {\n  number: string;\n  title: string;\n  description: string;\n}) {\n  return (\n    <div className=\"form-section-heading md:col-span-2\">\n      <span className=\"form-step-badge\" aria-hidden=\"true\">\n        {number}\n      </span>\n      <div>\n        <h2>{title}</h2>\n        <p>{description}</p>\n      </div>\n    </div>\n  );\n}\n\nfunction SiteFooter() {""",
)

# Keep the refinement layer isolated and easy to review/revert.
replace_once(
    "src/main.tsx",
    """import './styles/digital-rfp.css';""",
    """import './styles/digital-rfp.css';\nimport './styles/ux-refinement.css';""",
)

Path("src/styles/ux-refinement.css").write_text(
    """/* UI/UX Pro Max refinement layer: accessibility, touch targets, scanning, and form hierarchy. */\nhtml {\n  scroll-padding-top: 6rem;\n}\n\nbody,\n#root,\n.admin-shell,\n.admin-content {\n  min-height: 100dvh;\n}\n\nbutton,\na,\n[role='button'] {\n  touch-action: manipulation;\n}\n\nbutton:focus-visible {\n  outline: 3px solid rgba(49, 115, 219, 0.38);\n  outline-offset: 2px;\n}\n\n.btn {\n  min-height: 2.75rem;\n}\n\n.skip-link {\n  position: fixed;\n  left: 1rem;\n  top: 0.75rem;\n  z-index: 1000;\n  transform: translateY(-160%);\n  border-radius: 0.65rem;\n  background: #ffffff;\n  padding: 0.7rem 0.9rem;\n  color: #082638;\n  font-size: 0.875rem;\n  font-weight: 800;\n  box-shadow: 0 8px 28px rgba(8, 38, 56, 0.2);\n  transition: transform 0.16s ease;\n}\n\n.skip-link:focus {\n  transform: translateY(0);\n}\n\n#main-content:focus {\n  outline: none;\n}\n\n.admin-mobile-menu,\n.admin-collapse,\n.modal-close-button,\n.table-icon-button,\n.table-page-button {\n  min-height: 2.75rem;\n  min-width: 2.75rem;\n}\n\n.modal-close-button,\n.table-icon-button,\n.table-page-button,\n.table-search-clear {\n  display: inline-grid;\n  place-items: center;\n  border-radius: 0.65rem;\n}\n\n.table-search-clear {\n  width: 2.75rem;\n  height: 2.75rem;\n}\n\n.table-page-button {\n  border: 1px solid #ccd9df;\n  background: #ffffff;\n  color: #29404e;\n  transition:\n    border-color 0.16s ease,\n    background-color 0.16s ease,\n    color 0.16s ease;\n}\n\n.table-page-button:hover:not(:disabled),\n.table-icon-button:hover:not(:disabled) {\n  border-color: #9db2bd;\n  background: #eef7f5;\n  color: #08705f;\n}\n\n.data-grid-row {\n  transition: background-color 0.14s ease;\n}\n\n.data-grid-row:hover {\n  background: #f0f8f6;\n}\n\n.data-grid tbody td {\n  vertical-align: middle;\n}\n\n.form-section-heading {\n  display: flex;\n  align-items: flex-start;\n  gap: 0.85rem;\n  margin-top: 0.2rem;\n  border-top: 1px solid #e2eaee;\n  padding-top: 1.25rem;\n}\n\n.form-section-heading:first-child {\n  margin-top: 0;\n  border-top: 0;\n  padding-top: 0;\n}\n\n.form-section-heading h2 {\n  margin: 0;\n  color: #142432;\n  font-size: 1rem;\n  font-weight: 800;\n  letter-spacing: -0.01em;\n}\n\n.form-section-heading p {\n  max-width: 46rem;\n  margin: 0.2rem 0 0;\n  color: #667785;\n  font-size: 0.82rem;\n  line-height: 1.5;\n}\n\n.form-step-badge {\n  display: grid;\n  width: 2rem;\n  height: 2rem;\n  flex: 0 0 auto;\n  place-items: center;\n  border: 1px solid #b9e2d8;\n  border-radius: 0.65rem;\n  background: #eaf8f4;\n  color: #08705f;\n  font-size: 0.78rem;\n  font-weight: 900;\n}\n\n.dark .skip-link {\n  background: #e7edf6;\n  color: #08111f;\n}\n\n.dark .table-page-button {\n  border-color: #536176;\n  background: #162235;\n  color: #eef3f9;\n}\n\n.dark .table-page-button:hover:not(:disabled),\n.dark .table-icon-button:hover:not(:disabled) {\n  border-color: #5c8177;\n  background: #17372f;\n  color: #9ee8d5;\n}\n\n.dark .data-grid-row:hover {\n  background: #142738;\n}\n\n.dark .form-section-heading {\n  border-color: #334155;\n}\n\n.dark .form-section-heading h2 {\n  color: #edf3f9;\n}\n\n.dark .form-section-heading p {\n  color: #aebacd;\n}\n\n.dark .form-step-badge {\n  border-color: #286b5a;\n  background: #12382f;\n  color: #9ee8d5;\n}\n\n@media (max-width: 640px) {\n  .table-toolbar .btn {\n    min-height: 2.75rem;\n  }\n\n  .form-section-heading {\n    gap: 0.7rem;\n  }\n\n  .form-section-heading p {\n    font-size: 0.8rem;\n  }\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .skip-link,\n  .data-grid-row,\n  .table-page-button {\n    transition: none;\n  }\n}\n"""
)

print("UI/UX refinement patch applied.")
