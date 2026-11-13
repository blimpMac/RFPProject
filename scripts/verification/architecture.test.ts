import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');
const lineCount = (path: string) => read(path).split(/\r?\n/).length;

test('staff route stays a thin dispatcher', () => {
  const staff = read('server/routes/staff.ts');
  assert.ok(lineCount('server/routes/staff.ts') <= 70, 'staff.ts should remain a thin dispatcher');
  for (const route of ['finance/action', 'finance/update', 'department/action', 'audit-trail']) {
    assert.equal(staff.includes(route), false, `${route} must stay in a focused route module`);
  }
});

test('approval workspace stays feature-oriented', () => {
  assert.ok(
    lineCount('src/pages/ApprovalsPage.tsx') <= 750,
    'ApprovalsPage.tsx should compose feature modules instead of becoming a god component',
  );
  for (const path of [
    'src/features/approvals/workflow.ts',
    'src/features/approvals/ApprovalQueueFilters.tsx',
    'src/features/approvals/ApprovalQueueTable.tsx',
    'src/features/approvals/FinanceUpdateForm.tsx',
    'server/routes/staff/finance.ts',
    'server/routes/staff/monitoring.ts',
    'server/routes/staff/attachments.ts',
  ]) {
    assert.ok(read(path).length > 0, `${path} must exist`);
  }
});

test('IT can update only its own profile and receives a technical manual', () => {
  const profile = read('server/routes/staff/profile.ts');
  assert.match(profile, /requireStaff\(event, \[[\s\S]*?'it_administrator'/);
  assert.match(profile, /\.eq\('id', staff\.user\.id\)/);
  const manual = read('src/pages/ManualPage.tsx');
  assert.ok(manual.includes("roles.includes('it_administrator')"));
  assert.ok(manual.includes('IT Technical Manual'));
  assert.equal(manual.includes('to="/admin/new-request"'), false);
  assert.equal(manual.includes('to="/admin/preview-forms"'), false);
});

test('staff sign-out redirects immediately without stale auth state or blocked presence logging', () => {
  const auth = read('src/components/AuthProvider.tsx');
  const layout = read('src/layouts/AdminLayout.tsx');

  // Supabase auth callbacks cannot re-enter getSession while the auth lock is held.
  assert.ok(auth.includes('onAuthStateChange((_event, nextSession) => {'));
  assert.ok(auth.includes('window.setTimeout(() => {'));
  assert.equal(auth.includes('onAuthStateChange(() => void refresh())'), false);
  assert.match(auth, /if \(!nextSession\) \{[\s\S]*?clearSession\(\);/);

  // Stale /api/me results must not reinstate a user after they sign out.
  assert.ok(auth.includes('version !== sessionVersion.current'));

  // Presence tracking must never hold the user on the dashboard.
  assert.ok(layout.includes('keepalive: true'));
  assert.ok(layout.includes("supabase.auth.signOut({ scope: 'local' })"));
  assert.ok(layout.includes("navigate('/admin/login', { replace: true })"));
  assert.equal(layout.includes("await post('presence', { action: 'logout'"), false);
});

test('password recovery uses RFP branding and retains secure Supabase reset links', () => {
  const page = read('src/pages/PasswordRecoveryPage.tsx');
  const template = read('supabase/templates/recovery.html');
  const authConfig = read('supabase/config.toml');

  assert.ok(page.includes('RFP Monitoring System'));
  assert.ok(page.includes('Recovery request received'));
  assert.ok(page.includes("window.location.origin}/admin/reset-password"));
  assert.ok(page.includes('supabase.auth.resetPasswordForEmail'));
  assert.ok(page.includes('supabase.auth.updateUser'));
  assert.ok(template.includes('RFP Monitoring System'));
  assert.ok(template.includes('Reset my password'));
  assert.equal(template.split('{{ .ConfirmationURL }}').length - 1, 1);
  assert.match(template, /Didn't request this\?/);
  assert.match(authConfig, /\[auth\.email\.template\.recovery\]/);
  assert.ok(authConfig.includes('supabase/templates/recovery.html'));
});
