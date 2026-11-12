import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { createClient, type Session } from '@supabase/supabase-js';

const liveUrl = (process.env.PLAYWRIGHT_BASE_URL || 'https://greenlight-rfp.vercel.app').replace(
  /\/$/u,
  '',
);
const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const requestorEmail = process.env.UAT_REQUESTOR_EMAIL || 'dricianfranciscordon@gmail.com';
if (!supabaseUrl || !serviceKey || !publishableKey) {
  throw new Error('Supabase verification variables are required.');
}

const db = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const publicClient = createClient(supabaseUrl, publishableKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

async function api<T>(path: string, init: RequestInit = {}, session?: Session) {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  if (session) headers.set('authorization', `Bearer ${session.access_token}`);
  const response = await fetch(`${liveUrl}/api/${path}`, { ...init, headers });
  const body = (await response.json().catch(() => ({ error: 'Unreadable response.' }))) as T & {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(`${init.method || 'GET'} ${path} failed (${response.status}): ${body.error}`);
  }
  return body;
}

const post = <T>(path: string, body: unknown, session?: Session) =>
  api<T>(path, { method: 'POST', body: JSON.stringify(body) }, session);

async function sessionFor(email: string) {
  const link = await db.auth.admin.generateLink({ type: 'magiclink', email });
  if (link.error) throw link.error;
  const verified = await publicClient.auth.verifyOtp({
    type: 'magiclink',
    token_hash: link.data.properties.hashed_token,
  });
  if (verified.error || !verified.data.session) {
    throw verified.error || new Error(`Could not create a session for ${email}.`);
  }
  return verified.data.session;
}

async function emailForRole(role: string) {
  const roleRows = await db.from('user_roles').select('user_id').eq('role', role);
  if (roleRows.error) throw roleRows.error;
  const ids = (roleRows.data || []).map((row) => row.user_id);
  const profiles = await db
    .from('profiles')
    .select('email')
    .in('id', ids)
    .eq('active', true)
    .limit(1)
    .single();
  if (profiles.error || !profiles.data?.email) {
    throw profiles.error || new Error(`No active ${role} account exists.`);
  }
  return profiles.data.email;
}

type Created = { requestId: string; trackingToken: string; rfpNumber: string };

async function createRequest(scenario: string): Promise<Created> {
  const config = await api<{
    approvers: { department: string; approver_name: string }[];
    options: { departments: string[]; requestTypes: string[] };
  }>('public-config');
  const approver = config.approvers.find(
    (item) => item.department.replace(/^[-\s]+/u, '').toLowerCase() === 'sales',
  );
  assert.ok(approver, 'Sales must have an active Approving Head.');
  assert.ok(config.options.departments.some((department) => /sales/iu.test(department)));
  const rfpType = config.options.requestTypes.find((type) => !/liquidation/iu.test(type));
  assert.ok(rfpType, 'At least one non-liquidation request type must be configured.');
  const attachment = await readFile('test-assets/rfp-attachment-preview-test.png');
  const filename = `UAT-${scenario}-${Date.now()}.png`;
  const requiredPaymentDate = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
  const started = await post<{
    requestId: string;
    trackingToken: string;
    uploads: { id: string; name: string; path: string; token: string }[];
  }>('submissions/start', {
    request: {
      requestorName: 'Drician Cordon',
      requestorEmail,
      company: 'Greenlight Power Inc.',
      department: 'Sales',
      projectClass: 'LIVE-UAT',
      rfpType,
      requestType: 'Regular',
      supplierPayee: `LIVE UAT ${scenario}`,
      purposeDescription: `Automated production UAT ${scenario}; safe test record`,
      amount: 123.45,
      requiredPaymentDate,
      approvingHead: approver.approver_name,
      attachmentChecklist: ['Supporting document'],
      liquidationExpenses: [],
    },
    attachments: [{ name: filename, type: 'image/png', size: attachment.byteLength }],
    idempotencyKey: crypto.randomUUID(),
  });
  assert.equal(started.uploads.length, 1);
  const upload = started.uploads[0];
  const uploaded = await publicClient.storage
    .from('rfp-attachments')
    .uploadToSignedUrl(upload.path, upload.token, attachment, { contentType: 'image/png' });
  if (uploaded.error) throw uploaded.error;
  await post('submissions/attachment-complete', {
    requestId: started.requestId,
    trackingToken: started.trackingToken,
    attachmentId: upload.id,
  });
  const finalized = await post<{ rfpNumber: string }>('submissions/finalize', {
    requestId: started.requestId,
    trackingToken: started.trackingToken,
  });
  const tracked = await api<{
    request: { id: string; rfp_number: string; final_status: string };
    attachments: { id: string; status: string }[];
  }>(`track/${encodeURIComponent(started.trackingToken)}`);
  assert.equal(tracked.request.id, started.requestId);
  assert.equal(tracked.request.rfp_number, finalized.rfpNumber);
  assert.equal(tracked.request.final_status, 'Pending Department Approval');
  assert.equal(tracked.attachments.length, 1);
  assert.equal(tracked.attachments[0].status, 'available');
  return {
    requestId: started.requestId,
    trackingToken: started.trackingToken,
    rfpNumber: finalized.rfpNumber,
  };
}

async function decide(
  requestId: string,
  trackingToken: string,
  reviewToken: string,
  decision: 'approve' | 'reject' | 'return',
) {
  const review = await api<{
    request: { id: string; rfp_number: string; final_status: string };
    attachments: { url: string | null; download_url: string | null }[];
  }>(`review/${encodeURIComponent(reviewToken)}`);
  assert.equal(review.request.id, requestId);
  assert.equal(review.request.final_status, 'Pending Department Approval');
  assert.equal(review.attachments.length, 1);
  assert.ok(review.attachments[0].url);
  assert.ok(review.attachments[0].download_url);
  const preview = await fetch(review.attachments[0].url!);
  assert.equal(preview.ok, true, 'The signed attachment preview must be accessible.');

  const result = await post<{ request: { id: string; final_status: string; rfp_number: string } }>(
    `review/${encodeURIComponent(reviewToken)}`,
    {
      decision,
      remarks: decision === 'approve' ? 'Live UAT approval' : `Live UAT ${decision} remarks`,
    },
  );
  assert.equal(result.request.id, requestId);
  const expected =
    decision === 'approve'
      ? 'Pending Finance Review'
      : decision === 'reject'
        ? 'Department Rejected'
        : 'Returned to Requestor';
  assert.equal(result.request.final_status, expected);
  const tracked = await api<{ request: { final_status: string; rfp_number: string } }>(
    `track/${encodeURIComponent(trackingToken)}`,
  );
  assert.equal(tracked.request.final_status, expected);

  if (decision !== 'return') {
    return { rfpNumber: result.request.rfp_number, status: expected };
  }
  const resubmitted = await post<{
    request: { rfp_number: string; final_status: string };
  }>('submissions/resubmit', {
    requestId,
    trackingToken,
    correctionNote: 'Live UAT correction completed',
    corrections: {
      projectClass: 'LIVE-UAT-CORRECTED',
      supplierPayee: 'LIVE UAT RETURN RESUBMITTED',
      purposeDescription: 'Automated production UAT corrected and resubmitted',
      amount: 123.45,
      requiredPaymentDate: new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10),
      requestType: 'Regular',
    },
  });
  assert.equal(resubmitted.request.rfp_number, result.request.rfp_number);
  assert.equal(resubmitted.request.final_status, 'Pending Department Approval');
  return { rfpNumber: result.request.rfp_number, status: resubmitted.request.final_status };
}

async function finance(requestId: string, trackingToken: string) {
  const [departmentSession, memberSession, headSession] = await Promise.all([
    sessionFor(requestorEmail),
    sessionFor(await emailForRole('finance_reviewer')),
    sessionFor(await emailForRole('super_administrator')),
  ]);
  const unauthorized = await fetch(`${liveUrl}/api/finance/action`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${departmentSession.access_token}`,
    },
    body: JSON.stringify({ requestId, action: 'member_approve', remarks: 'Unauthorized UAT' }),
  });
  assert.equal(unauthorized.status, 403);

  const member = await post<{ request: { final_status: string } }>(
    'finance/action',
    { requestId, action: 'member_approve', remarks: 'Live UAT Finance member approval' },
    memberSession,
  );
  assert.equal(member.request.final_status, 'Pending Finance Head Review');
  const head = await post<{ request: { final_status: string } }>(
    'finance/action',
    { requestId, action: 'head_approve', remarks: 'Live UAT Finance Head approval' },
    headSession,
  );
  assert.equal(head.request.final_status, 'Awaiting Hard Copy Verification');
  const receivedDate = new Date().toISOString().slice(0, 10);
  const receipt = await post<{
    request: { final_status: string; raw_record: Record<string, unknown> };
  }>(
    'finance/update',
    {
      requestId,
      originalsReceivedDate: receivedDate,
      documentVerification: 'Complete',
      verificationRemarks: 'Live UAT hard-copy verification',
      financeRemarks: 'Live UAT receipt saved',
    },
    memberSession,
  );
  assert.equal(receipt.request.final_status, 'Awaiting Hard Copy Verification');
  const operations = receipt.request.raw_record.finance_operations as Record<string, unknown>;
  assert.equal(operations.originals_received_date, receivedDate);
  assert.equal(operations.document_verification, 'Complete');
  const processed = await post<{ request: { final_status: string } }>(
    'finance/action',
    { requestId, action: 'hard_copy_approve', remarks: 'Live UAT processing start' },
    memberSession,
  );
  assert.equal(processed.request.final_status, 'Processing');
  const tracked = await api<{ request: { final_status: string } }>(
    `track/${encodeURIComponent(trackingToken)}`,
  );
  assert.equal(tracked.request.final_status, 'Processing');
  return { unauthorizedStatus: unauthorized.status, status: tracked.request.final_status };
}

const [mode, ...args] = process.argv.slice(2);
let result: unknown;
if (mode === 'create') {
  result = await createRequest(args[0] || 'workflow');
} else if (mode === 'decide') {
  const [requestId, trackingToken, reviewToken, decision] = args;
  assert.ok(requestId && trackingToken && reviewToken);
  assert.ok(['approve', 'reject', 'return'].includes(decision));
  result = await decide(
    requestId,
    trackingToken,
    reviewToken,
    decision as 'approve' | 'reject' | 'return',
  );
} else if (mode === 'finance') {
  const [requestId, trackingToken] = args;
  assert.ok(requestId && trackingToken);
  result = await finance(requestId, trackingToken);
} else {
  throw new Error(
    'Use: create <scenario> | decide <id> <tracking> <review> <action> | finance <id> <tracking>',
  );
}
console.log(JSON.stringify({ ok: true, mode, result }, null, 2));
