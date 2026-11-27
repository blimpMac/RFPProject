begin;

alter table public.profile_email_change_otps
  add column if not exists verified_at timestamptz;

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
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 918273));

  select *
    into v_challenge
    from public.profile_email_change_otps
    where user_id = p_user_id
    order by challenge_sequence desc
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
    update public.profile_email_change_otps
      set consumed_at = now()
      where id = v_challenge.id;
    return query select 'expired'::text, null::text;
    return;
  end if;

  if v_challenge.attempt_count >= 5 then
    update public.profile_email_change_otps
      set consumed_at = now()
      where id = v_challenge.id;
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
    set verified_at = coalesce(verified_at, now())
    where id = v_challenge.id;

  return query select 'verified'::text, v_challenge.new_email;
end;
$$;

create or replace function public.consume_profile_email_change_otp(
  p_user_id uuid,
  p_otp_hash text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_challenge public.profile_email_change_otps%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 918273));

  select *
    into v_challenge
    from public.profile_email_change_otps
    where user_id = p_user_id
    order by challenge_sequence desc
    limit 1
    for update;

  if not found
    or v_challenge.consumed_at is not null
    or v_challenge.verified_at is null
    or v_challenge.expires_at <= now()
    or p_otp_hash is distinct from v_challenge.otp_hash then
    return false;
  end if;

  update public.profile_email_change_otps
    set consumed_at = now()
    where id = v_challenge.id;

  return true;
end;
$$;

revoke all on function public.issue_profile_email_change_otp(uuid, text, text) from public, anon, authenticated;
revoke all on function public.verify_profile_email_change_otp(uuid, text) from public, anon, authenticated;
revoke all on function public.consume_profile_email_change_otp(uuid, text) from public, anon, authenticated;

grant execute on function public.issue_profile_email_change_otp(uuid, text, text) to service_role;
grant execute on function public.verify_profile_email_change_otp(uuid, text) to service_role;
grant execute on function public.consume_profile_email_change_otp(uuid, text) to service_role;

commit;
