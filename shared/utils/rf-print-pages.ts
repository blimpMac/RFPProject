import { rfCopies, rfExpenseRowsPerCopy, type RfCopy, type RfLiquidation } from './rf-liquidation';

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
