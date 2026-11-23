import { ClipboardList, FileText, Printer } from 'lucide-react';
import {
  documentRequirementsFor,
  hardCopyRequirementFor,
} from '../../shared/constants/document-requirements';

const isOptionalRequirement = (item: string) =>
  /\bif\b|\bwhen\b|\bwhere applicable\b|\bas applicable\b|\boptional\b/i.test(item);


export function RequestSupportingDocuments({ rfpType }: { rfpType: string }) {
  if (!rfpType) return null;

  const groups = documentRequirementsFor(rfpType);
  const hardCopy = hardCopyRequirementFor(rfpType);

  return (
    <section className="md:col-span-2 min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-700 dark:bg-slate-900/70">
      <header className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#102a43] text-white dark:bg-[#173f6b]">
            <ClipboardList size={19} />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Required and Optional Documents
            </h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{rfpType}</p>
          </div>
        </div>
        {hardCopy === 'yes' && (
          <span
            role="img"
            aria-label="Hard copy required"
            title="Hard copy required"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
          >
            <Printer size={16} aria-hidden="true" />
          </span>
        )}
      </header>

      {groups.length ? (
        <div className="mt-4 grid min-w-0 gap-3 md:grid-cols-2">
          {groups.map((group) => {
            const requiredItems = group.items.filter((item) => !isOptionalRequirement(item));
            const optionalItems = group.items.filter(isOptionalRequirement);

            return (
              <section
                key={group.label}
                className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/70 p-3 sm:p-4 dark:border-slate-700 dark:bg-slate-800/45"
              >
                <h4 className="text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                  {group.label}
                </h4>

                <div className="mt-3 space-y-4">
                  {requiredItems.length > 0 && (
                    <div>
                      <div className="mb-2 flex items-center gap-2">
                        <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-600" />
                        <h5 className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                          Required
                        </h5>
                      </div>
                      <ul className="space-y-2">
                        {requiredItems.map((item) => (
                          <li key={item} className="flex min-w-0 items-start gap-2.5">
                            <FileText
                              size={15}
                              className="mt-0.5 shrink-0 text-slate-400"
                              aria-hidden="true"
                            />
                            <span className="min-w-0 flex-1 text-sm leading-5 text-slate-700 dark:text-slate-200">
                              {item}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {optionalItems.length > 0 && (
                    <div>
                      <div className="mb-2 flex items-center gap-2">
                        <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                        <h5 className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                          Optional / If applicable
                        </h5>
                      </div>
                      <ul className="space-y-2">
                        {optionalItems.map((item) => (
                          <li key={item} className="flex min-w-0 items-start gap-2.5">
                            <FileText
                              size={15}
                              className="mt-0.5 shrink-0 text-slate-400"
                              aria-hidden="true"
                            />
                            <span className="min-w-0 flex-1 text-sm leading-5 text-slate-700 dark:text-slate-200">
                              {item}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {group.items.length === 0 && (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      No documents listed for this category.
                    </p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          No document requirements are configured for this request type yet.
        </p>
      )}

    </section>
  );
}
