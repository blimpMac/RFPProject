/** RF liquidation fields and copy capacities, matched to the supplied
 * Departmental-and-Site RF Form (GPI rows 10–58; GEMCOR rows 10–44). */
export type RfExpense = {
  date: string;
  invoiceOrNo: string;
  name: string;
  itemDescription: string;
  account: string;
  amount: number;
};
export type RfUnliquidatedAdvance = {
  date: string;
  name: string;
  purpose: string;
  amount: number;
};
export type RfLiquidation = {
  custodianName: string;
  periodCovered: string;
  projectSof: string;
  revolvingFundAmount: number;
  previousReplenishment: number;
  cashOnHandAsOf: string;
  expenses: RfExpense[];
  unliquidatedAdvances: RfUnliquidatedAdvance[];
};

export const RF_UNLIQUIDATED_ROWS_PER_COPY = 2;
export function rfExpenseRowsPerCopy(company: string): number {
  return /greenmetal|gemcor/i.test(company) ? 35 : 49;
}

/** All arithmetic happens in centavos to prevent 0.1 + 0.2 rounding drift. */
export const toCentavos = (amount: number): number => Math.round(amount * 100);
export const fromCentavos = (amount: number): number => amount / 100;
export function sumRfAmounts(rows: readonly { amount: number }[]): number {
  return fromCentavos(rows.reduce((total, row) => total + toCentavos(row.amount), 0));
}
export type RfCopy = {
  number: number;
  expenses: RfExpense[];
  unliquidatedAdvances: RfUnliquidatedAdvance[];
  expenseTotal: number;
  advanceTotal: number;
};
export function rfCopies(form: Pick<RfLiquidation, 'expenses' | 'unliquidatedAdvances'>, company: string): RfCopy[] {
  const capacity = rfExpenseRowsPerCopy(company);
  const count = Math.max(
    1,
    Math.ceil(form.expenses.length / capacity),
    Math.ceil(form.unliquidatedAdvances.length / RF_UNLIQUIDATED_ROWS_PER_COPY),
  );
  return Array.from({ length: count }, (_, index) => {
    const expenses = form.expenses.slice(index * capacity, (index + 1) * capacity);
    const unliquidatedAdvances = form.unliquidatedAdvances.slice(
      index * RF_UNLIQUIDATED_ROWS_PER_COPY,
      (index + 1) * RF_UNLIQUIDATED_ROWS_PER_COPY,
    );
    return {
      number: index + 1, expenses, unliquidatedAdvances,
      expenseTotal: sumRfAmounts(expenses),
      advanceTotal: sumRfAmounts(unliquidatedAdvances),
    };
  });
}
export function rfTotals(form: RfLiquidation) {
  const expenses = sumRfAmounts(form.expenses);
  const unliquidatedAdvances = sumRfAmounts(form.unliquidatedAdvances);
  const previousReplenishment = fromCentavos(toCentavos(form.previousReplenishment));
  const revolvingFundAmount = fromCentavos(toCentavos(form.revolvingFundAmount));
  const cashOnHand = fromCentavos(
    toCentavos(revolvingFundAmount) -
    toCentavos(expenses) -
    toCentavos(unliquidatedAdvances),
  );
  return {
    expenses,
    unliquidatedAdvances,
    previousReplenishment,
    revolvingFundAmount,
    cashOnHand,
  };
}

export const RF_SUMMARY_COPIES_PER_PAGE = 25;

export type RfPrintPage =
  | {
      kind: 'copy';
      pageNumber: number;
      totalPages: number;
      copy: RfCopy;
      expenseRowSlots: number;
    }
  | {
      kind: 'summary';
      pageNumber: number;
      totalPages: number;
      summaryPageNumber: number;
      summaryPageCount: number;
      copies: RfCopy[];
      isFinalSummary: boolean;
    };

/** Each filled-out RF copy consumes an A4 page. Large liquidations also
 * paginate their reconciliation table so the grand totals stay on the
 * final A4 sheet. The blank RF rows are for printing only and are not
 * treated as expenses or included in any amount calculations.
 */
export function rfPrintPages(
  form: Pick<RfLiquidation, 'expenses' | 'unliquidatedAdvances'>,
  company: string,
): RfPrintPage[] {
  const copies = rfCopies(form, company);
  const summaryPageCount = Math.max(1, Math.ceil(copies.length / RF_SUMMARY_COPIES_PER_PAGE));
  const totalPages = copies.length + summaryPageCount;
  const expenseRowSlots = rfExpenseRowsPerCopy(company);

  const copyPages: RfPrintPage[] = copies.map((copy, i) => ({
    kind: 'copy',
    pageNumber: i + 1,
    totalPages,
    copy,
    expenseRowSlots,
  }));
  const summaryPages: RfPrintPage[] = Array.from({ length: summaryPageCount }, (_, i) => ({
    kind: 'summary',
    pageNumber: copies.length + i + 1,
    totalPages,
    summaryPageNumber: i + 1,
    summaryPageCount,
    copies: copies.slice(i * RF_SUMMARY_COPIES_PER_PAGE, (i + 1) * RF_SUMMARY_COPIES_PER_PAGE),
    isFinalSummary: i === summaryPageCount - 1,
  }));
  return [...copyPages, ...summaryPages];
}
