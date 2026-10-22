import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY are required.');

const execute = process.argv.includes('--execute');
const retainedEmails = new Set(['gpigemcorqbbackup@gmail.com', 'dricianfranciscordon@gmail.com']);
const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const listed = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listed.error) throw listed.error;
const retainedUsers = listed.data.users.filter((user) =>
  retainedEmails.has(user.email?.toLowerCase() || ''),
);
const removableUsers = listed.data.users.filter(
  (user) => !retainedEmails.has(user.email?.toLowerCase() || ''),
);
if (retainedUsers.length !== retainedEmails.size) {
  throw new Error('Cleanup stopped because both retained accounts were not found.');
}

const requests = await db.from('rfp_requests').select('id');
if (requests.error) throw requests.error;
const approvers = await db.from('approvers').select('id,approver_name,approver_email');
if (approvers.error) throw approvers.error;
const removableEmails = new Set(
  removableUsers.map((user) => user.email?.toLowerCase()).filter(Boolean),
);
const removableApprovers = (approvers.data || []).filter((approver) => {
  const email = approver.approver_email.toLowerCase();
  return (
    removableEmails.has(email) ||
    email.includes('+mock-') ||
    approver.approver_name.toLowerCase().includes('mock')
  );
});

const audit = {
  mode: execute ? 'execute' : 'dry-run',
  retainedAccounts: retainedUsers.length,
  accountsToRemove: removableUsers.length,
  requestsToRemove: requests.data?.length || 0,
  mockApproverRecordsToRemove: removableApprovers.length,
};
console.log(JSON.stringify(audit, null, 2));
if (!execute) process.exit(0);

async function removeStoredAttachments(requestId: string) {
  let offset = 0;
  while (true) {
    const listedFiles = await db.storage
      .from('rfp-attachments')
      .list(requestId, { limit: 100, offset });
    if (listedFiles.error) throw listedFiles.error;
    const files = (listedFiles.data || [])
      .filter((file) => file.id)
      .map((file) => `${requestId}/${file.name}`);
    if (files.length) {
      const removed = await db.storage.from('rfp-attachments').remove(files);
      if (removed.error) throw removed.error;
    }
    if ((listedFiles.data?.length || 0) < 100) break;
    offset += 100;
  }
}

for (const request of requests.data || []) await removeStoredAttachments(request.id);

if (requests.data?.length) {
  const expiredAt = new Date(Date.now() - 60_000).toISOString();
  const cleanupRows = requests.data.map((request) => ({
    request_id: request.id,
    label: `full-cleanup-${request.id}`,
    expires_at: expiredAt,
  }));
  const marked = await db
    .from('temporary_test_runs')
    .upsert(cleanupRows, { onConflict: 'request_id' });
  if (marked.error) throw marked.error;
  const purged = await db.rpc('purge_expired_temporary_tests');
  if (purged.error) throw purged.error;
}

if (removableApprovers.length) {
  const deletedApprovers = await db
    .from('approvers')
    .delete()
    .in(
      'id',
      removableApprovers.map((approver) => approver.id),
    );
  if (deletedApprovers.error) throw deletedApprovers.error;
}

for (const user of removableUsers) {
  const removed = await db.auth.admin.deleteUser(user.id);
  if (removed.error) throw removed.error;
}

const [remainingRequests, remainingUsers] = await Promise.all([
  db.from('rfp_requests').select('id', { count: 'exact', head: true }),
  db.auth.admin.listUsers({ page: 1, perPage: 1000 }),
]);
if (remainingRequests.error) throw remainingRequests.error;
if (remainingUsers.error) throw remainingUsers.error;
const remainingEmails = new Set(
  remainingUsers.data.users.map((user) => user.email?.toLowerCase()).filter(Boolean),
);
if (
  remainingRequests.count !== 0 ||
  remainingEmails.size !== retainedEmails.size ||
  [...retainedEmails].some((email) => !remainingEmails.has(email))
) {
  throw new Error(
    'Cleanup verification failed: the remaining production data does not match the requested state.',
  );
}

console.log(
  JSON.stringify(
    {
      ok: true,
      retainedAccounts: remainingEmails.size,
      remainingRequests: remainingRequests.count,
    },
    null,
    2,
  ),
);
