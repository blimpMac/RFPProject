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
const themeStorageKey = 'rfp-theme';
const viewports = [
  { name: 'phone-320', width: 320, height: 800 },
  { name: 'phone-360', width: 360, height: 800 },
  { name: 'phone-390', width: 390, height: 844 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'landscape-1024', width: 1024, height: 768 },
  { name: 'desktop-1440', width: 1440, height: 1000 },
];
const publicRoutes = [
  { path: '/', heading: 'New RFP request', name: 'request' },
  { path: '/admin/login', heading: 'Staff sign in', name: 'login' },
];
const staffRoutes = [
  { path: '/admin', heading: 'Payment requests at a glance', name: 'dashboard' },
  { path: '/admin/monitoring', heading: 'RFP monitor', name: 'monitoring' },
  { path: '/admin/approvals', heading: 'Finance Dashboard', name: 'approvals' },
  { path: '/admin/documents', heading: 'Document Management', name: 'documents' },
  { path: '/admin/account-management', heading: 'Account Management', name: 'account-management' },
  { path: '/admin/audit-trail', heading: 'Audit Trail', name: 'audit-trail' },
];

type RouteCheck = (typeof publicRoutes)[number] | (typeof staffRoutes)[number];
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

async function openAndCheck(page: Page, route: RouteCheck, staff = false) {
  await page.goto(`${liveUrl}${route.path}`, { waitUntil: 'networkidle' });
  const scope = staff ? page.locator('#main-content') : page;
  await scope.getByRole('heading', { name: route.heading, exact: true }).first().waitFor();
  await assertResponsiveLayout(page, route.name);
}

async function setThemeAndCheck(page: Page, theme: 'light' | 'dark', label: string) {
  await page.evaluate(
    `localStorage.setItem(${JSON.stringify(themeStorageKey)}, ${JSON.stringify(theme)})`,
  );
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(
    `document.documentElement.dataset.theme === ${JSON.stringify(theme)}`,
  );
  const classState = await page.evaluate<boolean>(
    `document.documentElement.classList.contains('dark')`,
  );
  if (classState !== (theme === 'dark')) {
    throw new Error(`${label} did not apply ${theme} mode consistently.`);
  }
  await assertResponsiveLayout(page, `${label} ${theme} mode`);
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

const latestRequest = await db
  .from('rfp_requests')
  .select('id')
  .order('submitted_at', { ascending: false })
  .limit(1)
  .maybeSingle();
if (latestRequest.error) throw latestRequest.error;

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

    if (viewport.name === 'phone-320' || viewport.name === 'desktop-1440') {
      await publicPage.goto(liveUrl, { waitUntil: 'networkidle' });
      await setThemeAndCheck(publicPage, 'light', `request ${viewport.name}`);
      await setThemeAndCheck(publicPage, 'dark', `request ${viewport.name}`);
    }

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
    for (const route of staffRoutes) await openAndCheck(staffPage, route, true);

    if (viewport.name === 'phone-320' || viewport.name === 'desktop-1440') {
      await staffPage.goto(`${liveUrl}/admin`, { waitUntil: 'networkidle' });
      await setThemeAndCheck(staffPage, 'light', `dashboard ${viewport.name}`);
      await setThemeAndCheck(staffPage, 'dark', `dashboard ${viewport.name}`);
    }

    if (latestRequest.data?.id) {
      await staffPage.goto(`${liveUrl}/admin/rfp/${latestRequest.data.id}/print`, {
        waitUntil: 'networkidle',
      });
      await staffPage.locator('.digital-rfp-sheet').waitFor();
      await assertResponsiveLayout(staffPage, `digital RFP ${viewport.name}`);
      if (viewport.name === 'phone-320') {
        await staffPage.screenshot({
          path: 'artifacts/responsive/digital-rfp-phone-320.png',
          fullPage: true,
        });
      }
    }

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

      await staffPage.goto(`${liveUrl}/admin/account-management`, { waitUntil: 'networkidle' });
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

      await staffPage.goto(`${liveUrl}/admin/approvals`, { waitUntil: 'networkidle' });
      await assertResponsiveLayout(staffPage, 'finance dashboard phone-320');
      await staffPage.screenshot({
        path: 'artifacts/responsive/finance-phone-320.png',
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
        modalChecks: 1,
        themeChecks: ['light', 'dark'],
        digitalRfpChecked: Boolean(latestRequest.data?.id),
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
