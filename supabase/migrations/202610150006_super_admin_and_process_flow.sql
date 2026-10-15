begin;

-- Keep account-role changes behind the server API. Only the super administrator
-- may perform a direct authenticated write if an emergency console action is needed.
drop policy if exists roles_admin_write on public.user_roles;
create policy roles_super_admin_write on public.user_roles for all
  using (public.has_role('super_administrator'))
  with check (public.has_role('super_administrator'));

insert into public.user_roles(user_id,role)
select id,'super_administrator'::public.app_role from auth.users
where lower(email)='gpigemcorqbbackup@gmail.com'
on conflict do nothing;
insert into public.user_roles(user_id,role)
select id,'administrator'::public.app_role from auth.users
where lower(email)='gpigemcorqbbackup@gmail.com'
on conflict do nothing;

create or replace function public.consume_department_review(p_token_hash text,p_decision text,p_remarks text)
returns public.rfp_requests language plpgsql security definer set search_path=public as $$
declare req public.rfp_requests; tok public.approval_tokens; next_status text; action_name text; reviewer record;
begin
  if p_decision not in ('approve','reject') then raise exception 'Invalid decision'; end if;
  if p_decision='reject' and nullif(trim(p_remarks),'') is null then raise exception 'Rejection remarks are required'; end if;
  select * into tok from public.approval_tokens where token_hash=p_token_hash for update;
  if not found or tok.used_at is not null or tok.revoked_at is not null or tok.expires_at < now() then raise exception 'Review credential is invalid or expired'; end if;
  select * into req from public.rfp_requests where id=tok.request_id for update;
  if req.final_status <> 'Pending Department Approval' then raise exception 'This request has already been decided'; end if;
  next_status := case when p_decision='approve' then 'Pending Finance Review' else 'Returned to Requestor' end;
  action_name := case when p_decision='approve' then 'Department Approved' else 'Returned to Requestor' end;
  update public.rfp_requests set department_approval=case when p_decision='approve' then 'Approved' else 'Rejected' end,
    department_approval_at=now(),department_approval_remarks=nullif(trim(p_remarks),''),
    final_status=next_status,last_action=action_name,version=version+1 where id=req.id returning * into req;
  update public.approval_tokens set used_at=now() where id=tok.id;
  insert into public.approval_logs(request_id,rfp_number,action,actor_email,remarks,previous_status,new_status)
    values(req.id,req.rfp_number,action_name,lower(tok.reviewer_email),nullif(trim(p_remarks),''),'Pending Department Approval',next_status);
  insert into public.email_notifications(request_id,template_key,recipient_email,subject,payload,deduplication_key)
    values(req.id,case when p_decision='approve' then 'department_approved' else 'department_rejected' end,req.requestor_email,
      req.rfp_number||case when p_decision='approve' then ' approved by department' else ' returned for correction' end,
      jsonb_build_object('remarks',nullif(trim(p_remarks),'')),req.id::text||':department_'||p_decision||':requestor');
  if p_decision='approve' then
    for reviewer in
      select distinct lower(u.email) email from auth.users u join public.user_roles ur on ur.user_id=u.id
      where ur.role='finance_reviewer' and u.email is not null
    loop
      insert into public.email_notifications(request_id,template_key,recipient_email,subject,payload,deduplication_key)
      values(req.id,'finance_review_required',reviewer.email,'Finance review required: '||req.rfp_number,'{}',req.id::text||':finance_review:'||reviewer.email)
      on conflict(deduplication_key) do nothing;
    end loop;
  end if;
  return req;
end $$;

create or replace function public.finance_workflow_action(
  p_request_id uuid,p_action text,p_remarks text,p_actor_email text,p_actor_user_id uuid,
  p_planned_check_date date default null,p_change_reason text default null
) returns public.rfp_requests language plpgsql security definer set search_path=public as $$
declare req public.rfp_requests; next_status text; review_value text; previous_status text; action_label text; notification_version integer;
begin
  select * into req from public.rfp_requests where id=p_request_id for update;
  if not found then raise exception 'Request not found'; end if;
  previous_status := req.final_status;
  if p_action='approve' then
    if previous_status not in ('Pending Finance Review','Documentation Required') then raise exception 'Request is not awaiting finance review'; end if;
    if coalesce(p_planned_check_date,req.planned_check_date) is null then raise exception 'A target release date is required'; end if;
    next_status:='Processing'; action_label:='Finance Approved';
  elsif p_action='reject' then
    if previous_status not in ('Pending Finance Review','Documentation Required') then raise exception 'Request is not awaiting finance review'; end if;
    if nullif(trim(p_remarks),'') is null then raise exception 'Remarks are required'; end if;
    next_status:='Returned to Department Approver'; action_label:='Finance Returned';
  elsif p_action='request_documents' then
    if previous_status not in ('Pending Finance Review','Documentation Required') then raise exception 'Request is not awaiting finance review'; end if;
    if nullif(trim(p_remarks),'') is null then raise exception 'Remarks are required'; end if;
    next_status:='Documentation Required'; action_label:='Documentation Required';
  elsif p_action='payment_processing' then
    if previous_status not in ('Pending Finance Review','Approved for Payment','Payment Processing','Processing') then raise exception 'Request cannot enter processing from its current status'; end if;
    if coalesce(p_planned_check_date,req.planned_check_date) is null then raise exception 'A target release date is required'; end if;
    next_status:='Processing'; action_label:='Processing Started';
  elsif p_action='check_preparation' then
    if previous_status not in ('Processing','Payment Processing') then raise exception 'Request must be processing before check preparation'; end if;
    next_status:='Check Preparation'; action_label:='Check Preparation';
  elsif p_action='awaiting_signatory' then
    if previous_status not in ('Check Preparation','Awaiting Signatory') then raise exception 'Check must be prepared before check approval'; end if;
    next_status:='Check Approval'; action_label:='Check Approval';
  elsif p_action='check_released' then
    if previous_status not in ('Check Approval','Awaiting Signatory') then raise exception 'Check approval is required before release'; end if;
    next_status:='Check Released'; action_label:='Check Released';
  elsif p_action='payment_released' then
    if previous_status not in ('Check Released','Payment Released') then raise exception 'The check must be released before payment completion'; end if;
    next_status:='Paid'; action_label:='Payment Completed';
  else raise exception 'Invalid finance action';
  end if;

  review_value := case when p_action in ('approve','payment_processing') then 'Approved' when p_action='reject' then 'Returned'
    when p_action='request_documents' then 'Documentation Required' else req.finance_review end;
  notification_version := req.version + 1;
  update public.rfp_requests set finance_review=review_value,
    finance_review_at=case when p_action in ('approve','reject','request_documents','payment_processing') then now() else finance_review_at end,
    finance_remarks=coalesce(nullif(trim(p_remarks),''),finance_remarks),finance_reviewed_by=coalesce(p_actor_user_id,finance_reviewed_by),
    final_status=next_status,last_action=action_label,planned_check_date=coalesce(p_planned_check_date,planned_check_date),
    check_date_last_updated=case when p_planned_check_date is distinct from planned_check_date then now() else check_date_last_updated end,
    check_date_change_reason=case when p_planned_check_date is distinct from planned_check_date then p_change_reason else check_date_change_reason end,
    version=notification_version where id=req.id returning * into req;
  insert into public.approval_logs(request_id,rfp_number,action,actor_email,actor_user_id,remarks,previous_status,new_status)
    values(req.id,req.rfp_number,action_label,lower(p_actor_email),p_actor_user_id,nullif(trim(p_remarks),''),previous_status,next_status);

  if p_action in ('approve','payment_processing') then
    insert into public.email_notifications(request_id,template_key,recipient_email,subject,payload,deduplication_key) values
      (req.id,'processing_started',req.requestor_email,req.rfp_number||' is processing',jsonb_build_object('plannedCheckDate',req.planned_check_date,'remarks',nullif(trim(p_remarks),'')),req.id::text||':processing:requestor:'||notification_version),
      (req.id,'processing_started',req.approver_email,req.rfp_number||' is processing',jsonb_build_object('plannedCheckDate',req.planned_check_date,'remarks',nullif(trim(p_remarks),'')),req.id::text||':processing:approver:'||notification_version);
  elsif p_action in ('reject','request_documents') then
    insert into public.email_notifications(request_id,template_key,recipient_email,subject,payload,deduplication_key) values
      (req.id,case when p_action='reject' then 'finance_returned' else 'documentation_required' end,req.requestor_email,req.rfp_number||' requires attention',jsonb_build_object('remarks',nullif(trim(p_remarks),'')),req.id::text||':finance:'||p_action||':requestor:'||notification_version),
      (req.id,case when p_action='reject' then 'finance_returned' else 'documentation_required' end,req.approver_email,req.rfp_number||' requires attention',jsonb_build_object('remarks',nullif(trim(p_remarks),'')),req.id::text||':finance:'||p_action||':approver:'||notification_version);
  elsif p_action='check_released' then
    insert into public.email_notifications(request_id,template_key,recipient_email,subject,payload,deduplication_key)
    values(req.id,'check_released',req.requestor_email,req.rfp_number||' check released','{}',req.id::text||':check_released:'||notification_version);
  elsif p_action='payment_released' then
    insert into public.email_notifications(request_id,template_key,recipient_email,subject,payload,deduplication_key)
    values(req.id,'payment_completed',req.requestor_email,req.rfp_number||' payment completed','{}',req.id::text||':payment_completed:'||notification_version);
  end if;
  return req;
end $$;

revoke all on function public.consume_department_review(text,text,text) from public,anon,authenticated;
revoke all on function public.finance_workflow_action(uuid,text,text,text,uuid,date,text) from public,anon,authenticated;
grant execute on function public.consume_department_review(text,text,text) to service_role;
grant execute on function public.finance_workflow_action(uuid,text,text,text,uuid,date,text) to service_role;

create or replace view public.dashboard_metrics with (security_invoker=true) as
select
  count(*)::int as total_requests,
  count(*) filter(where final_status in ('Paid','Check Released'))::int as approved_requests,
  count(*) filter(where final_status in ('Returned to Requestor','Returned to Department Approver'))::int as rejected_requests,
  count(*) filter(where final_status not in ('Paid','Returned to Requestor','Returned to Department Approver'))::int as pending_requests,
  coalesce(avg(extract(epoch from (coalesce(finance_review_at,department_approval_at)-submitted_at))/3600)
    filter(where coalesce(finance_review_at,department_approval_at) is not null),0)::numeric as average_turnaround_hours
from public.rfp_requests
where submitted_at is not null;

commit;
