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
  if (select count(distinct (item->>'userId')::uuid) from jsonb_array_elements(p_assignments) item) <> selected_count then raise exception 'Approving heads must be unique'; end if;
  select value->'departments' into configured_departments from public.system_settings where key='submission_options';
  if jsonb_typeof(configured_departments) <> 'array' or jsonb_array_length(configured_departments)=0 then raise exception 'No configured departments were found'; end if;
  for assignment in select value from jsonb_array_elements(p_assignments) loop
    if jsonb_typeof(assignment->'departments') <> 'array' then raise exception 'Each approving head needs department assignments'; end if;
    department_count:=jsonb_array_length(assignment->'departments');
    if department_count < 1 or department_count > 2 then raise exception 'Assign each approving head to 1 or 2 departments'; end if;
    if (select count(distinct lower(trim(leading '- ' from value))) from jsonb_array_elements_text(assignment->'departments')) <> department_count then raise exception 'Department assignments must be unique'; end if;
    for department_name in select value from jsonb_array_elements_text(assignment->'departments') loop
      if not exists(select 1 from jsonb_array_elements_text(configured_departments) configured(value) where lower(trim(leading '- ' from configured.value))=lower(trim(leading '- ' from department_name))) then raise exception 'Department % is not configured',department_name; end if;
    end loop;
  end loop;
  select count(*) into eligible_count from public.profiles p
  where p.id in (select distinct (item->>'userId')::uuid from jsonb_array_elements(p_assignments) item)
    and p.active and exists (select 1 from public.user_roles ur where ur.user_id=p.id and ur.role in ('super_administrator','administrator','department_approver'));
  if eligible_count <> selected_count then raise exception 'Every approving head must be an active Administrator or Department Approver'; end if;
  for department_name in select value from jsonb_array_elements_text(configured_departments) loop
    select count(*) into department_count from jsonb_array_elements(p_assignments) item,jsonb_array_elements_text(item->'departments') assigned(value)
    where lower(trim(leading '- ' from assigned.value))=lower(trim(leading '- ' from department_name));
    if department_count < 1 or department_count > 2 then raise exception 'Every department must have 1 or 2 approving heads'; end if;
  end loop;
  delete from public.department_approving_heads where id is not null;
  for assignment in select value from jsonb_array_elements(p_assignments) loop
    for department_name in select value from jsonb_array_elements_text(assignment->'departments') loop
      select count(*)+1 into position_value from public.department_approving_heads where normalized_department=lower(trim(leading '- ' from department_name));
      insert into public.department_approving_heads(department,user_id,position,created_by)
      values(trim(department_name),(assignment->>'userId')::uuid,position_value::smallint,p_actor_user_id);
    end loop;
  end loop;
  for department_name in select value from jsonb_array_elements_text(configured_departments) loop
    select coalesce(nullif(trim(p.full_name),''),'Approving Head'),p.email into primary_name,primary_email
    from public.department_approving_heads h join public.profiles p on p.id=h.user_id and p.active
    where h.normalized_department=lower(trim(leading '- ' from department_name)) order by h.position limit 1;
    select id into primary_approver_id from public.approvers where normalized_department=lower(trim(leading '- ' from department_name)) and active limit 1;
    if primary_approver_id is null then
      insert into public.approvers(department,approver_name,approver_email,active) values(trim(department_name),primary_name,primary_email,true);
    else
      update public.approvers set department=trim(department_name),approver_name=primary_name,approver_email=primary_email,active=true,updated_at=now() where id=primary_approver_id;
    end if;
  end loop;
end $$;

revoke all on function public.set_approving_head_assignments(jsonb,uuid) from public,anon,authenticated;
grant execute on function public.set_approving_head_assignments(jsonb,uuid) to service_role;

commit;
