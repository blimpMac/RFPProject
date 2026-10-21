import { seal } from '../lib/crypto.js';
import { HttpError } from '../lib/http.js';
import { adminClient } from '../lib/supabase.js';

type DatabaseClient=ReturnType<typeof adminClient>;

export async function queueSubmissionReceipt(
  db:DatabaseClient,requestId:string,rfpNumber:string,trackingToken:string,
){
  const requestor=await db.from('rfp_requests').select('requestor_email').eq('id',requestId).single();
  if(requestor.error||!requestor.data?.requestor_email){
    throw requestor.error||new HttpError(409,'The requestor email is missing.');
  }
  const queued=await db.from('email_notifications').upsert({
    request_id:requestId,
    template_key:'submission_received',
    recipient_email:requestor.data.requestor_email,
    subject:`${rfpNumber} was submitted`,
    payload:{trackingTokenCiphertext:seal(trackingToken)},
    deduplication_key:`${requestId}:submission_received:requestor`,
  },{onConflict:'deduplication_key',ignoreDuplicates:true});
  if(queued.error)throw queued.error;
}

export async function cancelPendingDepartmentReview(db:DatabaseClient,requestId:string){
  const cancelled=await db.from('email_notifications').update({
    status:'cancelled',last_error:'Request is no longer awaiting department approval',updated_at:new Date().toISOString(),
  }).eq('request_id',requestId).eq('template_key','supervisor_review').in('status',['queued','retry']);
  if(cancelled.error)throw cancelled.error;
}
