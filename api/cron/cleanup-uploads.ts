import { adminClient } from '../../server/lib/supabase.js';
import { cleanupAbandonedUploads, cleanupRateLimits } from '../../server/services/cleanup.js';

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get('authorization') === `Bearer ${secret}`);
}

export async function GET(request: Request): Promise<Response> {
  if (!authorized(request))
    return Response.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });
  try {
    const db = adminClient();
    const abandonedUploads = await cleanupAbandonedUploads(db);
    await cleanupRateLimits(db);
    return Response.json({ ok: true, removed: { abandonedUploads } });
  } catch (error) {
    console.error(error);
    return Response.json({ ok: false, error: 'Scheduled cleanup failed.' }, { status: 500 });
  }
}
