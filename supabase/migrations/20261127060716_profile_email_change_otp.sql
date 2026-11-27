begin;

create table if not exists public.profile_email_change_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  limit_date date not null,
  send_count integer not null default 0 check (send_count between 0 and 3),
  updated_at timestamptz not null default now(),
  primary key (user_id, limit_date)
);

create table if not exists public.profile_email_change_otps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  new_email text not null,
  otp_hash text not null check (length(otp_hash) = 64),
  attempt_count integer not null default 0 check (attempt_count between 0 and 5),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);

create index if not exists profile_email_change_otps_user_created_idx
  on public.profile_email_change_otps (user_id, created_at desc);

create index if not exists profile_email_change_otps_expiry_idx
  on public.profile_email_change_otps (expires_at)
  where consumed_at is null;

alter table public.profile_email_change_rate_limits enable row level security;
alter table public.profile_email_change_otps enable row level security;

revoke all on table public.profile_email_change_rate_limits from public, anon, authenticated;
revoke all on table public.profile_email_change_otps from public, anon, authenticated;
grant all on table public.profile_email_change_rate_limits to service_role;
grant all on table public.profile_email_change_otps to service_role;

create or replace function public.issue_profile_email_change_otp(
  p_user_id uuid,
  p_new_email text,
  p_otp_hash text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := (now() at time zone 'Asia/Manila')::date;
  v_count integer;
  v_id uuid;
begin
  if p_user_id is null or p_new_email is null or length(p_new_email) > 254
    or p_otp_hash is null or length(p_otp_hash) <> 64 then
    raise exception 'Invalid email-change challenge input';
  end if;

  insert into public.profile_email_change_rate_limits(user_id, limit_date, send_count)
  values (p_user_id, v_day, 1)
  on conflict (user_id, limit_date)
  do update set
    send_count = public.profile_email_change_rate_limits.send_count + 1,
    updated_at = now()
  where public.profile_email_change_rate_limits.send_count < 3
  returning send_count into v_count;

  if v_count is null then
    raise exception 'EMAIL_CHANGE_DAILY_LIMIT';
  end if;

  update public.profile_email_change_otps
    set consumed_at = now()
    where user_id = p_user_id and consumed_at is null;

  delete from public.profile_email_change_otps
    where user_id = p_user_id and created_at < now() - interval '30 days';
  delete from public.profile_email_change_rate_limits
    where limit_date < v_day - 90;

  insert into public.profile_email_change_otps(user_id, new_email, otp_hash, expires_at)
  values (p_user_id, lower(trim(p_new_email)), p_otp_hash, now() + interval '10 minutes')
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.verify_profile_email_change_otp(
  p_user_id uuid,
  p_otp_hash text
)
returns table(status text, new_email text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_challenge public.profile_email_change_otps%rowtype;
  v_attempts integer;
begin
  select *
    into v_challenge
    from public.profile_email_change_otps
    where user_id = p_user_id
    order by created_at desc
    limit 1
    for update;

  if not found then
    return query select 'missing'::text, null::text;
    return;
  end if;

  if v_challenge.consumed_at is not null then
    return query select 'used'::text, null::text;
    return;
  end if;

  if v_challenge.expires_at <= now() then
    update public.profile_email_change_otps set consumed_at = now() where id = v_challenge.id;
    return query select 'expired'::text, null::text;
    return;
  end if;

  if v_challenge.attempt_count >= 5 then
    update public.profile_email_change_otps set consumed_at = now() where id = v_challenge.id;
    return query select 'locked'::text, null::text;
    return;
  end if;

  if p_otp_hash is distinct from v_challenge.otp_hash then
    update public.profile_email_change_otps
      set attempt_count = attempt_count + 1,
          consumed_at = case when attempt_count + 1 >= 5 then now() else consumed_at end
      where id = v_challenge.id
      returning attempt_count into v_attempts;
    return query select case when v_attempts >= 5 then 'locked' else 'invalid' end, null::text;
    return;
  end if;

  update public.profile_email_change_otps
    set consumed_at = now()
    where id = v_challenge.id;

  return query select 'verified'::text, v_challenge.new_email;
end;
$$;

revoke all on function public.issue_profile_email_change_otp(uuid, text, text) from public, anon, authenticated;
revoke all on function public.verify_profile_email_change_otp(uuid, text) from public, anon, authenticated;
grant execute on function public.issue_profile_email_change_otp(uuid, text, text) to service_role;
grant execute on function public.verify_profile_email_change_otp(uuid, text) to service_role;

commit;
