import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY are required.');
const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const superadminEmail = (
  process.env.SUPERADMIN_EMAIL || 'gpigemcorqbbackup@gmail.com'
).toLowerCase();
const administratorEmail = (
  process.env.ADMINISTRATOR_EMAIL || 'dricianfranciscordon@gmail.com'
).toLowerCase();

const listed = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listed.error) throw listed.error;
const superadmin = listed.data.users.find(
  (candidate) => candidate.email?.toLowerCase() === superadminEmail,
);
const administrator = listed.data.users.find(
  (candidate) => candidate.email?.toLowerCase() === administratorEmail,
);
if (!superadmin || !administrator)
  throw new Error('One or more protected accounts were not found in Supabase Auth.');

const existingProfiles = await db
  .from('profiles')
  .select('id,full_name')
  .in('id', [superadmin.id, administrator.id]);
if (existingProfiles.error) throw existingProfiles.error;
const profileNames = new Map(
  (existingProfiles.data || []).map((profile) => [profile.id, profile.full_name]),
);
const profiles = await db.from('profiles').upsert(
  [
    {
      id: superadmin.id,
      email: superadminEmail,
      full_name: profileNames.get(superadmin.id) || 'Finance Head',
      active: true,
    },
    {
      id: administrator.id,
      email: administratorEmail,
      full_name: profileNames.get(administrator.id) || 'Administrator',
      active: true,
    },
  ],
  { onConflict: 'id' },
);
if (profiles.error) throw profiles.error;

const roles = await db.from('user_roles').upsert(
  [
    { user_id: superadmin.id, role: 'super_administrator' },
    { user_id: superadmin.id, role: 'administrator' },
    { user_id: administrator.id, role: 'administrator' },
  ],
  { onConflict: 'user_id,role' },
);
if (roles.error) throw roles.error;

const demoted = await db
  .from('user_roles')
  .delete()
  .eq('role', 'super_administrator')
  .neq('user_id', superadmin.id);
if (demoted.error) throw demoted.error;

const verified = await db
  .from('user_roles')
  .select('user_id,role')
  .in('user_id', [superadmin.id, administrator.id]);
if (verified.error) throw verified.error;
const currentSuperadmins = await db
  .from('user_roles')
  .select('user_id')
  .eq('role', 'super_administrator');
if (currentSuperadmins.error) throw currentSuperadmins.error;
if (
  currentSuperadmins.data?.length !== 1 ||
  currentSuperadmins.data[0]?.user_id !== superadmin.id
) {
  throw new Error('The requested account is not the sole Super Administrator.');
}
console.log(
  JSON.stringify(
    {
      ok: true,
      superadminEmail,
      soleSuperadmin: true,
      accounts: {
        superadmin: (verified.data || [])
          .filter((row) => row.user_id === superadmin.id)
          .map((row) => row.role)
          .sort(),
        administrator: (verified.data || [])
          .filter((row) => row.user_id === administrator.id)
          .map((row) => row.role)
          .sort(),
      },
    },
    null,
    2,
  ),
);
