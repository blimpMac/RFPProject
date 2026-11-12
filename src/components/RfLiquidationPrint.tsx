import { companyBrand } from '../../shared/contracts/digital-rfp';
import { RF_UNLIQUIDATED_ROWS_PER_COPY, rfTotals, sumRfAmounts, type RfLiquidation } from '../../shared/utils/rf-liquidation';
import { RF_SUMMARY_COPIES_PER_PAGE, rfPrintPages, type RfPrintPage } from '../../shared/utils/rf-liquidation';
import { manilaDate, php } from '../lib/format';

type CopyPage = Extract<RfPrintPage, { kind: 'copy' }>;
type SummaryPage = Extract<RfPrintPage, { kind: 'summary' }>;
type Brand = ReturnType<typeof companyBrand>;

function PageHeader({ brand, reference, summary = false }: {
  brand: Brand;
  reference: string;
  summary?: boolean;
}) {
  return (
    <header className="rf-form-heading">
      <div className="rf-form-brand">
        <img src={brand.logo} alt={`${brand.name} logo`} />
        <strong>{brand.name}</strong>
      </div>
      <div className="rf-form-heading-center">
        <h2>REVOLVING FUND LIQUIDATION</h2>
        <span>{summary ? 'CONSOLIDATED SUMMARY OF EXPENSES' : 'FOR REPLENISHMENT / CLOSE-OUT'}</span>
      </div>
      <div className="rf-form-reference">
        <span>REFERENCE NO.</span>
        <strong>{reference}</strong>
      </div>
    </header>
  );
}

function PageFooter({ pageNumber, totalPages, reference }: {
  pageNumber: number;
  totalPages: number;
  reference: string;
}) {
  return (
    <footer className="rf-form-page-footer">
      <span>RF Liquidation · {reference}</span>
      <strong>Page {pageNumber} of {totalPages}</strong>
    </footer>
  );
}

function Signatures({ custodian }: { custodian: string }) {
  return (
    <div className="rf-form-signatures">
      <div><strong>{custodian}</strong><span>Prepared by / Fund Custodian</span></div>
      <div><strong>&nbsp;</strong><span>Checked by / Department Head</span></div>
      <div><strong>&nbsp;</strong><span>Approved by / Finance</span></div>
    </div>
  );
}

function CopySheet({ page, form, company, brand, department, reference }: {
  page: CopyPage;
  form: RfLiquidation;
  company: string;
  brand: Brand;
  department: string;
  reference: string;
}) {
  const { copy, expenseRowSlots } = page;
  const isGemcor = /gemcor|greenmetal/i.test(company);
  const totals = rfTotals(form);
  return (
    <section
      className={`rf-form-page rf-form-${isGemcor ? 'gemcor' : 'gpi'}`}
      aria-label={`Filled out RF form copy ${copy.number} of ${page.totalPages}`}
    >
      <PageHeader brand={brand} reference={reference} />
      <div className="rf-form-document-line">
        <span>RF FORM · COPY {copy.number}</span>
        <span>{expenseRowSlots} expense rows per copy</span>
      </div>
      <dl className="rf-form-metadata">
        <div><dt>NAME / CUSTODIAN</dt><dd>{form.custodianName}</dd></div>
        <div><dt>PERIOD COVERED</dt><dd>{form.periodCovered}</dd></div>
        <div><dt>DEPARTMENT</dt><dd>{department}</dd></div>
        <div><dt>PROJECT / SOF</dt><dd>{form.projectSof}</dd></div>
      </dl>

      <table className="rf-form-table rf-form-expenses">
        <colgroup>
          <col className="rf-form-col-date" />
          <col className="rf-form-col-invoice" />
          <col className="rf-form-col-name" />
          <col className="rf-form-col-description" />
          <col className="rf-form-col-account" />
          <col className="rf-form-col-amount" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">DATE</th>
            <th scope="col">INVOICE / OR NO.</th>
            <th scope="col">NAME / PAYEE</th>
            <th scope="col">ITEM DESCRIPTION</th>
            <th scope="col">ACCOUNT</th>
            <th scope="col">AMOUNT (PHP)</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: expenseRowSlots }, (_, i) => {
            const entry = copy.expenses[i];
            return (
              <tr key={i} className={entry ? 'rf-form-filled-row' : 'rf-form-empty-row'}>
                <td>{entry ? manilaDate(entry.date) : '\u00a0'}</td>
                <td>{entry?.invoiceOrNo || '\u00a0'}</td>
                <td>{entry?.name || '\u00a0'}</td>
                <td>{entry?.itemDescription || '\u00a0'}</td>
                <td>{entry?.account || '\u00a0'}</td>
                <td>{entry ? php.format(entry.amount) : '\u00a0'}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr><th scope="row" colSpan={5}>TOTAL EXPENSES — COPY {copy.number}</th><td>{php.format(copy.expenseTotal)}</td></tr>
        </tfoot>
      </table>

      <div className="rf-form-subsection">UNLIQUIDATED CASH ADVANCE FROM RF</div>
      <table className="rf-form-table rf-form-advances">
        <thead>
          <tr><th scope="col">DATE</th><th scope="col">NAME</th><th scope="col">PURPOSE</th><th scope="col">AMOUNT (PHP)</th></tr>
        </thead>
        <tbody>
          {Array.from({ length: RF_UNLIQUIDATED_ROWS_PER_COPY }, (_, i) => {
            const entry = copy.unliquidatedAdvances[i];
            return (
              <tr key={i} className={entry ? 'rf-form-filled-row' : 'rf-form-empty-row'}>
                <td>{entry ? manilaDate(entry.date) : '\u00a0'}</td>
                <td>{entry?.name || '\u00a0'}</td>
                <td>{entry?.purpose || '\u00a0'}</td>
                <td>{entry ? php.format(entry.amount) : '\u00a0'}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot><tr><th scope="row" colSpan={3}>TOTAL UNLIQUIDATED CA — COPY {copy.number}</th><td>{php.format(copy.advanceTotal)}</td></tr></tfoot>
      </table>

      <dl className="rf-form-tally">
        <div><dt>REVOLVING FUND AMOUNT</dt><dd>{php.format(totals.revolvingFundAmount)}</dd></div>
        <div><dt>FOR REPLENISHMENT · ALL COPIES</dt><dd>{php.format(totals.expenses)}</dd></div>
        <div><dt>PREVIOUS REPLENISHMENT (NOT RECEIVED)</dt><dd>{php.format(totals.previousReplenishment)}</dd></div>
        <div><dt>UNLIQUIDATED CA · ALL COPIES</dt><dd>{php.format(totals.unliquidatedAdvances)}</dd></div>
        <div className="rf-form-cash-on-hand">
          <dt>ACTUAL CASH ON HAND AS OF {manilaDate(form.cashOnHandAsOf)}</dt>
          <dd>{php.format(totals.cashOnHand)}</dd>
        </div>
      </dl>

      <Signatures custodian={form.custodianName} />
      <PageFooter pageNumber={page.pageNumber} totalPages={page.totalPages} reference={reference} />
    </section>
  );
}

function SummarySheet({ page, form, brand, department, reference }: {
  page: SummaryPage;
  form: RfLiquidation;
  brand: Brand;
  department: string;
  reference: string;
}) {
  const totals = rfTotals(form);
  const subtotal = sumRfAmounts(page.copies.map((copy) => ({ amount: copy.expenseTotal })));
  const advanceSubtotal = sumRfAmounts(page.copies.map((copy) => ({ amount: copy.advanceTotal })));
  return (
    <section className="rf-form-page rf-form-summary-page"
      aria-label={`RF liquidation reconciliation page ${page.pageNumber} of ${page.totalPages}`}>
      <PageHeader brand={brand} reference={reference} summary />
      <div className="rf-form-document-line">
        <span>RECONCILIATION · {page.summaryPageNumber} OF {page.summaryPageCount}</span>
        <span>{page.isFinalSummary ? 'FINAL CONSOLIDATED TOTALS' : 'CONTINUED ON NEXT SUMMARY PAGE'}</span>
      </div>
      <dl className="rf-form-metadata">
        <div><dt>NAME / CUSTODIAN</dt><dd>{form.custodianName}</dd></div>
        <div><dt>PERIOD COVERED</dt><dd>{form.periodCovered}</dd></div>
        <div><dt>DEPARTMENT</dt><dd>{department}</dd></div>
        <div><dt>PROJECT / SOF</dt><dd>{form.projectSof}</dd></div>
      </dl>
      <table className="rf-form-table rf-form-summary-table">
        <thead><tr><th scope="col">RF FORM COPY</th><th scope="col">EXPENSES (PHP)</th><th scope="col">UNLIQUIDATED CA (PHP)</th></tr></thead>
        <tbody>
          {Array.from({ length: RF_SUMMARY_COPIES_PER_PAGE }, (_, i) => {
            const copy = page.copies[i];
            return (
              <tr key={i} className={copy ? 'rf-form-filled-row' : 'rf-form-empty-row'}>
                <td>{copy ? `RF Form Copy ${copy.number}` : '\u00a0'}</td>
                <td>{copy ? php.format(copy.expenseTotal) : '\u00a0'}</td>
                <td>{copy ? php.format(copy.advanceTotal) : '\u00a0'}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr><th scope="row">SUBTOTAL — THIS SUMMARY PAGE</th><td>{php.format(subtotal)}</td><td>{php.format(advanceSubtotal)}</td></tr>
        </tfoot>
      </table>
      {page.isFinalSummary ? (
        <dl className="rf-form-grand-totals">
          <div><dt>REVOLVING FUND AMOUNT</dt><dd>{php.format(totals.revolvingFundAmount)}</dd></div>
          <div><dt>COMBINED EXPENSES · FOR REPLENISHMENT</dt><dd>{php.format(totals.expenses)}</dd></div>
          <div><dt>ALL UNLIQUIDATED CASH ADVANCES</dt><dd>{php.format(totals.unliquidatedAdvances)}</dd></div>
          <div><dt>PREVIOUS REPLENISHMENT (NOT RECEIVED) · FOR REFERENCE</dt><dd>{php.format(totals.previousReplenishment)}</dd></div>
          <div className="rf-form-grand-cash">
            <dt>ACTUAL CASH ON HAND AS OF {manilaDate(form.cashOnHandAsOf)}</dt>
            <dd>{php.format(totals.cashOnHand)}</dd>
          </div>
          <div className="rf-form-grand-request">
            <dt>RF LIQUIDATION REQUEST AMOUNT · TOTAL OF ALL COPIES</dt>
            <dd>{php.format(totals.expenses)}</dd>
          </div>
        </dl>
      ) : (
        <p className="rf-form-continued">Remaining RF form copies are itemized on the next reconciliation page. The consolidated totals appear only on the final page.</p>
      )}
      <Signatures custodian={form.custodianName} />
      <PageFooter pageNumber={page.pageNumber} totalPages={page.totalPages} reference={reference} />
    </section>
  );
}

export function RfLiquidationPrint({ form, company, department, reference }: {
  form: RfLiquidation;
  company: string;
  department: string;
  reference: string;
}) {
  const pages = rfPrintPages(form, company);
  const brand = companyBrand(company);
  return (
    <div className="rf-print-bundle" aria-label="A4 RF liquidation forms and final reconciliation">
      {pages.map((page) =>
        page.kind === 'copy' ? (
          <CopySheet
            key={page.pageNumber}
            page={page}
            form={form}
            company={company}
            brand={brand}
            department={department}
            reference={reference}
          />
        ) : (
          <SummarySheet
            key={page.pageNumber}
            page={page}
            form={form}
            brand={brand}
            department={department}
            reference={reference}
          />
        ),
      )}
    </div>
  );
}
