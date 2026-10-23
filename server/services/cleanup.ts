import { adminClient } from '../lib/supabase.js';

type DatabaseClient = ReturnType<typeof adminClient>;

export async function cleanupAbandonedUploads(db: DatabaseClient, olderThanHours = 24) {
  const cutoff = new Date(Date.now() - olderThanHours * 60 * 60_000).toISOString();
  const requests = await db
    .from('rfp_requests')
    .select('id,source_worksheet')
    .eq('final_status', 'Draft Uploading')
    .lt('created_at', cutoff);
  if (requests.error) throw requests.error;

  const abandoned = (requests.data || []).filter(
    (request) => request.source_worksheet !== 'Demo Data',
  );
  for (const request of abandoned) {
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
  return abandoned.length;
}

export async function cleanupRateLimits(db: DatabaseClient, olderThanHours = 24) {
  const cutoff = new Date(Date.now() - olderThanHours * 60 * 60_000).toISOString();
  const result = await db.from('submission_rate_limits').delete().lt('occurred_at', cutoff);
  if (result.error) throw result.error;
}
