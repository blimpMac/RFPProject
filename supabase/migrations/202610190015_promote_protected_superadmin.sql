begin;

insert into public.user_roles(user_id,role)
select id,'super_administrator'::public.app_role from auth.users
where lower(email)='dricianfranciscordon@gmail.com'
on conflict do nothing;

insert into public.user_roles(user_id,role)
select id,'administrator'::public.app_role from auth.users
where lower(email)='dricianfranciscordon@gmail.com'
on conflict do nothing;

update public.profiles p set active=true,updated_at=now()
from auth.users u where p.id=u.id and lower(u.email)='dricianfranciscordon@gmail.com';

commit;
