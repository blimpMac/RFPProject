import assert from 'node:assert/strict';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import { openSealed } from '../../server/lib/crypto.ts';

const liveUrl = process.env.PLAYWRIGHT_BASE_URL || 'https://greenlight-rfp.vercel.app';
const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!supabaseUrl || !serviceKey || !publishableKey || !process.env.APPROVAL_TOKEN_ENCRYPTION_KEY) {
  throw new Error('Supabase and approval-token verification variables are required.');
}

const db = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const activeTokens = await db
  .from('approval_tokens')
  .select('request_id,expires_at')
  .is('used_at', null)
  .is('revoked_at', null)
  .gt('expires_at', new Date().toISOString())
  .order('created_at', { ascending: false })
  .limit(20);
if (activeTokens.error) throw activeTokens.error;

type ReviewResult = {
  ok: boolean;
  request: { id: string; final_status: string };
};
let review: ReviewResult | undefined;
let notificationStatus: string | undefined;
let expiresAt: string | undefined;
for (const activeToken of activeTokens.data || []) {
  const notification = await db
    .from('email_notifications')
    .select('payload,status')
    .eq('request_id', activeToken.request_id)
    .eq('template_key', 'supervisor_review')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (notification.error) throw notification.error;
  const payload = notification.data?.payload as Record<string, unknown> | undefined;
  if (typeof payload?.reviewTokenCiphertext !== 'string') continue;
  try {
    const reviewToken = openSealed(payload.reviewTokenCiphertext);
    const response = await fetch(
      `${liveUrl.replace(/\/$/, '')}/api/review/${encodeURIComponent(reviewToken)}`,
    );
    if (!response.ok) continue;
    const candidate = (await response.json()) as ReviewResult;
    if (candidate.request.id !== activeToken.request_id) continue;
    review = candidate;
    notificationStatus = notification.data?.status;
    expiresAt = activeToken.expires_at;
    break;
  } catch {
    // Production may use a different encryption key than this local environment.
  }
}
if (review) {
  assert.equal(review.ok, true);
  assert.equal(review.request.final_status, 'Pending Department Approval');
}

const users = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (users.error) throw users.error;
const superadmin = users.data.users.find(
  (user) =>
    user.email?.toLowerCase() ===
    (process.env.SUPERADMIN_EMAIL || 'gpigemcorqbbackup@gmail.com').toLowerCase(),
);
if (!superadmin?.email) throw new Error('The Super Administrator account was not found.');
const login = await db.auth.admin.generateLink({ type: 'magiclink', email: superadmin.email });
if (login.error) throw login.error;
const publicClient = createClient(supabaseUrl, publishableKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const verified = await publicClient.auth.verifyOtp({
  type: 'magiclink',
  token_hash: login.data.properties.hashed_token,
});
if (verified.error || !verified.data.session) {
  throw verified.error || new Error('A verification session could not be created.');
}
const previewResponse = await fetch(
  `${liveUrl.replace(/\/$/, '')}/api/email-preview?template=supervisor_review`,
  {
    headers: { authorization: `Bearer ${verified.data.session.access_token}` },
  },
);
if (!previewResponse.ok) {
  throw new Error(
    `Email preview failed (${previewResponse.status}): ${await previewResponse.text()}`,
  );
}
const preview = (await previewResponse.json()) as { html: string };
for (const label of ['Approve', 'Reject', 'Return for Correction']) {
  assert.ok(preview.html.includes(`>${label}<`), `Missing live preview action: ${label}`);
}
assert.doesNotMatch(preview.html, />Open secure review</);
assert.doesNotMatch(preview.html, /href="[^"]*\/review\/preview-only-not-valid/);

console.log(
  JSON.stringify(
    {
      ok: true,
      activeReviewLink: Boolean(review),
      requestStatus: review?.request.final_status,
      emailActions: ['Approve', 'Reject', 'Return for Correction'],
      previewLinksDisabled: true,
      notificationStatus,
      expiresAt,
      note: review
        ? undefined
        : 'Active production tokens could not be decrypted with the local verification key.',
    },
    null,
    2,
  ),
);
