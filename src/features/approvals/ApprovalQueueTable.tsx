import { ChevronLeft, ChevronRight, Eye, Pencil, Printer } from 'lucide-react';
import { EmptyState, StatusBadge } from '../../components/ui';
import { php } from '../../lib/format';
import type { RfpRequest } from '../../types';
import { RequestSla } from './RequestSla';
import { displayStatus } from './workflow';

export function ApprovalQueueTable({
  visibleRows,
  paginatedRows,
  view,
  page,
  pageSize,
  pageCount,
  finance,
  department,
  now,
  onPageChange,
  onPageSizeChange,
  onOpenRequest,
}: {
  visibleRows: RfpRequest[];
  paginatedRows: RfpRequest[];
  view: 'pending' | 'completed';
  page: number;
  pageSize: number;
  pageCount: number;
  finance: boolean;
  department: boolean;
  now: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onOpenRequest: (request: RfpRequest, mode: 'view' | 'edit') => void;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="finance-table-heading">
        <div>
          <h2>RFP Requests</h2>
          <p>Choose a request to review details and manage its Finance status.</p>
        </div>
        <span>{visibleRows.length} matching requests</span>
      </div>
      <div className="finance-table-wrap">
        <table className="finance-request-table">
          <thead>
            <tr>
              <th>Request</th>
              <th>Requestor / Department</th>
              <th>Amount</th>
              <th>Status / SLA</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedRows.map((request) => (
              <tr
                key={request.id}
                onClick={() => {
                  if (finance) onOpenRequest(request, 'view');
                  else if (department) onOpenRequest(request, 'edit');
                }}
              >
                <td>
                  <button
                    type="button"
                    className="finance-rfp-link"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenRequest(request, finance ? 'view' : 'edit');
                    }}
                  >
                    {request.rfp_number}
                  </button>
                  <small>{request.company || 'Company not recorded'}</small>
                </td>
                <td>
                  <strong>{request.requestor_name}</strong>
                  <small>{request.department}</small>
                </td>
                <td className="finance-amount">{php.format(request.amount)}</td>
                <td>
                  <StatusBadge>{displayStatus(request, now)}</StatusBadge>
                  <RequestSla request={request} now={now} />
                </td>
                <td>
                  <div className="finance-row-actions">
                    {finance && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenRequest(request, 'view');
                        }}
                      >
                        <Eye size={14} /> View
                      </button>
                    )}
                    {(finance || department) && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenRequest(request, 'edit');
                        }}
                      >
                        <Pencil size={14} /> {finance ? 'Edit' : 'Review'}
                      </button>
                    )}
                    {finance && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          window.open(
                            `/admin/rfp/${request.id}/print`,
                            '_blank',
                            'noopener,noreferrer',
                          );
                        }}
                      >
                        <Printer size={14} /> Print
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!visibleRows.length && (
        <EmptyState title="No requests" body={`There are no ${view} approvals in this view.`} />
      )}
      {visibleRows.length > 0 && (
        <div className="approval-pagination">
          <p>
            Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, visibleRows.length)} of{' '}
            {visibleRows.length}
          </p>
          <div className="approval-page-controls">
            <label>
              Rows
              <select
                value={pageSize}
                onChange={(event) => onPageSizeChange(Number(event.target.value))}
                aria-label="Approval rows per page"
              >
                {[10, 20, 50].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <span>
              Page {page} of {pageCount}
            </span>
            <button
              type="button"
              onClick={() => onPageChange(Math.max(1, page - 1))}
              disabled={page === 1}
              aria-label="Previous approval page"
            >
              <ChevronLeft size={17} />
            </button>
            <button
              type="button"
              onClick={() => onPageChange(Math.min(pageCount, page + 1))}
              disabled={page === pageCount}
              aria-label="Next approval page"
            >
              <ChevronRight size={17} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
