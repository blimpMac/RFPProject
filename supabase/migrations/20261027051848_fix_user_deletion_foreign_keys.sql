alter table public.approval_logs
  drop constraint if exists approval_logs_actor_user_id_fkey,
  add constraint approval_logs_actor_user_id_fkey
    foreign key (actor_user_id) references public.profiles(id) on delete set null;

alter table public.department_approving_heads
  drop constraint if exists department_approving_heads_created_by_fkey,
  add constraint department_approving_heads_created_by_fkey
    foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.migration_batches
  drop constraint if exists migration_batches_created_by_fkey,
  add constraint migration_batches_created_by_fkey
    foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.rfp_requests
  drop constraint if exists rfp_requests_department_approved_by_fkey,
  add constraint rfp_requests_department_approved_by_fkey
    foreign key (department_approved_by) references public.profiles(id) on delete set null,
  drop constraint if exists rfp_requests_finance_reviewed_by_fkey,
  add constraint rfp_requests_finance_reviewed_by_fkey
    foreign key (finance_reviewed_by) references public.profiles(id) on delete set null;

alter table public.system_settings
  drop constraint if exists system_settings_updated_by_fkey,
  add constraint system_settings_updated_by_fkey
    foreign key (updated_by) references public.profiles(id) on delete set null;

alter table public.user_roles
  drop constraint if exists user_roles_granted_by_fkey,
  add constraint user_roles_granted_by_fkey
    foreign key (granted_by) references public.profiles(id) on delete set null;
