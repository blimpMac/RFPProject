begin;

create index if not exists audit_logs_occurred_at_idx
  on public.audit_logs(occurred_at desc);
create index if not exists audit_logs_table_operation_idx
  on public.audit_logs(table_name,operation,occurred_at desc);

create or replace function public.audit_row_changes() returns trigger
language plpgsql security definer set search_path=public as $$
declare
  row_values jsonb;
  inferred_actor_text text;
  inferred_actor_id uuid;
  inferred_actor_email text;
begin
  row_values := case when TG_OP='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  inferred_actor_text := coalesce(
    auth.uid()::text,
    row_values->>'actor_user_id',
    row_values->>'updated_by',
    row_values->>'created_by',
    row_values->>'granted_by',
    row_values->>'department_approved_by',
    row_values->>'finance_reviewed_by'
  );
  if inferred_actor_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    inferred_actor_id := inferred_actor_text::uuid;
  end if;
  inferred_actor_email := coalesce(
    nullif(auth.jwt()->>'email',''),
    nullif(current_setting('request.jwt.claim.email',true),''),
    nullif(row_values->>'actor_email','')
  );
  if inferred_actor_email is null and inferred_actor_id is not null then
    select email into inferred_actor_email from public.profiles where id=inferred_actor_id;
  end if;

  insert into public.audit_logs(
    table_name,record_id,operation,actor_user_id,actor_email,old_values,new_values
  ) values (
    TG_TABLE_NAME,
    coalesce(row_values->>'id',row_values->>'key',row_values->>'user_id','unknown'),
    TG_OP,
    inferred_actor_id,
    inferred_actor_email,
    case when TG_OP in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when TG_OP in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return case when TG_OP='DELETE' then old else new end;
end $$;

drop trigger if exists audit_profiles on public.profiles;
create trigger audit_profiles after insert or update or delete on public.profiles
for each row execute function public.audit_row_changes();

drop trigger if exists audit_request_attachments on public.request_attachments;
create trigger audit_request_attachments after insert or update or delete on public.request_attachments
for each row execute function public.audit_row_changes();

drop trigger if exists audit_process_flow_steps on public.process_flow_steps;
create trigger audit_process_flow_steps after insert or update or delete on public.process_flow_steps
for each row execute function public.audit_row_changes();

commit;
