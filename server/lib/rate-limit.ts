import { adminClient } from './supabase.js';
import { config } from './config.js';
import { clientHash } from './crypto.js';
import { HttpError, type ApplicationEvent } from './http.js';

export async function enforceSubmissionLimit(event: ApplicationEvent) {
  const c = config();
  const ip =
    event.headers['x-nf-client-connection-ip'] ||
    event.headers['x-forwarded-for']?.split(',')[0] ||
    'unknown';
  const hash = clientHash(ip);
  const db = adminClient();
  const { data, error } = await db.rpc('record_submission_attempt', {
    p_client_hash: hash,
    p_window_minutes: c.RATE_LIMIT_WINDOW_MINUTES,
    p_max_attempts: c.RATE_LIMIT_MAX_SUBMISSIONS,
  });
  if (error) throw error;
  if (!data) throw new HttpError(429, 'Too many submissions. Please try again later.');
}
