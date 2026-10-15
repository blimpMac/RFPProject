begin;

drop policy if exists requests_department_read on public.rfp_requests;
create policy requests_department_read on public.rfp_requests for select using (
  public.has_role('department_approver')
  and exists (
    select 1 from public.profiles
    where id=auth.uid() and active
      and lower(trim(leading '- ' from department))=rfp_requests.normalized_department
  )
);

drop policy if exists logs_staff_read on public.approval_logs;
create policy logs_staff_read on public.approval_logs for select using (
  public.has_role('administrator') or public.has_role('super_administrator') or public.has_role('finance_reviewer')
  or exists (
    select 1 from public.rfp_requests r
    join public.profiles p on p.id=auth.uid() and p.active
    where r.id=approval_logs.request_id and public.has_role('department_approver')
      and lower(trim(leading '- ' from p.department))=r.normalized_department
  )
);

drop policy if exists attachments_staff_read on public.request_attachments;
create policy attachments_staff_read on public.request_attachments for select using (
  public.has_role('administrator') or public.has_role('super_administrator') or public.has_role('finance_reviewer')
  or exists (
    select 1 from public.rfp_requests r
    join public.profiles p on p.id=auth.uid() and p.active
    where r.id=request_attachments.request_id and public.has_role('department_approver')
      and lower(trim(leading '- ' from p.department))=r.normalized_department
  )
);

drop policy if exists storage_staff_read on storage.objects;
create policy storage_staff_read on storage.objects for select using (
  bucket_id='rfp-attachments' and (
    public.has_role('administrator') or public.has_role('super_administrator') or public.has_role('finance_reviewer')
    or exists (
      select 1 from public.rfp_requests r
      join public.profiles p on p.id=auth.uid() and p.active
      where r.id::text=split_part(storage.objects.name,'/',1) and public.has_role('department_approver')
        and lower(trim(leading '- ' from p.department))=r.normalized_department
    )
  )
);

commit;
