import { companyBrand } from '../../shared/contracts/digital-rfp';
import {
  RF_UNLIQUIDATED_ROWS_PER_FORM,
  rfExpenseRowsPerForm,
  rfTotals,
  type RfLiquidation,
} from '../../shared/utils/rf-liquidation';
import { manilaDate } from '../lib/format';

const accounting = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const amount = (value: number) => accounting.format(value);

export function RfLiquidationPrint({
  form,
  company,
  department,
  reference,
}: {
  form: RfLiquidation;
  company: string;
  department: string;
  reference: string;
}) {
  const brand = companyBrand(company);
  const totals = rfTotals(form);
  const expenseRows = rfExpenseRowsPerForm(company);
  const isGemcor = /greenmetal|gemcor/i.test(company);

  return (
    <section
      className={`rf-form-page rf-form-${isGemcor ? 'gemcor' : 'gpi'}`}
      aria-label="Revolving Fund Liquidation for Replenishment or Close-out"
    >
      <header className="rf-workbook-header">
        <img src={brand.logo} alt={`${brand.name} logo`} />
        <h1>Revolving Fund Liquidation for Replenishment/Close-out</h1>
        <div className="rf-workbook-reference" aria-label={`Request number ${reference}`}>
          <span>{reference.startsWith('CA-') ? 'CA No.' : 'RF No.'}</span>
          <strong>{reference}</strong>
        </div>
      </header>

      <dl className="rf-workbook-fields">
        <div>
          <dt>Name/Custodian:</dt>
          <dd>{form.custodianName}</dd>
        </div>
        <div>
          <dt>Period Covered:</dt>
          <dd>{form.periodCovered}</dd>
        </div>
        <div>
          <dt>Department:</dt>
          <dd>{department}</dd>
        </div>
        <div>
          <dt>Project/SOF:</dt>
          <dd>{form.projectSof}</dd>
        </div>
      </dl>

      <table className="rf-workbook-table rf-workbook-expenses">
        <colgroup>
          <col className="rf-col-date" />
          <col className="rf-col-invoice" />
          <col className="rf-col-name" />
          <col className="rf-col-description" />
          <col className="rf-col-account" />
          <col className="rf-col-amount" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Invoice/OR No.</th>
            <th scope="col">Name</th>
            <th scope="col">Item Description</th>
            <th scope="col">Account</th>
            <th scope="col">Amount</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: expenseRows }, (_, index) => {
            const entry = form.expenses[index];
            return (
              <tr key={index}>
                <td>{entry ? manilaDate(entry.date) : '\u00a0'}</td>
                <td>{entry?.invoiceOrNo || '\u00a0'}</td>
                <td>{entry?.name || '\u00a0'}</td>
                <td>{entry?.itemDescription || '\u00a0'}</td>
                <td>{entry?.account || '\u00a0'}</td>
                <td className="rf-workbook-money">{entry ? amount(entry.amount) : '\u00a0'}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={5}>
              TOTAL
            </th>
            <td className="rf-workbook-money">{amount(totals.expenses)}</td>
          </tr>
        </tfoot>
      </table>

      <div className="rf-workbook-expense-total">
        <strong>Total Expenses/For Replenishment</strong>
        <span>{amount(totals.expenses)}</span>
      </div>

      <h2 className="rf-workbook-subtitle">Unliquidated Cash Advance from RF</h2>
      <table className="rf-workbook-table rf-workbook-advances">
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Name</th>
            <th scope="col">Purpose</th>
            <th scope="col">Amount</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: RF_UNLIQUIDATED_ROWS_PER_FORM }, (_, index) => {
            const entry = form.unliquidatedAdvances[index];
            return (
              <tr key={index}>
                <td>{entry ? manilaDate(entry.date) : '\u00a0'}</td>
                <td>{entry?.name || '\u00a0'}</td>
                <td>{entry?.purpose || '\u00a0'}</td>
                <td className="rf-workbook-money">{entry ? amount(entry.amount) : '\u00a0'}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={3}>
              TOTAL
            </th>
            <td className="rf-workbook-money">{amount(totals.unliquidatedAdvances)}</td>
          </tr>
        </tfoot>
      </table>

      <div className="rf-workbook-advance-total">
        <strong>Total Unliquidated</strong>
        <span>{amount(totals.unliquidatedAdvances)}</span>
      </div>

      <dl className="rf-workbook-reconciliation">
        <div>
          <dt>Revolving Fund Amount</dt>
          <dd>{amount(totals.revolvingFundAmount)}</dd>
        </div>
        <div>
          <dt>Less: Total Expenses</dt>
          <dd>{amount(totals.expenses)}</dd>
        </div>
        <div>
          <dt>Total Unliquidated CA</dt>
          <dd>{amount(totals.unliquidatedAdvances)}</dd>
        </div>
        <div>
          <dt>Previous Replenishment (not yet received)</dt>
          <dd>{amount(totals.previousReplenishment)}</dd>
        </div>
        <div className="rf-workbook-cash">
          <dt>ACTUAL CASH ON HAND as of {manilaDate(form.cashOnHandAsOf)}</dt>
          <dd>{amount(totals.cashOnHand)}</dd>
        </div>
      </dl>

      <div className="rf-workbook-signatures">
        <div>
          <span />
          Prepared by Custodian:
        </div>
        <div>
          <span />
          Checked by Head of Department
        </div>
        <div>
          <span />
          Approved by Finance
        </div>
      </div>
    </section>
  );
}
