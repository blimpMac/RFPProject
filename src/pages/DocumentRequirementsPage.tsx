import { useMemo, useState } from 'react';
import { ClipboardList, Search, Printer, Info } from 'lucide-react';
import { documentRequirementsFor, hardCopyRequirementFor } from '../../shared/constants/document-requirements';
import { rfpRequestTypes } from '../../shared/constants/request-types';

type HardCopyFilter = 'all' | 'yes' | 'no' | 'unspecified';
const hardCopyText = (value: ReturnType<typeof hardCopyRequirementFor>) => value === 'yes' ? 'Required' : value === 'no' ? 'Not required' : 'Not specified';
const hardCopyClass = (value: ReturnType<typeof hardCopyRequirementFor>) => value === 'yes'
  ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
  : value === 'no' ? 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
  : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200';
const isConditional = (item: string) => /\bif\b|if applicable|when applicable/i.test(item.toLowerCase());

export function DocumentRequirementsPage() {
  const [search, setSearch] = useState('');
  const [hardCopyFilter, setHardCopyFilter] = useState<HardCopyFilter>('all');
  const filteredTypes = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rfpRequestTypes.filter((type) => {
      const groups = documentRequirementsFor(type);
      const matches = !query || [type, ...groups.flatMap((group) => [group.label, ...group.items])].some((value) => value.toLowerCase().includes(query));
      return matches && (hardCopyFilter === 'all' || hardCopyRequirementFor(type) === hardCopyFilter);
    });
  }, [hardCopyFilter, search]);

  return <div className="document-requirements-page space-y-5">
    <section className="dashboard-hero !flex !flex-col !items-stretch gap-4 lg:!flex-row lg:!items-center lg:!justify-between">
      <div className="min-w-0 flex-1"><p className="eyebrow">RFP reference guide</p><h2 className="mt-2 flex items-center gap-2.5 text-2xl font-semibold leading-tight sm:text-3xl"><ClipboardList size={24} />Document Requirements</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Review the internal and external documents for each request type, including whether a hard copy is required.</p></div>
      <button type="button" className="btn btn-secondary inline-flex w-full items-center justify-center gap-2 sm:w-auto" onClick={() => window.print()}><Printer size={16} />Print guide</button>
    </section>
    <section className="card grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_14rem] md:items-end">
      <div className="field min-w-0"><label htmlFor="requirements-search">Search request types or documents</label><div className="relative"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input id="requirements-search" className="input !pl-10" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search a document, supplier type, or keyword" /></div></div>
      <div className="field min-w-0"><label htmlFor="hard-copy-filter">Hard-copy requirement</label><select id="hard-copy-filter" className="input" value={hardCopyFilter} onChange={(event) => setHardCopyFilter(event.target.value as HardCopyFilter)}><option value="all">All request types</option><option value="yes">Hard copy required</option><option value="no">Hard copy not required</option><option value="unspecified">Not specified</option></select></div>
    </section>
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-slate-500">Showing <strong className="text-slate-800 dark:text-slate-100">{filteredTypes.length}</strong> of {rfpRequestTypes.length} request types</p>{(search || hardCopyFilter !== 'all') && <button type="button" className="text-sm font-semibold text-[#08735e] hover:underline dark:text-emerald-300" onClick={() => { setSearch(''); setHardCopyFilter('all'); }}>Clear filters</button>}</div>
    {filteredTypes.length ? <section className="grid min-w-0 gap-4 md:grid-cols-2 2xl:grid-cols-3">{filteredTypes.map((type) => {
      const groups = documentRequirementsFor(type); const hardCopy = hardCopyRequirementFor(type);
      return <article key={type} className="card flex min-w-0 flex-col gap-4 p-4 sm:p-5">
        <header className="flex min-w-0 flex-col gap-2 border-b border-slate-100 pb-3 dark:border-slate-700 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Request type</p><h3 className="mt-1 break-words text-base font-semibold text-slate-900 dark:text-slate-100">{type}</h3></div><span className={`inline-flex w-fit max-w-full shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${hardCopyClass(hardCopy)}`}>Hard copy: {hardCopyText(hardCopy)}</span></header>
        <div className="grid min-w-0 gap-3">{groups.map((group) => <section key={group.label} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/45"><div className="mb-2 flex items-center justify-between gap-2"><h4 className="text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">{group.label}</h4><span className="shrink-0 text-xs text-slate-400">{group.items.length} {group.items.length === 1 ? 'item' : 'items'}</span></div>{group.items.length ? <ul className="space-y-2">{group.items.map((item) => <li key={item} className="flex min-w-0 items-start gap-2.5"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#0f8f78]" /><span className="min-w-0 flex-1 text-sm leading-5 text-slate-700 dark:text-slate-200">{item}</span>{isConditional(item) && <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">If applicable</span>}</li>)}</ul> : <p className="text-sm text-slate-500 dark:text-slate-400">No external documents listed.</p>}</section>)}</div>
      </article>;
    })}</section> : <section className="card p-10 text-center"><ClipboardList className="mx-auto text-slate-400" size={30} /><h3 className="mt-3 font-semibold text-slate-800 dark:text-slate-100">No matching requirements</h3><p className="mt-1 text-sm text-slate-500">Try another search term or clear the hard-copy filter.</p></section>}
    <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300" role="note"><Info size={17} className="mt-1 shrink-0" /><p>Hard-copy labels are based on the supplied requirements matrix. Request types not listed in that matrix are marked Not specified rather than assuming a rule. Items marked conditionally apply only when relevant; Finance may request additional documents during verification.</p></div>
  </div>;
}
