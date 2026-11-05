import { adminClient } from '../lib/supabase.js';

const CA_RF_ORIGINALS = ['Cash Advance (CA)', 'Cash Advance Request', 'Revolving Fund (RF)'];

/** Runs alongside the existing protected daily queue worker. No cron/HTTP
 * route is exposed publicly. Each transition is optimistic and idempotent. */
export async function processDueLiquidations() {
  const db = adminClient();
  const candidates = await db.from('rfp_requests')
    .select('id,rfp_number,rfp_type,requestor_email,version')
    .eq('final_status', 'Paid')
    .in('rfp_type', CA_RF_ORIGINALS)
    .limit(100);
  if (candidates.error) throw candidates.error;
  let transitioned = 0;
  for (const request of candidates.data || []) {
    const paidLog = await db.from('approval_logs')
      .select('occurred_at').eq('request_id',request.id)
      .eq('action','Payment Completed')
      .order('occurred_at',{ascending:false}).limit(1).maybeSingle();
    if (paidLog.error) throw paidLog.error;
    if (!paidLog.data?.occurred_at) continue;
    if (Date.now() < new Date(paidLog.data.occurred_at).getTime() + 3 * 86_400_000) continue;

    const changed = await db.from('rfp_requests').update({
      final_status: 'Pending Liquidation',
      last_action: 'Expense Liquidation Due',
      version: Number(request.version || 1) + 1,
    }).eq('id',request.id).eq('final_status','Paid')
      .eq('version',request.version).select('id').maybeSingle();
    if (changed.error) throw changed.error;
    if (!changed.data) continue;
    transitioned += 1;

    const log = await db.from('approval_logs').insert({
      request_id: request.id, rfp_number: request.rfp_number,
      action: 'Expense Liquidation Due', actor_email: 'rfp-monitoring-system',
      remarks: 'Three days elapsed after payment completion; requestor must submit itemized expenses.',
      previous_status: 'Paid', new_status: 'Pending Liquidation',
    });
    if (log.error) throw log.error;

    const receipt = await db.from('email_notifications')
      .select('payload').eq('request_id',request.id)
      .eq('template_key','submission_received')
      .order('created_at',{ascending:false}).limit(1).maybeSingle();
    if (receipt.error) throw receipt.error;
    const sealedTracking = receipt.data?.payload &&
      typeof receipt.data.payload === 'object' &&
      !Array.isArray(receipt.data.payload)
        ? (receipt.data.payload as Record<string, unknown>).trackingTokenCiphertext : null;
    const notification = await db.from('email_notifications').upsert({
      request_id: request.id,
      recipient_email: request.requestor_email,
      template_key: 'liquidation_required',
      subject: `Expense liquidation required: ${request.rfp_number}`,
      payload: typeof sealedTracking === 'string'
        ? { trackingTokenCiphertext: sealedTracking }
        : {},
      deduplication_key: `${request.id}:liquidation_required:${Number(request.version || 1) + 1}`,
    },{onConflict:'deduplication_key',ignoreDuplicates:true});
    if (notification.error) throw notification.error;
  }
  return { checked: (candidates.data || []).length, transitioned };
}
