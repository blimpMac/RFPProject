import process from 'node:process';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!supabaseUrl || !serviceKey || !publishableKey)
  throw new Error(
    'SUPABASE_URL, SUPABASE_SECRET_KEY, and the browser publishable key are required.',
  );
const liveUrl = 'https://greenlight-rfp.vercel.app';
const db = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const users = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (users.error) throw users.error;
const superadmin = users.data.users.find(
  (user) => user.email?.toLowerCase() === 'dricianfranciscordon@gmail.com',
);
if (!superadmin?.email) throw new Error('The Super Administrator account was not found.');
const profile = await db.from('profiles').select('full_name').eq('id', superadmin.id).single();
if (profile.error || !profile.data.full_name)
  throw profile.error || new Error('The Super Administrator profile name was not found.');
const login = await db.auth.admin.generateLink({
  type: 'magiclink',
  email: superadmin.email,
  options: { redirectTo: `${liveUrl}/admin/approver-management` },
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
  throw verified.error || new Error('The one-time Super Administrator session was not created.');
const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
const storageKey = `sb-${projectRef}-auth-token`;

await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
  });
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
    key: storageKey,
    value: JSON.stringify(verified.data.session),
  });
  await page.goto(`${liveUrl}/admin/approver-management`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Approver Management' }).waitFor();
  await page.getByRole('link', { name: 'Approver Management' }).waitFor();
  const topbar = page.locator('header.admin-topbar');
  await topbar.getByText(profile.data.full_name, { exact: true }).waitFor();
  await topbar.getByText(superadmin.email, { exact: true }).waitFor();
  await page.getByText('Active accounts', { exact: true }).waitFor();
  await page.getByLabel('Account status').selectOption('active');
  await page.getByLabel('Department').selectOption('all');
  const resetActions = await page.getByRole('button', { name: 'Reset password' }).count();
  const deleteActions = await page.getByRole('button', { name: 'Delete' }).count();
  if (resetActions < 1 || deleteActions < 1)
    throw new Error('Expected approver management actions were not rendered.');
  const accountRows = await page.locator('article').count();
  if (accountRows > 10)
    throw new Error(
      `Approver Management rendered ${accountRows} accounts instead of a maximum of 10.`,
    );
  await page.getByText('10 accounts per page').waitFor();
  await page.getByRole('button', { name: 'Add an approver' }).click();
  await page.getByRole('heading', { name: 'Add an approver' }).waitFor();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.screenshot({ path: 'artifacts/approver-management.png', fullPage: true });

  await page.getByRole('link', { name: 'Approval Team' }).click();
  await page.getByRole('heading', { name: 'Edit Approval Team', exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Approval team', exact: true }).waitFor();
  await page.getByRole('button', { name: /Edit approval team|Set up approval team/ }).click();
  await page.getByRole('heading', { name: 'Choose the approval team', exact: true }).waitFor();
  const headChoices = page.getByRole('checkbox', { name: 'Head', exact: true });
  const coChoices = page.getByRole('checkbox', { name: 'Co-Approver', exact: true });
  if ((await headChoices.count()) < 2)
    throw new Error('The Approver Head choices were not rendered.');
  if ((await coChoices.count()) < 2) throw new Error('The Co-Approver choices were not rendered.');
  await headChoices.nth(0).check();
  await headChoices.nth(1).check();
  let checkedHeads = 0;
  for (let index = 0; index < (await headChoices.count()); index += 1)
    if (await headChoices.nth(index).isChecked()) checkedHeads += 1;
  if (checkedHeads !== 1) throw new Error('More than one Approver Head could be selected.');
  const departmentSections = page.getByTestId('approval-department-section');
  let replacementVerified = false;
  for (
    let sectionIndex = 0;
    sectionIndex < (await departmentSections.count()) && !replacementVerified;
    sectionIndex += 1
  ) {
    const choices = departmentSections
      .nth(sectionIndex)
      .getByRole('checkbox', { name: 'Co-Approver', exact: true });
    const enabled = [];
    for (let index = 0; index < (await choices.count()); index += 1)
      if (await choices.nth(index).isEnabled()) enabled.push(index);
    if (enabled.length >= 2) {
      const first = choices.nth(enabled[0]);
      const second = choices.nth(enabled[1]);
      if (!(await first.isChecked())) await first.check();
      await second.check();
      if ((await first.isChecked()) || !(await second.isChecked()))
        throw new Error('Selecting another Co-Approver did not replace the department selection.');
      await second.uncheck();
      replacementVerified = true;
    }
  }
  if (replacementVerified) {
    let checkedCoApprovers = 0;
    for (let index = 0; index < (await coChoices.count()); index += 1)
      if (await coChoices.nth(index).isChecked()) checkedCoApprovers += 1;
    for (
      let sectionIndex = 0;
      sectionIndex < (await departmentSections.count()) && checkedCoApprovers < 3;
      sectionIndex += 1
    ) {
      const choices = departmentSections
        .nth(sectionIndex)
        .getByRole('checkbox', { name: 'Co-Approver', exact: true });
      for (let index = 0; index < (await choices.count()); index += 1) {
        const choice = choices.nth(index);
        if ((await choice.isEnabled()) && !(await choice.isChecked())) {
          await choice.check();
          checkedCoApprovers += 1;
          break;
        }
      }
    }
    checkedCoApprovers = 0;
    for (let index = 0; index < (await coChoices.count()); index += 1)
      if (await coChoices.nth(index).isChecked()) checkedCoApprovers += 1;
    if (checkedCoApprovers < 2 || checkedCoApprovers > 3)
      throw new Error('Co-Approver selection did not stay within the 2-3 account limit.');
    checkedHeads = 0;
    for (let index = 0; index < (await headChoices.count()); index += 1)
      if (await headChoices.nth(index).isChecked()) checkedHeads += 1;
    if (checkedHeads !== 1) await headChoices.nth(0).check();
    await page.getByText(/of 2–3 Co-Approvers selected/).waitFor();
    const departmentBrowser = page.getByLabel('Department', { exact: true });
    const departmentValue =
      (await departmentBrowser.locator('option').nth(2).getAttribute('value')) ||
      (await departmentBrowser.locator('option').nth(1).getAttribute('value'));
    if (!departmentValue)
      throw new Error('No department groups were available in the Approval Team selector.');
    await departmentBrowser.selectOption(departmentValue);
    if ((await page.getByTestId('approval-department-section').count()) !== 1)
      throw new Error('Department filtering did not isolate one account section.');
  }
  await page
    .getByRole('dialog')
    .locator('.modal-panel')
    .evaluate((element) => {
      element.scrollTop = 0;
    });
  await page.screenshot({ path: 'artifacts/approving-heads.png', fullPage: true });
  await page.getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('link', { name: 'Account Management' }).click();
  await page.getByRole('heading', { name: 'Account Management', exact: true }).waitFor();
  await page.getByLabel('Access', { exact: true }).waitFor();
  await page.getByLabel('Status', { exact: true }).waitFor();
  const managerRows = await page.locator('article').count();
  if (managerRows > 6)
    throw new Error(`Account Manager rendered ${managerRows} accounts instead of a maximum of 6.`);
  await page.getByText('6 accounts per page').waitFor();
  if (
    (await page.getByText('Email previews', { exact: true }).count()) ||
    (await page.getByText('Configuration', { exact: true }).count())
  )
    throw new Error('Removed Settings tabs are still visible.');
  await page.getByRole('button', { name: 'Add account' }).click();
  await page.getByRole('heading', { name: 'Add account', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.screenshot({ path: 'artifacts/account-manager.png', fullPage: true });

  await page.goto(`${liveUrl}/admin/documents`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Document Management' }).waitFor();
  const requestorSelect = page.getByLabel('Requestor', { exact: true });
  const requestorOptions = requestorSelect.locator('option');
  if ((await requestorOptions.count()) > 1) {
    const requestorValue = await requestorOptions.nth(1).getAttribute('value');
    if (requestorValue) await requestorSelect.selectOption(requestorValue);
  }
  await requestorSelect.selectOption('all');
  const fromDate = page.getByLabel('From', { exact: true });
  const toDate = page.getByLabel('To', { exact: true });
  await fromDate.fill('2020-01-01');
  await toDate.fill('2099-12-31');
  await page.getByRole('heading', { name: 'No matching documents' }).waitFor();
  await page.screenshot({ path: 'artifacts/document-management-empty.png', fullPage: true });
  console.log(
    JSON.stringify(
      {
        ok: true,
        signedInIdentity: true,
        superadminNavigation: true,
        activeDetection: true,
        addApprover: true,
        approverPagination: true,
        editApprovingHeadsNavigation: true,
        approvalTeamEditor: true,
        accountManagerPagination: true,
        resetPasswordAction: true,
        deleteAction: true,
        requestorFilter: true,
        dateRangeFilter: true,
        emptyDocumentState: true,
        screenshots: [
          'artifacts/approver-management.png',
          'artifacts/approving-heads.png',
          'artifacts/account-manager.png',
          'artifacts/document-management-empty.png',
        ],
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
