import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const rfpNumber = process.env.RFP_NUMBER;

if (!supabaseUrl || !serviceKey || !rfpNumber) {
  throw new Error('SUPABASE_URL, SUPABASE_SECRET_KEY, and RFP_NUMBER are required.');
}

const db = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const request = await db.from('rfp_requests').select('id').eq('rfp_number', rfpNumber).single();
if (request.error) throw request.error;

const notifications = await db
  .from('email_notifications')
  .select('template_key,status,attempt_count,last_error,sent_at')
  .eq('request_id', request.data.id)
  .order('created_at');
if (notifications.error) throw notifications.error;

console.log(
  JSON.stringify(
    {
      rfpNumber,
      notifications: (notifications.data || []).map((row) => ({
        template: row.template_key,
        status: row.status,
        attemptCount: row.attempt_count,
        sent: Boolean(row.sent_at),
        error: row.last_error,
      })),
    },
    null,
    2,
  ),
);
