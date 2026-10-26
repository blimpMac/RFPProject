import { ClipboardCheck } from 'lucide-react';
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
    <section className="md:col-span-2 rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-900/30">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-[#315c93] shadow-sm dark:bg-slate-800">
          <ClipboardCheck size={18} />
        </span>
        <div>
          <h2 className="text-sm font-semibold">Documents to check before submitting</h2>
          <p className="mt-1 text-xs text-slate-500">{rfpType}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {groups.map((group) => (
          <div
            key={group.label}
            className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"
          >
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              {group.label}
            </p>
            <ul className="mt-2 space-y-2 text-sm">
              {group.items.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span
                    className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400"
                    aria-hidden="true"
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
        Remember to check and prepare the documents listed above before submitting your request.
      </p>
    </section>
  );
}
