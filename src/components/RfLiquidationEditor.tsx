import { useEffect } from 'react';
import { FilePlus2, Trash2 } from 'lucide-react';
import {
  rfExpenseRowsPerCopy, rfTotals, sumRfAmounts, toCentavos,
  type RfLiquidation,
} from '../../shared/utils/rf-liquidation';

type ExpenseDraft = {
  date: string; invoiceOrNo: string; name: string; itemDescription: string;
  account: string; amount: string;
};
type AdvanceDraft = { date: string; name: string; purpose: string; amount: string };
export type RfLiquidationDraft = {
  custodianName: string; periodCovered: string; projectSof: string;
  revolvingFundAmount: string; previousReplenishment: string; cashOnHandAsOf: string;
  expenses: ExpenseDraft[]; unliquidatedAdvances: AdvanceDraft[];
};
const blankExpense = (): ExpenseDraft => ({
  date:'', invoiceOrNo:'', name:'', itemDescription:'', account:'', amount:'',
});
const blankAdvance = (): AdvanceDraft => ({ date:'', name:'', purpose:'', amount:'' });
export const emptyRfLiquidationDraft = (): RfLiquidationDraft => ({
  custodianName:'', periodCovered:'', projectSof:'', revolvingFundAmount:'',
  previousReplenishment:'', cashOnHandAsOf:'', expenses:[], unliquidatedAdvances:[],
});
const expenseFields = ['date','invoiceOrNo','name','itemDescription','account','amount'] as const;
const advanceFields = ['date','name','purpose','amount'] as const;
const hasAny = <T extends object>(row: T) => Object.values(row).some((v) => String(v).trim() !== '');
const hasAll = (row: ExpenseDraft) =>
  expenseFields.every((key) => row[key].trim() !== '') && Number(row.amount) > 0;
const php = (amount: number) => new Intl.NumberFormat('en-PH', {style:'currency',currency:'PHP'}).format(amount);
const num = (v: string) => Number(v) || 0;

export function normalizeRfDraft(draft: RfLiquidationDraft): RfLiquidation {
  return {
    custodianName: draft.custodianName.trim(),
    periodCovered: draft.periodCovered.trim(),
    projectSof: draft.projectSof.trim(),
    revolvingFundAmount: num(draft.revolvingFundAmount),
    previousReplenishment: num(draft.previousReplenishment),
    cashOnHandAsOf: draft.cashOnHandAsOf,
    expenses: draft.expenses.filter((row) => hasAny(row)).map((row) => ({
      date: row.date, invoiceOrNo: row.invoiceOrNo.trim(),
      name: row.name.trim(), itemDescription: row.itemDescription.trim(),
      account: row.account.trim(), amount: num(row.amount),
    })),
    unliquidatedAdvances: draft.unliquidatedAdvances.filter((row) => hasAny(row))
      .map((row) => ({ date:row.date, name:row.name.trim(), purpose:row.purpose.trim(), amount:num(row.amount) })),
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
  if (!v.expenses.length) return 'RF form: Add at least one expense before submitting.';
  for (const [i,row] of v.expenses.entries()) {
    if (!row.date || !row.invoiceOrNo || !row.name || !row.itemDescription ||
        !row.account || !(row.amount > 0) || !Number.isFinite(row.amount) ||
        toCentavos(row.amount) !== row.amount * 100 && Math.abs(toCentavos(row.amount) - row.amount * 100) > 0.00001)
      return `RF form: Complete all six fields for expense row ${i + 1} (use N/A if no OR number).`;
  }
  for (const [i,row] of v.unliquidatedAdvances.entries()) {
    if (!row.date || !row.name || !row.purpose || !(row.amount > 0) || !Number.isFinite(row.amount))
      return `RF form: Complete Date, Name, Purpose, and Amount for unliquidated CA row ${i + 1}.`;
  }
  if (v.expenses.length > 2000 || v.unliquidatedAdvances.length > 200)
    return 'The RF liquidation exceeds the maximum supported number of entries.';
  return null;
}

export function RfLiquidationEditor({ value, onChange, company, department, requestorName }: {
  value: RfLiquidationDraft;
  onChange: (next: RfLiquidationDraft) => void;
  company: string; department: string; requestorName: string;
}) {
  const capacity = rfExpenseRowsPerCopy(company);
  const pageCount = Math.max(1,
    Math.ceil(value.expenses.length / capacity),
    Math.ceil(value.unliquidatedAdvances.length / 2));
  const numeric = normalizeRfDraft(value);
  const totals = rfTotals(numeric);
  const set = <K extends keyof RfLiquidationDraft,>(key: K, field: RfLiquidationDraft[K]) =>
    onChange({...value,[key]:field});

  // A complete last row exactly fills the template; open a fresh copy
  // automatically. The empty next row isn't included in submitted totals.
  useEffect(() => {
    const last = value.expenses.at(-1);
    if (last && value.expenses.length % capacity === 0 && hasAll(last)) {
      onChange({...value,expenses:[...value.expenses,blankExpense()]});
    }
  }, [value, capacity, onChange]);

  function editExpense(index:number, key:keyof ExpenseDraft, next:string) {
    set('expenses', value.expenses.map((row,i)=> i === index ? {...row,[key]:next} : row));
  }
  function editAdvance(index:number, key:keyof AdvanceDraft, next:string) {
    set('unliquidatedAdvances',
      value.unliquidatedAdvances.map((row,i)=> i === index ? {...row,[key]:next} : row));
  }

  return (
    <section className="rf-editor md:col-span-2 rounded-2xl border border-[#a8bcd0] bg-[#f8fbff] p-4 sm:p-6" aria-label="RF liquidation form">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-[#315c93]">Required before submitting</p>
          <h3 className="mt-1 text-xl font-bold text-[#102a43]">Revolving Fund Liquidation for Replenishment / Close-out</h3>
          <p className="mt-2 text-sm text-slate-600">
            Matches your { /gemcor|greenmetal/i.test(company) ? 'GEMCOR' : 'GPI' } RF template.
            Every {capacity} expense lines automatically create the next RF form copy.
          </p>
        </div>
        <span className="rounded-full bg-[#102a43] px-4 py-2 text-sm font-semibold text-white">
          {pageCount} {pageCount === 1 ? 'copy' : 'copies'}
        </span>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <label className="field text-sm font-semibold">Name / Custodian
          <input required className="input mt-1 w-full" value={value.custodianName} placeholder="First and last name"
            onChange={e=>set('custodianName',e.target.value)} />
        </label>
        <label className="field text-sm font-semibold">Period Covered
          <input required className="input mt-1 w-full" value={value.periodCovered} placeholder="e.g. Nov 1–15, 2026"
            onChange={e=>set('periodCovered',e.target.value)} />
        </label>
        <label className="field text-sm font-semibold">Department
          <input className="input mt-1 w-full" value={department} readOnly />
        </label>
        <label className="field text-sm font-semibold">Project / SOF
          <input required className="input mt-1 w-full" value={value.projectSof} placeholder="Project name or SOF number"
            onChange={e=>set('projectSof',e.target.value)} />
        </label>
        <label className="field text-sm font-semibold">Revolving Fund Amount (PHP)
          <input required type="number" min="0.01" step="0.01" className="input mt-1 w-full"
            value={value.revolvingFundAmount} onChange={e=>set('revolvingFundAmount',e.target.value)} />
        </label>
        <label className="field text-sm font-semibold">Cash On Hand As Of
          <input required type="date" className="input mt-1 w-full" value={value.cashOnHandAsOf}
            onChange={e=>set('cashOnHandAsOf',e.target.value)} />
        </label>
      </div>
      <p className="mt-3 text-xs text-slate-600">Prepared by: {value.custodianName || requestorName || 'Custodian'} · Checked by Head of Department · Approved by Finance</p>
      {Array.from({length:pageCount},(_,pageIndex)=>{
        const expenses = value.expenses.slice(pageIndex*capacity,(pageIndex+1)*capacity);
        const advances = value.unliquidatedAdvances.slice(pageIndex*2,(pageIndex+1)*2);
        const expenseTotal = sumRfAmounts(expenses.map(e=>({amount:num(e.amount)})));
        const advanceTotal = sumRfAmounts(advances.map(e=>({amount:num(e.amount)})));
        return (
          <div className="rf-editor-copy mt-6 overflow-hidden rounded-xl border bg-white" key={pageIndex}>
            <div className="flex flex-wrap justify-between gap-2 bg-[#102a43] px-4 py-3 text-white">
              <strong>RF Form — Copy {pageIndex+1} of {pageCount}</strong>
              <span className="text-xs">{expenses.length} / {capacity} expense lines · {advances.length} / 2 unliquidated CA lines</span>
            </div>
            <div className="px-4 pt-4">
              <h4 className="font-bold text-[#173f6b]">Expense details</h4>
              <p className="text-xs text-slate-600">Use “N/A” in Invoice/OR No. if no receipt number applies.</p>
            </div>
            <div className="overflow-x-auto p-4">
              <table className="w-full min-w-[780px] border-collapse text-xs">
                <thead className="bg-[#e5edf5] text-left text-[#102a43]">
                  <tr>{['Date','Invoice / OR No.','Name','Item Description','Account','Amount (PHP)',''].map(h=>(
                    <th key={h} className="border border-slate-300 p-2">{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {expenses.map((row,i)=>{
                    const index = pageIndex*capacity+i;
                    return (
                      <tr key={index}>
                        {expenseFields.map((field)=>(
                          <td key={field} className="min-w-24 border border-slate-200 p-1">
                            <input
                              className="w-full min-w-0 bg-transparent px-1 py-2 outline-offset-2 focus:bg-blue-50"
                              aria-label={`Copy ${pageIndex+1}, expense ${i+1}, ${field}`}
                              type={field==='date'?'date':field==='amount'?'number':'text'}
                              min={field==='amount'?'0.01':undefined}
                              step={field==='amount'?'0.01':undefined}
                              maxLength={field==='itemDescription'?280:field==='account'?120:160}
                              value={row[field]}
                              onChange={e=>editExpense(index,field,e.target.value)}
                            />
                          </td>
                        ))}
                        <td className="border border-slate-200 p-1">
                          <button className="rounded p-2 text-red-600 hover:bg-red-50" type="button"
                            title="Remove expense" aria-label={`Remove expense ${index+1}`}
                            onClick={()=>set('expenses',value.expenses.filter((_,j)=>j!==index))}><Trash2 size={15}/></button>
                        </td>
                      </tr>
                    );
                  })}
                  {!expenses.length && <tr><td colSpan={7} className="border border-slate-200 p-4 text-center text-slate-500">No expense lines in this copy yet.</td></tr>}
                </tbody>
                <tfoot><tr className="bg-slate-50 font-bold">
                  <td colSpan={5} className="border border-slate-200 p-2 text-right">Copy {pageIndex+1} expenses total</td>
                  <td colSpan={2} className="border border-slate-200 p-2 text-right">{php(expenseTotal)}</td>
                </tr></tfoot>
              </table>
              {pageIndex===pageCount-1 && (
                <button type="button" className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#315c93] px-3 py-2 text-sm font-semibold text-white"
                  onClick={()=>set('expenses',[...value.expenses,blankExpense()])}
                  disabled={value.expenses.length>=2000}>
                  <FilePlus2 size={16}/> Add expense line
                </button>
              )}
            </div>
            <div className="border-t p-4">
              <h4 className="font-bold text-[#173f6b]">Unliquidated Cash Advance from RF</h4>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[650px] border-collapse text-xs">
                  <thead className="bg-[#e5edf5] text-left">
                    <tr>{['Date','Name','Purpose','Amount (PHP)',''].map(h=><th key={h} className="border border-slate-300 p-2">{h}</th>)}</tr>
                  </thead>
                  <tbody>{advances.map((row,i)=>{
                    const index=pageIndex*2+i;
                    return (
                      <tr key={index}>
                        {advanceFields.map(field=>(
                          <td key={field} className="border border-slate-200 p-1">
                            <input className="w-full bg-transparent px-1 py-2"
                              aria-label={`Copy ${pageIndex+1} unliquidated CA ${i+1} ${field}`}
                              type={field==='date'?'date':field==='amount'?'number':'text'}
                              min={field==='amount'?'0.01':undefined} step={field==='amount'?'0.01':undefined}
                              maxLength={160} value={row[field]} onChange={e=>editAdvance(index,field,e.target.value)} />
                          </td>
                        ))}
                        <td className="border border-slate-200 p-1">
                          <button type="button" aria-label={`Remove unliquidated CA ${index+1}`}
                            className="p-2 text-red-600" onClick={()=>set('unliquidatedAdvances',value.unliquidatedAdvances.filter((_,j)=>j!==index))}>
                            <Trash2 size={15}/>
                          </button>
                        </td>
                      </tr>
                    );
                  })}</tbody>
                  <tfoot><tr className="bg-slate-50 font-bold">
                    <td colSpan={3} className="border border-slate-200 p-2 text-right">Unliquidated CA total (this copy)</td>
                    <td colSpan={2} className="border border-slate-200 p-2 text-right">{php(advanceTotal)}</td>
                  </tr></tfoot>
                </table>
              </div>
              {pageIndex===pageCount-1 && (
                <button type="button" className="mt-3 rounded-lg border px-3 py-2 text-sm font-semibold"
                  onClick={()=>set('unliquidatedAdvances',[...value.unliquidatedAdvances,blankAdvance()])}
                  disabled={value.unliquidatedAdvances.length>=200}>+ Add unliquidated CA</button>
              )}
            </div>
          </div>
        );
      })}
      <div className="mt-6 rounded-xl border-2 border-[#315c93] bg-white p-4 sm:p-5" aria-live="polite">
        <h4 className="text-lg font-bold text-[#102a43]">Consolidated totals — final page</h4>
        <p className="mt-1 text-sm text-slate-600">Automatically sums all {pageCount} RF form {pageCount===1?'copy':'copies'}. Amount is passed directly to the RFP request.</p>
        <label className="mt-4 block text-sm font-semibold">Previous Replenishment (not yet received) — PHP
          <input type="number" min="0" step="0.01" className="input mt-1 w-full sm:max-w-sm"
            value={value.previousReplenishment} placeholder="0.00"
            onChange={e=>set('previousReplenishment',e.target.value)} />
        </label>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-lg bg-[#edf4fb] p-3"><dt>All-copy expenses / For Replenishment</dt><dd className="mt-1 text-lg font-bold">{php(totals.expenses)}</dd></div>
          <div className="rounded-lg bg-[#edf4fb] p-3"><dt>All-copy unliquidated CA</dt><dd className="mt-1 text-lg font-bold">{php(totals.unliquidatedAdvances)}</dd></div>
          <div className="rounded-lg bg-slate-100 p-3"><dt>Revolving Fund Amount</dt><dd className="mt-1 text-lg font-bold">{php(totals.revolvingFundAmount)}</dd></div>
          <div className="rounded-lg bg-slate-100 p-3"><dt>Previous Replenishment (not received)</dt><dd className="mt-1 text-lg font-bold">{php(totals.previousReplenishment)}</dd></div>
          <div className="rounded-lg border border-[#315c93] p-3 sm:col-span-2"><dt className="font-bold">Actual Cash On Hand as of {value.cashOnHandAsOf || '—'}</dt>
            <dd className="mt-1 text-xl font-black">{php(totals.cashOnHand)}</dd>
            <p className="mt-1 text-xs text-slate-500">RF amount − total expenses − unliquidated CA − pending replenishment</p></div>
        </dl>
      </div>
    </section>
  );
}
