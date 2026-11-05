import { processEmailQueue } from '../../server/email/service.js';
import { processDueLiquidations } from '../../server/services/liquidation-workflow.js';

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get('authorization') === `Bearer ${secret}`);
}

export async function GET(request: Request): Promise<Response> {
  if (!authorized(request)) {
    return Response.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });
  }

  let liquidations: { checked: number; transitioned: number } | null = null;
  try {
    liquidations = await processDueLiquidations();
  } catch (error) {
    console.error('Liquidation state processor failed', error);
  }
  try {
    const results = await processEmailQueue();
    return Response.json({ ok: liquidations !== null, liquidations, results });
  } catch (error) {
    console.error(error);
    return Response.json(
      { ok: false, liquidations, error: 'Email queue processing failed.' },
      { status: 500 },
    );
  }
}
