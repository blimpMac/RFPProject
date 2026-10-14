begin;

drop function if exists public.finalize_rfp_submission(uuid);
create or replace function public.finalize_rfp_submission(
  p_request_id uuid,p_review_token_hash text,p_review_token_ciphertext text,p_review_expires_at timestamptz
) returns jsonb language plpgsql security definer set search_path=public as $$
declare req public.rfp_requests;
begin
  select * into req from public.rfp_requests where id=p_request_id for update;
  if not found then raise exception 'Request not found'; end if;
  if req.final_status <> 'Draft Uploading' then return jsonb_build_object('rfpNumber',req.rfp_number,'status',req.final_status,'duplicate',true); end if;
  if exists(select 1 from public.request_attachments where request_id=req.id and status <> 'available') then
    raise exception 'All declared attachments must be uploaded before submission';
  end if;
  update public.rfp_requests set submitted_at=now(),department_approval='Pending',finance_review='Not Started',
    final_status='Pending Department Approval',last_action='Submitted',version=version+1 where id=req.id returning * into req;
  insert into public.approval_logs(request_id,rfp_number,occurred_at,action,actor_email,new_status)
    values(req.id,req.rfp_number,req.submitted_at,'Submitted',req.requestor_email,'Pending Department Approval');
  insert into public.form_responses(source_timestamp,requestor_email,requestor_name,department,normalized_department,project_class,rfp_type,
    normalized_rfp_type,supplier_payee,purpose_description,amount,required_payment_date,approving_head,matched_request_id,match_status,match_method,raw_record)
  values(req.submitted_at,req.requestor_email,req.requestor_name,req.department,req.normalized_department,req.project_class,req.rfp_type,
    req.normalized_rfp_type,req.supplier_payee,req.purpose_description,req.amount,req.required_payment_date,req.approving_head,req.id,'matched','native_submission','{}');
  insert into public.approval_tokens(request_id,token_hash,reviewer_email,expires_at)
    values(req.id,p_review_token_hash,req.approver_email,p_review_expires_at);
  insert into public.email_notifications(request_id,template_key,recipient_email,subject,payload,deduplication_key)
    values(req.id,'supervisor_review',req.approver_email,'Review required: '||req.rfp_number,
      jsonb_build_object('reviewTokenCiphertext',p_review_token_ciphertext),req.id::text||':supervisor_review');
  return jsonb_build_object('rfpNumber',req.rfp_number,'status',req.final_status,'requestId',req.id);
end $$;

create or replace function public.consume_department_review(p_token_hash text,p_decision text,p_remarks text)
returns public.rfp_requests language plpgsql security definer set search_path=public as $$
declare req public.rfp_requests; tok public.approval_tokens; next_status text; action_name text;
begin
  if p_decision not in ('approve','reject') then raise exception 'Invalid decision'; end if;
  if p_decision='reject' and nullif(trim(p_remarks),'') is null then raise exception 'Rejection remarks are required'; end if;
  select * into tok from public.approval_tokens where token_hash=p_token_hash for update;
  if not found or tok.used_at is not null or tok.revoked_at is not null or tok.expires_at < now() then raise exception 'Review credential is invalid or expired'; end if;
  select * into req from public.rfp_requests where id=tok.request_id for update;
  if req.final_status <> 'Pending Department Approval' then raise exception 'This request has already been decided'; end if;
  next_status := case when p_decision='approve' then 'Pending Finance Review' else 'Department Rejected' end;
  action_name := case when p_decision='approve' then 'Department Approved' else 'Department Rejected' end;
  update public.rfp_requests set department_approval=case when p_decision='approve' then 'Approved' else 'Rejected' end,
    department_approval_at=now(),department_approval_remarks=nullif(trim(p_remarks),''),
    final_status=next_status,last_action=action_name,version=version+1 where id=req.id returning * into req;
  update public.approval_tokens set used_at=now() where id=tok.id;
  insert into public.approval_logs(request_id,rfp_number,action,actor_email,remarks,previous_status,new_status)
    values(req.id,req.rfp_number,action_name,lower(tok.reviewer_email),nullif(trim(p_remarks),''),'Pending Department Approval',next_status);
  insert into public.email_notifications(request_id,template_key,recipient_email,subject,payload,deduplication_key)
    values(req.id,case when p_decision='approve' then 'department_approved' else 'department_rejected' end,req.requestor_email,
      req.rfp_number||case when p_decision='approve' then ' approved by department' else ' requires your attention' end,
      jsonb_build_object('remarks',nullif(trim(p_remarks),'')),req.id::text||':department_'||p_decision);
  return req;
end $$;

create or replace function public.finance_workflow_action(
  p_request_id uuid,p_action text,p_remarks text,p_actor_email text,p_actor_user_id uuid,
  p_planned_check_date date default null,p_change_reason text default null
) returns public.rfp_requests language plpgsql security definer set search_path=public as $$
declare req public.rfp_requests; next_status text; review_value text; previous_status text; action_label text;
begin
  select * into req from public.rfp_requests where id=p_request_id for update;
  if not found then raise exception 'Request not found'; end if;
  previous_status := req.final_status;
  next_status := case p_action when 'approve' then 'Approved for Payment' when 'reject' then 'Finance Rejected'
    when 'request_documents' then 'Documentation Required' when 'payment_processing' then 'Payment Processing'
    when 'check_preparation' then 'Check Preparation' when 'awaiting_signatory' then 'Awaiting Signatory'
    when 'payment_released' then 'Payment Released' else null end;
  if next_status is null then raise exception 'Invalid finance action'; end if;
  if p_action in ('approve','reject','request_documents') and previous_status not in ('Pending Finance Review','Documentation Required') then raise exception 'Request is not awaiting finance review'; end if;
  if p_action in ('reject','request_documents') and nullif(trim(p_remarks),'') is null then raise exception 'Remarks are required'; end if;
  if p_planned_check_date is distinct from req.planned_check_date and req.planned_check_date is not null and nullif(trim(p_change_reason),'') is null then raise exception 'A reason is required when changing the check date'; end if;
  review_value := case when p_action='approve' then 'Approved' when p_action='reject' then 'Rejected' when p_action='request_documents' then 'Documentation Required' else req.finance_review end;
  action_label := initcap(replace(p_action,'_',' '));
  update public.rfp_requests set finance_review=review_value,
    finance_review_at=case when p_action in ('approve','reject','request_documents') then now() else finance_review_at end,
    finance_remarks=coalesce(nullif(trim(p_remarks),''),finance_remarks),finance_reviewed_by=p_actor_user_id,
    final_status=next_status,last_action=action_label,planned_check_date=coalesce(p_planned_check_date,planned_check_date),
    check_date_last_updated=case when p_planned_check_date is distinct from planned_check_date then now() else check_date_last_updated end,
    check_date_change_reason=case when p_planned_check_date is distinct from planned_check_date then p_change_reason else check_date_change_reason end,
    version=version+1 where id=req.id returning * into req;
  insert into public.approval_logs(request_id,rfp_number,action,actor_email,actor_user_id,remarks,previous_status,new_status)
    values(req.id,req.rfp_number,action_label,lower(p_actor_email),p_actor_user_id,nullif(trim(p_remarks),''),previous_status,next_status);
  if p_action in ('reject','request_documents') then
    insert into public.email_notifications(request_id,template_key,recipient_email,subject,payload,deduplication_key)
    values(req.id,case when p_action='reject' then 'finance_rejected' else 'documentation_required' end,req.requestor_email,
      req.rfp_number||' — '||action_label,jsonb_build_object('remarks',nullif(trim(p_remarks),'')),req.id::text||':finance:'||p_action||':'||req.version);
  end if;
  return req;
end $$;

create or replace function public.claim_email_notifications(p_limit integer default 10)
returns setof public.email_notifications language plpgsql security definer set search_path=public as $$
begin
  return query
  update public.email_notifications e set status='sending',attempt_count=attempt_count+1,last_attempt_at=now(),updated_at=now()
  where e.id in (select id from public.email_notifications where status in ('queued','retry') and next_attempt_at<=now() and attempt_count<max_attempts order by created_at for update skip locked limit p_limit)
  returning e.*;
end $$;

revoke all on function public.finalize_rfp_submission(uuid,text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.consume_department_review(text,text,text) from public,anon,authenticated;
revoke all on function public.claim_email_notifications(integer) from public,anon,authenticated;
grant execute on function public.finalize_rfp_submission(uuid,text,text,timestamptz) to service_role;
grant execute on function public.consume_department_review(text,text,text) to service_role;
grant execute on function public.claim_email_notifications(integer) to service_role;

commit;
