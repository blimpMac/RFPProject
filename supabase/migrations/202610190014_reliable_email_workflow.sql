begin;

-- Improves request-scoped delivery and recovery without changing the workflow
-- function signatures used by already-deployed application versions.
create index if not exists email_notifications_request_delivery_idx
  on public.email_notifications(request_id,status,next_attempt_at,created_at);

create or replace function public.recover_stale_email_notifications()
returns integer language plpgsql security definer set search_path=public as $$
declare recovered integer;
begin
  update public.email_notifications
  set status='retry',next_attempt_at=now(),
    last_error=coalesce(last_error,'Delivery worker stopped before completion'),updated_at=now()
  where status='sending' and last_attempt_at<now()-interval '15 minutes' and attempt_count<max_attempts;
  get diagnostics recovered=row_count;
  return recovered;
end $$;

revoke all on function public.recover_stale_email_notifications() from public,anon,authenticated;
grant execute on function public.recover_stale_email_notifications() to service_role;

commit;
