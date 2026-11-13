import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.IT_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.IT_ADMIN_INITIAL_PASSWORD;
const fullName = process.env.IT_ADMIN_FULL_NAME?.trim() || 'IT Administrator';

if (!url || !secret || !email || !password) {
  throw new Error(
    'Set SUPABASE_URL, SUPABASE_SECRET_KEY, IT_ADMIN_EMAIL, and IT_ADMIN_INITIAL_PASSWORD in a private local environment.',
  );
}
if (
  password.length < 14 ||
  !/[A-Z]/.test(password) ||
  !/[a-z]/.test(password) ||
  !/[0-9]/.test(password) ||
  !/[^A-Za-z0-9]/.test(password)
) {
  throw new Error(
    'IT administrator initial password must have at least 14 characters and uppercase, lowercase, number and symbol. Do not use a password shared in a chat.',
  );
}

const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const listed = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listed.error) throw listed.error;
let user = listed.data.users.find((entry) => entry.email?.toLowerCase() === email);
if (user) {
  const roles = await db.from('user_roles').select('role').eq('user_id', user.id);
  if (roles.error) throw roles.error;
  if (roles.data?.length)
    throw new Error(
      'This account already has payment-related staff roles. Use a separate IT-only account.',
    );
  if (process.env.IT_ADMIN_ALLOW_EXISTING !== '1') {
    throw new Error(
      'Account already exists. For an existing non-Finance user, set IT_ADMIN_ALLOW_EXISTING=1 explicitly after reviewing ownership.',
    );
  }
  const changed = await db.auth.admin.updateUserById(user.id, { password });
  if (changed.error) throw changed.error;
} else {
  const created = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (created.error || !created.data.user)
    throw created.error || new Error('Unable to create IT account.');
  user = created.data.user;
}

const profile = await db.from('profiles').upsert(
  {
    id: user!.id,
    email,
    full_name: fullName,
    department: 'IT',
    active: true,
    protected_account: true,
  },
  { onConflict: 'id' },
);
if (profile.error) throw profile.error;
const grant = await db.from('it_administrators').upsert(
  {
    user_id: user!.id,
    active: true,
  },
  { onConflict: 'user_id' },
);
if (grant.error) throw grant.error;
console.log('Dedicated IT-only account provisioned. Email:', email);
console.log(
  'Require the operator to change the temporary password after the first successful sign-in.',
);
