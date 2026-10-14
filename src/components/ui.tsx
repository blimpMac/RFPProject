import type { ButtonHTMLAttributes,ReactNode } from 'react';
import clsx from 'clsx';
import { statusTone } from '../lib/format';

export function Button({className,variant='primary',...props}:ButtonHTMLAttributes<HTMLButtonElement>&{variant?:'primary'|'secondary'|'danger'}){return <button className={clsx('btn focus-ring',`btn-${variant}`,className)} {...props}/>}
export function StatusBadge({children}:{children:ReactNode}){const text=String(children??'');return <span className={`status status-${statusTone(text)}`}>{text||'—'}</span>}
export function Spinner({label='Loading'}:{label?:string}){return <span className="inline-flex items-center gap-2"><span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent"/><span>{label}</span></span>}
export function EmptyState({title,body}:{title:string;body:string}){return <div className="px-6 py-14 text-center"><h3 className="font-semibold text-slate-700">{title}</h3><p className="mt-1 text-sm text-slate-500">{body}</p></div>}
export function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}){return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true"><div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-xl bg-white shadow-2xl"><div className="sticky top-0 flex items-center justify-between border-b bg-white px-5 py-4"><h2 className="text-lg font-semibold">{title}</h2><button className="rounded p-2 text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label="Close">×</button></div><div className="p-5">{children}</div></div></div>}
