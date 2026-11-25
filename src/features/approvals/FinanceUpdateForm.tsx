import { Button, Spinner } from '../../components/ui';
import type { RfpRequest } from '../../types';
import { requiresOriginals } from './workflow';

export function FinanceUpdateForm({
  request,
  originalsDate,
  documentVerification,
  verificationRemarks,
  checkDate,
  reason,
  processingStatus,
  lateDocuments,
  financeNotes,
  busy,
  onOriginalsDateChange,
  onDocumentVerificationChange,
  onVerificationRemarksChange,
  onCheckDateChange,
  onReasonChange,
  onLateDocumentsChange,
  onFinanceNotesChange,
  onSave,
}: {
  request: RfpRequest;
  originalsDate: string;
  documentVerification: string;
  verificationRemarks: string;
  checkDate: string;
  reason: string;
  processingStatus: string;
  lateDocuments: string;
  financeNotes: string;
  busy: boolean;
  onOriginalsDateChange: (value: string) => void;
  onDocumentVerificationChange: (value: string) => void;
  onVerificationRemarksChange: (value: string) => void;
  onCheckDateChange: (value: string) => void;
  onReasonChange: (value: string) => void;
  onLateDocumentsChange: (value: string) => void;
  onFinanceNotesChange: (value: string) => void;
  onSave: () => void;
}) {
  const combinedApproval = [
    'Pending Finance Review',
    'Documentation Required',
    'Pending Finance Head Review',
  ].includes(request.final_status);

  return (
    <section className="finance-update-section">
      <h3 className="finance-section-title">Finance updates</h3>
      <div className="finance-update-grid">
        <div className="field">
          <label htmlFor="originals-date">Original documents received date</label>
          <input
            id="originals-date"
            className="input"
            type="date"
            disabled={!requiresOriginals(request)}
            value={originalsDate}
            onChange={(event) => onOriginalsDateChange(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="document-verification">Original documents verification</label>
          <select
            id="document-verification"
            className="input"
            disabled={!requiresOriginals(request)}
            value={documentVerification}
            onChange={(event) => onDocumentVerificationChange(event.target.value)}
          >
            <option value="">Select status</option>
            <option value="Complete">Complete</option>
            <option value="Incomplete">Incomplete</option>
          </select>
        </div>
        <div className="field finance-update-wide">
          <label htmlFor="verification-remarks">Verification remarks / missing documents</label>
          <textarea
            id="verification-remarks"
            className="input min-h-24"
            disabled={!requiresOriginals(request)}
            placeholder="Required when documents are incomplete"
            value={verificationRemarks}
            onChange={(event) => onVerificationRemarksChange(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="target-date">Planned check / release date</label>
          <input
            id="target-date"
            className="input"
            type="date"
            value={checkDate}
            onChange={(event) => onCheckDateChange(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="target-date-reason">Reason for changing target date</label>
          <input
            id="target-date-reason"
            className="input"
            placeholder="Required when changing an existing date"
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
          />
        </div>
        <div className="field">
          <label>Workflow stage</label>
          <div className="input flex min-h-11 items-center bg-slate-50 text-sm font-semibold text-slate-700">
            {request.final_status}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Advance the request using the guarded Next Workflow Actions below.
          </p>
        </div>
        <div className="field">
          <label htmlFor="late-documents">Late documents received</label>
          <textarea
            id="late-documents"
            className="input min-h-24"
            placeholder="One document per line"
            value={lateDocuments}
            onChange={(event) => onLateDocumentsChange(event.target.value)}
          />
        </div>
        <div className="field finance-update-wide">
          <label htmlFor="finance-notes">SOF # / Finance notes</label>
          <textarea
            id="finance-notes"
            className="input min-h-24"
            placeholder="SOF12345 — add related Finance remarks here"
            value={financeNotes}
            onChange={(event) => onFinanceNotesChange(event.target.value)}
          />
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Start with SOF followed by the actual number (e.g., SOF12345), then add any related
            Finance remarks.
          </p>
        </div>
      </div>
      <div className="finance-update-footer">
        <p>
          {combinedApproval
            ? 'Complete the original-document receipt details above, then choose “Approve as Finance member” below. One action will record receipt, verify the documents and start the 3-day processing clock.'
            : 'Original-document receipt and verification are recorded here. Any later changes are added to the approval log.'}
        </p>
        {!combinedApproval && (
          <Button onClick={onSave} disabled={busy}>
            {busy ? <Spinner label="Saving" /> : 'Save Finance updates'}
          </Button>
        )}
      </div>
    </section>
  );
}

