import { ClipboardCheck, Info } from 'lucide-react';
import { documentRequirementsFor } from '../../shared/constants/document-requirements';

export function RequestAttachmentChecklist({
  rfpType,
}: {
  rfpType: string;
  selected: string[];
  onChange: (items: string[]) => void;
}) {
  const groups = documentRequirementsFor(rfpType);
  if (!groups) return null;

  return (
    <section className="md:col-span-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/70">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#102a43] text-white shadow-sm dark:bg-[#173f6b]">
          <ClipboardCheck size={19} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            Documents to check before submitting
          </h2>
          <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">{rfpType}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {groups.map((group) => (
          <div
            key={group.label}
            className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/50"
          >
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {group.label}
            </p>
            <ul className="mt-2 space-y-2 text-sm text-slate-700 dark:text-slate-200">
              {group.items.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span
                    className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#0f8f78]"
                    aria-hidden="true"
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div
        className="mt-4 flex items-start gap-2.5 rounded-lg border border-[#b9e2d8] bg-[#edf8f5] px-3 py-2.5 text-sm text-[#125f52] dark:border-[#286b5a] dark:bg-[#12382f] dark:text-[#b6eee1]"
        role="note"
      >
        <Info className="mt-0.5 shrink-0" size={17} aria-hidden="true" />
        <p className="font-medium leading-6">
          Prepare the documents listed above before submitting your request. Missing documents can
          still be submitted later for Finance verification.
        </p>
      </div>
    </section>
  );
}
