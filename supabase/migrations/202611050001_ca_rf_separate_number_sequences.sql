-- CA/RF numbering is independent; existing RFP references are never changed.
create sequence if not exists public.ca_number_seq start 1 increment 1;
create sequence if not exists public.rf_number_seq start 1 increment 1;

create or replace function public.next_rfp_number(p_request_type text)
returns text language plpgsql security definer set search_path to 'public' as $$
declare prefix text; seq_name text; n bigint; candidate text;
begin
  prefix := case
    when p_request_type ~* '(cash advance|(^|[^A-Za-z])CA([^A-Za-z]|$))' then 'CA'
    when p_request_type ~* '(revolving fund|(^|[^A-Za-z])RF([^A-Za-z]|$))' then 'RF'
    else 'RFP' end;
  if prefix='RFP' then return public.next_rfp_number(); end if;
  seq_name := case when prefix='CA' then 'public.ca_number_seq' else 'public.rf_number_seq' end;
  loop
    n := nextval(seq_name::regclass);
    candidate := prefix || '-' || lpad(n::text,4,'0');
    exit when not exists(select 1 from public.rfp_requests where rfp_number=candidate);
  end loop;
  return candidate;
end;
$$;

create or replace function public.start_rfp_submission(p_request jsonb,p_idempotency_key uuid,p_tracking_hash text,p_attachments jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare req public.rfp_requests; approver public.approvers; item jsonb;
        idx integer:=0; head_names text; head_count integer;
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
    public.next_rfp_number(p_request->>'rfpType'),lower(p_request->>'requestorEmail'),p_request->>'requestorName',p_request->>'department',lower(trim(leading '- ' from p_request->>'department')),
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
end;
$$;

-- Persist categories and the new department for fresh environments.
update public.system_settings
set value = jsonb_set(
  jsonb_set(value,'{departments}',
    case when coalesce(value->'departments','[]'::jsonb) ? 'Aftersales'
      then coalesce(value->'departments','[]'::jsonb)
      else coalesce(value->'departments','[]'::jsonb) || '["Aftersales"]'::jsonb
    end, true),
  '{requestTypes}',
  '["Trade Suppliers","Kaliwaan Suppliers","Subcon Payment Request","TPC Request","Manpower Agency Payments","Reimbursement","Opex - non PO transactions","Cash Advance (CA)","Revolving Fund (RF)","CA Liquidation","RF Liquidation"]'::jsonb, true)
where key='submission_options';
