begin;

-- Keep independent yearly counters for regular RFPs, Cash Advances, and
-- Revolving Funds. The sequence for each family is shared by its request and
-- liquidation forms.
alter table public.rfp_number_year_sequences
  add column if not exists prefix text not null default 'RFP';

alter table public.rfp_number_year_sequences
  drop constraint if exists rfp_number_year_sequences_pkey;
alter table public.rfp_number_year_sequences
  add constraint rfp_number_year_sequences_pkey primary key (year, prefix);
alter table public.rfp_number_year_sequences
  drop constraint if exists rfp_number_year_sequences_prefix_check;
alter table public.rfp_number_year_sequences
  add constraint rfp_number_year_sequences_prefix_check check (prefix in ('RFP', 'CA', 'RF'));

-- Preserve previously allocated unyearly CA/RF numbers, including numbers
-- whose requests were later removed, by considering the original sequences.
with current_year as (
  select extract(year from (now() at time zone 'Asia/Manila'))::integer as year
), legacy_values as (
  select 'CA'::text as prefix, last_value::bigint as last_number
  from public.ca_number_seq
  union all
  select 'RF'::text, last_value::bigint
  from public.rf_number_seq
), legacy_records as (
  select case when reference ~ '^CA-[0-9]+$' then 'CA' else 'RF' end as prefix,
         substring(reference from '([0-9]+)$')::bigint as last_number
  from (
    select rfp_number as reference from public.rfp_requests
    union all
    select rfp_number as reference from public.approval_logs
  ) as number_sources
  where reference ~ '^(CA|RF)-[0-9]+$'
), family_max as (
  select prefix, max(last_number) as last_number
  from (select * from legacy_values union all select * from legacy_records) as family_values
  group by prefix
)
insert into public.rfp_number_year_sequences(year, prefix, last_number)
select current_year.year, family_max.prefix, family_max.last_number
from current_year cross join family_max
on conflict (year, prefix) do update
set last_number = greatest(public.rfp_number_year_sequences.last_number, excluded.last_number);

-- Seed all already used year-prefixed references, including immutable logs,
-- so deleted requests never cause a previously issued number to be reused.
with existing_numbers as (
  select substring(reference from '^(RFP|CA|RF)-') as prefix,
         substring(reference from '^[^-]+-([0-9]{4})-')::integer as year,
         substring(reference from '-([0-9]+)$')::bigint as last_number
  from (
    select rfp_number as reference from public.rfp_requests
    union all
    select rfp_number as reference from public.approval_logs
  ) as number_sources
  where reference ~ '^(RFP|CA|RF)-[0-9]{4}-[0-9]+$'
)
insert into public.rfp_number_year_sequences(year, prefix, last_number)
select year, prefix, max(last_number)
from existing_numbers
group by year, prefix
on conflict (year, prefix) do update
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
    insert into public.rfp_number_year_sequences(year, prefix, last_number)
    values (v_year, 'RFP', 1)
    on conflict (year, prefix) do update
      set last_number = public.rfp_number_year_sequences.last_number + 1
    returning last_number into v_number;

    candidate := 'RFP-' || v_year::text || '-' || lpad(v_number::text, 4, '0');
    exit when not exists (
      select 1 from public.rfp_requests where rfp_number = candidate
      union all
      select 1 from public.approval_logs where rfp_number = candidate
    );
  end loop;
  return candidate;
end;
$$;

create or replace function public.next_rfp_number(p_request_type text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text;
  v_year integer := extract(year from (now() at time zone 'Asia/Manila'))::integer;
  v_number bigint;
  candidate text;
begin
  v_prefix := case
    when coalesce(p_request_type, '') ~* '(cash advance|(^|[^A-Za-z])CA([^A-Za-z]|$))' then 'CA'
    when coalesce(p_request_type, '') ~* '(revolving fund|(^|[^A-Za-z])RF([^A-Za-z]|$))' then 'RF'
    else 'RFP'
  end;

  if v_prefix = 'RFP' then
    return public.next_rfp_number();
  end if;

  loop
    insert into public.rfp_number_year_sequences(year, prefix, last_number)
    values (v_year, v_prefix, 1)
    on conflict (year, prefix) do update
      set last_number = public.rfp_number_year_sequences.last_number + 1
    returning last_number into v_number;

    candidate := v_prefix || '-' || v_year::text || '-' || lpad(v_number::text, 4, '0');
    exit when not exists (
      select 1 from public.rfp_requests where rfp_number = candidate
      union all
      select 1 from public.approval_logs where rfp_number = candidate
    );
  end loop;
  return candidate;
end;
$$;

revoke all on function public.next_rfp_number() from public, anon, authenticated;
grant execute on function public.next_rfp_number() to service_role;
revoke all on function public.next_rfp_number(text) from public, anon, authenticated;
grant execute on function public.next_rfp_number(text) to service_role;

alter table public.rfp_requests drop constraint if exists rfp_number_format;
alter table public.rfp_requests add constraint rfp_number_format check (
  rfp_number is null
  or rfp_number ~ '^(RFP-[0-9]{4,}|CA-[0-9]{4,}|RF-[0-9]{4,}|(RFP|CA|RF)-[0-9]{4}-[0-9]{4,}|DEMO-RFP-[0-9]{3})$'
);

commit;

