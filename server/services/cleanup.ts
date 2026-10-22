import { adminClient } from '../lib/supabase.js';

type DatabaseClient = ReturnType<typeof adminClient>;

export async function cleanupExpiredTemporaryTests(db: DatabaseClient) {
  const result = await db.rpc('purge_expired_temporary_tests');
  if (result.error) throw result.error;
  return Number(result.data || 0);
}

export async function cleanupAbandonedUploads(db: DatabaseClient, olderThanHours = 24) {
  const cutoff = new Date(Date.now() - olderThanHours * 60 * 60_000).toISOString();
  const requests = await db
    .from('rfp_requests')
    .select('id')
    .eq('final_status', 'Draft Uploading')
    .lt('created_at', cutoff);
  if (requests.error) throw requests.error;

  for (const request of requests.data || []) {
    const listed = await db.storage.from('rfp-attachments').list(request.id, { limit: 100 });
    if (listed.error) throw listed.error;
    if (listed.data?.length) {
      const removed = await db.storage
        .from('rfp-attachments')
        .remove(listed.data.map((file) => `${request.id}/${file.name}`));
      if (removed.error) throw removed.error;
    }
    const deleted = await db.from('rfp_requests').delete().eq('id', request.id);
    if (deleted.error) throw deleted.error;
  }
  return requests.data?.length || 0;
}

export async function cleanupRateLimits(db: DatabaseClient, olderThanHours = 24) {
  const cutoff = new Date(Date.now() - olderThanHours * 60 * 60_000).toISOString();
  const result = await db.from('submission_rate_limits').delete().lt('occurred_at', cutoff);
  if (result.error) throw result.error;
}
