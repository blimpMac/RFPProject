import { companyBrand } from '../../shared/contracts/digital-rfp';
import { manilaDate, php } from '../lib/format';
import { rfTotals, type RfLiquidation } from '../../shared/utils/rf-liquidation';
import {
  DigitalRfpReceipt,
  type DigitalRfpAttachment,
  type DigitalRfpOperations,
  type DigitalRfpRequest,
  type DigitalRfpWorkflow,
} from './DigitalRfpReceipt';
import { RfLiquidationPrint } from './RfLiquidationPrint';

type ReceiptProps = {
  request: DigitalRfpRequest;
  attachments: DigitalRfpAttachment[];
  workflow?: DigitalRfpWorkflow;
  financeOperations?: DigitalRfpOperations;
  financeReceipt?: import('../../shared/contracts/digital-rfp').FinanceReceipt;
  submissionChecklist?: string[];
  liquidationExpenses?: { date: string; description: string; amount: number }[];
  rfLiquidation?: RfLiquidation | null;
};

export function isFundRequestType(type: string) {
  return /cash\s*advance|\bCA\b|revolving\s*fund|\bRF\b/i.test(type);
}

function FundTrackingReceipt({ request, liquidationExpenses = [], rfLiquidation }: ReceiptProps) {
  const brand = companyBrand(request.company);
  const isCashAdvance = /cash\s*advance|\bCA\b/i.test(request.rfp_type);
  const family = isCashAdvance ? 'Cash Advance' : 'Revolving Fund';
  const rfSummary = rfLiquidation ? rfTotals(rfLiquidation) : null;
  const expenses = liquidationExpenses.length
    ? liquidationExpenses
    : request.raw_record?.liquidation_expenses || [];

  return (
    <div className="fund-tracking-documents">
      <article
        className="fund-tracking-receipt"
        aria-label={`${family} tracking receipt ${request.rfp_number}`}
      >
        <header className="fund-tracking-header">
          <img src={brand.logo} alt={`${brand.name} logo`} />
          <div>
            <p>{brand.name}</p>
            <h1>{family.toUpperCase()} TRACKING / RECEIPT FORM</h1>
          </div>
          <div className="fund-tracking-reference">
            <span>{isCashAdvance ? 'CA No.' : 'RF No.'}</span>
            <strong>{request.rfp_number}</strong>
          </div>
        </header>
        <div className="fund-tracking-status">
          <span>Current status</span>
          <strong>{request.final_status || 'Pending'}</strong>
        </div>
        <section className="fund-tracking-grid" aria-label="Request details">
          <Field label="Requestor" value={request.requestor_name} />
          <Field label="Department" value={request.department} />
          <Field label="Request type" value={request.rfp_type} />
          <Field
            label={rfLiquidation ? 'RF custodian' : 'Payee / custodian'}
            value={rfLiquidation?.custodianName || request.supplier_payee}
          />
          <Field label="SOF #" value={rfLiquidation?.projectSof || request.project_class} />
          <Field
            label={rfSummary ? 'Total expenses / replenishment' : 'Amount'}
            value={php.format(rfSummary?.expenses ?? request.amount)}
          />
          {rfLiquidation && (
            <>
              <Field label="Period covered" value={rfLiquidation.periodCovered} />
              <Field
                label="Revolving fund amount"
                value={php.format(rfSummary!.revolvingFundAmount)}
              />
              <Field
                label="Previous replenishment"
                value={php.format(rfSummary!.previousReplenishment)}
              />
              <Field
                label="Unliquidated advances"
                value={php.format(rfSummary!.unliquidatedAdvances)}
              />
              <Field
                label={`Actual cash on hand as of ${manilaDate(rfLiquidation.cashOnHandAsOf)}`}
                value={php.format(rfSummary!.cashOnHand)}
              />
            </>
          )}
          <Field
            label="Date submitted"
            value={request.submitted_at ? manilaDate(request.submitted_at) : '—'}
          />
          <Field
            label="Required date"
            value={request.required_payment_date ? manilaDate(request.required_payment_date) : '—'}
          />
          <Field label="Department head" value={request.approving_head} />
          <Field label="Department approval" value={request.department_approval} />
          <Field label="Finance review" value={request.finance_review} />
          <Field
            label="Finance target release"
            value={request.planned_check_date ? manilaDate(request.planned_check_date) : '—'}
          />
          <div className="fund-tracking-wide">
            <Field label="Purpose" value={request.purpose_description} />
          </div>
          {request.department_approval_remarks && (
            <div className="fund-tracking-wide">
              <Field label="Department head remarks" value={request.department_approval_remarks} />
            </div>
          )}
        </section>
      </article>

      {rfLiquidation && (
        <section className="fund-attached-form" aria-label="Submitted RF liquidation form">
          <h2>Attached submitted RF form</h2>
          <RfLiquidationPrint
            form={rfLiquidation}
            company={request.company || ''}
            department={request.department}
            departmentHead={request.approving_head}
            reference={request.rfp_number}
          />
        </section>
      )}

      {!rfLiquidation && expenses.length > 0 && (
        <section className="fund-expense-attachment" aria-label="Submitted liquidation expenses">
          <h2>Attached liquidation details</h2>
          <div className="fund-expense-scroll">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((row, index) => (
                  <tr key={`${row.date}-${index}`}>
                    <td>{row.date ? manilaDate(row.date) : '—'}</td>
                    <td>{row.description}</td>
                    <td>{php.format(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" colSpan={2}>
                    Total liquidation expenses
                  </th>
                  <th>
                    {php.format(expenses.reduce((sum, row) => sum + Number(row.amount || 0), 0))}
                  </th>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="fund-tracking-field">
      <span>{label}</span>
      <strong>{value?.trim() || '—'}</strong>
    </div>
  );
}

export function RequestTrackingReceipt(props: ReceiptProps) {
  return isFundRequestType(props.request.rfp_type) ? (
    <FundTrackingReceipt {...props} />
  ) : (
    <DigitalRfpReceipt {...props} />
  );
}
