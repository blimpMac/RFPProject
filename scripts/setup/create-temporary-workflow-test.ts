import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import { randomToken,seal,sha256 } from '../../server/lib/crypto.js';

const url=process.env.SUPABASE_URL;
const key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!key)throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY are required.');
const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const retentionHours=Number(process.env.TEMP_TEST_RETENTION_HOURS||24);
const testLabel='temporary-manual-department-approval';
const primaryRecipient='gpigemcorqbbackup@gmail.com';
const requestorEmail='dricianfranciscordon@gmail.com';

const purged=await db.rpc('purge_expired_temporary_tests');
if(purged.error)throw purged.error;
const existing=await db.from('temporary_test_runs').select('request_id,expires_at').eq('label',testLabel).gt('expires_at',new Date().toISOString()).maybeSingle();
if(existing.error)throw existing.error;
if(existing.data){
  if(process.env.REPLACE_TEMP_WORKFLOW_TEST==='true'){
    const expired=await db.from('temporary_test_runs').update({expires_at:new Date(Date.now()-1000).toISOString()}).eq('request_id',existing.data.request_id);
    if(expired.error)throw expired.error;
    const removed=await db.rpc('purge_expired_temporary_tests');
    if(removed.error)throw removed.error;
  }else{
  const request=await db.from('rfp_requests').select('rfp_number,final_status').eq('id',existing.data.request_id).single();
  if(request.error)throw request.error;
  console.log(JSON.stringify({ok:true,reused:true,rfpNumber:request.data.rfp_number,status:request.data.final_status,expiresAt:existing.data.expires_at,manualApprovalPath:'/admin/approvals',emailDelivery:'queued only; SMTP intentionally omitted'},null,2));
  process.exit(0);
  }
}

const [profilesResult,rolesResult,headsResult]=await Promise.all([
  db.from('profiles').select('id,email,full_name,active').eq('active',true),
  db.from('user_roles').select('user_id,role'),
  db.from('department_approving_heads').select('department,user_id,position').order('position'),
]);
for(const result of [profilesResult,rolesResult,headsResult])if(result.error)throw result.error;
const profiles=profilesResult.data||[];
const primary=profiles.find((profile)=>profile.email.toLowerCase()===primaryRecipient);
if(!primary)throw new Error('The protected primary approving account is not active.');
const departmentApproverIds=new Set((rolesResult.data||[]).filter((row)=>row.role==='department_approver').map((row)=>row.user_id));
const assignedHeadIds=new Set((headsResult.data||[]).map((row)=>row.user_id));
const secondary=profiles.find((profile)=>assignedHeadIds.has(profile.id)&&departmentApproverIds.has(profile.id)&&profile.full_name?.includes('(Mock)'));
if(!secondary)throw new Error('No active mock Department Approver account was found.');

const userOrder:string[]=[];
const departmentsByUser=new Map<string,string[]>();
for(const row of headsResult.data||[]){
  if(!userOrder.includes(row.user_id))userOrder.push(row.user_id);
  const departments=departmentsByUser.get(row.user_id)||[];
  if(!departments.includes(row.department))departments.push(row.department);
  departmentsByUser.set(row.user_id,departments);
}
if(!userOrder.includes(primary.id))userOrder.unshift(primary.id);
const primaryIndex=userOrder.indexOf(primary.id);
if(primaryIndex>0){userOrder.splice(primaryIndex,1);userOrder.unshift(primary.id)}
const financeName=(headsResult.data||[]).find((row)=>row.department.toLowerCase()==='finance')?.department||'Finance';
for(const userId of [primary.id,secondary.id]){
  const departments=departmentsByUser.get(userId)||[];
  if(!departments.some((department)=>department.toLowerCase()===financeName.toLowerCase()))departments.push(financeName);
  departmentsByUser.set(userId,departments);
}
const assignments=userOrder.map((userId)=>({userId,departments:departmentsByUser.get(userId)||[]}));
const rosterSaved=await db.rpc('set_approving_head_assignments',{p_assignments:assignments,p_actor_user_id:primary.id});
if(rosterSaved.error)throw rosterSaved.error;

const trackingToken=randomToken();
const dueDate=new Date(Date.now()+7*24*60*60_000).toISOString().slice(0,10);
const started=await db.rpc('start_rfp_submission',{
  p_request:{
    requestorName:'Drician Francisco Cordon',requestorEmail,department:financeName,
    projectClass:'Temporary workflow verification',rfpType:'Request for Payment',supplierPayee:'Temporary Test Payee',
    purposeDescription:'TEMPORARY TEST - manual department approval and requestor notification verification.',
    amount:1,requiredPaymentDate:dueDate,approvingHead:'Assigned privately by account',
  },
  p_idempotency_key:randomUUID(),p_tracking_hash:sha256(trackingToken),p_attachments:[],
});
if(started.error)throw started.error;

const reviewToken=randomToken();
const reviewExpiry=new Date(Date.now()+Math.max(retentionHours,1)*60*60_000).toISOString();
const finalized=await db.rpc('finalize_rfp_submission',{
  p_request_id:started.data.requestId,p_review_token_hash:sha256(reviewToken),
  p_review_token_ciphertext:seal(reviewToken),p_review_expires_at:reviewExpiry,
});
if(finalized.error)throw finalized.error;
const expiresAt=new Date(Date.now()+retentionHours*60*60_000).toISOString();
const marked=await db.from('temporary_test_runs').insert({request_id:started.data.requestId,label:testLabel,expires_at:expiresAt});
if(marked.error)throw marked.error;

console.log(JSON.stringify({
  ok:true,reused:false,rfpNumber:finalized.data.rfpNumber,status:finalized.data.status,
  department:financeName,approvingHeads:['Protected Administrator',secondary.full_name||'Active Department Approver'],
  expiresAt,manualApprovalPath:'/admin/approvals',emailDelivery:'queued only; SMTP intentionally omitted',
},null,2));
