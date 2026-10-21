begin;

-- The primary operational owner retains both roles because existing RLS policies
-- use administrator for normal dashboard access and super_administrator for
-- account-management actions.
insert into public.user_roles(user_id,role)
select id,'super_administrator'::public.app_role from auth.users
where lower(email)='dricianfranciscordon@gmail.com'
on conflict do nothing;

insert into public.user_roles(user_id,role)
select id,'administrator'::public.app_role from auth.users
where lower(email)='dricianfranciscordon@gmail.com'
on conflict do nothing;

-- Keep the backup mailbox as an administrator and preserve any independent
-- department_approver assignment, but remove its super-administrator authority.
insert into public.user_roles(user_id,role)
select id,'administrator'::public.app_role from auth.users
where lower(email)='gpigemcorqbbackup@gmail.com'
on conflict do nothing;

delete from public.user_roles ur
using auth.users u
where ur.user_id=u.id
  and lower(u.email)='gpigemcorqbbackup@gmail.com'
  and ur.role='super_administrator';

update public.profiles p set active=true,updated_at=now()
from auth.users u
where p.id=u.id
  and lower(u.email) in ('dricianfranciscordon@gmail.com','gpigemcorqbbackup@gmail.com');

commit;
