import { useCallback,useEffect,useMemo,useState } from 'react';
import { Check,FileQuestion } from 'lucide-react';
import { Button,EmptyState,Modal,Spinner,StatusBadge } from '../components/ui';
import { useAuth } from '../components/AuthProvider';
import { get,post } from '../lib/api';
import { manilaDate,php } from '../lib/format';
import type { RfpRequest } from '../types';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { AttachmentPreviewSection } from '../components/AttachmentPreviewSection';

type Result={rows:RfpRequest[]};
type Action={value:string;label:string};

const financeActionOptions=(status:string):Action[]=>{
  if(['Pending Finance Review','Documentation Required'].includes(status))return[{value:'approve',label:'Approve and start processing'},{value:'reject',label:'Return to Department Approver'},{value:'request_documents',label:'Request documents'}];
  if(['Approved for Payment','Payment Processing'].includes(status))return[{value:'payment_processing',label:'Start processing'}];
  if(status==='Processing')return[{value:'check_preparation',label:'Prepare check and documents'}];
  if(status==='Check Preparation')return[{value:'awaiting_signatory',label:'Send for check approval'}];
  if(['Check Approval','Awaiting Signatory'].includes(status))return[{value:'check_released',label:'Record check release'}];
  if(['Check Released','Payment Released'].includes(status))return[{value:'payment_released',label:'Mark payment completed'}];
  return[];
};

export function ApprovalsPage(){
  const{roles}=useAuth();
  const[rows,setRows]=useState<RfpRequest[]>([]);const[loading,setLoading]=useState(true);const[error,setError]=useState('');const[selected,setSelected]=useState<RfpRequest>();const[action,setAction]=useState('');const[remarks,setRemarks]=useState('');const[checkDate,setCheckDate]=useState('');const[reason,setReason]=useState('');const[busy,setBusy]=useState(false);const[view,setView]=useState<'pending'|'completed'>('pending');
  const load=useCallback(()=>get<Result>('monitoring/requests?page=1&pageSize=200').then((result)=>{setRows(result.rows);setError('')}).catch((cause)=>setError(cause.message)).finally(()=>setLoading(false)),[]);
  useEffect(()=>{void load()},[load]);
  useAutoRefresh(load);
  const visibleRows=useMemo(()=>rows.filter((request)=>view==='pending'?!/paid|returned to requestor/i.test(request.final_status):/paid|returned to requestor/i.test(request.final_status)),[rows,view]);
  const finance=roles.some((role)=>['super_administrator','administrator','finance_reviewer'].includes(role));
  const department=roles.some((role)=>['super_administrator','administrator','department_approver'].includes(role));
  const departmentReturn=selected?.final_status==='Returned to Department Approver';
  const departmentPending=selected?.final_status==='Pending Department Approval';
  const departmentStage=departmentPending||departmentReturn;
  const choices=selected?(departmentStage&&department?[{value:'department_approve',label:departmentReturn?'Re-approve and return to Finance':'Approve and send to Finance'},{value:'department_reject',label:'Return to Requestor'}]:finance?financeActionOptions(selected.final_status):[]):[];
  const departmentAction=action.startsWith('department_');
  const needsTarget=['approve','payment_processing'].includes(action);

  const save=async()=>{
    if(!selected||!action)return;
    if(needsTarget&&!checkDate&&!selected.planned_check_date){setError('A target release date is required before processing can begin.');return}
    if(action==='department_reject'&&!remarks.trim()){setError('Remarks are required when returning a request to the Requestor.');return}
    setBusy(true);setError('');
    try{
      if(departmentAction)await post('department/action',{requestId:selected.id,decision:action==='department_approve'?'approve':'reject',remarks});
      else await post('finance/action',{requestId:selected.id,action,remarks,plannedCheckDate:checkDate||null,changeReason:reason||null});
      setSelected(undefined);setAction('');setRemarks('');setCheckDate('');setReason('');await load();
    }catch(cause){setError(cause instanceof Error?cause.message:'Action failed.')}finally{setBusy(false)}
  };

  if(loading)return <Spinner/>;
  return <div className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold">Approvals</h1><p className="text-sm text-slate-500">Department approval, finance review, processing, check approval, release, and payment completion.</p></div><span className="live-refresh-indicator">Live · refreshes every 15 seconds</span></div>
    <div className="flex gap-2"><Button variant={view==='pending'?'primary':'secondary'} onClick={()=>setView('pending')}>Pending</Button><Button variant={view==='completed'?'primary':'secondary'} onClick={()=>setView('completed')}>Completed / Requestor correction</Button></div>
    {error&&<p className="rounded bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
    <div className="card overflow-hidden"><div className="divide-y">{visibleRows.map((request)=><div className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center" key={request.id}><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{request.rfp_number}</p><StatusBadge>{request.final_status}</StatusBadge></div><p className="mt-1 text-sm text-slate-600">{request.requestor_name} · {request.department} · {request.supplier_payee}</p><p className="mt-1 text-xs text-slate-500">Submitted {manilaDate(request.submitted_at,true)} · {php.format(request.amount)}</p></div><Button variant="secondary" onClick={()=>{setSelected(request);setAction('');setCheckDate(request.planned_check_date||'');setError('')}}>Open request</Button></div>)}</div>{!visibleRows.length&&<EmptyState title="No requests" body={`There are no ${view} approvals in this view.`}/>}</div>
    {selected&&<Modal title={selected.rfp_number} onClose={()=>setSelected(undefined)}><div className="grid gap-4 sm:grid-cols-2">{[['Requestor',selected.requestor_name],['Department',selected.department],['Supplier / Payee',selected.supplier_payee],['Amount',php.format(selected.amount)],['Required date',manilaDate(selected.required_payment_date)],['Current stage',selected.final_status],['Approving heads',selected.approving_head],['Department approval',selected.department_approval],['Finance review',selected.finance_review],['Purpose',selected.purpose_description]].map(([key,value])=><div key={key} className={key==='Purpose'||key==='Approving heads'?'sm:col-span-2':''}><p className="text-xs font-semibold uppercase text-slate-500">{key}</p><p className="mt-1 text-sm">{value}</p></div>)}</div><AttachmentPreviewSection requestId={selected.id}/>{choices.length>0&&<div className="mt-6 border-t pt-5"><h3 className="font-semibold">Next workflow action</h3><div className="mt-3 grid gap-3 sm:grid-cols-2"><select className="input sm:col-span-2" value={action} onChange={(event)=>setAction(event.target.value)}><option value="">Select action…</option>{choices.map((choice)=><option key={choice.value} value={choice.value}>{choice.label}</option>)}</select>{!departmentStage&&<><div className="field sm:col-span-2"><label htmlFor="target-date">Target release date{needsTarget?' *':''}</label><input id="target-date" className="input" type="date" value={checkDate} onChange={(event)=>setCheckDate(event.target.value)}/></div><input className="input sm:col-span-2" placeholder="Reason for changing target date" value={reason} onChange={(event)=>setReason(event.target.value)}/></>}<textarea className="input min-h-24 sm:col-span-2" placeholder={departmentAction?'Remarks (required when returning to requestor)':'Remarks'} value={remarks} onChange={(event)=>setRemarks(event.target.value)}/></div><div className="mt-4 flex justify-end"><Button onClick={()=>void save()} disabled={!action||busy}>{busy?<Spinner label="Saving"/>:<><Check size={17}/>Save action</>}</Button></div></div>}{(finance||department)&&!choices.length&&<p className="mt-5 rounded bg-slate-50 p-3 text-sm text-slate-600">No further system action is available for this status.</p>}{!finance&&!department&&<p className="mt-5 rounded bg-blue-50 p-3 text-sm text-blue-800"><FileQuestion className="mr-2 inline" size={16}/>Department decisions are completed through the secure email review link.</p>}</Modal>}
  </div>;
}
