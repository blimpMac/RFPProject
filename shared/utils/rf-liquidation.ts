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
