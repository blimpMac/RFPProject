import { FileText, Plus, Trash2 } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { Button } from './ui';

export type CaLiquidationExpense = {
  date: string;
  description: string;
  amount: string;
};

const createExpense = (): CaLiquidationExpense => ({
  date: '',
  description: '',
  amount: '',
});

const pesos = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
});

export function CaLiquidationEditor({
  expenses,
  onChange,
}: {
  expenses: CaLiquidationExpense[];
  onChange: Dispatch<SetStateAction<CaLiquidationExpense[]>>;
}) {
  const amountInCentavos = expenses.reduce((total, row) => {
    const amount = Number(row.amount);
    return Number.isFinite(amount) && amount > 0
      ? total + Math.round(amount * 100)
      : total;
  }, 0);
  const completedCount = expenses.filter(
    (row) =>
      Boolean(row.date && row.description.trim().length >= 2) &&
      Number.isFinite(Number(row.amount)) &&
      Number(row.amount) > 0,
  ).length;

  const edit = (index: number, key: keyof CaLiquidationExpense, value: string) => {
    onChange((rows) =>
      rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)),
    );
  };

  return (
    <section className="ca-liquidation-editor md:col-span-2" aria-label="CA liquidation expenses">
      <div className="ca-liquidation-header">
        <div className="ca-liquidation-title">
          <span className="ca-liquidation-kicker">Required for CA Liquidation</span>
          <h3>Itemized liquidation expenses</h3>
          <p>
            List the expense date, description, and peso amount for each item.
            Completed entries appear on the liquidation expense summary.
          </p>
        </div>
        <div className="ca-liquidation-header-actions">
          <span className="ca-liquidation-count" aria-label={`${expenses.length} expense rows`}>
            <FileText size={15} aria-hidden="true" />
            {expenses.length} {expenses.length === 1 ? 'entry' : 'entries'}
          </span>
          <Button
            type="button"
            variant="secondary"
            className="ca-liquidation-add"
            onClick={() => onChange((rows) => [...rows, createExpense()])}
          >
            <Plus size={16} aria-hidden="true" />
            Add expense
          </Button>
        </div>
      </div>

      {expenses.length > 0 ? (
        <div className="ca-liquidation-entries">
          {expenses.map((expense, index) => (
            <div className="ca-liquidation-row" key={index}>
              <div className="ca-liquidation-row-heading">
                <span className="ca-liquidation-row-number">
                  Expense {String(index + 1).padStart(2, '0')}
                </span>
                <button
                  type="button"
                  className="ca-liquidation-remove"
                  aria-label={`Remove expense ${index + 1}`}
                  title="Remove expense"
                  onClick={() => onChange((rows) => rows.filter((_, i) => i !== index))}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </div>
              <div className="ca-liquidation-fields">
                <label className="ca-liquidation-field" htmlFor={`ca-expense-date-${index}`}>
                  <span>Expense date</span>
                  <input
                    id={`ca-expense-date-${index}`}
                    className="input"
                    type="date"
                    required
                    value={expense.date}
                    onChange={(event) => edit(index, 'date', event.target.value)}
                  />
                </label>
                <label className="ca-liquidation-field" htmlFor={`ca-expense-description-${index}`}>
                  <span>Description</span>
                  <input
                    id={`ca-expense-description-${index}`}
                    className="input"
                    type="text"
                    required
                    maxLength={280}
                    placeholder="Purpose of expense"
                    value={expense.description}
                    onChange={(event) => edit(index, 'description', event.target.value)}
                  />
                </label>
                <label className="ca-liquidation-field" htmlFor={`ca-expense-amount-${index}`}>
                  <span>Amount (PHP)</span>
                  <input
                    id={`ca-expense-amount-${index}`}
                    className="input ca-liquidation-amount"
                    type="number"
                    required
                    inputMode="decimal"
                    min="0.01"
                    step="0.01"
                    placeholder="0.00"
                    value={expense.amount}
                    onChange={(event) => edit(index, 'amount', event.target.value)}
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="ca-liquidation-empty">
          <FileText size={19} aria-hidden="true" />
          <span>No expenses added yet. Use <strong>Add expense</strong> to begin.</span>
        </div>
      )}

      {expenses.length > 0 && (
        <div className="ca-liquidation-footer" aria-live="polite">
          <span>
            <strong>{completedCount}</strong> of <strong>{expenses.length}</strong> entries completed
          </span>
          <div className="ca-liquidation-total">
            <span>Total itemized expenses</span>
            <strong>{pesos.format(amountInCentavos / 100)}</strong>
          </div>
        </div>
      )}
    </section>
  );
}
