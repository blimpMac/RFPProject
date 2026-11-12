begin;

create or replace function public.consume_department_review(
  p_token_hash text,
  p_decision text,
  p_remarks text
) returns public.rfp_requests
language plpgsql
security definer
set search_path=public
as $$
declare
  req public.rfp_requests;
  tok public.approval_tokens;
  next_status text;
  action_name text;
  notification_key text;
  notification_subject text;
  reviewer record;
  notification_version integer;
begin
  if p_decision not in ('approve','reject','return') then
    raise exception 'Invalid decision';
  end if;
  if p_decision in ('reject','return') and nullif(trim(p_remarks),'') is null then
    raise exception 'Remarks are required when rejecting or returning a request';
  end if;

  select * into tok
  from public.approval_tokens
  where token_hash=p_token_hash
  for update;
  if not found or tok.used_at is not null or tok.revoked_at is not null or tok.expires_at < now() then
    raise exception 'Review credential is invalid or expired';
  end if;

  select * into req
  from public.rfp_requests
  where id=tok.request_id
  for update;
  if req.final_status <> 'Pending Department Approval' then
    raise exception 'This request has already been decided';
  end if;

  next_status := case p_decision
    when 'approve' then 'Pending Finance Review'
    when 'reject' then 'Department Rejected'
    else 'Returned to Requestor'
  end;
  action_name := case p_decision
    when 'approve' then 'Department Approved'
    when 'reject' then 'Department Rejected'
    else 'Returned for Correction'
  end;
  notification_key := case p_decision
    when 'approve' then 'department_approved'
    when 'reject' then 'department_rejected'
    else 'department_returned'
  end;
  notification_subject := req.rfp_number || case p_decision
    when 'approve' then ' approved by department'
    when 'reject' then ' rejected by department'
    else ' returned for correction'
  end;
  notification_version := req.version + 1;

  update public.rfp_requests
  set department_approval=case p_decision
      when 'approve' then 'Approved'
      when 'reject' then 'Rejected'
      else 'Returned'
    end,
    department_approval_at=now(),
    department_approval_remarks=nullif(trim(p_remarks),''),
    final_status=next_status,
    last_action=action_name,
    version=notification_version
  where id=req.id
  returning * into req;

  update public.approval_tokens set used_at=now() where id=tok.id;
  insert into public.approval_logs(
    request_id,rfp_number,action,actor_email,remarks,previous_status,new_status
  ) values (
    req.id,req.rfp_number,action_name,lower(tok.reviewer_email),nullif(trim(p_remarks),''),
    'Pending Department Approval',next_status
  );
  insert into public.email_notifications(
    request_id,template_key,recipient_email,subject,payload,deduplication_key
  ) values (
    req.id,notification_key,req.requestor_email,notification_subject,
    jsonb_build_object('remarks',nullif(trim(p_remarks),'')),
    req.id::text||':department_'||p_decision||':'||notification_version||':requestor'
  );

  if p_decision='approve' then
    for reviewer in
      select distinct lower(u.email) email
      from auth.users u
      join public.user_roles ur on ur.user_id=u.id
      where ur.role='finance_reviewer' and u.email is not null
    loop
      insert into public.email_notifications(
        request_id,template_key,recipient_email,subject,payload,deduplication_key
      ) values (
        req.id,'finance_review_required',reviewer.email,
        'Finance review required: '||req.rfp_number,'{}',
        req.id::text||':finance_review:'||notification_version||':'||reviewer.email
      ) on conflict(deduplication_key) do nothing;
    end loop;
  end if;

  return req;
end $$;

revoke all on function public.consume_department_review(text,text,text) from public,anon,authenticated;
grant execute on function public.consume_department_review(text,text,text) to service_role;

create or replace view public.dashboard_metrics with (security_invoker=true) as
select
  count(*)::int as total_requests,
  count(*) filter(where final_status in ('Paid','Check Released'))::int as approved_requests,
  count(*) filter(where final_status in (
    'Department Rejected','Returned to Requestor','Returned to Department Approver'
  ))::int as rejected_requests,
  count(*) filter(where final_status not in (
    'Paid','Check Released','Department Rejected','Returned to Requestor','Returned to Department Approver'
  ))::int as pending_requests,
  coalesce(avg(extract(epoch from (
    coalesce(finance_review_at,department_approval_at)-submitted_at
  ))/3600) filter(where coalesce(finance_review_at,department_approval_at) is not null),0)::numeric
    as average_turnaround_hours
from public.rfp_requests
where submitted_at is not null;

commit;
