import { processEmailQueue } from '../../server/email/service.js';

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get('authorization') === `Bearer ${secret}`);
}

export async function GET(request: Request): Promise<Response> {
  if (!authorized(request)) {
    return Response.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    return Response.json({ ok: true, results: await processEmailQueue() });
  } catch (error) {
    console.error(error);
    return Response.json({ ok: false, error: 'Email queue processing failed.' }, { status: 500 });
  }
}
