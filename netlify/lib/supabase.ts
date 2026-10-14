import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

export function adminClient() {
  const c = config();
  return createClient(c.SUPABASE_URL, c.SUPABASE_SECRET_KEY || c.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
