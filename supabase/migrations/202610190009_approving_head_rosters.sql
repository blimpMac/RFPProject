begin;

create table if not exists public.department_approving_heads (
  id uuid primary key default gen_random_uuid(),
  department text not null check (length(trim(department)) > 0),
  normalized_department text generated always as (lower(trim(leading '- ' from department))) stored,
  user_id uuid not null references public.profiles(id) on delete cascade,
  position smallint not null check (position between 1 and 4),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (normalized_department,user_id),
  unique (normalized_department,position)
);

alter table public.department_approving_heads enable row level security;
create policy approving_heads_staff_read on public.department_approving_heads for select using (public.is_staff());
create policy approving_heads_admin_write on public.department_approving_heads for all
  using (public.has_role('administrator') or public.has_role('super_administrator'))
  with check (public.has_role('administrator') or public.has_role('super_administrator'));

create trigger audit_department_approving_heads after insert or update or delete on public.department_approving_heads
for each row execute function public.audit_row_changes();

create or replace function public.set_department_approving_heads(
  p_department text,p_user_ids uuid[],p_actor_user_id uuid
) returns void language plpgsql security definer set search_path=public as $$
declare selected_count integer; eligible_count integer; primary_name text; primary_email text; primary_approver_id uuid;
begin
  if nullif(trim(p_department),'') is null then raise exception 'Department is required'; end if;
  select count(distinct user_id) into selected_count from unnest(p_user_ids) as chosen(user_id);
  if selected_count <> coalesce(array_length(p_user_ids,1),0) then raise exception 'Approving heads must be unique'; end if;
  if selected_count < 2 or selected_count > 4 then raise exception 'Select between 2 and 4 approving heads'; end if;

  select count(*) into eligible_count from public.profiles p
  where p.id=any(p_user_ids) and p.active and exists (
    select 1 from public.user_roles ur where ur.user_id=p.id
      and ur.role in ('super_administrator','administrator','department_approver')
  );
  if eligible_count <> selected_count then raise exception 'Every approving head must be an active Administrator or Department Approver'; end if;

  delete from public.department_approving_heads
  where normalized_department=lower(trim(leading '- ' from p_department));
  insert into public.department_approving_heads(department,user_id,position,created_by)
  select trim(p_department),value,ordinality::smallint,p_actor_user_id
  from unnest(p_user_ids) with ordinality as chosen(value,ordinality);

  select coalesce(nullif(trim(full_name),''),email),email into primary_name,primary_email
  from public.profiles where id=p_user_ids[1] and active;
  select id into primary_approver_id from public.approvers
  where normalized_department=lower(trim(leading '- ' from p_department)) and active limit 1;
  if primary_approver_id is null then
    insert into public.approvers(department,approver_name,approver_email,active)
    values(trim(p_department),primary_name,primary_email,true);
  else
    update public.approvers set department=trim(p_department),approver_name=primary_name,
      approver_email=primary_email,active=true,updated_at=now() where id=primary_approver_id;
  end if;
end $$;

create or replace function public.start_rfp_submission(
  p_request jsonb,p_idempotency_key uuid,p_tracking_hash text,p_attachments jsonb default '[]'::jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare req public.rfp_requests; approver public.approvers; item jsonb; idx integer:=0; head_names text; head_count integer;
begin
  select * into req from public.rfp_requests where idempotency_key=p_idempotency_key;
  if found then return jsonb_build_object('requestId',req.id,'rfpNumber',req.rfp_number,'status',req.final_status,'duplicate',true); end if;
  select * into approver from public.approvers
    where active and normalized_department=lower(trim(leading '- ' from p_request->>'department')) limit 1;
  if not found then raise exception 'No active approver is assigned to this department'; end if;
  select count(*),string_agg(coalesce(nullif(trim(p.full_name),''),p.email),', ' order by h.position)
    into head_count,head_names from public.department_approving_heads h join public.profiles p on p.id=h.user_id and p.active
    where h.normalized_department=lower(trim(leading '- ' from p_request->>'department'));
  if head_count not between 2 and 4 then head_names:=approver.approver_name; end if;
  insert into public.rfp_requests(
    rfp_number,requestor_email,requestor_name,department,normalized_department,project_class,rfp_type,normalized_rfp_type,
    supplier_payee,purpose_description,amount,required_payment_date,approving_head,approver_id,approver_email,
    public_tracking_hash,idempotency_key,final_status,last_action
  ) values (
    public.next_rfp_number(),lower(p_request->>'requestorEmail'),p_request->>'requestorName',p_request->>'department',lower(trim(leading '- ' from p_request->>'department')),
    p_request->>'projectClass',p_request->>'rfpType',lower(trim(leading '- ' from p_request->>'rfpType')),p_request->>'supplierPayee',
    p_request->>'purposeDescription',(p_request->>'amount')::numeric,(p_request->>'requiredPaymentDate')::date,head_names,
    approver.id,approver.approver_email,p_tracking_hash,p_idempotency_key,'Draft Uploading','Draft Created'
  ) returning * into req;
  for item in select * from jsonb_array_elements(p_attachments) loop
    idx:=idx+1;
    insert into public.request_attachments(request_id,original_filename,storage_path,mime_type,size_bytes)
    values(req.id,item->>'name',req.id::text||'/'||idx::text||'-'||regexp_replace(item->>'name','[^A-Za-z0-9._-]','_','g'),item->>'type',(item->>'size')::bigint);
  end loop;
  return jsonb_build_object('requestId',req.id,'rfpNumber',req.rfp_number,'status',req.final_status,'duplicate',false);
end $$;

create or replace function public.decide_department_request(
  p_request_id uuid,p_decision text,p_remarks text,p_actor_email text,p_actor_user_id uuid default null
) returns public.rfp_requests language plpgsql security definer set search_path=public as $$
declare req public.rfp_requests; next_status text; action_name text; reviewer record; notification_version integer;
begin
  if p_decision not in ('approve','reject') then raise exception 'Invalid decision'; end if;
  if p_decision='reject' and nullif(trim(p_remarks),'') is null then raise exception 'Rejection remarks are required'; end if;
  select * into req from public.rfp_requests where id=p_request_id for update;
  if not found then raise exception 'Request not found'; end if;
  if req.final_status <> 'Pending Department Approval' then raise exception 'This request is not awaiting department approval'; end if;
  next_status:=case when p_decision='approve' then 'Pending Finance Review' else 'Returned to Requestor' end;
  action_name:=case when p_decision='approve' then 'Department Approved' else 'Returned to Requestor' end;
  notification_version:=req.version+1;
  update public.rfp_requests set department_approval=case when p_decision='approve' then 'Approved' else 'Rejected' end,
    department_approval_at=now(),department_approval_remarks=nullif(trim(p_remarks),''),department_approved_by=p_actor_user_id,
    final_status=next_status,last_action=action_name,version=notification_version where id=req.id returning * into req;
  update public.approval_tokens set revoked_at=now() where request_id=req.id and used_at is null and revoked_at is null;
  insert into public.approval_logs(request_id,rfp_number,action,actor_email,actor_user_id,remarks,previous_status,new_status)
    values(req.id,req.rfp_number,action_name,lower(p_actor_email),p_actor_user_id,nullif(trim(p_remarks),''),'Pending Department Approval',next_status);
  insert into public.email_notifications(request_id,template_key,recipient_email,subject,payload,deduplication_key)
    values(req.id,case when p_decision='approve' then 'department_approved' else 'department_rejected' end,req.requestor_email,
      req.rfp_number||case when p_decision='approve' then ' approved by department' else ' returned for correction' end,
      jsonb_build_object('remarks',nullif(trim(p_remarks),'')),req.id::text||':department_dashboard:'||p_decision||':'||notification_version);
  if p_decision='approve' then
    for reviewer in select distinct lower(u.email) email from auth.users u join public.user_roles ur on ur.user_id=u.id
      where ur.role='finance_reviewer' and u.email is not null loop
      insert into public.email_notifications(request_id,template_key,recipient_email,subject,payload,deduplication_key)
      values(req.id,'finance_review_required',reviewer.email,'Finance review required: '||req.rfp_number,'{}',req.id::text||':finance_review:'||reviewer.email)
      on conflict(deduplication_key) do nothing;
    end loop;
  end if;
  return req;
end $$;

revoke all on function public.set_department_approving_heads(text,uuid[],uuid) from public,anon,authenticated;
revoke all on function public.start_rfp_submission(jsonb,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.decide_department_request(uuid,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.set_department_approving_heads(text,uuid[],uuid) to service_role;
grant execute on function public.start_rfp_submission(jsonb,uuid,text,jsonb) to service_role;
grant execute on function public.decide_department_request(uuid,text,text,text,uuid) to service_role;

commit;
