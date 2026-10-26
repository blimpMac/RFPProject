import {
  constants,
  createHash,
  generateKeyPairSync,
  privateDecrypt,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { adminClient } from '../server/lib/supabase.js';

const BOOTSTRAP_TOKEN_HASH = '7f33970eeda7154fc505c7c9e0a7cb34fb6fa2d19f8b1464fe68c128c9314856';
const CHALLENGE_KEY = 'temporary_account_bootstrap';
const FINANCE_MEMBER_EMAIL = 'gpi.cashiering@gmail.com';
const FINANCE_HEAD_EMAIL = 'dmb.greenlightpowerinc@gmail.com';
const IT_HEAD_EMAIL = 'cerealman637@gmail.com';

const noStore = { 'Cache-Control': 'no-store, max-age=0' };

function authorized(token: string | null) {
  if (!token) return false;
  const actual = Buffer.from(createHash('sha256').update(token).digest('hex'));
  const expected = Buffer.from(BOOTSTRAP_TOKEN_HASH);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function text(value: unknown) {
  return String(value ?? '').trim();
}

async function ensureUser(
  db: ReturnType<typeof adminClient>,
  input: {
    email: string;
    password: string;
    fullName: string;
    role: 'finance_reviewer' | 'department_approver';
    department?: string;
  },
) {
  const listed = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listed.error) throw listed.error;
  let user = listed.data.users.find(
    (candidate) => candidate.email?.toLowerCase() === input.email.toLowerCase(),
  );

  if (user) {
    const updated = await db.auth.admin.updateUserById(user.id, {
      password: input.password,
      email_confirm: true,
      user_metadata: {
        ...user.user_metadata,
        full_name: input.fullName,
        department: input.department ?? null,
      },
    });
    if (updated.error) throw updated.error;
    user = updated.data.user;
  } else {
    const created = await db.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: {
        full_name: input.fullName,
        department: input.department ?? null,
      },
    });
    if (created.error) throw created.error;
    user = created.data.user;
  }

  const profile = await db.from('profiles').upsert(
    {
      id: user.id,
      email: input.email.toLowerCase(),
      full_name: input.fullName,
      department: input.department ?? null,
      active: true,
    },
    { onConflict: 'id' },
  );
  if (profile.error) throw profile.error;

  const removedRoles = await db.from('user_roles').delete().eq('user_id', user.id);
  if (removedRoles.error) throw removedRoles.error;
  const role = await db.from('user_roles').insert({ user_id: user.id, role: input.role });
  if (role.error) throw role.error;

  return user;
}

async function ensureItHeadAssignment(db: ReturnType<typeof adminClient>, userId: string) {
  const activeApprover = await db
    .from('approvers')
    .select('id')
    .eq('normalized_department', 'it')
    .eq('active', true)
    .maybeSingle();
  if (activeApprover.error) throw activeApprover.error;
  if (activeApprover.data?.id) {
    const updated = await db
      .from('approvers')
      .update({
        department: 'IT',
        approver_name: 'IT Head',
        approver_email: IT_HEAD_EMAIL,
        active: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', activeApprover.data.id);
    if (updated.error) throw updated.error;
  } else {
    const inserted = await db.from('approvers').insert({
      department: 'IT',
      approver_name: 'IT Head',
      approver_email: IT_HEAD_EMAIL,
      active: true,
    });
    if (inserted.error) throw inserted.error;
  }

  const assignment = await db
    .from('department_approving_heads')
    .select('id')
    .eq('normalized_department', 'it')
    .eq('user_id', userId)
    .maybeSingle();
  if (assignment.error) throw assignment.error;
  if (assignment.data) return;

  const positions = await db
    .from('department_approving_heads')
    .select('position')
    .eq('normalized_department', 'it');
  if (positions.error) throw positions.error;
  const used = new Set((positions.data || []).map((row) => Number(row.position)));
  const position = [1, 2, 3, 4].find((candidate) => !used.has(candidate));
  if (!position) throw new Error('The IT approving-head roster already has four assigned accounts.');

  const inserted = await db.from('department_approving_heads').insert({
    department: 'IT',
    user_id: userId,
    position,
    created_by: null,
  });
  if (inserted.error) throw inserted.error;
}

export async function temporaryAccountBootstrap(request: Request) {
  const url = new URL(request.url);
  if (!authorized(url.searchParams.get('token'))) {
    return Response.json({ ok: false, error: 'Not found.' }, { status: 404, headers: noStore });
  }

  const db = adminClient();
  const mode = url.searchParams.get('mode') || 'challenge';

  try {
    if (mode === 'challenge') {
      const challengeId = randomUUID();
      const { publicKey, privateKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });
      const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
      const stored = await db.from('system_settings').upsert(
        {
          key: CHALLENGE_KEY,
          value: { challengeId, privateKey, expiresAt },
          description: 'Temporary encrypted staff-account bootstrap challenge',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' },
      );
      if (stored.error) throw stored.error;
      return Response.json(
        { ok: true, challengeId, publicKey, expiresAt },
        { status: 200, headers: noStore },
      );
    }

    if (mode !== 'apply') {
      return Response.json({ ok: false, error: 'Unsupported mode.' }, { status: 400, headers: noStore });
    }

    const challengeId = text(url.searchParams.get('challenge'));
    const payload = text(url.searchParams.get('payload'));
    if (!challengeId || !payload) {
      return Response.json(
        { ok: false, error: 'Missing encrypted bootstrap payload.' },
        { status: 400, headers: noStore },
      );
    }

    const challenge = await db
      .from('system_settings')
      .select('value')
      .eq('key', CHALLENGE_KEY)
      .maybeSingle();
    if (challenge.error) throw challenge.error;
    const value = (challenge.data?.value || {}) as Record<string, unknown>;
    if (text(value.challengeId) !== challengeId) throw new Error('Bootstrap challenge does not match.');
    if (!value.expiresAt || new Date(text(value.expiresAt)).getTime() < Date.now()) {
      throw new Error('Bootstrap challenge has expired.');
    }

    const decrypted = privateDecrypt(
      {
        key: text(value.privateKey),
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      Buffer.from(payload, 'base64url'),
    ).toString('utf8');
    const credentials = JSON.parse(decrypted) as { p1?: string; p2?: string; p3?: string };
    const financeMemberPassword = text(credentials.p1);
    const financeHeadPassword = text(credentials.p2);
    const itHeadPassword = text(credentials.p3);
    if ([financeMemberPassword, financeHeadPassword, itHeadPassword].some((password) => password.length < 8)) {
      throw new Error('Every bootstrap password must contain at least eight characters.');
    }

    const financeMember = await ensureUser(db, {
      email: FINANCE_MEMBER_EMAIL,
      password: financeMemberPassword,
      fullName: 'GPI Cashiering',
      role: 'finance_reviewer',
    });
    const financeHead = await ensureUser(db, {
      email: FINANCE_HEAD_EMAIL,
      password: financeHeadPassword,
      fullName: 'Finance Head',
      role: 'finance_reviewer',
    });
    const itHead = await ensureUser(db, {
      email: IT_HEAD_EMAIL,
      password: itHeadPassword,
      fullName: 'IT Head',
      role: 'department_approver',
      department: 'IT',
    });
    await ensureItHeadAssignment(db, itHead.id);

    await db.from('system_settings').delete().eq('key', CHALLENGE_KEY);

    return Response.json(
      {
        ok: true,
        users: [
          { id: financeMember.id, email: FINANCE_MEMBER_EMAIL, role: 'finance_reviewer' },
          { id: financeHead.id, email: FINANCE_HEAD_EMAIL, role: 'finance_head' },
          { id: itHead.id, email: IT_HEAD_EMAIL, role: 'department_approver', department: 'IT' },
        ],
      },
      { status: 200, headers: noStore },
    );
  } catch (cause) {
    return Response.json(
      { ok: false, error: cause instanceof Error ? cause.message : 'Bootstrap failed.' },
      { status: 500, headers: noStore },
    );
  }
}
