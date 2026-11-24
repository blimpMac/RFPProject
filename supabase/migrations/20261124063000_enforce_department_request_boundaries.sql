-- Keep Department Head reads scoped to their department even when a legacy
-- administrator role is also present. Finance roles and Finance Head retain
-- access to requests across all departments.

drop policy if exists requests_admin_read on public.rfp_requests;
drop policy if exists requests_finance_read on public.rfp_requests;
create policy requests_finance_read on public.rfp_requests for select using (
  (select public.has_role('finance_reviewer'))
  or (select public.has_role('super_administrator'))
);

drop policy if exists logs_staff_read on public.approval_logs;
create policy logs_staff_read on public.approval_logs for select using (
  (select public.has_role('super_administrator'))
  or (select public.has_role('finance_reviewer'))
  or exists (
    select 1 from public.rfp_requests r
    join public.profiles p on p.id = (select auth.uid()) and p.active
    where r.id = approval_logs.request_id
      and (select public.has_role('department_approver'))
      and lower(trim(leading '- ' from p.department)) = r.normalized_department
  )
);

drop policy if exists attachments_staff_read on public.request_attachments;
create policy attachments_staff_read on public.request_attachments for select using (
  (select public.has_role('super_administrator'))
  or (select public.has_role('finance_reviewer'))
  or exists (
    select 1 from public.rfp_requests r
    join public.profiles p on p.id = (select auth.uid()) and p.active
    where r.id = request_attachments.request_id
      and (select public.has_role('department_approver'))
      and lower(trim(leading '- ' from p.department)) = r.normalized_department
  )
);

drop policy if exists storage_staff_read on storage.objects;
create policy storage_staff_read on storage.objects for select using (
  bucket_id = 'rfp-attachments'
  and (
    (select public.has_role('super_administrator'))
    or (select public.has_role('finance_reviewer'))
    or exists (
      select 1 from public.rfp_requests r
      join public.profiles p on p.id = (select auth.uid()) and p.active
      where r.id::text = split_part(storage.objects.name, '/', 1)
        and (select public.has_role('department_approver'))
        and lower(trim(leading '- ' from p.department)) = r.normalized_department
    )
  )
);

drop policy if exists forms_admin_read on public.form_responses;
create policy forms_admin_read on public.form_responses for select using (
  (select public.has_role('super_administrator'))
);
drop policy if exists audit_admin_read on public.audit_logs;
create policy audit_admin_read on public.audit_logs for select using (
  (select public.has_role('super_administrator'))
);
