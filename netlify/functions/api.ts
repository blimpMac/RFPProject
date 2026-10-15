import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { adminClient } from '../lib/supabase.js';
import { config } from '../lib/config.js';
import { randomToken, seal, sha256 } from '../lib/crypto.js';
import { assertSameOrigin, ensureMethod, HttpError, json, readJson, responseError, routeOf } from '../lib/http.js';
import { requireStaff } from '../lib/auth.js';
import { enforceSubmissionLimit } from '../lib/rate-limit.js';
import { completeAttachmentSchema, decisionSchema, finalizeSchema, financeSchema, startSchema } from '../lib/validation.js';

const tableMap: Record<string,{table:string;order:string;roles?:string[]}> = {
  requests:{table:'rfp_requests',order:'submitted_at'}, forms:{table:'form_responses',order:'source_timestamp',roles:['administrator']},
  approvers:{table:'approvers',order:'department',roles:['administrator']}, logs:{table:'approval_logs',order:'occurred_at'}, flow:{table:'process_flow_steps',order:'display_order'},
  documents:{table:'request_attachments',order:'created_at',roles:['administrator','finance_reviewer']},
};

export const handler: Handler = async (event) => {
  try {
    assertSameOrigin(event);
    const route=routeOf(event); const db=adminClient(); const c=config();
    if(route==='public-config'){
      ensureMethod(event,'GET');
      const {data}=await db.from('system_settings').select('value').eq('key','submission_options').single();
      const {data:approvers}=await db.from('approvers').select('department,approver_name').eq('active',true).order('department');
      return json(200,{ok:true,options:data?.value||{},approvers:approvers||[],limits:{maxFiles:c.MAX_UPLOAD_FILES,maxSizeMb:c.MAX_UPLOAD_SIZE_MB}});
    }
    if(route==='submissions/start'){
      ensureMethod(event,'POST'); await enforceSubmissionLimit(event);
      const input=startSchema.parse(readJson(event));
      if(input.attachments.length>c.MAX_UPLOAD_FILES||input.attachments.some((f)=>f.size>c.MAX_UPLOAD_SIZE_MB*1024*1024)) throw new HttpError(400,'Attachment limit exceeded.');
      const{data:optionRow,error:optionError}=await db.from('system_settings').select('value').eq('key','submission_options').single();if(optionError)throw optionError;const optionValue=optionRow.value as {departments?:string[];requestTypes?:string[]};const norm=(value:string)=>value.replace(/^[-–—\s]+/,'').trim().toLowerCase();if(!optionValue.departments?.some((v)=>norm(v)===norm(input.request.department))||!optionValue.requestTypes?.some((v)=>norm(v)===norm(input.request.rfpType)))throw new HttpError(400,'Department or RFP type is not an allowed option.');
      const trackingToken=randomToken();
      const {data,error}=await db.rpc('start_rfp_submission',{p_request:input.request,p_idempotency_key:input.idempotencyKey,p_tracking_hash:sha256(trackingToken),p_attachments:input.attachments});
      if(error) throw new HttpError(400,error.message);
      const {data:items,error:itemError}=await db.from('request_attachments').select('id,original_filename,storage_path').eq('request_id',data.requestId).order('created_at');
      if(itemError) throw itemError;
      const uploads=[];
      for(const item of items||[]){ const signed=await db.storage.from('rfp-attachments').createSignedUploadUrl(item.storage_path); if(signed.error) throw signed.error; uploads.push({id:item.id,name:item.original_filename,path:item.storage_path,token:signed.data.token}); }
      return json(200,{ok:true,...data,trackingToken,uploads});
    }
    if(route==='submissions/attachment-complete'){
      ensureMethod(event,'POST'); const input=completeAttachmentSchema.parse(readJson(event));
      const {data:req}=await db.from('rfp_requests').select('id').eq('id',input.requestId).eq('public_tracking_hash',sha256(input.trackingToken)).single();
      if(!req) throw new HttpError(403,'Invalid submission credential.');
      const {data:item}=await db.from('request_attachments').select('*').eq('id',input.attachmentId).eq('request_id',input.requestId).single();
      if(!item?.storage_path) throw new HttpError(404,'Attachment record not found.');
      const folder=input.requestId; const filename=item.storage_path.slice(folder.length+1);
      const listed=await db.storage.from('rfp-attachments').list(folder,{search:filename,limit:10});
      const object=listed.data?.find((f)=>f.name===filename); if(!object) throw new HttpError(409,'The upload was not found in private storage.');
      const {error}=await db.from('request_attachments').update({status:'available',uploaded_at:new Date().toISOString()}).eq('id',item.id); if(error) throw error;
      return json(200,{ok:true});
    }
    if(route==='submissions/finalize'){
      ensureMethod(event,'POST'); const input=finalizeSchema.parse(readJson(event));
      const {data:req}=await db.from('rfp_requests').select('id').eq('id',input.requestId).eq('public_tracking_hash',sha256(input.trackingToken)).single();
      if(!req) throw new HttpError(403,'Invalid submission credential.');
      const reviewToken=randomToken(); const expires=new Date(Date.now()+c.REVIEW_TOKEN_HOURS*60*60_000).toISOString();
      const {data,error}=await db.rpc('finalize_rfp_submission',{p_request_id:input.requestId,p_review_token_hash:sha256(reviewToken),p_review_token_ciphertext:seal(reviewToken),p_review_expires_at:expires});
      if(error) throw new HttpError(409,error.message);
      return json(200,{ok:true,...data});
    }
    if(route.startsWith('track/')){
      ensureMethod(event,'GET');const token=decodeURIComponent(route.slice(6));if(token.length<20)throw new HttpError(403,'Invalid tracking credential.');
      const{data:req,error}=await db.from('rfp_requests').select('id,rfp_number,submitted_at,requestor_name,department,amount,required_payment_date,department_approval,finance_review,final_status,last_action,planned_check_date').eq('public_tracking_hash',sha256(token)).single();if(error||!req)throw new HttpError(404,'Request not found.');
      const[{data:logs},{data:attachments}]=await Promise.all([db.from('approval_logs').select('occurred_at,action,remarks,new_status').eq('request_id',req.id).order('occurred_at'),db.from('request_attachments').select('id,original_filename,mime_type,status').eq('request_id',req.id)]);
      return json(200,{ok:true,request:req,logs:logs||[],attachments:attachments||[]});
    }
    if(route.startsWith('review/')){
      const token=decodeURIComponent(route.slice(7));
      if(event.httpMethod==='GET'){
        const {data:tok}=await db.from('approval_tokens').select('request_id,expires_at,used_at,revoked_at').eq('token_hash',sha256(token)).single();
        if(!tok||tok.used_at||tok.revoked_at||new Date(tok.expires_at)<new Date()) throw new HttpError(410,'This review link is invalid, expired, or already used.');
        const {data:req,error}=await db.from('rfp_requests').select('id,rfp_number,requestor_name,requestor_email,department,project_class,rfp_type,supplier_payee,purpose_description,amount,required_payment_date,final_status').eq('id',tok.request_id).single(); if(error) throw error;
        const {data:attachments,error:attachmentError}=await db.from('request_attachments').select('id,original_filename,mime_type,storage_path').eq('request_id',tok.request_id).eq('status','available');
        if(attachmentError)throw attachmentError;
        const previews=await Promise.all((attachments||[]).map(async(item)=>{
          if(!item.storage_path)return{id:item.id,original_filename:item.original_filename,mime_type:item.mime_type,url:null};
          const signed=await db.storage.from('rfp-attachments').createSignedUrl(item.storage_path,900,{download:item.original_filename});
          if(signed.error)throw signed.error;
          return{id:item.id,original_filename:item.original_filename,mime_type:item.mime_type,url:signed.data.signedUrl};
        }));
        return json(200,{ok:true,request:req,attachments:previews});
      }
      if(event.httpMethod==='POST'){
        const input=decisionSchema.parse({...readJson(event) as object,token});
        const {data,error}=await db.rpc('consume_department_review',{p_token_hash:sha256(input.token),p_decision:input.decision,p_remarks:input.remarks});
        if(error) throw new HttpError(409,error.message); return json(200,{ok:true,request:data});
      }
      throw new HttpError(405,'Method not allowed.');
    }
    if(route==='me'){
      ensureMethod(event,'GET'); const staff=await requireStaff(event); return json(200,{ok:true,user:{id:staff.user.id,email:staff.user.email},roles:staff.roles});
    }
    if(route==='dashboard'){
      ensureMethod(event,'GET'); const staff=await requireStaff(event);
      let requestQuery=db.from('rfp_requests').select('id,rfp_number,submitted_at,department,amount,final_status,department_approval_at,finance_review_at').not('submitted_at','is',null).order('submitted_at',{ascending:false}).limit(5000);
      const departmentOnly=staff.roles.includes('department_approver')&&!staff.roles.some((r)=>['administrator','finance_reviewer'].includes(r));
      if(departmentOnly)requestQuery=requestQuery.eq('approver_email',staff.user.email||'');
      const [{data:metrics,error},{data:requests}]=await Promise.all([db.from('dashboard_metrics').select('*').single(),requestQuery]); if(error) throw error;
      const requestIds=(requests||[]).map((r)=>r.id);let logsQuery=db.from('approval_logs').select('*').order('occurred_at',{ascending:false}).limit(8);if(departmentOnly)logsQuery=requestIds.length?logsQuery.in('request_id',requestIds):logsQuery.eq('request_id','00000000-0000-0000-0000-000000000000');const{data:logs}=await logsQuery;
      return json(200,{ok:true,metrics,requests:requests||[],recentActivity:logs||[]});
    }
    if(route.startsWith('monitoring/')){
      ensureMethod(event,'GET'); const key=route.slice(11); const spec=tableMap[key]; if(!spec) throw new HttpError(404,'Worksheet not found.');
      const staff=await requireStaff(event,spec.roles);
      const page=Math.max(1,Number(event.queryStringParameters?.page)||1),pageSize=Math.min(200,Math.max(10,Number(event.queryStringParameters?.pageSize)||50));
      let query=db.from(spec.table).select('*',{count:'exact'}).order(spec.order,{ascending:false}).range((page-1)*pageSize,page*pageSize-1);
      if(key==='requests'&&staff.roles.includes('department_approver')&&!staff.roles.some((r)=>['administrator','finance_reviewer'].includes(r))) query=query.eq('approver_email',staff.user.email || '');
      if(key==='logs'&&staff.roles.includes('department_approver')&&!staff.roles.some((r)=>['administrator','finance_reviewer'].includes(r))){const assigned=await db.from('rfp_requests').select('id').eq('approver_email',staff.user.email||'');const ids=(assigned.data||[]).map((r)=>r.id);query=ids.length?query.in('request_id',ids):query.eq('request_id','00000000-0000-0000-0000-000000000000')}
      const {data,error,count}=await query; if(error) throw error; return json(200,{ok:true,rows:data||[],count,page,pageSize});
    }
    if(route==='finance/action'){
      ensureMethod(event,'POST'); const staff=await requireStaff(event,['administrator','finance_reviewer']); const input=financeSchema.parse(readJson(event));
      const {data,error}=await db.rpc('finance_workflow_action',{p_request_id:input.requestId,p_action:input.action,p_remarks:input.remarks,p_actor_email:staff.user.email,p_actor_user_id:staff.user.id,p_planned_check_date:input.plannedCheckDate||null,p_change_reason:input.changeReason||null}); if(error) throw new HttpError(409,error.message); return json(200,{ok:true,request:data});
    }
    if(route==='attachments/url'){
      ensureMethod(event,'POST'); await requireStaff(event); const input=z.object({attachmentId:z.uuid()}).parse(readJson(event));
      const {data:item}=await db.from('request_attachments').select('storage_path').eq('id',input.attachmentId).eq('status','available').single(); if(!item?.storage_path) throw new HttpError(404,'Document not found.');
      const signed=await db.storage.from('rfp-attachments').createSignedUrl(item.storage_path,300); if(signed.error) throw signed.error; return json(200,{ok:true,url:signed.data.signedUrl});
    }
    if(route==='approvers'){
      const staff=await requireStaff(event,['administrator']); void staff;
      if(event.httpMethod==='POST'){ const input=z.object({department:z.string().min(1).max(100),approverName:z.string().min(2).max(160),approverEmail:z.email(),active:z.boolean().default(true)}).parse(readJson(event)); const {data,error}=await db.from('approvers').insert({department:input.department,approver_name:input.approverName,approver_email:input.approverEmail,active:input.active}).select().single(); if(error) throw new HttpError(409,error.message); return json(201,{ok:true,approver:data}); }
      if(event.httpMethod==='PATCH'){ const input=z.object({id:z.uuid(),department:z.string().min(1).max(100),approverName:z.string().min(2).max(160),approverEmail:z.email(),active:z.boolean()}).parse(readJson(event)); const {data,error}=await db.from('approvers').update({department:input.department,approver_name:input.approverName,approver_email:input.approverEmail,active:input.active}).eq('id',input.id).select().single(); if(error) throw new HttpError(409,error.message); return json(200,{ok:true,approver:data}); }
      throw new HttpError(405,'Method not allowed.');
    }
    if(route==='staff-users'){
      await requireStaff(event,['administrator']);
      if(event.httpMethod==='GET'){
        const listed=await db.auth.admin.listUsers({page:1,perPage:1000}); if(listed.error) throw listed.error;
        const {data:roleRows,error}=await db.from('user_roles').select('user_id,role'); if(error) throw error;
        const users=listed.data.users.map((user)=>({id:user.id,email:user.email,createdAt:user.created_at,lastSignInAt:user.last_sign_in_at,roles:(roleRows||[]).filter((r)=>r.user_id===user.id).map((r)=>r.role)}));
        return json(200,{ok:true,users});
      }
      if(event.httpMethod==='POST'){
        const input=z.object({email:z.email(),roles:z.array(z.enum(['administrator','department_approver','finance_reviewer'])).min(1)}).parse(readJson(event));
        const invited=await db.auth.admin.inviteUserByEmail(input.email,{redirectTo:`${c.SITE_URL}/admin/login`}); if(invited.error) throw new HttpError(409,invited.error.message);
        const {error}=await db.from('user_roles').insert(input.roles.map((role)=>({user_id:invited.data.user.id,role}))); if(error) throw error;
        return json(201,{ok:true,user:{id:invited.data.user.id,email:invited.data.user.email,roles:input.roles}});
      }
      if(event.httpMethod==='PATCH'){
        const input=z.object({userId:z.uuid(),roles:z.array(z.enum(['administrator','department_approver','finance_reviewer'])).min(1)}).parse(readJson(event));
        const {error:deleteError}=await db.from('user_roles').delete().eq('user_id',input.userId); if(deleteError) throw deleteError;
        const {error}=await db.from('user_roles').insert(input.roles.map((role)=>({user_id:input.userId,role}))); if(error) throw error;
        return json(200,{ok:true});
      }
      throw new HttpError(405,'Method not allowed.');
    }
    if(route==='settings'){
      await requireStaff(event,['administrator']);
      if(event.httpMethod==='GET'){const{data,error}=await db.from('system_settings').select('*').order('key');if(error)throw error;return json(200,{ok:true,settings:data||[]});}
      if(event.httpMethod==='PATCH'){const input=z.object({key:z.enum(['workflow_targets','submission_options','upload_limits']),value:z.record(z.string(),z.unknown())}).parse(readJson(event));const{data,error}=await db.from('system_settings').update({value:input.value}).eq('key',input.key).select().single();if(error)throw error;return json(200,{ok:true,setting:data});}
      throw new HttpError(405,'Method not allowed.');
    }
    throw new HttpError(404,'API route not found.');
  } catch(error) { if(error instanceof z.ZodError) return json(400,{ok:false,error:'Please correct the highlighted information.',issues:error.issues}); return responseError(error); }
};
