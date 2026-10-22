import process from 'node:process';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!supabaseUrl || !serviceKey || !publishableKey)
  throw new Error('Supabase verification variables are required.');

const liveUrl = 'https://greenlight-rfp.vercel.app';
const db = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const users = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (users.error) throw users.error;
if (users.data.users.length !== 2)
  throw new Error(`Expected 2 retained accounts, found ${users.data.users.length}.`);
const superadmin = users.data.users.find(
  (user) => user.email?.toLowerCase() === 'dricianfranciscordon@gmail.com',
);
if (!superadmin?.email) throw new Error('The retained Super Administrator account was not found.');
const requests = await db.from('rfp_requests').select('id', { count: 'exact', head: true });
if (requests.error) throw requests.error;
if (requests.count !== 0)
  throw new Error(`Expected an empty request tracker, found ${requests.count} rows.`);

const login = await db.auth.admin.generateLink({
  type: 'magiclink',
  email: superadmin.email,
  options: { redirectTo: `${liveUrl}/admin/monitoring` },
});
if (login.error) throw login.error;
const authClient = createClient(supabaseUrl, publishableKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const verified = await authClient.auth.verifyOtp({
  type: 'magiclink',
  token_hash: login.data.properties.hashed_token,
});
if (verified.error || !verified.data.session)
  throw verified.error || new Error('A verification session could not be created.');
const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
const storageKey = `sb-${projectRef}-auth-token`;

await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 360, height: 800 },
    deviceScaleFactor: 1,
  });
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
    key: storageKey,
    value: JSON.stringify(verified.data.session),
  });
  await page.goto(`${liveUrl}/admin/monitoring`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Monitoring Sheets' }).waitFor();
  await page.getByRole('button', { name: 'In Progress Requests', exact: true }).waitFor();
  const search = page.getByPlaceholder('Search visible rows…');
  await search.waitFor();
  await page.getByText('No records', { exact: true }).waitFor();
  const viewport = page.viewportSize();
  const bounds = await search.boundingBox();
  const pageWidth = await page.evaluate<number>('document.documentElement.scrollWidth');
  const dimensions = {
    viewportWidth: viewport?.width || 0,
    pageWidth,
    searchLeft: bounds?.x ?? -1,
    searchRight: bounds ? bounds.x + bounds.width : Number.POSITIVE_INFINITY,
  };
  if (
    dimensions.pageWidth > dimensions.viewportWidth + 1 ||
    dimensions.searchLeft < 0 ||
    dimensions.searchRight > dimensions.viewportWidth + 1
  ) {
    throw new Error(`Monitoring controls overflow at mobile width: ${JSON.stringify(dimensions)}`);
  }
  await page.screenshot({ path: 'artifacts/monitoring-mobile-clean.png', fullPage: true });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${liveUrl}/admin/settings`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Account Manager', exact: true }).waitFor();
  await page.getByRole('link', { name: 'Account Manager', exact: true }).waitFor();
  const accountRows = await page.locator('article').count();
  if (accountRows !== 2) throw new Error(`Expected 2 retained account rows, found ${accountRows}.`);
  await page.screenshot({ path: 'artifacts/account-manager-two-accounts.png', fullPage: true });

  console.log(
    JSON.stringify(
      {
        ok: true,
        retainedAccounts: 2,
        remainingRequests: 0,
        monitoringLabel: true,
        mobileOverflow: false,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
