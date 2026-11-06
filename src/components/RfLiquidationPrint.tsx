import { rfCopies, rfTotals, type RfLiquidation } from '../../shared/utils/rf-liquidation';
import { manilaDate, php } from '../lib/format';

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
  const copies = rfCopies(form, company);
  const totals = rfTotals(form);
  return (
    <div className="rf-print-bundle" aria-label="RF liquidation supporting forms">
      {copies.map((copy) => (
        <section
          key={copy.number}
          className="rf-print-copy"
          aria-label={`Revolving Fund liquidation copy ${copy.number}`}
        >
          <header className="rf-print-copy-heading">
            <div>
              <h2>Revolving Fund Liquidation for Replenishment / Close-out</h2>
              <p>
                {company || 'Company'} · {reference}
              </p>
            </div>
            <strong>
              Copy {copy.number} of {copies.length}
            </strong>
          </header>
          <dl className="rf-print-meta">
            <div>
              <dt>Name / Custodian</dt>
              <dd>{form.custodianName}</dd>
            </div>
            <div>
              <dt>Period Covered</dt>
              <dd>{form.periodCovered}</dd>
            </div>
            <div>
              <dt>Department</dt>
              <dd>{department}</dd>
            </div>
            <div>
              <dt>Project / SOF</dt>
              <dd>{form.projectSof}</dd>
            </div>
          </dl>
          <table className="rf-print-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Invoice / OR No.</th>
                <th>Name</th>
                <th>Item Description</th>
                <th>Account</th>
                <th>Amount (PHP)</th>
              </tr>
            </thead>
            <tbody>
              {copy.expenses.map((entry, index) => (
                <tr key={index}>
                  <td>{manilaDate(entry.date)}</td>
                  <td>{entry.invoiceOrNo}</td>
                  <td>{entry.name}</td>
                  <td>{entry.itemDescription}</td>
                  <td>{entry.account}</td>
                  <td>{php.format(entry.amount)}</td>
                </tr>
              ))}
              {!copy.expenses.length && (
                <tr>
                  <td colSpan={6}>No expense items on this copy</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={5}>TOTAL — Copy {copy.number} expenses</th>
                <th>{php.format(copy.expenseTotal)}</th>
              </tr>
            </tfoot>
          </table>
          <h3 className="rf-print-subheading">Unliquidated Cash Advance from RF</h3>
          <table className="rf-print-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Name</th>
                <th colSpan={3}>Purpose</th>
                <th>Amount (PHP)</th>
              </tr>
            </thead>
            <tbody>
              {copy.unliquidatedAdvances.map((entry, index) => (
                <tr key={index}>
                  <td>{manilaDate(entry.date)}</td>
                  <td>{entry.name}</td>
                  <td colSpan={3}>{entry.purpose}</td>
                  <td>{php.format(entry.amount)}</td>
                </tr>
              ))}
              {!copy.unliquidatedAdvances.length && (
                <tr>
                  <td colSpan={6}>No unliquidated cash advances on this copy</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={5}>TOTAL — Copy {copy.number} unliquidated CA</th>
                <th>{php.format(copy.advanceTotal)}</th>
              </tr>
            </tfoot>
          </table>
          <div className="rf-print-signatures">
            <span>
              Prepared by Custodian: <strong>{form.custodianName}</strong>
            </span>
            <span>Checked by Head of Department</span>
            <span>Approved by Finance</span>
          </div>
        </section>
      ))}
      <section
        className="rf-print-copy rf-print-grand-summary"
        aria-label="Consolidated RF liquidation totals"
      >
        <header className="rf-print-copy-heading">
          <div>
            <h2>Revolving Fund Liquidation — Consolidated Summary</h2>
            <p>
              {reference} · {form.periodCovered} · Final Page
            </p>
          </div>
          <strong>
            {copies.length} {copies.length === 1 ? 'copy' : 'copies'}
          </strong>
        </header>
        <table className="rf-print-table">
          <thead>
            <tr>
              <th colSpan={4}>Consumed RF Form</th>
              <th>Expense Total</th>
              <th>Unliquidated CA</th>
            </tr>
          </thead>
          <tbody>
            {copies.map((copy) => (
              <tr key={copy.number}>
                <td colSpan={4}>
                  Copy {copy.number} of {copies.length}
                </td>
                <td>{php.format(copy.expenseTotal)}</td>
                <td>{php.format(copy.advanceTotal)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th colSpan={4}>Combined totals from all copies</th>
              <th>{php.format(totals.expenses)}</th>
              <th>{php.format(totals.unliquidatedAdvances)}</th>
            </tr>
          </tfoot>
        </table>
        <dl className="rf-print-summary-ledger">
          <div>
            <dt>Revolving Fund Amount</dt>
            <dd>{php.format(totals.revolvingFundAmount)}</dd>
          </div>
          <div>
            <dt>Less: Total Expenses / For Replenishment ({copies.length} copies)</dt>
            <dd>{php.format(totals.expenses)}</dd>
          </div>
          <div>
            <dt>Less: Total Unliquidated CA</dt>
            <dd>{php.format(totals.unliquidatedAdvances)}</dd>
          </div>
          <div>
            <dt>Previous Replenishment (not yet received) · for reference</dt>
            <dd>{php.format(totals.previousReplenishment)}</dd>
          </div>
          <div className="rf-print-cash">
            <dt>ACTUAL CASH ON HAND as of {manilaDate(form.cashOnHandAsOf)}</dt>
            <dd>{php.format(totals.cashOnHand)}</dd>
          </div>
        </dl>
        <div className="rf-print-signatures">
          <span>
            Prepared by Custodian: <strong>{form.custodianName}</strong>
          </span>
          <span>Checked by Head of Department</span>
          <span>Approved by Finance</span>
        </div>
        <p className="rf-print-note">
          All figures are calculated from the individual RF form copies. The combined expense total
          is the RF liquidation request amount.
        </p>
      </section>
    </div>
  );
}
