import process from 'node:process';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const rfpNumber = process.env.RFP_NUMBER;
if (!supabaseUrl || !serviceKey || !rfpNumber)
  throw new Error('SUPABASE_URL, SUPABASE_SECRET_KEY, and RFP_NUMBER are required.');

const db = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const access = JSON.parse(await readFile('test-assets/mock-access-accounts.json', 'utf8')) as {
  accounts: { email: string; temporaryPassword: string }[];
};
const heads = await db
  .from('department_approving_heads')
  .select('user_id')
  .eq('normalized_department', 'finance');
if (heads.error) throw heads.error;
const headIds = (heads.data || []).map((head) => head.user_id);
const profiles = headIds.length
  ? await db.from('profiles').select('email').in('id', headIds)
  : { data: [], error: null };
if (profiles.error) throw profiles.error;
const eligibleEmails = new Set((profiles.data || []).map((profile) => profile.email.toLowerCase()));
const account = access.accounts.find((candidate) =>
  eligibleEmails.has(candidate.email.toLowerCase()),
);
if (!account)
  throw new Error('No Finance mock approver credential is available for browser verification.');

await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
  });
  await page.goto('https://greenlight-rfp.vercel.app/admin/login', { waitUntil: 'networkidle' });
  await page.getByLabel('Work email').fill(account.email);
  await page.getByLabel('Password').fill(account.temporaryPassword);
  await page.getByRole('button', { name: 'Sign in securely' }).click();
  await page.waitForURL(/\/admin\/?$/, { timeout: 20_000 });
  await page.goto('https://greenlight-rfp.vercel.app/admin/approvals', {
    waitUntil: 'networkidle',
  });
  const requestLabel = page.getByText(rfpNumber, { exact: true });
  await requestLabel.waitFor();
  const requestRow = requestLabel.locator('xpath=../../..');
  await requestRow.getByRole('button', { name: 'Open request' }).click();
  await page.getByRole('button', { name: 'Preview all attachments (2)' }).click();
  await page.getByRole('heading', { name: 'Attachments (2)' }).waitFor();
  await page.locator('iframe[title^="Preview TEMPORARY-RFP-APPROVAL-ATTACHMENT.pdf"]').waitFor();
  await page.getByRole('button', { name: /TEMPORARY-RFP-APPROVAL-IMAGE\.png/ }).click();
  await page.getByRole('img', { name: 'TEMPORARY-RFP-APPROVAL-IMAGE.png' }).waitFor();
  const screenshot = `artifacts/${rfpNumber.toLowerCase()}-attachment-preview.png`;
  await page.screenshot({ path: screenshot, fullPage: true });
  console.log(
    JSON.stringify(
      { ok: true, rfpNumber, attachmentCount: 2, pdfPreview: true, imagePreview: true, screenshot },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
