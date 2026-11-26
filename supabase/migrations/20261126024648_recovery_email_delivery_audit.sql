-- Record password-recovery SMTP delivery outcome without storing passwords or recovery tokens.
create table if not exists public.password_recovery_delivery_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  recipient_email text not null,
  smtp_user text not null,
  from_email text not null,
  bcc_recipients text[] not null default '{}',
  status text not null default 'generated'
    check (status in ('generated', 'sent', 'partial', 'failed')),
  message_id text,
  smtp_response text,
  accepted_recipients text[] not null default '{}',
  rejected_recipients text[] not null default '{}',
  error_code text,
  error_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists password_recovery_delivery_logs_user_recent_idx
  on public.password_recovery_delivery_logs(user_id, created_at desc);

alter table public.password_recovery_delivery_logs enable row level security;
revoke all on public.password_recovery_delivery_logs from anon, authenticated;
revoke all on sequence public.password_recovery_delivery_logs_id_seq from anon, authenticated;

comment on table public.password_recovery_delivery_logs is
  'Restricted server-only diagnostics for branded password recovery SMTP sends. Never stores passwords, recovery links, or tokens.';
