import { CheckCircle2, FileStack, Info, Plus, Trash2 } from 'lucide-react';
import {
  rfCopies,
  rfExpenseRowsPerCopy,
  rfTotals,
  sumRfAmounts,
  toCentavos,
  type RfLiquidation,
} from '../../shared/utils/rf-liquidation';
import {
  blankRfExpense,
  blankRfAdvance,
  rfRowHasAnyValue,
  rfExpenseRowComplete,
  rfAdvanceRowComplete,
  updateRfExpenseRow,
  updateRfAdvanceRow,
  removeRfExpenseRow,
  removeRfAdvanceRow,
  RF_MAX_EXPENSE_ROWS,
  RF_MAX_ADVANCE_ROWS,
  type RfExpenseDraftRow,
  type RfAdvanceDraftRow,
} from '../../shared/utils/rf-entry-rows';

export type RfLiquidationDraft = {
  custodianName: string;
  periodCovered: string;
  projectSof: string;
  revolvingFundAmount: string;
  previousReplenishment: string;
  cashOnHandAsOf: string;
  expenses: RfExpenseDraftRow[];
  unliquidatedAdvances: RfAdvanceDraftRow[];
};

export const emptyRfLiquidationDraft = (): RfLiquidationDraft => ({
  custodianName: '',
  periodCovered: '',
  projectSof: '',
  revolvingFundAmount: '',
  previousReplenishment: '',
  cashOnHandAsOf: '',
  expenses: [blankRfExpense()],
  unliquidatedAdvances: [],
});

const php = (amount: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
const num = (v: string) => Number(v) || 0;

export function normalizeRfDraft(draft: RfLiquidationDraft): RfLiquidation {
  return {
    custodianName: draft.custodianName.trim(),
    periodCovered: draft.periodCovered.trim(),
    projectSof: draft.projectSof.trim(),
    revolvingFundAmount: num(draft.revolvingFundAmount),
    previousReplenishment: num(draft.previousReplenishment),
    cashOnHandAsOf: draft.cashOnHandAsOf,
    expenses: draft.expenses.filter(rfRowHasAnyValue).map((row) => ({
      date: row.date,
      invoiceOrNo: row.invoiceOrNo.trim(),
      name: row.name.trim(),
      itemDescription: row.itemDescription.trim(),
      account: row.account.trim(),
      amount: num(row.amount),
    })),
    unliquidatedAdvances: draft.unliquidatedAdvances.filter(rfRowHasAnyValue).map((row) => ({
      date: row.date,
      name: row.name.trim(),
      purpose: row.purpose.trim(),
      amount: num(row.amount),
    })),
  };
}

export function validateRfDraft(draft: RfLiquidationDraft): string | null {
  const v = normalizeRfDraft(draft);
  if (!v.custodianName || v.custodianName.split(/\s+/).length < 2)
    return 'RF form: Enter the full first and last name of the custodian.';
  if (!v.periodCovered || !v.projectSof || !v.cashOnHandAsOf)
    return 'RF form: Complete Period Covered, Project/SOF, and Cash On Hand As Of.';
  if (!Number.isFinite(v.revolvingFundAmount) || v.revolvingFundAmount <= 0)
    return 'RF form: Enter a valid positive Revolving Fund Amount.';
  if (!Number.isFinite(v.previousReplenishment) || v.previousReplenishment < 0)
    return 'RF form: Previous replenishment cannot be negative.';
  if (!v.expenses.length) return 'RF form: Enter at least one complete expense row.';
  for (const [i, row] of v.expenses.entries()) {
    if (
      !row.date ||
      !row.invoiceOrNo ||
      !row.name ||
      !row.itemDescription ||
      !row.account ||
      !(row.amount > 0) ||
      !Number.isFinite(row.amount) ||
      Math.abs(toCentavos(row.amount) - row.amount * 100) > 0.00001
    ) {
      return `RF form: Complete all six fields in expense row ${i + 1} (use N/A if no OR number).`;
    }
  }
  for (const [i, row] of v.unliquidatedAdvances.entries()) {
    if (
      !row.date ||
      !row.name ||
      !row.purpose ||
      !(row.amount > 0) ||
      !Number.isFinite(row.amount) ||
      Math.abs(toCentavos(row.amount) - row.amount * 100) > 0.00001
    ) {
      return `RF form: Complete Date, Name, Purpose, and Amount in unliquidated CA row ${i + 1}.`;
    }
  }
  if (
    v.expenses.length > RF_MAX_EXPENSE_ROWS ||
    v.unliquidatedAdvances.length > RF_MAX_ADVANCE_ROWS
  )
    return 'The RF liquidation exceeds the maximum supported number of entries.';
  return null;
}

function EntryField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  className = '',
  readOnly = false,
  min,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  type?: 'text' | 'date' | 'number';
  placeholder?: string;
  className?: string;
  readOnly?: boolean;
  min?: string;
}) {
  return (
    <label className={`rf-entry-field ${className}`}>
      <span>{label}</span>
      <input
        className="input"
        type={type}
        value={value}
        placeholder={placeholder}
        inputMode={type === 'number' ? 'decimal' : undefined}
        min={min ?? (type === 'number' ? '0.01' : undefined)}
        readOnly={readOnly}
        step={type === 'number' ? '0.01' : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

const expenseInputs: {
  field: keyof RfExpenseDraftRow;
  label: string;
  type?: 'text' | 'date' | 'number';
  placeholder?: string;
  css?: string;
}[] = [
  { field: 'date', label: 'Expense date', type: 'date' },
  { field: 'invoiceOrNo', label: 'Invoice / OR no.', placeholder: 'OR / N/A' },
  { field: 'name', label: 'Name / Payee', placeholder: 'Supplier or recipient' },
  {
    field: 'itemDescription',
    label: 'Item description',
    placeholder: 'What was purchased',
    css: 'rf-entry-description',
  },
  { field: 'account', label: 'Account', placeholder: 'Expense account' },
  {
    field: 'amount',
    label: 'Amount (PHP)',
    type: 'number',
    placeholder: '0.00',
    css: 'rf-entry-amount',
  },
];
const advanceInputs: {
  field: keyof RfAdvanceDraftRow;
  label: string;
  type?: 'text' | 'date' | 'number';
  placeholder?: string;
}[] = [
  { field: 'date', label: 'Date', type: 'date' },
  { field: 'name', label: 'Name', placeholder: 'Recipient' },
  { field: 'purpose', label: 'Purpose', placeholder: 'Advance purpose' },
  { field: 'amount', label: 'Amount (PHP)', type: 'number', placeholder: '0.00' },
];

export function RfLiquidationEditor({
  value,
  onChange,
  company,
  department,
  requestorName,
}: {
  value: RfLiquidationDraft;
  onChange: (next: RfLiquidationDraft) => void;
  company: string;
  department: string;
  requestorName: string;
}) {
  const capacity = rfExpenseRowsPerCopy(company);
  const pageCount = Math.max(
    1,
    Math.ceil(value.expenses.length / capacity),
    Math.ceil(value.unliquidatedAdvances.length / 2),
  );
  const numeric = normalizeRfDraft(value);
  const usedCopies = rfCopies(numeric, company).length;
  const totals = rfTotals(numeric);
  const completeExpenseCount = value.expenses.filter(rfExpenseRowComplete).length;
  const completeAdvanceCount = value.unliquidatedAdvances.filter(rfAdvanceRowComplete).length;
  const set = <K extends keyof RfLiquidationDraft>(key: K, field: RfLiquidationDraft[K]) =>
    onChange({ ...value, [key]: field });

  const isGemcor = /gemcor|greenmetal/i.test(company);

  return (
    <section className="rf-editor md:col-span-2" aria-label="RF liquidation form">
      <div className="rf-editor-header">
        <div className="rf-editor-heading">
          <span className="rf-editor-eyebrow">Required · RF Liquidation</span>
          <h3>Revolving Fund Liquidation</h3>
          <p>
            Complete the form below. Totals update automatically, and the next entry appears once a
            row is filled in.
          </p>
        </div>
        <span className="rf-editor-copy-counter">
          <FileStack size={17} aria-hidden="true" />
          {usedCopies} {usedCopies === 1 ? 'form used' : 'forms used'}
          {pageCount > usedCopies ? ' · Next ready' : ''}
        </span>
      </div>

      <div className="rf-editor-details">
        <EntryField
          label="Name / Custodian"
          value={value.custodianName}
          placeholder="First and last name"
          onChange={(next) => set('custodianName', next)}
        />
        <EntryField
          label="Period covered"
          value={value.periodCovered}
          placeholder="e.g. Nov 1–15, 2026"
          onChange={(next) => set('periodCovered', next)}
        />
        <EntryField label="Department" value={department} readOnly onChange={() => {}} />
        <EntryField
          label="Project / SOF"
          value={value.projectSof}
          placeholder="Project name or SOF number"
          onChange={(next) => set('projectSof', next)}
        />
        <EntryField
          label="Revolving fund amount (PHP)"
          value={value.revolvingFundAmount}
          type="number"
          placeholder="0.00"
          onChange={(next) => set('revolvingFundAmount', next)}
        />
        <EntryField
          label="Cash on hand as of"
          type="date"
          value={value.cashOnHandAsOf}
          onChange={(next) => set('cashOnHandAsOf', next)}
        />
      </div>
      <p className="rf-editor-caption">
        Prepared by {value.custodianName || requestorName || 'Custodian'} · Checked by Department
        Head · Approved by Finance
      </p>

      <div className="rf-editor-live-totals" aria-live="polite" aria-atomic="true">
        <div>
          <span>Total expenses</span>
          <strong>{php(totals.expenses)}</strong>
        </div>
        <div>
          <span>Unliquidated advances</span>
          <strong>{php(totals.unliquidatedAdvances)}</strong>
        </div>
        <div className="rf-editor-primary-total">
          <span>RF liquidation amount</span>
          <strong>{php(totals.expenses)}</strong>
        </div>
      </div>

      {Array.from({ length: pageCount }, (_, pageIndex) => {
        const expenseRows = value.expenses.slice(pageIndex * capacity, (pageIndex + 1) * capacity);
        const advanceRows = value.unliquidatedAdvances.slice(pageIndex * 2, (pageIndex + 1) * 2);
        const expenseTotal = sumRfAmounts(expenseRows.map((row) => ({ amount: num(row.amount) })));
        const advanceTotal = sumRfAmounts(advanceRows.map((row) => ({ amount: num(row.amount) })));
        return (
          <div className="rf-editor-copy" key={pageIndex}>
            <div className="rf-editor-copy-header">
              <div className="rf-editor-copy-title">
                <span className="rf-editor-copy-index">
                  {String(pageIndex + 1).padStart(2, '0')}
                </span>
                <div>
                  <h4>RF Form · Copy {pageIndex + 1}</h4>
                  <p>
                    {isGemcor ? 'GEMCOR' : 'Greenlight'} template · {capacity} expense entries per
                    copy
                  </p>
                </div>
              </div>
              <span className="rf-editor-copy-progress">
                {expenseRows.filter(rfExpenseRowComplete).length} / {capacity} expenses
              </span>
            </div>
            <div className="rf-editor-copy-body">
              <div className="rf-editor-subheading">
                <h5>Expense details</h5>
                <span>Next row opens automatically after completing all fields</span>
              </div>
              <div className="rf-entry-list">
                {expenseRows.map((row, indexOnPage) => {
                  const index = pageIndex * capacity + indexOnPage;
                  const complete = rfExpenseRowComplete(row);
                  return (
                    <div className={`rf-entry-row${complete ? ' is-complete' : ''}`} key={index}>
                      <div className="rf-entry-row-heading">
                        <span className="rf-entry-row-number">
                          #{String(index + 1).padStart(2, '0')}
                        </span>
                        <span className={`rf-entry-row-status${complete ? ' is-complete' : ''}`}>
                          {complete ? (
                            <>
                              <CheckCircle2 size={14} /> Completed
                            </>
                          ) : (
                            'Enter expense details'
                          )}
                        </span>
                        <button
                          type="button"
                          className="rf-entry-remove"
                          aria-label={`Remove expense row ${index + 1}`}
                          onClick={() => set('expenses', removeRfExpenseRow(value.expenses, index))}
                        >
                          <Trash2 size={15} aria-hidden="true" />
                        </button>
                      </div>
                      <div className="rf-entry-fields">
                        {expenseInputs.map(({ field, label, type, placeholder, css }) => (
                          <EntryField
                            key={field}
                            label={label}
                            type={type}
                            placeholder={placeholder}
                            className={css || ''}
                            value={row[field]}
                            onChange={(next) =>
                              set(
                                'expenses',
                                updateRfExpenseRow(value.expenses, index, field, next),
                              )
                            }
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              {value.expenses.length >= RF_MAX_EXPENSE_ROWS && pageIndex === pageCount - 1 && (
                <p className="rf-editor-limit">
                  Maximum {RF_MAX_EXPENSE_ROWS} expense lines reached.
                </p>
              )}
              {pageIndex === 0 && completeExpenseCount === 0 && (
                <p className="rf-editor-help">
                  <Info size={14} aria-hidden="true" />
                  All six fields are needed. Write N/A for Invoice/OR if none applies.
                </p>
              )}
              <div className="rf-editor-copy-subtotal">
                <span>Copy {pageIndex + 1} · expense subtotal</span>
                <strong>{php(expenseTotal)}</strong>
              </div>

              <div className="rf-editor-advance-section">
                <div className="rf-editor-subheading">
                  <h5>Unliquidated cash advances</h5>
                  <span>Optional · 2 entries per copy</span>
                </div>
                <div className="rf-entry-list">
                  {advanceRows.map((row, indexOnPage) => {
                    const index = pageIndex * 2 + indexOnPage;
                    const complete = rfAdvanceRowComplete(row);
                    return (
                      <div
                        className={`rf-entry-row rf-entry-row-advance${complete ? ' is-complete' : ''}`}
                        key={index}
                      >
                        <div className="rf-entry-row-heading">
                          <span className="rf-entry-row-number">
                            CA #{String(index + 1).padStart(2, '0')}
                          </span>
                          <span className={`rf-entry-row-status${complete ? ' is-complete' : ''}`}>
                            {complete ? (
                              <>
                                <CheckCircle2 size={14} /> Completed
                              </>
                            ) : (
                              'Enter advance details'
                            )}
                          </span>
                          <button
                            type="button"
                            className="rf-entry-remove"
                            aria-label={`Remove cash advance row ${index + 1}`}
                            onClick={() =>
                              set(
                                'unliquidatedAdvances',
                                removeRfAdvanceRow(value.unliquidatedAdvances, index),
                              )
                            }
                          >
                            <Trash2 size={15} aria-hidden="true" />
                          </button>
                        </div>
                        <div className="rf-entry-fields rf-entry-fields-advance">
                          {advanceInputs.map(({ field, label, type, placeholder }) => (
                            <EntryField
                              key={field}
                              label={label}
                              type={type}
                              placeholder={placeholder}
                              value={row[field]}
                              onChange={(next) =>
                                set(
                                  'unliquidatedAdvances',
                                  updateRfAdvanceRow(
                                    value.unliquidatedAdvances,
                                    index,
                                    field,
                                    next,
                                  ),
                                )
                              }
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {pageIndex === pageCount - 1 && !value.unliquidatedAdvances.length && (
                  <button
                    type="button"
                    className="btn btn-secondary rf-entry-add"
                    onClick={() => set('unliquidatedAdvances', [blankRfAdvance()])}
                  >
                    <Plus size={15} aria-hidden="true" /> Add cash advance
                  </button>
                )}
                <div className="rf-editor-copy-subtotal">
                  <span>Copy {pageIndex + 1} · unliquidated CA</span>
                  <strong>{php(advanceTotal)}</strong>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      <div className="rf-editor-final">
        <div className="rf-editor-final-heading">
          <div>
            <span className="rf-editor-eyebrow">Automatically calculated</span>
            <h4>Consolidated RF liquidation summary</h4>
            <p>
              Includes {usedCopies} completed RF {usedCopies === 1 ? 'form copy' : 'form copies'}.
              The total expenses flow into the main request amount automatically.
            </p>
          </div>
          <span className="rf-editor-summary-icon">
            <FileStack size={19} aria-hidden="true" />
          </span>
        </div>
        <div className="rf-editor-previous">
          <EntryField
            label="Previous replenishment (not yet received)"
            type="number"
            min="0"
            placeholder="0.00 (if none)"
            value={value.previousReplenishment}
            onChange={(next) => set('previousReplenishment', next)}
          />
          <p>Shown for reference; it is not deducted twice from cash on hand.</p>
        </div>
        <dl className="rf-editor-summary-list" aria-live="polite">
          <div>
            <dt>Revolving fund amount</dt>
            <dd>{php(totals.revolvingFundAmount)}</dd>
          </div>
          <div>
            <dt>Total expenses · {completeExpenseCount} entries</dt>
            <dd>{php(totals.expenses)}</dd>
          </div>
          <div>
            <dt>Unliquidated cash advances · {completeAdvanceCount} entries</dt>
            <dd>{php(totals.unliquidatedAdvances)}</dd>
          </div>
          <div>
            <dt>Previous replenishment · reference only</dt>
            <dd>{php(totals.previousReplenishment)}</dd>
          </div>
          <div className="rf-editor-cash-balance">
            <dt>
              Actual cash on hand <small>as of {value.cashOnHandAsOf || '—'}</small>
            </dt>
            <dd>{php(totals.cashOnHand)}</dd>
          </div>
          <div className="rf-editor-request-amount">
            <dt>Amount passed to RF Liquidation request</dt>
            <dd>{php(totals.expenses)}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
