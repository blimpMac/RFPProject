import { adminClient } from '../../server/lib/supabase.js';
import {
  cleanupAbandonedUploads,
  cleanupExpiredTemporaryTests,
  cleanupRateLimits,
} from '../../server/services/cleanup.js';

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get('authorization') === `Bearer ${secret}`);
}

export async function GET(request: Request): Promise<Response> {
  if (!authorized(request))
    return Response.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });
  try {
    const db = adminClient();
    const [abandonedUploads, expiredTests] = await Promise.all([
      cleanupAbandonedUploads(db),
      cleanupExpiredTemporaryTests(db),
    ]);
    await cleanupRateLimits(db);
    return Response.json({ ok: true, removed: { abandonedUploads, expiredTests } });
  } catch (error) {
    console.error(error);
    return Response.json({ ok: false, error: 'Scheduled cleanup failed.' }, { status: 500 });
  }
}
