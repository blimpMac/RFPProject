import { useMemo, useState } from 'react';
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
  Search,
  SlidersHorizontal,
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

export function DataTable({
  rows,
  total,
  page,
  pageSize,
  onPage,
  onPageSize,
  defaultKeys,
  title,
}: DataTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [search, setSearch] = useState('');
  const [visibility, setVisibility] = useState<ColumnVisibilityState>({});
  const [selected, setSelected] = useState<Row>();
  const [columnsOpen, setColumnsOpen] = useState(false);

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
      {
        id: 'select',
        header: '',
        enableHiding: false,
        cell: () => <input type="checkbox" aria-label="Select row" />,
      },
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
            className="rounded p-1.5 text-[#173f6b] hover:bg-blue-50"
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

  const exportRows = table.getFilteredRowModel().rows.map((row) => row.original);
  const visibleColumns = () =>
    table
      .getVisibleLeafColumns()
      .map((column) => column.id)
      .filter((key) => !['select', 'actions'].includes(key));
  const csv = () => {
    const visible = visibleColumns();
    const content = [
      visible.map(columnLabel),
      ...exportRows.map((row) => visible.map((key) => String(row[key] ?? ''))),
    ]
      .map((line) => line.map((value) => `"${value.replaceAll('"', '""')}"`).join(','))
      .join('\n');
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(new Blob([content], { type: 'text/csv' }));
    anchor.download = `${title.replaceAll(' ', '-').toLowerCase()}.csv`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  };
  const xlsx = async () => {
    const { Workbook } = await import('exceljs');
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet(title.slice(0, 31));
    const visible = visibleColumns();
    sheet.addRow(visible.map(columnLabel));
    exportRows.forEach((row) =>
      sheet.addRow(
        visible.map((key) => (row[key] === null || row[key] === undefined ? '' : String(row[key]))),
      ),
    );
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
  };

  return (
    <div className="card min-w-0 overflow-hidden">
      <div className="grid min-w-0 grid-cols-2 items-center gap-2 border-b p-3 sm:flex sm:flex-wrap">
        <div className="relative col-span-2 min-w-0 w-full flex-1 sm:col-span-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
          <input
            className="input min-w-0 !pl-10"
            placeholder="Search visible rows…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="relative min-w-0">
          <Button
            className="w-full sm:w-auto"
            variant="secondary"
            disabled={!hideableColumns.length}
            onClick={() => setColumnsOpen(!columnsOpen)}
            title={hideableColumns.length ? 'Choose visible columns' : 'No columns available'}
          >
            <SlidersHorizontal size={16} />
            Columns
          </Button>
          {columnsOpen && hideableColumns.length > 0 && (
            <div className="absolute left-0 z-20 mt-2 max-h-80 w-[min(16rem,calc(100vw-2.5rem))] overflow-auto rounded-lg border bg-white p-3 shadow-xl sm:left-auto sm:right-0">
              {hideableColumns.map((column) => (
                <label key={column.id} className="flex items-center gap-2 py-1 text-sm">
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
        <Button className="min-w-0" variant="secondary" onClick={csv}>
          <Download size={16} />
          CSV
        </Button>
        <Button className="min-w-0" variant="secondary" onClick={xlsx}>
          XLSX
        </Button>
      </div>

      <div className="max-h-[65vh] overflow-auto">
        <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
          <thead className="sticky top-0 z-10 bg-slate-100">
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header, index) => (
                  <th
                    key={header.id}
                    className={`whitespace-nowrap border-b border-r px-3 py-3 font-semibold text-slate-600 ${index === 1 ? 'sticky left-0 z-10 bg-slate-100' : ''}`}
                  >
                    <button
                      className="flex items-center gap-1"
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getCanSort() && <ChevronDown size={13} />}
                    </button>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row, rowIndex) => (
              <tr key={row.id} className={rowIndex % 2 ? 'bg-slate-50/60' : 'bg-white'}>
                {row.getVisibleCells().map((cell, cellIndex) => (
                  <td
                    key={cell.id}
                    className={`max-w-72 whitespace-nowrap border-b border-r px-3 py-2.5 ${cellIndex === 1 ? 'sticky left-0 bg-inherit font-medium' : ''}`}
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

      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm text-slate-600">
        <span>
          {total
            ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`
            : '0 rows'}
        </span>
        <div className="flex min-w-0 items-center gap-2">
          <label className="whitespace-nowrap">
            Rows{' '}
            <select
              className="rounded border px-2 py-1"
              value={pageSize}
              onChange={(event) => onPageSize(Number(event.target.value))}
            >
              {[25, 50, 100, 200].map((size) => (
                <option key={size}>{size}</option>
              ))}
            </select>
          </label>
          <button
            className="rounded border p-1.5 disabled:opacity-40"
            aria-label="Previous page"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
          >
            <ChevronLeft size={17} />
          </button>
          <button
            className="rounded border p-1.5 disabled:opacity-40"
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
