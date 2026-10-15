begin;

create or replace function public.resubmit_returned_request(
  p_request_id uuid,p_tracking_hash text,p_review_token_hash text,p_review_token_ciphertext text,
  p_review_expires_at timestamptz,p_correction_note text
) returns public.rfp_requests language plpgsql security definer set search_path=public as $$
declare req public.rfp_requests; previous_status text; notification_version integer;
begin
  if nullif(trim(p_correction_note),'') is null then raise exception 'A correction note is required'; end if;
  select * into req from public.rfp_requests
    where id=p_request_id and public_tracking_hash=p_tracking_hash for update;
  if not found then raise exception 'Invalid tracking credential'; end if;
  if req.final_status <> 'Returned to Requestor' then raise exception 'Only a request returned to the requestor can be resubmitted'; end if;
  previous_status:=req.final_status; notification_version:=req.version+1;
  update public.approval_tokens set revoked_at=now()
    where request_id=req.id and used_at is null and revoked_at is null;
  update public.rfp_requests set department_approval='Pending',department_approval_at=null,
    department_approval_remarks=null,finance_review='Not Started',finance_review_at=null,finance_remarks=null,
    final_status='Pending Department Approval',last_action='Resubmitted by Requestor',version=notification_version
    where id=req.id returning * into req;
  insert into public.approval_tokens(request_id,token_hash,reviewer_email,expires_at)
    values(req.id,p_review_token_hash,req.approver_email,p_review_expires_at);
  insert into public.approval_logs(request_id,rfp_number,action,actor_email,remarks,previous_status,new_status)
    values(req.id,req.rfp_number,'Resubmitted by Requestor',req.requestor_email,trim(p_correction_note),previous_status,'Pending Department Approval');
  insert into public.email_notifications(request_id,template_key,recipient_email,subject,payload,deduplication_key)
    values(req.id,'supervisor_review',req.approver_email,'Review required: '||req.rfp_number,
      jsonb_build_object('reviewTokenCiphertext',p_review_token_ciphertext,'correctionNote',trim(p_correction_note)),
      req.id::text||':supervisor_review:resubmit:'||notification_version);
  return req;
end $$;

create or replace function public.department_rereview_action(
  p_request_id uuid,p_decision text,p_remarks text,p_actor_email text,p_actor_user_id uuid
) returns public.rfp_requests language plpgsql security definer set search_path=public as $$
declare req public.rfp_requests; next_status text; action_name text; reviewer record; notification_version integer;
begin
  if p_decision not in ('approve','reject') then raise exception 'Invalid decision'; end if;
  if p_decision='reject' and nullif(trim(p_remarks),'') is null then raise exception 'Remarks are required'; end if;
  select * into req from public.rfp_requests where id=p_request_id for update;
  if not found then raise exception 'Request not found'; end if;
  if req.final_status <> 'Returned to Department Approver' then raise exception 'Request is not awaiting department re-review'; end if;
  next_status:=case when p_decision='approve' then 'Pending Finance Review' else 'Returned to Requestor' end;
  action_name:=case when p_decision='approve' then 'Department Re-approved' else 'Returned to Requestor' end;
  notification_version:=req.version+1;
  update public.rfp_requests set
    department_approval=case when p_decision='approve' then 'Approved' else 'Rejected' end,
    department_approval_at=now(),department_approval_remarks=nullif(trim(p_remarks),''),department_approved_by=p_actor_user_id,
    finance_review=case when p_decision='approve' then 'Pending' else finance_review end,
    finance_review_at=case when p_decision='approve' then null else finance_review_at end,
    final_status=next_status,last_action=action_name,version=notification_version
    where id=req.id returning * into req;
  insert into public.approval_logs(request_id,rfp_number,action,actor_email,actor_user_id,remarks,previous_status,new_status)
    values(req.id,req.rfp_number,action_name,lower(p_actor_email),p_actor_user_id,nullif(trim(p_remarks),''),'Returned to Department Approver',next_status);
  insert into public.email_notifications(request_id,template_key,recipient_email,subject,payload,deduplication_key)
    values(req.id,case when p_decision='approve' then 'department_approved' else 'department_rejected' end,req.requestor_email,
      req.rfp_number||case when p_decision='approve' then ' returned to finance review' else ' returned for correction' end,
      jsonb_build_object('remarks',nullif(trim(p_remarks),'')),req.id::text||':department_rereview:'||p_decision||':'||notification_version);
  if p_decision='approve' then
    for reviewer in
      select distinct lower(u.email) email from auth.users u join public.user_roles ur on ur.user_id=u.id
      where ur.role='finance_reviewer' and u.email is not null
    loop
      insert into public.email_notifications(request_id,template_key,recipient_email,subject,payload,deduplication_key)
      values(req.id,'finance_review_required',reviewer.email,'Finance re-review required: '||req.rfp_number,'{}',req.id::text||':finance_rereview:'||notification_version||':'||reviewer.email)
      on conflict(deduplication_key) do nothing;
    end loop;
  end if;
  return req;
end $$;

revoke all on function public.resubmit_returned_request(uuid,text,text,text,timestamptz,text) from public,anon,authenticated;
revoke all on function public.department_rereview_action(uuid,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.resubmit_returned_request(uuid,text,text,text,timestamptz,text) to service_role;
grant execute on function public.department_rereview_action(uuid,text,text,text,uuid) to service_role;

commit;
