begin;

create extension if not exists pg_cron;

do $$
declare existing_job_id bigint;
begin
  for existing_job_id in select jobid from cron.job where jobname='rfp-temporary-test-cleanup' loop
    perform cron.unschedule(existing_job_id);
  end loop;
  perform cron.schedule(
    'rfp-temporary-test-cleanup',
    '*/15 * * * *',
    'select public.purge_expired_temporary_tests();'
  );
end $$;

commit;
