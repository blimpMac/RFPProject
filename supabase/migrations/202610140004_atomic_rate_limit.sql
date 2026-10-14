begin;

create or replace function public.record_submission_attempt(p_client_hash text,p_window_minutes integer,p_max_attempts integer)
returns boolean language plpgsql security definer set search_path=public as $$
declare attempts integer;
begin
  if p_window_minutes < 1 or p_max_attempts < 1 then raise exception 'Invalid rate-limit configuration'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_client_hash,0));
  select count(*) into attempts from public.submission_rate_limits
    where client_hash=p_client_hash and occurred_at>=now()-make_interval(mins=>p_window_minutes);
  if attempts >= p_max_attempts then return false; end if;
  insert into public.submission_rate_limits(client_hash) values(p_client_hash);
  return true;
end $$;

revoke all on function public.record_submission_attempt(text,integer,integer) from public,anon,authenticated;
grant execute on function public.record_submission_attempt(text,integer,integer) to service_role;

commit;
