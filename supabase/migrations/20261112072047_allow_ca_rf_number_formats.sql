begin;

-- The separate CA/RF number generator introduced RF-#### and CA-####,
-- so the request table must accept those references as well as RFP numbers.
alter table public.rfp_requests drop constraint if exists rfp_number_format;
alter table public.rfp_requests add constraint rfp_number_format check (
  rfp_number is null
  or rfp_number ~ '^(RFP-[0-9]{4,}|CA-[0-9]{4,}|RF-[0-9]{4,}|DEMO-RFP-[0-9]{3})$'
);

commit;
