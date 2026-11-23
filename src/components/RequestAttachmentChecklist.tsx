import { ClipboardCheck, Info } from 'lucide-react';
import { documentRequirementsFor, hardCopyRequirementFor } from '../../shared/constants/document-requirements';

const isConditional = (item: string) => /\bif\b|if applicable|when applicable/i.test(item.toLowerCase());
const hardCopyLabel = (value: ReturnType<typeof hardCopyRequirementFor>) =>
  value === 'yes' ? 'Yes' : value === 'no' ? 'No' : 'Not specified';

export function RequestAttachmentChecklist({ rfpType, selected, onChange }: {
  rfpType: string; selected: string[]; onChange: (items: string[]) => void;
}) {
  const groups = documentRequirementsFor(rfpType);
  if (!rfpType || groups.length === 0) return null;
  const allItems = groups.flatMap((group) => group.items);
  const checkedCount = allItems.filter((item) => selected.includes(item)).length;
  const progress = allItems.length ? checkedCount / allItems.length * 100 : 0;
  const toggleItem = (item: string, checked: boolean) =>
    onChange(checked ? [...selected, item] : selected.filter((value) => value !== item));

  return (
    <section className="md:col-span-2 min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-700 dark:bg-slate-900/70">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#102a43] text-white dark:bg-[#173f6b]"><ClipboardCheck size={19} /></span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Documents to check before submitting</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{rfpType}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">Hard copy: {hardCopyLabel(hardCopyRequirementFor(rfpType))}</span>
          <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200">{checkedCount} of {allItems.length} checked</span>
        </div>
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="progressbar" aria-label="Document checklist completion" aria-valuemin={0} aria-valuemax={allItems.length} aria-valuenow={checkedCount}>
        <div className="h-full rounded-full bg-[#0f8f78] transition-[width] duration-200" style={{ width: `${progress}%` }} />
      </div>
      <div className="mt-4 grid min-w-0 gap-3 md:grid-cols-2">
        {groups.map((group) => <div key={group.label} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/70 p-3 sm:p-4 dark:border-slate-700 dark:bg-slate-800/45">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">{group.label}</h3>
            <span className="shrink-0 text-xs text-slate-400">{group.items.length} {group.items.length === 1 ? 'item' : 'items'}</span>
          </div>
          {group.items.length ? <ul className="space-y-2">{group.items.map((item) => {
            const checked = selected.includes(item);
            const conditional = isConditional(item);
            return <li key={item}><label className={`flex min-w-0 cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${checked ? 'border-emerald-300 bg-emerald-50/80 dark:border-emerald-800 dark:bg-emerald-950/30' : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900/60 dark:hover:border-slate-500'}`}>
              <input type="checkbox" checked={checked} onChange={(event) => toggleItem(item, event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#0f8f78]" />
              <span className="min-w-0 flex-1"><span className="block text-sm leading-5 text-slate-700 dark:text-slate-200">{item}</span><span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${conditional ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>{conditional ? 'Conditional' : 'Required'}</span></span>
            </label></li>;
          })}</ul> : <p className="rounded-lg border border-dashed border-slate-200 bg-white/70 px-3 py-4 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">No external documents are listed for this request type.</p>}
        </div>)}
      </div>
      <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-[#b9e2d8] bg-[#edf8f5] px-3 py-3 text-sm text-[#125f52] dark:border-[#286b5a] dark:bg-[#12382f] dark:text-[#b6eee1]" role="note">
        <Info className="mt-0.5 shrink-0" size={17} />
        <p className="leading-6">Tick each document you have checked or prepared. Items marked Conditional apply only when relevant. The checklist is a preparation aid and does not replace uploading the actual supporting files.</p>
      </div>
    </section>
  );
}
