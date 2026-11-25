-- Align Finance Member approval measurement with the agreed three-business-day SLA.
UPDATE public.system_settings
SET value = jsonb_set(
  COALESCE(value, '{}'::jsonb),
  '{financeReviewDays}',
  '3'::jsonb,
  true
)
WHERE key = 'workflow_targets';
