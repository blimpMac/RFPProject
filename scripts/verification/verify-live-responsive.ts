import process from 'node:process';
import { mkdir } from 'node:fs/promises';
import { chromium, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!supabaseUrl || !serviceKey || !publishableKey) {
  throw new Error('Supabase verification variables are required.');
}

const liveUrl = 'https://greenlight-rfp.vercel.app';
const viewports = [
  { name: 'phone-320', width: 320, height: 800 },
  { name: 'phone-390', width: 390, height: 844 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop-1440', width: 1440, height: 1000 },
];
const publicRoutes = [
  { path: '/', heading: 'New RFP request', name: 'request' },
  { path: '/admin/login', heading: 'Sign in to your account', name: 'login' },
];
const staffRoutes = [
  { path: '/admin', heading: 'Dashboard', name: 'dashboard' },
  { path: '/admin/monitoring', heading: 'Monitoring Sheets', name: 'monitoring' },
  { path: '/admin/approvals', heading: 'Finance Dashboard', name: 'approvals' },
  { path: '/admin/documents', heading: 'Document Management', name: 'documents' },
  {
    path: '/admin/approver-management',
    heading: 'Approver Management',
    name: 'approver-management',
  },
  { path: '/admin/approving-heads', heading: 'Edit Approval Team', name: 'approval-team' },
  { path: '/admin/settings', heading: 'Account Manager', name: 'account-manager' },
];

type LayoutMetrics = {
  viewportWidth: number;
  documentWidth: number;
  bodyWidth: number;
};

async function assertResponsiveLayout(page: Page, label: string) {
  const metrics = await page.evaluate<LayoutMetrics>(`(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth
  }))()`);
  const overflow = Math.max(metrics.documentWidth, metrics.bodyWidth) - metrics.viewportWidth;
  if (overflow > 1) {
    throw new Error(`${label} has ${overflow}px of document-level horizontal overflow.`);
  }
}

async function openAndCheck(page: Page, route: { path: string; heading: string; name: string }) {
  await page.goto(`${liveUrl}${route.path}`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: route.heading, exact: true }).waitFor();
  await assertResponsiveLayout(page, route.name);
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
if (!superadmin?.email) throw new Error('The retained Super Administrator account was not found.');
const login = await db.auth.admin.generateLink({
  type: 'magiclink',
  email: superadmin.email,
  options: { redirectTo: `${liveUrl}/admin` },
});
if (login.error) throw login.error;
const authClient = createClient(supabaseUrl, publishableKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const verified = await authClient.auth.verifyOtp({
  type: 'magiclink',
  token_hash: login.data.properties.hashed_token,
});
if (verified.error || !verified.data.session) {
  throw verified.error || new Error('A verification session could not be created.');
}
const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
const storageKey = `sb-${projectRef}-auth-token`;

await mkdir('artifacts/responsive', { recursive: true });
const browser = await chromium.launch();
const browserErrors: string[] = [];

try {
  const publicPage = await browser.newPage();
  publicPage.on('pageerror', (error) => browserErrors.push(`public: ${error.message}`));
  for (const viewport of viewports) {
    await publicPage.setViewportSize(viewport);
    for (const route of publicRoutes) await openAndCheck(publicPage, route);
    if (viewport.name === 'phone-320') {
      await publicPage.goto(liveUrl, { waitUntil: 'networkidle' });
      await publicPage.screenshot({
        path: 'artifacts/responsive/request-phone-320.png',
        fullPage: true,
      });
    }
  }
  await publicPage.close();

  const staffPage = await browser.newPage();
  staffPage.on('pageerror', (error) => browserErrors.push(`staff: ${error.message}`));
  await staffPage.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
    key: storageKey,
    value: JSON.stringify(verified.data.session),
  });

  for (const viewport of viewports) {
    await staffPage.setViewportSize(viewport);
    for (const route of staffRoutes) await openAndCheck(staffPage, route);

    if (viewport.name === 'phone-320') {
      await staffPage.goto(`${liveUrl}/admin`, { waitUntil: 'networkidle' });
      await staffPage.getByRole('button', { name: 'Open navigation' }).click();
      await staffPage.getByRole('navigation', { name: 'Staff navigation' }).waitFor();
      await assertResponsiveLayout(staffPage, 'mobile navigation');
      await staffPage.getByRole('button', { name: 'Close navigation', exact: true }).click();

      await staffPage.goto(`${liveUrl}/admin/monitoring`, { waitUntil: 'networkidle' });
      const columnsButton = staffPage.getByRole('button', { name: 'Columns' });
      if (await columnsButton.isEnabled()) await columnsButton.click();
      await assertResponsiveLayout(staffPage, 'monitoring columns menu');
      await staffPage.screenshot({
        path: 'artifacts/responsive/monitoring-phone-320.png',
        fullPage: true,
      });

      await staffPage.goto(`${liveUrl}/admin/approver-management`, {
        waitUntil: 'networkidle',
      });
      await staffPage.getByRole('button', { name: 'Add an approver' }).click();
      await staffPage.getByRole('heading', { name: 'Add an approver', exact: true }).waitFor();
      await assertResponsiveLayout(staffPage, 'add approver modal');
      await staffPage.getByRole('button', { name: 'Cancel' }).click();

      await staffPage.goto(`${liveUrl}/admin/settings`, { waitUntil: 'networkidle' });
      await staffPage.getByRole('button', { name: 'Add account' }).click();
      await staffPage.getByRole('heading', { name: 'Add account', exact: true }).waitFor();
      await assertResponsiveLayout(staffPage, 'add account modal');
      await staffPage.screenshot({
        path: 'artifacts/responsive/account-modal-phone-320.png',
        fullPage: true,
      });
      await staffPage.getByRole('button', { name: 'Cancel' }).click();
      await staffPage.screenshot({
        path: 'artifacts/responsive/account-manager-phone-320.png',
        fullPage: true,
      });
    }
  }

  if (browserErrors.length) throw new Error(`Browser errors: ${browserErrors.join(' | ')}`);
  console.log(
    JSON.stringify(
      {
        ok: true,
        viewports: viewports.map((viewport) => viewport.name),
        publicPages: publicRoutes.length,
        staffPages: staffRoutes.length,
        modalChecks: 2,
        mobileNavigation: true,
        documentOverflow: false,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
