import { Search, X } from 'lucide-react';

export function ApprovalQueueFilters({
  view,
  search,
  statusFilter,
  fromDate,
  toDate,
  company,
  statusOptions,
  companyOptions,
  hasFilters,
  onViewChange,
  onSearchChange,
  onStatusChange,
  onFromDateChange,
  onToDateChange,
  onCompanyChange,
  onClear,
}: {
  view: 'pending' | 'completed';
  search: string;
  statusFilter: string;
  fromDate: string;
  toDate: string;
  company: string;
  statusOptions: string[];
  companyOptions: string[];
  hasFilters: boolean;
  onViewChange: (value: 'pending' | 'completed') => void;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onFromDateChange: (value: string) => void;
  onToDateChange: (value: string) => void;
  onCompanyChange: (value: string) => void;
  onClear: () => void;
}) {
  return (
    <section className="approval-filter-panel" aria-label="Approval queue filters">
      <div className="approval-view-toggle" role="group" aria-label="Request view">
        <button
          type="button"
          className={view === 'pending' ? 'active' : ''}
          onClick={() => onViewChange('pending')}
          aria-pressed={view === 'pending'}
        >
          Active
        </button>
        <button
          type="button"
          className={view === 'completed' ? 'active' : ''}
          onClick={() => onViewChange('completed')}
          aria-pressed={view === 'completed'}
        >
          Completed / returned
        </button>
      </div>
      <label className="approval-search">
        <Search size={16} aria-hidden="true" />
        <span className="sr-only">Search approval queue</span>
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search RFP, payee, or requestor"
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            aria-label="Clear approval search"
          >
            <X size={15} />
          </button>
        )}
      </label>
      <select
        className="input"
        aria-label="Status"
        value={statusFilter}
        onChange={(event) => onStatusChange(event.target.value)}
      >
        <option value="">All statuses</option>
        {statusOptions.map((item) => (
          <option key={item}>{item}</option>
        ))}
      </select>
      <input
        className="input"
        aria-label="Submitted from date"
        title="Submitted from"
        type="date"
        value={fromDate}
        onChange={(event) => onFromDateChange(event.target.value)}
      />
      <input
        className="input"
        aria-label="Submitted to date"
        title="Submitted to"
        type="date"
        value={toDate}
        onChange={(event) => onToDateChange(event.target.value)}
      />
      <select
        className="input"
        aria-label="Company"
        value={company}
        onChange={(event) => onCompanyChange(event.target.value)}
      >
        <option value="">All companies</option>
        {companyOptions.map((item) => (
          <option key={item}>{item}</option>
        ))}
      </select>
      {hasFilters && (
        <button type="button" className="approval-clear" onClick={onClear}>
          Clear filters
        </button>
      )}
    </section>
  );
}
