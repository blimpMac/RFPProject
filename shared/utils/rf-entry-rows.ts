/** Automatic, bounded RF form row creation shared by the editor and tests.
 * The final empty row is an editing placeholder; only nonempty rows are saved.
 */
export type RfExpenseDraftRow = {
  date: string;
  invoiceOrNo: string;
  name: string;
  itemDescription: string;
  account: string;
  amount: string;
};
export type RfAdvanceDraftRow = {
  date: string;
  name: string;
  purpose: string;
  amount: string;
};
export const RF_MAX_EXPENSE_ROWS = 2000;
export const RF_MAX_ADVANCE_ROWS = 200;
export const blankRfExpense = (): RfExpenseDraftRow => ({
  date: '',
  invoiceOrNo: '',
  name: '',
  itemDescription: '',
  account: '',
  amount: '',
});
export const blankRfAdvance = (): RfAdvanceDraftRow => ({
  date: '',
  name: '',
  purpose: '',
  amount: '',
});
export function rfRowHasAnyValue(row: object): boolean {
  return Object.values(row).some((v) => String(v).trim() !== '');
}
const hasValidMoney = (value: string): boolean => {
  const number = Number(value);
  return value.trim() !== '' && Number.isFinite(number) && number > 0 &&
    Math.abs(Math.round(number * 100) - number * 100) < 0.00001;
};
export function rfExpenseRowComplete(row: RfExpenseDraftRow): boolean {
  return !!(
    row.date &&
    row.invoiceOrNo.trim() &&
    row.name.trim() &&
    row.itemDescription.trim() &&
    row.account.trim() &&
    hasValidMoney(row.amount)
  );
}
export function rfAdvanceRowComplete(row: RfAdvanceDraftRow): boolean {
  return !!(
    row.date &&
    row.name.trim() &&
    row.purpose.trim() &&
    hasValidMoney(row.amount)
  );
}
function insertFollowingBlank<T>(
  rows: T[],
  index: number,
  complete: (row: T) => boolean,
  blank: () => T,
  maximum: number,
): T[] {
  if (index === rows.length - 1 && rows.length < maximum && complete(rows[index])) {
    return [...rows, blank()];
  }
  return rows;
}
export function updateRfExpenseRow(
  rows: RfExpenseDraftRow[],
  index: number,
  field: keyof RfExpenseDraftRow,
  value: string,
): RfExpenseDraftRow[] {
  if (index < 0 || index >= rows.length) return rows;
  const updated = rows.map((row, i) => (i === index ? { ...row, [field]: value } : row));
  return insertFollowingBlank(updated, index, rfExpenseRowComplete, blankRfExpense, RF_MAX_EXPENSE_ROWS);
}
export function updateRfAdvanceRow(
  rows: RfAdvanceDraftRow[],
  index: number,
  field: keyof RfAdvanceDraftRow,
  value: string,
): RfAdvanceDraftRow[] {
  if (index < 0 || index >= rows.length) return rows;
  const updated = rows.map((row, i) => (i === index ? { ...row, [field]: value } : row));
  return insertFollowingBlank(updated, index, rfAdvanceRowComplete, blankRfAdvance, RF_MAX_ADVANCE_ROWS);
}
export function removeRfExpenseRow(rows: RfExpenseDraftRow[], index: number): RfExpenseDraftRow[] {
  const remaining = rows.filter((_, i) => i !== index);
  if (!remaining.length) return [blankRfExpense()];
  if (rfExpenseRowComplete(remaining[remaining.length - 1]) && remaining.length < RF_MAX_EXPENSE_ROWS) {
    return [...remaining, blankRfExpense()];
  }
  return remaining;
}
export function removeRfAdvanceRow(rows: RfAdvanceDraftRow[], index: number): RfAdvanceDraftRow[] {
  const remaining = rows.filter((_, i) => i !== index);
  if (!remaining.length) return [];
  if (rfAdvanceRowComplete(remaining[remaining.length - 1]) && remaining.length < RF_MAX_ADVANCE_ROWS) {
    return [...remaining, blankRfAdvance()];
  }
  return remaining;
}
