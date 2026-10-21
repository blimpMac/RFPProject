begin;

create or replace function public.set_approving_head_assignments(
  p_assignments jsonb,p_actor_user_id uuid
) returns void language plpgsql security definer set search_path=public as $$
declare
  assignment jsonb;
  department_name text;
  configured_departments jsonb;
  selected_count integer;
  eligible_count integer;
  department_count integer;
  position_value integer;
  primary_name text;
  primary_email text;
  primary_approver_id uuid;
begin
  if jsonb_typeof(p_assignments) <> 'array' then raise exception 'Approving head assignments must be an array'; end if;
  selected_count:=jsonb_array_length(p_assignments);
  if selected_count < 3 or selected_count > 4 then raise exception 'Select between 3 and 4 approving heads'; end if;
  if (select count(distinct (item->>'userId')::uuid) from jsonb_array_elements(p_assignments) item) <> selected_count then
    raise exception 'Approving heads must be unique';
  end if;

  select value->'departments' into configured_departments from public.system_settings where key='submission_options';
  if jsonb_typeof(configured_departments) <> 'array' or jsonb_array_length(configured_departments)=0 then
    raise exception 'No configured departments were found';
  end if;

  for assignment in select value from jsonb_array_elements(p_assignments) loop
    if jsonb_typeof(assignment->'departments') <> 'array' then raise exception 'Each approving head needs department assignments'; end if;
    department_count:=jsonb_array_length(assignment->'departments');
    if department_count < 1 or department_count > 2 then raise exception 'Assign each approving head to 1 or 2 departments'; end if;
    if (select count(distinct lower(trim(leading '- ' from value))) from jsonb_array_elements_text(assignment->'departments')) <> department_count then
      raise exception 'Department assignments must be unique';
    end if;
    for department_name in select value from jsonb_array_elements_text(assignment->'departments') loop
      if not exists(select 1 from jsonb_array_elements_text(configured_departments) configured(value) where lower(trim(leading '- ' from configured.value))=lower(trim(leading '- ' from department_name))) then
        raise exception 'Department % is not configured',department_name;
      end if;
    end loop;
  end loop;

  select count(*) into eligible_count from public.profiles p
  where p.id in (select distinct (item->>'userId')::uuid from jsonb_array_elements(p_assignments) item)
    and p.active and exists (
      select 1 from public.user_roles ur where ur.user_id=p.id
        and ur.role in ('super_administrator','administrator','department_approver')
    );
  if eligible_count <> selected_count then raise exception 'Every approving head must be an active Administrator or Department Approver'; end if;

  for department_name in select value from jsonb_array_elements_text(configured_departments) loop
    select count(*) into department_count
    from jsonb_array_elements(p_assignments) item,jsonb_array_elements_text(item->'departments') assigned(value)
    where lower(trim(leading '- ' from assigned.value))=lower(trim(leading '- ' from department_name));
    if department_count < 1 or department_count > 2 then raise exception 'Every department must have 1 or 2 approving heads'; end if;
  end loop;

  delete from public.department_approving_heads where id is not null;
  for assignment in select value from jsonb_array_elements(p_assignments) loop
    for department_name in select value from jsonb_array_elements_text(assignment->'departments') loop
      select count(*)+1 into position_value from public.department_approving_heads
      where normalized_department=lower(trim(leading '- ' from department_name));
      insert into public.department_approving_heads(department,user_id,position,created_by)
      values(trim(department_name),(assignment->>'userId')::uuid,position_value::smallint,p_actor_user_id);
    end loop;
  end loop;

  for department_name in select value from jsonb_array_elements_text(configured_departments) loop
    select coalesce(nullif(trim(p.full_name),''),'Approving Head'),p.email into primary_name,primary_email
    from public.department_approving_heads h join public.profiles p on p.id=h.user_id and p.active
    where h.normalized_department=lower(trim(leading '- ' from department_name)) order by h.position limit 1;
    select id into primary_approver_id from public.approvers
    where normalized_department=lower(trim(leading '- ' from department_name)) and active limit 1;
    if primary_approver_id is null then
      insert into public.approvers(department,approver_name,approver_email,active)
      values(trim(department_name),primary_name,primary_email,true);
    else
      update public.approvers set department=trim(department_name),approver_name=primary_name,
        approver_email=primary_email,active=true,updated_at=now() where id=primary_approver_id;
    end if;
  end loop;
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
  select count(*),string_agg(coalesce(nullif(trim(p.full_name),''),'Approving Head'),', ' order by h.position)
    into head_count,head_names from public.department_approving_heads h join public.profiles p on p.id=h.user_id and p.active
    where h.normalized_department=lower(trim(leading '- ' from p_request->>'department'));
  if head_count not between 1 and 2 then head_names:=approver.approver_name; end if;
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

create or replace function public.finalize_rfp_submission(
  p_request_id uuid,p_review_token_hash text,p_review_token_ciphertext text,p_review_expires_at timestamptz
) returns jsonb language plpgsql security definer set search_path=public as $$
declare req public.rfp_requests; reviewer record; reviewer_count integer:=0;
begin
  select * into req from public.rfp_requests where id=p_request_id for update;
  if not found then raise exception 'Request not found'; end if;
  if req.final_status <> 'Draft Uploading' then return jsonb_build_object('rfpNumber',req.rfp_number,'status',req.final_status,'duplicate',true); end if;
  if exists(select 1 from public.request_attachments where request_id=req.id and status <> 'available') then raise exception 'All declared attachments must be uploaded before submission'; end if;
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
  for reviewer in select p.id,p.email from public.department_approving_heads h join public.profiles p on p.id=h.user_id and p.active
    where h.normalized_department=req.normalized_department order by h.position loop
    reviewer_count:=reviewer_count+1;
    insert into public.email_notifications(request_id,template_key,recipient_email,subject,payload,deduplication_key)
    values(req.id,'supervisor_review',lower(reviewer.email),'Review required: '||req.rfp_number,
      jsonb_build_object('reviewTokenCiphertext',p_review_token_ciphertext),req.id::text||':supervisor_review:'||reviewer.id::text);
  end loop;
  if reviewer_count=0 then
    insert into public.email_notifications(request_id,template_key,recipient_email,subject,payload,deduplication_key)
    values(req.id,'supervisor_review',req.approver_email,'Review required: '||req.rfp_number,
      jsonb_build_object('reviewTokenCiphertext',p_review_token_ciphertext),req.id::text||':supervisor_review');
  end if;
  return jsonb_build_object('rfpNumber',req.rfp_number,'status',req.final_status,'requestId',req.id);
end $$;

create or replace function public.resubmit_returned_request(
  p_request_id uuid,p_tracking_hash text,p_review_token_hash text,p_review_token_ciphertext text,
  p_review_expires_at timestamptz,p_correction_note text
) returns public.rfp_requests language plpgsql security definer set search_path=public as $$
declare req public.rfp_requests; previous_status text; notification_version integer; reviewer record; reviewer_count integer:=0;
begin
  if nullif(trim(p_correction_note),'') is null then raise exception 'A correction note is required'; end if;
  select * into req from public.rfp_requests where id=p_request_id and public_tracking_hash=p_tracking_hash for update;
  if not found then raise exception 'Invalid tracking credential'; end if;
  if req.final_status <> 'Returned to Requestor' then raise exception 'Only a request returned to the requestor can be resubmitted'; end if;
  previous_status:=req.final_status; notification_version:=req.version+1;
  update public.approval_tokens set revoked_at=now() where request_id=req.id and used_at is null and revoked_at is null;
  update public.rfp_requests set department_approval='Pending',department_approval_at=null,
    department_approval_remarks=null,finance_review='Not Started',finance_review_at=null,finance_remarks=null,
    final_status='Pending Department Approval',last_action='Resubmitted by Requestor',version=notification_version
    where id=req.id returning * into req;
  insert into public.approval_tokens(request_id,token_hash,reviewer_email,expires_at)
    values(req.id,p_review_token_hash,req.approver_email,p_review_expires_at);
  insert into public.approval_logs(request_id,rfp_number,action,actor_email,remarks,previous_status,new_status)
    values(req.id,req.rfp_number,'Resubmitted by Requestor',req.requestor_email,trim(p_correction_note),previous_status,'Pending Department Approval');
  for reviewer in select p.id,p.email from public.department_approving_heads h join public.profiles p on p.id=h.user_id and p.active
    where h.normalized_department=req.normalized_department order by h.position loop
    reviewer_count:=reviewer_count+1;
    insert into public.email_notifications(request_id,template_key,recipient_email,subject,payload,deduplication_key)
    values(req.id,'supervisor_review',lower(reviewer.email),'Review required: '||req.rfp_number,
      jsonb_build_object('reviewTokenCiphertext',p_review_token_ciphertext,'correctionNote',trim(p_correction_note)),
      req.id::text||':supervisor_review:resubmit:'||notification_version||':'||reviewer.id::text);
  end loop;
  if reviewer_count=0 then
    insert into public.email_notifications(request_id,template_key,recipient_email,subject,payload,deduplication_key)
    values(req.id,'supervisor_review',req.approver_email,'Review required: '||req.rfp_number,
      jsonb_build_object('reviewTokenCiphertext',p_review_token_ciphertext,'correctionNote',trim(p_correction_note)),
      req.id::text||':supervisor_review:resubmit:'||notification_version);
  end if;
  return req;
end $$;

revoke all on function public.set_approving_head_assignments(jsonb,uuid) from public,anon,authenticated;
revoke all on function public.start_rfp_submission(jsonb,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.finalize_rfp_submission(uuid,text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.resubmit_returned_request(uuid,text,text,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.set_approving_head_assignments(jsonb,uuid) to service_role;
grant execute on function public.start_rfp_submission(jsonb,uuid,text,jsonb) to service_role;
grant execute on function public.finalize_rfp_submission(uuid,text,text,timestamptz) to service_role;
grant execute on function public.resubmit_returned_request(uuid,text,text,text,timestamptz,text) to service_role;

commit;
