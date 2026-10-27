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
  checkNumber,
  paymentReference,
  processingStatus,
  lateDocuments,
  financeNotes,
  busy,
  onOriginalsDateChange,
  onDocumentVerificationChange,
  onVerificationRemarksChange,
  onCheckDateChange,
  onReasonChange,
  onCheckNumberChange,
  onPaymentReferenceChange,
  onProcessingStatusChange,
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
  checkNumber: string;
  paymentReference: string;
  processingStatus: string;
  lateDocuments: string;
  financeNotes: string;
  busy: boolean;
  onOriginalsDateChange: (value: string) => void;
  onDocumentVerificationChange: (value: string) => void;
  onVerificationRemarksChange: (value: string) => void;
  onCheckDateChange: (value: string) => void;
  onReasonChange: (value: string) => void;
  onCheckNumberChange: (value: string) => void;
  onPaymentReferenceChange: (value: string) => void;
  onProcessingStatusChange: (value: string) => void;
  onLateDocumentsChange: (value: string) => void;
  onFinanceNotesChange: (value: string) => void;
  onSave: () => void;
}) {
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
          <label htmlFor="check-number">Check number</label>
          <input
            id="check-number"
            className="input"
            placeholder="If issued"
            value={checkNumber}
            onChange={(event) => onCheckNumberChange(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="payment-reference">Payment reference</label>
          <input
            id="payment-reference"
            className="input"
            placeholder="Bank or payment reference"
            value={paymentReference}
            onChange={(event) => onPaymentReferenceChange(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="processing-status">Receipt processing status</label>
          <select
            id="processing-status"
            className="input"
            value={processingStatus}
            onChange={(event) => onProcessingStatusChange(event.target.value)}
          >
            <option value="">Use workflow status</option>
            {[
              'For Processing',
              'Check Preparation',
              'Check Approval',
              'Check Released',
              'Paid',
            ].map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
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
          <label htmlFor="finance-notes">Finance remarks / internal notes</label>
          <textarea
            id="finance-notes"
            className="input min-h-24"
            placeholder="Add a note for the Finance team"
            value={financeNotes}
            onChange={(event) => onFinanceNotesChange(event.target.value)}
          />
        </div>
      </div>
      <div className="finance-update-footer">
        <p>
          Every RFP must record received hard copies and a Complete verification after Finance Head
          approval. The 3-day processing clock starts only when a Finance member approves this
          hard-copy gate.
        </p>
        <Button onClick={onSave} disabled={busy}>
          {busy ? <Spinner label="Saving" /> : 'Save Finance updates'}
        </Button>
      </div>
    </section>
  );
}
