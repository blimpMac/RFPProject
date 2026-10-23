begin;

alter table public.rfp_requests add column if not exists company text;
alter table public.form_responses add column if not exists company text;

update public.form_responses f
set company=r.company
from public.rfp_requests r
where f.matched_request_id=r.id and f.company is null and r.company is not null;

alter table public.rfp_requests drop constraint if exists rfp_requests_company_check;
alter table public.rfp_requests add constraint rfp_requests_company_check check (
  company in ('Greenlight Power Inc.','Greenmetal Electric Manufacturing Corp.')
);
alter table public.form_responses drop constraint if exists form_responses_company_check;
alter table public.form_responses add constraint form_responses_company_check check (
  company in ('Greenlight Power Inc.','Greenmetal Electric Manufacturing Corp.')
);

alter table public.rfp_requests drop constraint if exists rfp_number_format;
alter table public.rfp_requests add constraint rfp_number_format check (
  rfp_number is null or rfp_number ~ '^(RFP-[0-9]{4,}|DEMO-RFP-[0-9]{3})$'
);

create or replace function public.copy_request_company_to_form_response() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.matched_request_id is not null then
    select company into new.company from public.rfp_requests where id=new.matched_request_id;
  end if;
  return new;
end $$;

drop trigger if exists copy_request_company_to_form_response on public.form_responses;
create trigger copy_request_company_to_form_response
before insert or update of matched_request_id on public.form_responses
for each row execute function public.copy_request_company_to_form_response();

with demo(
  id,number,days_ago,company,status,department_approval,finance_review,last_action
) as (values
  ('11000000-0000-4000-8000-000000000001'::uuid,'DEMO-RFP-001',11,'Greenlight Power Inc.','Draft Uploading','Pending','Not Started','Draft Created'),
  ('11000000-0000-4000-8000-000000000002'::uuid,'DEMO-RFP-002',10,'Greenmetal Electric Manufacturing Corp.','Pending Department Approval','Pending','Not Started','Submitted'),
  ('11000000-0000-4000-8000-000000000003'::uuid,'DEMO-RFP-003',9,'Greenlight Power Inc.','Returned to Requestor','Rejected','Not Started','Returned to Requestor'),
  ('11000000-0000-4000-8000-000000000004'::uuid,'DEMO-RFP-004',8,'Greenmetal Electric Manufacturing Corp.','Pending Finance Review','Approved','Pending','Department Approved'),
  ('11000000-0000-4000-8000-000000000005'::uuid,'DEMO-RFP-005',7,'Greenlight Power Inc.','Documentation Required','Approved','Documentation Required','Documentation Required'),
  ('11000000-0000-4000-8000-000000000006'::uuid,'DEMO-RFP-006',6,'Greenmetal Electric Manufacturing Corp.','Returned to Department Approver','Approved','Returned','Finance Returned'),
  ('11000000-0000-4000-8000-000000000007'::uuid,'DEMO-RFP-007',5,'Greenlight Power Inc.','Processing','Approved','Approved','Processing Started'),
  ('11000000-0000-4000-8000-000000000008'::uuid,'DEMO-RFP-008',4,'Greenmetal Electric Manufacturing Corp.','Check Preparation','Approved','Approved','Check Preparation'),
  ('11000000-0000-4000-8000-000000000009'::uuid,'DEMO-RFP-009',3,'Greenlight Power Inc.','Check Approval','Approved','Approved','Check Approval'),
  ('11000000-0000-4000-8000-000000000010'::uuid,'DEMO-RFP-010',2,'Greenmetal Electric Manufacturing Corp.','Check Released','Approved','Approved','Check Released'),
  ('11000000-0000-4000-8000-000000000011'::uuid,'DEMO-RFP-011',1,'Greenlight Power Inc.','Paid','Approved','Approved','Payment Completed')
)
insert into public.rfp_requests(
  id,rfp_number,submitted_at,requestor_email,requestor_name,company,department,
  normalized_department,project_class,rfp_type,normalized_rfp_type,supplier_payee,
  purpose_description,amount,required_payment_date,approving_head,approver_email,
  department_approval,department_approval_at,department_approval_remarks,
  finance_review,finance_review_at,finance_remarks,final_status,last_action,
  planned_check_date,source_worksheet,source_row_number,source_record_hash,raw_record,version
)
select
  id,number,case when status='Draft Uploading' then null else now()-(days_ago||' days')::interval end,
  'demo.requestor+'||lpad(row_number() over(order by number)::text,2,'0')||'@example.com',
  'Demo Requestor '||lpad(row_number() over(order by number)::text,2,'0'),company,
  case when row_number() over(order by number)%2=0 then 'Finance' else 'Operations' end,
  case when row_number() over(order by number)%2=0 then 'finance' else 'operations' end,
  'Demo Project '||lpad(row_number() over(order by number)::text,2,'0'),'Supplier Payment','supplier payment',
  'Demo Supplier '||lpad(row_number() over(order by number)::text,2,'0'),
  'Demonstration request for the '||status||' workflow state.',
  12500+(row_number() over(order by number)*3750),current_date+(row_number() over(order by number)::int+7),
  'Demo Approving Head','demo.approver@example.com',department_approval,
  case when department_approval in ('Approved','Rejected') then now()-((days_ago-1)||' days')::interval end,
  case when department_approval='Rejected' then 'Demo correction requested.' end,
  finance_review,
  case when finance_review not in ('Not Started','Pending') then now()-greatest(days_ago-2,0)*interval '1 day' end,
  case when finance_review in ('Documentation Required','Returned') then 'Demo finance follow-up.' end,
  status,last_action,
  case when status in ('Processing','Check Preparation','Check Approval','Check Released','Paid') then current_date+7 end,
  'Demo Data',row_number() over(order by number)::int,'demo-'||number,jsonb_build_object('demo',true),1
from demo
on conflict(id) do update set
  company=excluded.company,
  final_status=excluded.final_status,
  last_action=excluded.last_action,
  department_approval=excluded.department_approval,
  finance_review=excluded.finance_review,
  purpose_description=excluded.purpose_description,
  raw_record=excluded.raw_record;

insert into public.form_responses(
  id,source_timestamp,requestor_email,requestor_name,company,department,normalized_department,
  project_class,rfp_type,normalized_rfp_type,supplier_payee,purpose_description,amount,
  required_payment_date,approving_head,matched_request_id,match_status,match_method,
  source_worksheet,source_row_number,source_record_hash,raw_record
)
select
  md5('form-'||r.id::text)::uuid,r.submitted_at,r.requestor_email,r.requestor_name,r.company,
  r.department,r.normalized_department,r.project_class,r.rfp_type,r.normalized_rfp_type,
  r.supplier_payee,r.purpose_description,r.amount,r.required_payment_date,r.approving_head,
  r.id,'matched','demo_seed','Demo Data',r.source_row_number,r.source_record_hash,jsonb_build_object('demo',true)
from public.rfp_requests r
where r.source_worksheet='Demo Data' and r.submitted_at is not null
on conflict(id) do update set
  company=excluded.company,
  source_timestamp=excluded.source_timestamp,
  match_status=excluded.match_status,
  raw_record=excluded.raw_record;

insert into public.approval_logs(
  id,request_id,rfp_number,occurred_at,action,actor_email,remarks,previous_status,new_status,
  source_worksheet,source_row_number,source_record_hash,raw_record
)
select
  md5('log-'||r.id::text)::uuid,r.id,r.rfp_number,r.submitted_at+interval '1 hour',r.last_action,
  'demo.finance@example.com','Demonstration workflow record.',null,r.final_status,
  'Demo Data',r.source_row_number,r.source_record_hash,jsonb_build_object('demo',true)
from public.rfp_requests r
where r.source_worksheet='Demo Data' and r.submitted_at is not null
on conflict(id) do update set
  action=excluded.action,
  new_status=excluded.new_status,
  remarks=excluded.remarks,
  raw_record=excluded.raw_record;

commit;
