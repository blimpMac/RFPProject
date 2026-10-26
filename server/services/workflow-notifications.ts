import { randomToken, seal, sha256 } from '../lib/crypto.js';
import { HttpError } from '../lib/http.js';
import { adminClient } from '../lib/supabase.js';
import { reviewerIsCurrentDepartmentHead } from '../lib/department-review-access.js';

type DatabaseClient = ReturnType<typeof adminClient>;

export async function queueSubmissionReceipt(
  db: DatabaseClient,
  requestId: string,
  rfpNumber: string,
  trackingToken: string,
) {
  const requestor = await db
    .from('rfp_requests')
    .select('requestor_email')
    .eq('id', requestId)
    .single();
  if (requestor.error || !requestor.data?.requestor_email) {
    throw requestor.error || new HttpError(409, 'The requestor email is missing.');
  }
  const queued = await db.from('email_notifications').upsert(
    {
      request_id: requestId,
      template_key: 'submission_received',
      recipient_email: requestor.data.requestor_email,
      subject: `${rfpNumber} was submitted`,
      payload: { trackingTokenCiphertext: seal(trackingToken) },
      deduplication_key: `${requestId}:submission_received:requestor`,
    },
    { onConflict: 'deduplication_key', ignoreDuplicates: true },
  );
  if (queued.error) throw queued.error;
}

export async function cancelPendingDepartmentReview(db: DatabaseClient, requestId: string) {
  const cancelled = await db
    .from('email_notifications')
    .update({
      status: 'cancelled',
      last_error: 'Request is no longer awaiting department approval',
      updated_at: new Date().toISOString(),
    })
    .eq('request_id', requestId)
    .eq('template_key', 'supervisor_review')
    .in('status', ['queued', 'retry']);
  if (cancelled.error) throw cancelled.error;
  const revoked = await db
    .from('approval_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('request_id', requestId)
    .is('used_at', null)
    .is('revoked_at', null);
  if (revoked.error) throw revoked.error;
}

export async function assertCurrentDepartmentReviewToken(db: DatabaseClient, tokenHash: string) {
  const tokenResult = await db
    .from('approval_tokens')
    .select('id,request_id,reviewer_email,expires_at,used_at,revoked_at')
    .eq('token_hash', tokenHash)
    .single();
  const token = tokenResult.data;
  if (
    tokenResult.error ||
    !token ||
    token.used_at ||
    token.revoked_at ||
    new Date(token.expires_at) < new Date()
  ) {
    throw new HttpError(410, 'This review link is invalid, expired, or already used.');
  }
  const request = await db
    .from('rfp_requests')
    .select('id,final_status,normalized_department')
    .eq('id', token.request_id)
    .single();
  const profile = await db
    .from('profiles')
    .select('id,email,active')
    .eq('email', token.reviewer_email.toLowerCase())
    .maybeSingle();
  if (profile.error) throw profile.error;
  const userId = profile.data?.id;
  const [roleRows, assignments] = userId
    ? await Promise.all([
        db.from('user_roles').select('role').eq('user_id', userId),
        db.from('department_approving_heads').select('normalized_department').eq('user_id', userId),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
      ];
  if (request.error || roleRows.error || assignments.error) {
    throw request.error || roleRows.error || assignments.error;
  }
  const eligible = reviewerIsCurrentDepartmentHead({
    reviewerEmail: token.reviewer_email,
    requestStatus: request.data?.final_status || '',
    requestDepartment: request.data?.normalized_department || '',
    profile: profile.data,
    roles: (roleRows.data || []).map((row) => row.role),
    assignedDepartments: (assignments.data || []).map((row) => row.normalized_department),
  });
  if (!eligible) {
    await db
      .from('approval_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', token.id);
    throw new HttpError(410, 'This review link no longer belongs to the active Department Head.');
  }
  return token;
}

export async function refreshPendingDepartmentReviews(
  db: DatabaseClient,
  departmentKeys: string[],
  reviewTokenHours: number,
) {
  const keys = [...new Set(departmentKeys.filter(Boolean))];
  const refreshed: string[] = [];
  for (const departmentKey of keys) {
    const assignment = await db
      .from('department_approving_heads')
      .select('user_id')
      .eq('normalized_department', departmentKey)
      .limit(1)
      .maybeSingle();
    if (assignment.error) throw assignment.error;
    const profile = assignment.data?.user_id
      ? await db
          .from('profiles')
          .select('id,email,full_name,active')
          .eq('id', assignment.data.user_id)
          .eq('active', true)
          .maybeSingle()
      : { data: null, error: null };
    if (profile.error) throw profile.error;
    const requests = await db
      .from('rfp_requests')
      .select('id,rfp_number,version')
      .eq('normalized_department', departmentKey)
      .eq('final_status', 'Pending Department Approval');
    if (requests.error) throw requests.error;
    for (const request of requests.data || []) {
      await cancelPendingDepartmentReview(db, request.id);
      if (!profile.data?.email) continue;
      const reviewToken = randomToken();
      const expiresAt = new Date(Date.now() + reviewTokenHours * 60 * 60_000).toISOString();
      const nextVersion = Number(request.version || 1) + 1;
      const updated = await db
        .from('rfp_requests')
        .update({
          approver_id: profile.data.id,
          approver_email: profile.data.email.toLowerCase(),
          approving_head: profile.data.full_name || profile.data.email,
          version: nextVersion,
        })
        .eq('id', request.id)
        .eq('version', request.version)
        .select('id')
        .maybeSingle();
      if (updated.error || !updated.data) {
        throw updated.error || new HttpError(409, 'A pending request changed during reassignment.');
      }
      const token = await db.from('approval_tokens').insert({
        request_id: request.id,
        token_hash: sha256(reviewToken),
        reviewer_email: profile.data.email.toLowerCase(),
        expires_at: expiresAt,
      });
      if (token.error) throw token.error;
      const notification = await db.from('email_notifications').insert({
        request_id: request.id,
        template_key: 'supervisor_review',
        recipient_email: profile.data.email.toLowerCase(),
        subject: `Review required: ${request.rfp_number}`,
        payload: { reviewTokenCiphertext: seal(reviewToken) },
        deduplication_key: `${request.id}:supervisor_review:head-change:${nextVersion}`,
      });
      if (notification.error) throw notification.error;
      refreshed.push(request.id);
    }
  }
  return refreshed;
}
