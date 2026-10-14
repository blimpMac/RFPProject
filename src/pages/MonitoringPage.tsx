import { useEffect,useState } from 'react';
import { DataTable } from '../components/DataTable';
import { Spinner } from '../components/ui';
import { get } from '../lib/api';
import { useAuth } from '../components/AuthProvider';

const tabs=[['requests','RFP Tracker'],['forms','Form Responses'],['approvers','Approver Master'],['logs','Approval Log'],['flow','Recommended Process Flow']] as const;
const defaults:Record<string,string[]>={
  requests:['rfp_number','submitted_at','requestor_name','department','supplier_payee','amount','department_approval','finance_review','final_status'],
  forms:['source_timestamp','requestor_email','requestor_name','department','project_class','rfp_type','supplier_payee','amount','match_status'],
  approvers:['department','approver_name','approver_email','active'],logs:['occurred_at','rfp_number','action','actor_email','remarks','previous_status','new_status'],
  flow:['stage','activity','responsible_party','required_action','target'],
};
type Result={rows:Record<string,unknown>[];count:number;page:number;pageSize:number};
export function MonitoringPage(){const{roles}=useAuth();const available=tabs.filter(([key])=>roles.includes('administrator')||!['forms','approvers'].includes(key));const[tab,setTab]=useState(available[0]?.[0]||'requests');const[page,setPage]=useState(1);const[pageSize,setPageSize]=useState(50);const[data,setData]=useState<Result>();const[error,setError]=useState('');const[loading,setLoading]=useState(true);useEffect(()=>{setLoading(true);setError('');get<Result>(`monitoring/${tab}?page=${page}&pageSize=${pageSize}`).then(setData).catch((e)=>setError(e.message)).finally(()=>setLoading(false))},[tab,page,pageSize]);const change=(key:string)=>{setTab(key as typeof tab);setPage(1)};return <div className="space-y-4"><div><h1 className="text-2xl font-semibold">Monitoring Sheets</h1><p className="text-sm text-slate-500">Workbook-style access to live Supabase records.</p></div><div className="overflow-x-auto border-b"><div className="flex min-w-max">{available.map(([key,label])=><button key={key} onClick={()=>change(key)} className={`border-b-2 px-4 py-3 text-sm font-medium ${tab===key?'border-[#173f6b] text-[#173f6b]':'border-transparent text-slate-500 hover:text-slate-800'}`}>{label}</button>)}</div></div>{loading?<div className="card p-10 text-center"><Spinner/></div>:error?<p className="rounded bg-red-50 p-4 text-red-700">{error}</p>:<DataTable key={tab} rows={data?.rows||[]} total={data?.count||0} page={page} pageSize={pageSize} onPage={setPage} onPageSize={(n)=>{setPageSize(n);setPage(1)}} defaultKeys={defaults[tab]} title={tabs.find(([k])=>k===tab)?.[1]||tab}/>}</div>}
