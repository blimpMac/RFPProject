import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY are required.');
const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const decided = await db
  .from('rfp_requests')
  .select('id')
  .neq('final_status', 'Pending Department Approval');
if (decided.error) throw decided.error;
const ids = (decided.data || []).map((request) => request.id);
let cancelled = 0;
if (ids.length) {
  const result = await db
    .from('email_notifications')
    .update({
      status: 'cancelled',
      last_error: 'Request is no longer awaiting department approval',
      updated_at: new Date().toISOString(),
    })
    .in('request_id', ids)
    .eq('template_key', 'supervisor_review')
    .in('status', ['queued', 'retry'])
    .select('id');
  if (result.error) throw result.error;
  cancelled = result.data?.length || 0;
}
console.log(
  JSON.stringify({ ok: true, cancelledObsoleteDepartmentReviewNotifications: cancelled }, null, 2),
);
