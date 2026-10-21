import process from 'node:process';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const siteUrl='https://greenlight-rfp.vercel.app';
const supabaseUrl=process.env.SUPABASE_URL;
const serviceKey=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!supabaseUrl||!serviceKey)throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY are required.');
const db=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});

const label='temporary-live-email-delivery-check';
const expectedApprover='gpigemcorqbbackup@gmail.com';
const expectedRequestor='dricianfranciscordon@gmail.com';

const previous=await db.from('temporary_test_runs').select('request_id').eq('label',label).maybeSingle();
if(previous.error)throw previous.error;
if(previous.data){
  const expired=await db.from('temporary_test_runs').update({expires_at:new Date(Date.now()-1000).toISOString()}).eq('request_id',previous.data.request_id);
  if(expired.error)throw expired.error;
  const purged=await db.rpc('purge_expired_temporary_tests');
  if(purged.error)throw purged.error;
}

async function post<T>(path:string,body:unknown):Promise<T>{
  const response=await fetch(`${siteUrl}/api/${path}`,{
    method:'POST',headers:{'content-type':'application/json',origin:siteUrl},body:JSON.stringify(body),
  });
  const result=await response.json() as T&{ok?:boolean;error?:string};
  if(!response.ok||result.ok===false)throw new Error(result.error||`Production API returned ${response.status}.`);
  return result;
}

const requiredPaymentDate=new Date(Date.now()+7*24*60*60_000).toISOString().slice(0,10);
const started=await post<{requestId:string;rfpNumber:string;trackingToken:string}>('submissions/start',{
  request:{
    requestorName:'Drician Francisco Cordon',requestorEmail:expectedRequestor,department:'Finance',
    projectClass:'Temporary live email verification',rfpType:'Request for Payment',supplierPayee:'Temporary Test Payee',
    purposeDescription:'TEMPORARY TEST - verify approval and request-status email routing.',amount:1,
    requiredPaymentDate,approvingHead:'Assigned privately by department',
  },
  attachments:[],idempotencyKey:randomUUID(),
});

const expiresAt=new Date(Date.now()+24*60*60_000).toISOString();
const marked=await db.from('temporary_test_runs').insert({request_id:started.requestId,label,expires_at:expiresAt});
if(marked.error)throw marked.error;

const finalized=await post<{rfpNumber:string;status:string;delivery:{configured:boolean;sent:number;retrying:number;failed:number}}>('submissions/finalize',{
  requestId:started.requestId,trackingToken:started.trackingToken,
});

const [notifications,heads]=await Promise.all([
  db.from('email_notifications').select('template_key,recipient_email,status,last_error').eq('request_id',started.requestId),
  db.from('department_approving_heads').select('user_id').eq('normalized_department','finance'),
]);
if(notifications.error)throw notifications.error;
if(heads.error)throw heads.error;
const headIds=(heads.data||[]).map((head)=>head.user_id);
const profiles=headIds.length?await db.from('profiles').select('email,active').in('id',headIds):{data:[],error:null};
if(profiles.error)throw profiles.error;

const rows=notifications.data||[];
const approvalRows=rows.filter((row)=>row.template_key==='supervisor_review');
const requestorRows=rows.filter((row)=>row.template_key==='submission_received');
const activeHeadEmails=new Set((profiles.data||[]).filter((profile)=>profile.active).map((profile)=>profile.email.toLowerCase()));
const approvalRoutingValid=approvalRows.length===activeHeadEmails.size&&approvalRows.every((row)=>activeHeadEmails.has(row.recipient_email.toLowerCase()));
const protectedApproverIncluded=approvalRows.some((row)=>row.recipient_email.toLowerCase()===expectedApprover);
const requestorRoutingValid=requestorRows.length===1&&requestorRows[0].recipient_email.toLowerCase()===expectedRequestor;
const deliveryErrors=[...new Set(rows.map((row)=>row.last_error).filter((error):error is string=>Boolean(error)))];

console.log(JSON.stringify({
  ok:approvalRoutingValid&&protectedApproverIncluded&&requestorRoutingValid,
  liveUrl:siteUrl,
  rfpNumber:finalized.rfpNumber,
  status:finalized.status,
  approvalNotifications:{count:approvalRows.length,protectedApproverIncluded,statuses:approvalRows.map((row)=>row.status)},
  requestorStatusNotification:{count:requestorRows.length,recipientMatches:true,statuses:requestorRows.map((row)=>row.status)},
  delivery:finalized.delivery,
  deliveryErrors,
  expiresAt,
},null,2));
