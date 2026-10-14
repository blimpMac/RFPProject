begin;

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger approvers_touch before update on public.approvers for each row execute function public.touch_updated_at();
create trigger requests_touch before update on public.rfp_requests for each row execute function public.touch_updated_at();
create trigger emails_touch before update on public.email_notifications for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id,email,full_name)
  values(new.id, coalesce(new.email,''), new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.has_role(required_role public.app_role) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.user_roles where user_id = auth.uid() and role = required_role)
$$;

create or replace function public.is_staff() returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.user_roles where user_id=auth.uid())
$$;

create or replace function public.next_rfp_number() returns text
language plpgsql security definer set search_path=public as $$
declare n bigint; candidate text;
begin
  loop
    n := nextval('public.rfp_number_seq');
    candidate := 'RFP-' || lpad(n::text, 4, '0');
    exit when not exists(select 1 from public.rfp_requests where rfp_number=candidate);
  end loop;
  return candidate;
end $$;

create or replace function public.sync_rfp_number_sequence() returns bigint
language plpgsql security definer set search_path=public as $$
declare max_number bigint;
begin
  select coalesce(max(substring(rfp_number from '[0-9]+')::bigint),0) into max_number from public.rfp_requests;
  perform setval('public.rfp_number_seq', greatest(max_number,1), max_number > 0);
  return max_number + 1;
end $$;

create or replace function public.audit_row_changes() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  insert into public.audit_logs(table_name,record_id,operation,actor_user_id,actor_email,old_values,new_values)
  values(TG_TABLE_NAME, coalesce((case when TG_OP='DELETE' then to_jsonb(old) else to_jsonb(new) end)->>'id','unknown'), TG_OP,
    auth.uid(), coalesce(auth.jwt()->>'email',current_setting('request.jwt.claim.email',true)),
    case when TG_OP in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when TG_OP in ('INSERT','UPDATE') then to_jsonb(new) end);
  return case when TG_OP='DELETE' then old else new end;
end $$;

create trigger audit_requests after insert or update or delete on public.rfp_requests for each row execute function public.audit_row_changes();
create trigger audit_approvers after insert or update or delete on public.approvers for each row execute function public.audit_row_changes();
create trigger audit_settings after insert or update or delete on public.system_settings for each row execute function public.audit_row_changes();
create trigger audit_roles after insert or update or delete on public.user_roles for each row execute function public.audit_row_changes();

create or replace function public.prevent_mutation() returns trigger language plpgsql as $$
begin raise exception '% is immutable', TG_TABLE_NAME; end $$;
create trigger approval_logs_immutable before update or delete on public.approval_logs for each row execute function public.prevent_mutation();
create trigger migration_snapshots_immutable before update or delete on public.migration_source_snapshots for each row execute function public.prevent_mutation();

create or replace function public.start_rfp_submission(
  p_request jsonb, p_idempotency_key uuid, p_tracking_hash text, p_attachments jsonb default '[]'::jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare req public.rfp_requests; approver public.approvers; item jsonb; idx integer := 0;
begin
  select * into req from public.rfp_requests where idempotency_key=p_idempotency_key;
  if found then return jsonb_build_object('requestId',req.id,'rfpNumber',req.rfp_number,'status',req.final_status,'duplicate',true); end if;
  select * into approver from public.approvers
    where active and normalized_department=lower(trim(leading '- ' from p_request->>'department')) limit 1;
  if not found then raise exception 'No active approver is assigned to this department'; end if;
  insert into public.rfp_requests(
    rfp_number,requestor_email,requestor_name,department,normalized_department,project_class,rfp_type,normalized_rfp_type,
    supplier_payee,purpose_description,amount,required_payment_date,approving_head,approver_id,approver_email,
    public_tracking_hash,idempotency_key,final_status,last_action
  ) values (
    public.next_rfp_number(),lower(p_request->>'requestorEmail'),p_request->>'requestorName',p_request->>'department',lower(trim(leading '- ' from p_request->>'department')),
    p_request->>'projectClass',p_request->>'rfpType',lower(trim(leading '- ' from p_request->>'rfpType')),p_request->>'supplierPayee',
    p_request->>'purposeDescription',(p_request->>'amount')::numeric,(p_request->>'requiredPaymentDate')::date,approver.approver_name,
    approver.id,approver.approver_email,p_tracking_hash,p_idempotency_key,'Draft Uploading','Draft Created'
  ) returning * into req;
  for item in select * from jsonb_array_elements(p_attachments) loop
    idx := idx + 1;
    insert into public.request_attachments(request_id,original_filename,storage_path,mime_type,size_bytes)
    values(req.id,item->>'name',req.id::text||'/'||idx::text||'-'||regexp_replace(item->>'name','[^A-Za-z0-9._-]','_','g'),item->>'type',(item->>'size')::bigint);
  end loop;
  return jsonb_build_object('requestId',req.id,'rfpNumber',req.rfp_number,'status',req.final_status,'duplicate',false);
end $$;

create or replace function public.finalize_rfp_submission(p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare req public.rfp_requests; token_id uuid;
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
  return jsonb_build_object('rfpNumber',req.rfp_number,'status',req.final_status,'requestId',req.id);
end $$;

create or replace function public.decide_department_request(
  p_request_id uuid,p_decision text,p_remarks text,p_actor_email text,p_actor_user_id uuid default null
) returns public.rfp_requests language plpgsql security definer set search_path=public as $$
declare req public.rfp_requests; next_status text; action_name text;
begin
  if p_decision not in ('approve','reject') then raise exception 'Invalid decision'; end if;
  if p_decision='reject' and nullif(trim(p_remarks),'') is null then raise exception 'Rejection remarks are required'; end if;
  select * into req from public.rfp_requests where id=p_request_id for update;
  if not found then raise exception 'Request not found'; end if;
  if req.final_status <> 'Pending Department Approval' then raise exception 'This request has already been decided'; end if;
  next_status := case when p_decision='approve' then 'Pending Finance Review' else 'Department Rejected' end;
  action_name := case when p_decision='approve' then 'Department Approved' else 'Department Rejected' end;
  update public.rfp_requests set department_approval=initcap(p_decision)||case when p_decision='approve' then 'd' else 'ed' end,
    department_approval_at=now(),department_approval_remarks=nullif(trim(p_remarks),''),department_approved_by=p_actor_user_id,
    final_status=next_status,last_action=action_name,version=version+1 where id=req.id returning * into req;
  insert into public.approval_logs(request_id,rfp_number,action,actor_email,actor_user_id,remarks,previous_status,new_status)
    values(req.id,req.rfp_number,action_name,lower(p_actor_email),p_actor_user_id,nullif(trim(p_remarks),''),'Pending Department Approval',next_status);
  return req;
end $$;

create or replace function public.finance_workflow_action(
  p_request_id uuid,p_action text,p_remarks text,p_actor_email text,p_actor_user_id uuid,
  p_planned_check_date date default null,p_change_reason text default null
) returns public.rfp_requests language plpgsql security definer set search_path=public as $$
declare req public.rfp_requests; next_status text; review_value text;
begin
  select * into req from public.rfp_requests where id=p_request_id for update;
  if not found then raise exception 'Request not found'; end if;
  next_status := case p_action
    when 'approve' then 'Approved for Payment' when 'reject' then 'Finance Rejected'
    when 'request_documents' then 'Documentation Required' when 'payment_processing' then 'Payment Processing'
    when 'check_preparation' then 'Check Preparation' when 'awaiting_signatory' then 'Awaiting Signatory'
    when 'payment_released' then 'Payment Released' else null end;
  if next_status is null then raise exception 'Invalid finance action'; end if;
  if p_action in ('reject','request_documents') and nullif(trim(p_remarks),'') is null then raise exception 'Remarks are required'; end if;
  if p_planned_check_date is distinct from req.planned_check_date and req.planned_check_date is not null and nullif(trim(p_change_reason),'') is null then
    raise exception 'A reason is required when changing the check date';
  end if;
  review_value := case when p_action='approve' then 'Approved' when p_action='reject' then 'Rejected'
    when p_action='request_documents' then 'Documentation Required' else req.finance_review end;
  update public.rfp_requests set finance_review=review_value,
    finance_review_at=case when p_action in ('approve','reject','request_documents') then now() else finance_review_at end,
    finance_remarks=coalesce(nullif(trim(p_remarks),''),finance_remarks),finance_reviewed_by=p_actor_user_id,
    final_status=next_status,last_action=initcap(replace(p_action,'_',' ')),planned_check_date=coalesce(p_planned_check_date,planned_check_date),
    check_date_last_updated=case when p_planned_check_date is distinct from planned_check_date then now() else check_date_last_updated end,
    check_date_change_reason=case when p_planned_check_date is distinct from planned_check_date then p_change_reason else check_date_change_reason end,
    version=version+1 where id=req.id returning * into req;
  insert into public.approval_logs(request_id,rfp_number,action,actor_email,actor_user_id,remarks,previous_status,new_status)
    values(req.id,req.rfp_number,req.last_action,lower(p_actor_email),p_actor_user_id,nullif(trim(p_remarks),''),req.final_status,next_status);
  return req;
end $$;

create or replace view public.dashboard_metrics with (security_invoker=true) as
select count(*)::int total_requests,
 count(*) filter(where final_status in ('Approved for Payment','Payment Processing','Check Preparation','Awaiting Signatory','Payment Released'))::int approved_requests,
 count(*) filter(where final_status in ('Department Rejected','Finance Rejected'))::int rejected_requests,
 count(*) filter(where final_status not in ('Department Rejected','Finance Rejected','Payment Released'))::int pending_requests,
 round(avg(extract(epoch from (coalesce(finance_review_at,department_approval_at)-submitted_at))/3600) filter(where coalesce(finance_review_at,department_approval_at) is not null),1) average_turnaround_hours
from public.rfp_requests where submitted_at is not null;

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.approvers enable row level security;
alter table public.form_responses enable row level security;
alter table public.rfp_requests enable row level security;
alter table public.request_attachments enable row level security;
alter table public.approval_logs enable row level security;
alter table public.process_flow_steps enable row level security;
alter table public.process_flow_reference_data enable row level security;
alter table public.email_notifications enable row level security;
alter table public.approval_tokens enable row level security;
alter table public.migration_batches enable row level security;
alter table public.migration_row_maps enable row level security;
alter table public.migration_source_snapshots enable row level security;
alter table public.system_settings enable row level security;
alter table public.audit_logs enable row level security;
alter table public.submission_rate_limits enable row level security;

create policy profiles_self_read on public.profiles for select using (id=auth.uid() or public.has_role('administrator'));
create policy profiles_admin_update on public.profiles for update using (public.has_role('administrator')) with check (public.has_role('administrator'));
create policy roles_staff_read on public.user_roles for select using (user_id=auth.uid() or public.has_role('administrator'));
create policy roles_admin_write on public.user_roles for all using (public.has_role('administrator')) with check (public.has_role('administrator'));
create policy approvers_staff_read on public.approvers for select using (public.is_staff());
create policy approvers_admin_write on public.approvers for all using (public.has_role('administrator')) with check (public.has_role('administrator'));
create policy requests_admin_read on public.rfp_requests for select using (public.has_role('administrator'));
create policy requests_finance_read on public.rfp_requests for select using (public.has_role('finance_reviewer'));
create policy requests_department_read on public.rfp_requests for select using (public.has_role('department_approver') and lower(approver_email)=lower(auth.jwt()->>'email'));
create policy forms_admin_read on public.form_responses for select using (public.has_role('administrator'));
create policy logs_staff_read on public.approval_logs for select using (public.is_staff());
create policy attachments_staff_read on public.request_attachments for select using (public.is_staff());
create policy process_flow_staff_read on public.process_flow_steps for select using (public.is_staff());
create policy process_ref_admin_read on public.process_flow_reference_data for select using (public.has_role('administrator'));
create policy settings_staff_read on public.system_settings for select using (public.is_staff());
create policy settings_admin_write on public.system_settings for all using (public.has_role('administrator')) with check (public.has_role('administrator'));
create policy audit_admin_read on public.audit_logs for select using (public.has_role('administrator'));
create policy migration_admin_read on public.migration_batches for select using (public.has_role('administrator'));
create policy row_maps_admin_read on public.migration_row_maps for select using (public.has_role('administrator'));
create policy snapshots_admin_read on public.migration_source_snapshots for select using (public.has_role('administrator'));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('rfp-attachments','rfp-attachments',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp','image/gif'])
on conflict(id) do update set public=false;

create policy storage_staff_read on storage.objects for select using (bucket_id='rfp-attachments' and public.is_staff());

revoke all on function public.start_rfp_submission(jsonb,uuid,text,jsonb) from public, anon, authenticated;
revoke all on function public.finalize_rfp_submission(uuid) from public, anon, authenticated;
revoke all on function public.decide_department_request(uuid,text,text,text,uuid) from public, anon, authenticated;
revoke all on function public.finance_workflow_action(uuid,text,text,text,uuid,date,text) from public, anon, authenticated;
grant execute on function public.start_rfp_submission(jsonb,uuid,text,jsonb) to service_role;
grant execute on function public.finalize_rfp_submission(uuid) to service_role;
grant execute on function public.decide_department_request(uuid,text,text,text,uuid) to service_role;
grant execute on function public.finance_workflow_action(uuid,text,text,text,uuid,date,text) to service_role;

commit;
