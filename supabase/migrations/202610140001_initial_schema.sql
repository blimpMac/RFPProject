begin;

create extension if not exists pgcrypto;
create sequence if not exists public.rfp_number_seq start with 1 increment by 1;

create type public.app_role as enum ('administrator', 'department_approver', 'finance_reviewer');
create type public.attachment_state as enum ('awaiting_upload', 'available', 'migration_pending', 'source_access_required', 'deleted');
create type public.email_state as enum ('queued', 'sending', 'sent', 'retry', 'failed', 'cancelled');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  department text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table public.approvers (
  id uuid primary key default gen_random_uuid(),
  department text not null,
  normalized_department text generated always as (lower(trim(leading '- ' from department))) stored,
  approver_name text not null,
  approver_email text not null,
  active boolean not null default true,
  source_worksheet text,
  source_row_number integer,
  import_batch_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint approvers_email_format check (approver_email ~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')
);
create unique index approvers_one_active_department on public.approvers(normalized_department) where active;

create table public.form_responses (
  id uuid primary key default gen_random_uuid(),
  source_timestamp timestamptz,
  requestor_email text,
  requestor_name text,
  department text,
  normalized_department text,
  project_class text,
  rfp_type text,
  normalized_rfp_type text,
  supplier_payee text,
  purpose_description text,
  amount numeric(14,2),
  required_payment_date date,
  supporting_documents text,
  approving_head text,
  matched_request_id uuid,
  match_status text not null default 'unreviewed' check (match_status in ('unreviewed','matched','unmatched','ambiguous')),
  match_method text,
  source_worksheet text not null default 'Form Responses 1',
  source_row_number integer,
  source_record_hash text,
  import_batch_id uuid,
  raw_record jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (source_worksheet, source_row_number, source_record_hash)
);

create table public.rfp_requests (
  id uuid primary key default gen_random_uuid(),
  rfp_number text unique,
  submitted_at timestamptz,
  requestor_email text not null,
  requestor_name text not null,
  department text not null,
  normalized_department text not null,
  project_class text not null,
  rfp_type text not null,
  normalized_rfp_type text not null,
  supplier_payee text not null,
  purpose_description text not null,
  amount numeric(14,2) not null check (amount > 0),
  required_payment_date date not null,
  supporting_documents_source text,
  approving_head text not null,
  approver_id uuid references public.approvers(id),
  approver_email text not null,
  department_approval text not null default 'Pending',
  department_approval_at timestamptz,
  department_approval_remarks text,
  department_approved_by uuid references public.profiles(id),
  finance_review text not null default 'Not Started',
  finance_review_at timestamptz,
  finance_remarks text,
  finance_reviewed_by uuid references public.profiles(id),
  final_status text not null default 'Draft Uploading',
  last_action text not null default 'Draft Created',
  planned_check_date date,
  check_date_last_updated timestamptz,
  check_date_change_reason text,
  finance_email_thread_id text,
  public_tracking_hash text,
  idempotency_key uuid unique,
  source_worksheet text,
  source_row_number integer,
  source_record_hash text,
  import_batch_id uuid,
  raw_record jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rfp_number_format check (rfp_number is null or rfp_number ~ '^RFP-[0-9]{4,}$')
);
alter table public.form_responses add constraint form_responses_request_fk foreign key (matched_request_id) references public.rfp_requests(id) on delete set null;

create table public.request_attachments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.rfp_requests(id) on delete cascade,
  original_filename text not null,
  storage_bucket text not null default 'rfp-attachments',
  storage_path text,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  status public.attachment_state not null default 'awaiting_upload',
  source_url text,
  source_file_id text,
  source_owner text,
  migration_error text,
  uploaded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (request_id, storage_path)
);

create table public.approval_logs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.rfp_requests(id) on delete restrict,
  rfp_number text not null,
  occurred_at timestamptz not null default now(),
  action text not null,
  actor_email text,
  actor_user_id uuid references public.profiles(id),
  remarks text,
  previous_status text,
  new_status text,
  source_worksheet text,
  source_row_number integer,
  source_record_hash text,
  import_batch_id uuid,
  raw_record jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (source_worksheet, source_row_number, source_record_hash)
);

create table public.process_flow_steps (
  id uuid primary key default gen_random_uuid(),
  display_order integer not null,
  stage text not null,
  activity text,
  responsible_party text,
  required_action text,
  target text,
  target_business_days integer,
  active boolean not null default true,
  source_worksheet text not null default 'Recommended Process Flow',
  source_row_number integer,
  import_batch_id uuid,
  raw_record jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (source_worksheet, source_row_number)
);

create table public.process_flow_reference_data (
  id uuid primary key default gen_random_uuid(),
  source_worksheet text not null default 'Recommended Process Flow',
  cell_address text not null,
  row_number integer not null,
  column_number integer not null,
  raw_value text,
  import_batch_id uuid,
  created_at timestamptz not null default now(),
  unique (source_worksheet, cell_address, import_batch_id)
);

create table public.email_notifications (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.rfp_requests(id) on delete cascade,
  template_key text not null,
  recipient_email text not null,
  subject text not null,
  payload jsonb not null default '{}'::jsonb,
  status public.email_state not null default 'queued',
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  next_attempt_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  sent_at timestamptz,
  provider_message_id text,
  last_error text,
  deduplication_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.approval_tokens (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.rfp_requests(id) on delete cascade,
  token_hash text not null unique,
  purpose text not null default 'department_review',
  reviewer_email text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.migration_batches (
  id uuid primary key default gen_random_uuid(),
  source_name text not null,
  source_file_id text,
  source_checksum text not null unique,
  status text not null default 'running' check (status in ('running','completed','completed_with_warnings','failed','rolled_back')),
  source_counts jsonb not null default '{}'::jsonb,
  imported_counts jsonb not null default '{}'::jsonb,
  skipped_counts jsonb not null default '{}'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_by uuid references public.profiles(id)
);

alter table public.approvers add constraint approvers_batch_fk foreign key (import_batch_id) references public.migration_batches(id);
alter table public.form_responses add constraint form_responses_batch_fk foreign key (import_batch_id) references public.migration_batches(id);
alter table public.rfp_requests add constraint requests_batch_fk foreign key (import_batch_id) references public.migration_batches(id);
alter table public.approval_logs add constraint logs_batch_fk foreign key (import_batch_id) references public.migration_batches(id);
alter table public.process_flow_steps add constraint flow_batch_fk foreign key (import_batch_id) references public.migration_batches(id);
alter table public.process_flow_reference_data add constraint flow_ref_batch_fk foreign key (import_batch_id) references public.migration_batches(id);

create table public.migration_row_maps (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.migration_batches(id) on delete cascade,
  worksheet_name text not null,
  source_row_number integer not null,
  source_record_hash text not null,
  target_table text,
  target_id uuid,
  result text not null check (result in ('imported','matched','unmatched','duplicate','skipped','error')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (worksheet_name, source_row_number, source_record_hash)
);

create table public.migration_source_snapshots (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.migration_batches(id) on delete restrict,
  worksheet_name text not null,
  source_row_number integer not null,
  source_record_hash text not null,
  raw_cells jsonb not null,
  created_at timestamptz not null default now(),
  unique (batch_id, worksheet_name, source_row_number)
);

create table public.system_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id text not null,
  operation text not null,
  actor_user_id uuid,
  actor_email text,
  old_values jsonb,
  new_values jsonb,
  occurred_at timestamptz not null default now()
);

create table public.submission_rate_limits (
  id bigint generated always as identity primary key,
  client_hash text not null,
  occurred_at timestamptz not null default now()
);

create index rfp_requests_status_idx on public.rfp_requests(final_status, submitted_at desc);
create index rfp_requests_department_idx on public.rfp_requests(normalized_department, submitted_at desc);
create index rfp_requests_approver_idx on public.rfp_requests(lower(approver_email), final_status);
create index approval_logs_request_idx on public.approval_logs(request_id, occurred_at desc);
create index approval_logs_rfp_idx on public.approval_logs(rfp_number, occurred_at desc);
create index attachments_request_idx on public.request_attachments(request_id, status);
create index email_queue_idx on public.email_notifications(status, next_attempt_at) where status in ('queued','retry');
create index rate_limits_idx on public.submission_rate_limits(client_hash, occurred_at desc);

insert into public.system_settings(key, value, description) values
  ('workflow_targets', '{"departmentApprovalDays":1,"financeReviewDays":2,"checkPreparationDays":3,"paymentReleaseDays":4}', 'Business-day workflow targets'),
  ('submission_options', '{"departments":["Sales","Operations","Engineering","IT","HR","Admin","Finance","Other"],"requestTypes":["Request for Payment","Supplier Payment","Project Expense","Reimbursement","Cash Advance","Other"]}', 'Public form choices'),
  ('upload_limits', '{"maxFiles":10,"maxSizeMb":10,"mimeTypes":["application/pdf","image/jpeg","image/png","image/webp","image/gif"]}', 'Attachment validation defaults')
on conflict (key) do nothing;

commit;
