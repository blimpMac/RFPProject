/** RF liquidation fields and row capacities from the supplied workbook. */
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

export const RF_UNLIQUIDATED_ROWS_PER_FORM = 2;

export function rfExpenseRowsPerForm(company: string): number {
  return /greenmetal|gemcor/i.test(company) ? 35 : 49;
}

/** All arithmetic happens in centavos to prevent 0.1 + 0.2 rounding drift. */
export const toCentavos = (amount: number): number => Math.round(amount * 100);
export const fromCentavos = (amount: number): number => amount / 100;

export function sumRfAmounts(rows: readonly { amount: number }[]): number {
  return fromCentavos(rows.reduce((total, row) => total + toCentavos(row.amount), 0));
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
