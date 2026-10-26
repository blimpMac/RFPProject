import { useEffect, useMemo, useRef, useState } from 'react';
import {
  columnFilteringFeature,
  columnVisibilityFeature,
  createFilteredRowModel,
  createSortedRowModel,
  filterFn_includesString,
  flexRender,
  globalFilteringFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  tableFeatures,
  useTable,
  type ColumnVisibilityState,
  type SortingState,
} from '@tanstack/react-table';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { Button, EmptyState, Modal, StatusBadge } from './ui';
import { labelize, manilaDate, php } from '../lib/format';

type Row = Record<string, unknown>;
type DataTableProps = {
  rows: Row[];
  total: number;
  page: number;
  pageSize: number;
  onPage: (page: number) => void;
  onPageSize: (pageSize: number) => void;
  defaultKeys?: string[];
  title: string;
  loadExportRows?: () => Promise<Row[]>;
};

const statusKeys = new Set([
  'final_status',
  'department_approval',
  'finance_review',
  'status',
  'active',
  'result',
]);
const moneyKeys = new Set(['amount']);
const dateKeys = new Set([
  'submitted_at',
  'source_timestamp',
  'date_time',
  'occurred_at',
  'department_approval_at',
  'finance_review_at',
  'required_payment_date',
  'planned_check_date',
  'created_at',
  'updated_at',
]);
const omitted = new Set([
  'raw_record',
  'source_record_hash',
  'public_tracking_hash',
  'idempotency_key',
  'import_batch_id',
  'version',
  'normalized_department',
  'normalized_rfp_type',
]);
const columnLabel = (key: string) => (key === 'rfp_type' ? 'Type' : labelize(key));
const features = tableFeatures({
  columnFilteringFeature,
  columnVisibilityFeature,
  globalFilteringFeature,
  rowSortingFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  filterFns: { includesString: filterFn_includesString },
  sortFns: { alphanumeric: sortFn_alphanumeric },
});

function display(key: string, value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (moneyKeys.has(key)) return php.format(Number(value));
  if (dateKeys.has(key))
    return manilaDate(String(value), key.endsWith('_at') || key.includes('timestamp'));
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function exportValue(value: unknown) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function DataTable({
  rows,
  total,
  page,
  pageSize,
  onPage,
  onPageSize,
  defaultKeys,
  title,
  loadExportRows,
}: DataTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [search, setSearch] = useState('');
  const [visibility, setVisibility] = useState<ColumnVisibilityState>({});
  const [selected, setSelected] = useState<Row>();
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, []);

  const keys = useMemo(() => {
    const all = new Set<string>();
    rows.forEach((row) => Object.keys(row).forEach((key) => !omitted.has(key) && all.add(key)));
    return [
      ...(defaultKeys || []).filter((key) => all.has(key)),
      ...[...all].filter((key) => !defaultKeys?.includes(key)),
    ];
  }, [rows, defaultKeys]);

  const initialVisibility = useMemo(
    () => Object.fromEntries(keys.map((key) => [key, !defaultKeys || defaultKeys.includes(key)])),
    [keys, defaultKeys],
  );
  const columns = useMemo(
    () => [
      ...keys.map((key) => ({
        accessorKey: key,
        header: columnLabel(key),
        cell: ({ getValue }: { getValue: () => unknown }) =>
          statusKeys.has(key) ? (
            <StatusBadge>{display(key, getValue())}</StatusBadge>
          ) : (
            display(key, getValue())
          ),
      })),
      {
        id: 'actions',
        header: 'Actions',
        enableHiding: false,
        cell: ({ row }: { row: { original: Row } }) => (
          <button
            type="button"
            className="focus-ring table-icon-button text-[#173f6b] hover:bg-blue-50"
            onClick={() => setSelected(row.original)}
            aria-label="View details"
          >
            <Eye size={17} />
          </button>
        ),
      },
    ],
    [keys],
  );
  const table = useTable({
    features,
    data: rows,
    columns,
    state: {
      sorting,
      globalFilter: search,
      columnVisibility: { ...initialVisibility, ...visibility },
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setSearch,
    onColumnVisibilityChange: setVisibility,
  });
  const hideableColumns = table.getAllLeafColumns().filter((column) => column.getCanHide());

  const displayedExportRows = table.getFilteredRowModel().rows.map((row) => row.original);
  const visibleColumns = () =>
    table
      .getVisibleLeafColumns()
      .map((column) => column.id)
      .filter((key) => key !== 'actions');
  const rowsForExport = async () => {
    const source = loadExportRows ? await loadExportRows() : displayedExportRows;
    if (!search) return source;
    const needle = search.toLowerCase();
    return source.filter((row) =>
      visibleColumns().some((key) => exportValue(row[key]).toLowerCase().includes(needle)),
    );
  };
  const csv = async () => {
    setExporting(true);
    setExportError('');
    try {
      const exportRows = await rowsForExport();
      const visible = visibleColumns();
      const content = [
        visible.map(columnLabel),
        ...exportRows.map((row) => visible.map((key) => exportValue(row[key]))),
      ]
        .map((line) => line.map((value) => `"${value.replaceAll('"', '""')}"`).join(','))
        .join('\n');
      const anchor = document.createElement('a');
      anchor.href = URL.createObjectURL(new Blob([content], { type: 'text/csv' }));
      anchor.download = `${title.replaceAll(' ', '-').toLowerCase()}.csv`;
      anchor.click();
      URL.revokeObjectURL(anchor.href);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Could not export these records.');
    } finally {
      setExporting(false);
    }
  };
  const xlsx = async () => {
    setExporting(true);
    setExportError('');
    try {
      const exportRows = await rowsForExport();
      const { Workbook } = await import('exceljs');
      const workbook = new Workbook();
      const sheet = workbook.addWorksheet(title.slice(0, 31));
      const visible = visibleColumns();
      sheet.addRow(visible.map(columnLabel));
      exportRows.forEach((row) => sheet.addRow(visible.map((key) => exportValue(row[key]))));
      sheet.getRow(1).font = { bold: true };
      sheet.columns.forEach((column) => {
        column.width = 18;
      });
      const buffer = await workbook.xlsx.writeBuffer();
      const anchor = document.createElement('a');
      anchor.href = URL.createObjectURL(
        new Blob([buffer], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
      );
      anchor.download = `${title.replaceAll(' ', '-').toLowerCase()}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(anchor.href);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Could not export these records.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="card min-w-0 overflow-hidden">
      <div className="table-toolbar grid min-w-0 grid-cols-2 items-center gap-2 p-3 sm:flex sm:flex-wrap sm:p-4">
        <div className="relative col-span-2 min-w-0 w-full flex-1 sm:col-span-1 sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
          <input
            ref={searchRef}
            className="input min-w-0 !pl-10"
            placeholder="Search visible rows…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search visible rows"
          />
          {search ? (
            <button
              type="button"
              className="focus-ring table-search-clear absolute right-0 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
              onClick={() => setSearch('')}
              aria-label="Clear search"
            >
              <X size={16} />
            </button>
          ) : (
            <kbd className="absolute right-3 top-1/2 hidden -translate-y-1/2 sm:inline-flex">
              Ctrl K
            </kbd>
          )}
        </div>
        {(search || sorting.length > 0 || Object.keys(visibility).length > 0) && (
          <button
            className="table-reset"
            onClick={() => {
              setSearch('');
              setSorting([]);
              setVisibility({});
            }}
          >
            <RotateCcw size={14} />
            Reset view
          </button>
        )}
        <div className="relative min-w-0">
          <Button
            className="w-full sm:w-auto"
            variant="secondary"
            disabled={!hideableColumns.length}
            aria-expanded={columnsOpen}
            aria-haspopup="menu"
            onClick={() => setColumnsOpen(!columnsOpen)}
            title={hideableColumns.length ? 'Choose visible columns' : 'No columns available'}
          >
            <SlidersHorizontal size={16} />
            Columns
          </Button>
          {columnsOpen && hideableColumns.length > 0 && (
            <div className="absolute left-0 z-20 mt-2 max-h-80 w-[min(16rem,calc(100vw-2.5rem))] overflow-auto rounded-lg border bg-white p-3 shadow-xl sm:left-auto sm:right-0">
              {hideableColumns.map((column) => (
                <label key={column.id} className="flex min-h-11 items-center gap-2 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={column.getIsVisible()}
                    onChange={column.getToggleVisibilityHandler()}
                  />
                  {columnLabel(column.id)}
                </label>
              ))}
            </div>
          )}
        </div>
        <Button
          className="min-w-0"
          variant="secondary"
          disabled={exporting}
          onClick={() => void csv()}
        >
          <Download size={16} />
          CSV
        </Button>
        <Button
          className="min-w-0"
          variant="secondary"
          disabled={exporting}
          onClick={() => void xlsx()}
        >
          {exporting ? 'Exporting…' : 'XLSX'}
        </Button>
      </div>
      {exportError && (
        <p className="border-b bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {exportError}
        </p>
      )}

      <div className="max-h-[65vh] overflow-auto">
        <table className="data-grid min-w-full border-separate border-spacing-0 text-left text-sm">
          <caption className="sr-only">
            {title}. Use the column headings to sort the currently loaded records.
          </caption>
          <thead className="sticky top-0 z-10 bg-slate-100">
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header, index) => {
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
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row, rowIndex) => (
              <tr
                key={row.id}
                className={`data-grid-row ${rowIndex % 2 ? 'bg-slate-50/60' : 'bg-white'}`}
              >
                {row.getVisibleCells().map((cell, cellIndex) => (
                  <td
                    key={cell.id}
                    className={`max-w-72 whitespace-nowrap border-b border-r px-3 py-3 ${cellIndex === 0 ? 'sticky left-0 bg-inherit font-semibold' : ''}`}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <EmptyState title="No records" body="No rows match this worksheet or current filters." />
        )}
      </div>

      <div className="table-footer flex min-w-0 flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm text-slate-600">
        <span aria-live="polite">
          {total
            ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`
            : '0 rows'}
          {search ? ' · filtered view' : ''}
        </span>
        <div className="flex min-w-0 items-center gap-2">
          <label className="whitespace-nowrap">
            Rows{' '}
            <select
              className="input !min-h-11 !w-auto !py-1 !pl-2 !pr-8"
              aria-label="Rows per page"
              value={pageSize}
              onChange={(event) => onPageSize(Number(event.target.value))}
            >
              {[25, 50, 100, 200].map((size) => (
                <option key={size}>{size}</option>
              ))}
            </select>
          </label>
          <span className="hidden text-xs sm:inline">Page {page}</span>
          <button
            type="button"
            className="focus-ring table-page-button disabled:opacity-40"
            aria-label="Previous page"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
          >
            <ChevronLeft size={17} />
          </button>
          <button
            type="button"
            className="focus-ring table-page-button disabled:opacity-40"
            aria-label="Next page"
            disabled={page * pageSize >= total}
            onClick={() => onPage(page + 1)}
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </div>

      {selected && (
        <Modal
          title={String(
            selected.rfp_number || selected.action || selected.department || 'Row details',
          )}
          onClose={() => setSelected(undefined)}
        >
          <dl className="grid gap-4 sm:grid-cols-2">
            {Object.entries(selected)
              .filter(([key]) => !omitted.has(key))
              .map(([key, value]) => (
                <div
                  key={key}
                  className={
                    key === 'purpose_description' || key === 'raw_record' ? 'sm:col-span-2' : ''
                  }
                >
                  <dt className="text-xs font-semibold uppercase text-slate-500">
                    {columnLabel(key)}
                  </dt>
                  <dd className="mt-1 break-words text-sm">
                    {statusKeys.has(key) ? (
                      <StatusBadge>{display(key, value)}</StatusBadge>
                    ) : (
                      display(key, value)
                    )}
                  </dd>
                </div>
              ))}
          </dl>
        </Modal>
      )}
    </div>
  );
}
