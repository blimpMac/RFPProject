-- A Finance Member with no saved checklist must not receive every request alert.
-- Keep legacy/non-member destinations and non-member templates unchanged.
create or replace function public.finance_notification_allowed(
  p_recipient_email text, p_request_type text, p_template_key text
) returns boolean
language plpgsql stable set search_path = ''
as $allowed$
declare
  selected text[];
  is_finance_member boolean := false;
begin
  if p_template_key not in (
    'finance_review_required', 'hard_copy_verification_required', 'liquidation_submitted'
  ) then return true; end if;

  select true, pref.allowed_types into is_finance_member, selected
  from public.profiles p
  join public.user_roles ur on ur.user_id = p.id and ur.role = 'finance_reviewer'
  left join public.finance_email_preferences pref on pref.user_id = p.id
  where lower(p.email) = lower(btrim(coalesce(p_recipient_email, '')))
  and not exists (
    select 1 from public.user_roles head
    where head.user_id = p.id and head.role = 'super_administrator'
  )
  limit 1;

  -- Preserve delivery to legacy destinations that are not Finance Member accounts.
  if not found then return true; end if;
  -- A Finance Member must have an explicit checklist before receiving request alerts.
  if not is_finance_member or selected is null then return false; end if;
  return public.finance_request_email_category(p_request_type) = any(selected);
end
$allowed$;

revoke all on function public.finance_notification_allowed(text,text,text)
  from public, anon, authenticated;
grant execute on function public.finance_notification_allowed(text,text,text) to service_role;
comment on function public.finance_notification_allowed(text,text,text) is
  'Finance Member request-category filter. Unconfigured Finance Members receive no request alerts; the sender also checks queued jobs before delivery.';
