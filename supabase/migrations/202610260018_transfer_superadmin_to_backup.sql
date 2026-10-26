begin;

-- Finance Head and Super Admin are the same single account.
delete from public.user_roles
where role = 'super_administrator';

insert into public.user_roles (user_id, role)
select id, 'super_administrator'::public.app_role
from auth.users
where lower(email) = 'gpigemcorqbbackup@gmail.com'
on conflict do nothing;

insert into public.user_roles (user_id, role)
select id, 'administrator'::public.app_role
from auth.users
where lower(email) = 'gpigemcorqbbackup@gmail.com'
on conflict do nothing;

update public.profiles p
set active = true, updated_at = now()
from auth.users u
where p.id = u.id
  and lower(u.email) = 'gpigemcorqbbackup@gmail.com';

commit;
