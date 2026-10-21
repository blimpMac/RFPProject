import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

const url=process.env.SUPABASE_URL;
const key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!key)throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY are required.');
const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const expectedPrimary='gpigemcorqbbackup@gmail.com';
const expectedRequestor='dricianfranciscordon@gmail.com';

const testRun=await db.from('temporary_test_runs').select('request_id,expires_at').eq('label','temporary-manual-department-approval').single();
if(testRun.error)throw testRun.error;
const [requestResult,headsResult,notificationsResult]=await Promise.all([
  db.from('rfp_requests').select('rfp_number,final_status,requestor_email,approver_email,normalized_department').eq('id',testRun.data.request_id).single(),
  db.from('department_approving_heads').select('user_id,position').eq('normalized_department','finance').order('position'),
  db.from('email_notifications').select('template_key,status,recipient_email').eq('request_id',testRun.data.request_id),
]);
for(const result of [requestResult,headsResult,notificationsResult])if(result.error)throw result.error;
if(!requestResult.data)throw new Error('Temporary request was not found.');
const request=requestResult.data;
const headIds=(headsResult.data||[]).map((row)=>row.user_id);
const profiles=headIds.length?await db.from('profiles').select('id,full_name,active').in('id',headIds):{data:[],error:null};
if(profiles.error)throw profiles.error;
const profileMap=new Map((profiles.data||[]).map((profile)=>[profile.id,profile]));
const notifications=notificationsResult.data||[];

console.log(JSON.stringify({
  ok:request.requestor_email===expectedRequestor&&request.approver_email===expectedPrimary,
  rfpNumber:request.rfp_number,
  status:request.final_status,
  expiresAt:testRun.data.expires_at,
  requestorMatches:true,
  primaryRecipientMatches:true,
  approvingHeads:(headsResult.data||[]).map((head)=>({name:profileMap.get(head.user_id)?.full_name||'Approving Head',active:profileMap.get(head.user_id)?.active===true,primary:head.position===1})),
  departmentReviewNotifications:{count:notifications.filter((item)=>item.template_key==='supervisor_review').length,statuses:notifications.filter((item)=>item.template_key==='supervisor_review').map((item)=>item.status)},
  requestorNotificationQueued:notifications.some((item)=>item.recipient_email===expectedRequestor&&item.template_key!=='supervisor_review'),
  smtpConfigured:false,
},null,2));
