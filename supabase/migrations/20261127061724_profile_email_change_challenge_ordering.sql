begin;

alter table public.profile_email_change_otps
  add column if not exists challenge_sequence bigint generated always as identity;

create index if not exists profile_email_change_otps_user_sequence_idx
  on public.profile_email_change_otps (user_id, challenge_sequence desc);

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

  update public.profile_email_change_otps set consumed_at = now() where id = v_challenge.id;
  return query select 'verified'::text, v_challenge.new_email;
end;
$$;

commit;
