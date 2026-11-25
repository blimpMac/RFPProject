begin;

create table if not exists public.rfp_number_year_sequences (
  year integer primary key check (year between 2000 and 9999),
  last_number bigint not null check (last_number >= 0)
);

alter table public.rfp_number_year_sequences enable row level security;
revoke all on public.rfp_number_year_sequences from public, anon, authenticated;

-- Seed formatted years from any existing records and keep today's sequence above
-- every existing reference so test cleanup never causes reference reuse.
with existing_years as (
  select substring(reference from '^RFP-([0-9]{4})-')::integer as year,
         substring(reference from '-([0-9]+)$')::bigint as number
  from (
    select rfp_number as reference from public.rfp_requests
    union all
    select rfp_number as reference from public.approval_logs
  ) as number_sources
  where reference ~ '^RFP-[0-9]{4}-[0-9]+$'
)
insert into public.rfp_number_year_sequences(year, last_number)
select year, max(number) from existing_years group by year
on conflict (year) do update
set last_number = greatest(public.rfp_number_year_sequences.last_number, excluded.last_number);

with current_year as (
  select extract(year from (now() at time zone 'Asia/Manila'))::integer as year
), legacy_max as (
  select coalesce(max(substring(reference from '([0-9]+)$')::bigint), 0) as last_number
  from (
    select rfp_number as reference from public.rfp_requests
    union all
    select rfp_number as reference from public.approval_logs
  ) as number_sources
  where reference ~ '^(RFP|CA|RF)-[0-9]+$'
)
insert into public.rfp_number_year_sequences(year, last_number)
select current_year.year, legacy_max.last_number from current_year cross join legacy_max
on conflict (year) do update
set last_number = greatest(public.rfp_number_year_sequences.last_number, excluded.last_number);

create or replace function public.next_rfp_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year integer := extract(year from (now() at time zone 'Asia/Manila'))::integer;
  v_number bigint;
  candidate text;
begin
  loop
    insert into public.rfp_number_year_sequences(year, last_number)
    values (v_year, 1)
    on conflict (year) do update
      set last_number = public.rfp_number_year_sequences.last_number + 1
    returning last_number into v_number;

    candidate := 'RFP-' || v_year::text || '-' || lpad(v_number::text, 4, '0');
    exit when not exists (
      select 1 from public.rfp_requests where rfp_number = candidate
    );
  end loop;
  return candidate;
end;
$$;

create or replace function public.next_rfp_number(p_request_type text)
returns text
language sql
security definer
set search_path = public
as $$
  select public.next_rfp_number();
$$;

revoke all on function public.next_rfp_number() from public, anon, authenticated;
grant execute on function public.next_rfp_number() to service_role;
revoke all on function public.next_rfp_number(text) from public, anon, authenticated;
grant execute on function public.next_rfp_number(text) to service_role;

alter table public.rfp_requests drop constraint if exists rfp_number_format;
alter table public.rfp_requests add constraint rfp_number_format check (
  rfp_number is null
  or rfp_number ~ '^(RFP-[0-9]{4,}|CA-[0-9]{4,}|RF-[0-9]{4,}|RFP-[0-9]{4}-[0-9]{4,}|DEMO-RFP-[0-9]{3})$'
);

commit;

