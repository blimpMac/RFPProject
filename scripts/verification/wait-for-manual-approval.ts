import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const rfpNumber = process.env.RFP_NUMBER;
if (!supabaseUrl || !serviceKey || !rfpNumber)
  throw new Error('SUPABASE_URL, SUPABASE_SECRET_KEY, and RFP_NUMBER are required.');

const db = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const timeoutAt = Date.now() + 60 * 60_000;
let previousStatus = '';

while (Date.now() < timeoutAt) {
  const request = await db
    .from('rfp_requests')
    .select('final_status,department_approval,department_approval_at,last_action')
    .eq('rfp_number', rfpNumber)
    .single();
  if (request.error) throw request.error;
  if (request.data.final_status !== previousStatus) {
    previousStatus = request.data.final_status;
    console.log(
      JSON.stringify({
        rfpNumber,
        status: request.data.final_status,
        lastAction: request.data.last_action,
      }),
    );
  }
  if (request.data.final_status !== 'Pending Department Approval') {
    console.log(
      JSON.stringify(
        {
          ok: request.data.department_approval === 'Approved',
          rfpNumber,
          status: request.data.final_status,
          departmentApproval: request.data.department_approval,
          decidedAt: request.data.department_approval_at,
          lastAction: request.data.last_action,
        },
        null,
        2,
      ),
    );
    process.exit(0);
  }
  await new Promise((resolve) => setTimeout(resolve, 10_000));
}

throw new Error(`Timed out waiting for manual approval of ${rfpNumber}.`);
