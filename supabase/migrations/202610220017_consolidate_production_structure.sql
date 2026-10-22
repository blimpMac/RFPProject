begin;

alter table public.profiles
  add column if not exists protected_account boolean not null default false;

update public.profiles
set protected_account = true
where lower(email) in (
  'gpigemcorqbbackup@gmail.com',
  'dricianfranciscordon@gmail.com'
);

create or replace function public.prevent_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception '% is immutable', tg_table_name;
end
$$;

do $$
declare
  existing_job_id bigint;
begin
  for existing_job_id in
    select jobid from cron.job where jobname = 'rfp-temporary-test-cleanup'
  loop
    perform cron.unschedule(existing_job_id);
  end loop;
exception
  when undefined_table then null;
end
$$;

drop function if exists public.purge_expired_temporary_tests();
drop table if exists public.temporary_test_runs;

commit;
