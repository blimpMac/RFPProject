import { adminClient } from '../../server/lib/supabase.js';

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get('authorization') === `Bearer ${secret}`);
}

export async function GET(request: Request): Promise<Response> {
  if (!authorized(request)) {
    return Response.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });
  }

  const db = adminClient();
  const cutoff = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const { data, error } = await db
    .from('rfp_requests')
    .select('id')
    .eq('final_status', 'Draft Uploading')
    .lt('created_at', cutoff);

  if (error) {
    console.error(error);
    return Response.json({ ok: false, error: 'Upload cleanup failed.' }, { status: 500 });
  }

  for (const requestRow of data ?? []) {
    const listed = await db.storage.from('rfp-attachments').list(requestRow.id, { limit: 100 });
    if (listed.data?.length) {
      await db.storage
        .from('rfp-attachments')
        .remove(listed.data.map((file) => `${requestRow.id}/${file.name}`));
    }
    await db.from('rfp_requests').delete().eq('id', requestRow.id);
  }

  await db
    .from('submission_rate_limits')
    .delete()
    .lt('occurred_at', new Date(Date.now() - 24 * 60 * 60_000).toISOString());

  return Response.json({ ok: true, removed: data?.length ?? 0 });
}
