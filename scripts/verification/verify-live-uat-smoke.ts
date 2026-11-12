import assert from 'node:assert/strict';
import process from 'node:process';
import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const liveUrl = process.env.PLAYWRIGHT_BASE_URL || 'https://greenlight-rfp.vercel.app';
const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!supabaseUrl || !serviceKey || !publishableKey) {
  throw new Error('Supabase verification variables are required.');
}

const db = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
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
const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
const storageKey = `sb-${projectRef}-auth-token`;

const browser = await chromium.launch();
try {
  const unauthorized = await browser.newPage();
  await unauthorized.goto(`${liveUrl}/admin`, { waitUntil: 'networkidle' });
  await unauthorized.waitForURL(/\/admin\/login$/);
  await unauthorized.getByRole('heading', { name: 'Staff sign in' }).waitFor();
  await unauthorized.close();

  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
    key: storageKey,
    value: JSON.stringify(verified.data.session),
  });
  await page.goto(`${liveUrl}/admin/approvals`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Finance Dashboard', exact: true }).waitFor();

  await page.goto(`${liveUrl}/admin/monitoring`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'RFP monitor', exact: true }).waitFor();
  const csvDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'CSV', exact: true }).click();
  const csv = await csvDownload;
  assert.match(csv.suggestedFilename(), /\.csv$/i);
  const xlsxDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'XLSX', exact: true }).click();
  const xlsx = await xlsxDownload;
  assert.match(xlsx.suggestedFilename(), /\.xlsx$/i);
  await context.close();

  console.log(
    JSON.stringify(
      {
        ok: true,
        unauthorizedRedirect: true,
        authorizedFinanceDashboard: true,
        exports: [csv.suggestedFilename(), xlsx.suggestedFilename()],
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
