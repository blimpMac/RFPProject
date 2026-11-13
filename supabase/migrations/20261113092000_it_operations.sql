-- IT operations are kept separate from finance/payment authority.
-- No client-side RLS grants: all access is through the authenticated, IT-only API.
create table if not exists public.it_administrators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id),
  active boolean not null default true
);
create table if not exists public.staff_presence (
  user_id uuid not null references auth.users(id) on delete cascade,
  session_hash text not null,
  signed_in_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  signed_out_at timestamptz,
  last_path text,
  primary key (user_id,session_hash)
);
create index if not exists staff_presence_recent_idx on public.staff_presence(last_seen_at desc);
create table if not exists public.it_security_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_user_id uuid references auth.users(id),
  target_user_id uuid references auth.users(id),
  action text not null check (length(action) <= 100),
  details jsonb not null default '{}'::jsonb
);
create index if not exists it_security_events_recent_idx on public.it_security_events(occurred_at desc);
alter table public.it_administrators enable row level security;
alter table public.staff_presence enable row level security;
alter table public.it_security_events enable row level security;
revoke all on public.it_administrators from anon, authenticated;
revoke all on public.staff_presence from anon, authenticated;
revoke all on public.it_security_events from anon, authenticated;
revoke all on sequence public.it_security_events_id_seq from anon, authenticated;
comment on table public.it_administrators is 'IT-only operator access; never grants finance approval privileges.';
comment on table public.staff_presence is 'Authenticated heartbeat evidence; online means last heartbeat within three minutes.';
comment on table public.it_security_events is 'IT administration actions; no passwords, SMTP credentials or access tokens are stored.';
