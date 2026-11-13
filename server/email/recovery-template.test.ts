import assert from 'node:assert/strict';
import test from 'node:test';
import { recoveryFromAddress, recoverySubject, renderRecoveryEmail } from './recovery-template.ts';

test('recovery email uses RFP Monitoring System identity and a secure link', () => {
  const tokenLink =
    'https://chchtjolsnlelgxbgkip.supabase.co/auth/v1/verify?token=sample&type=recovery&redirect_to=https%3A%2F%2Fgreenlight-rfp.vercel.app';
  const html = renderRecoveryEmail(tokenLink);

  assert.equal(recoverySubject, 'RFP Monitoring System | Reset your password');
  assert.ok(html.includes('RFP Monitoring System'));
  assert.ok(html.includes('GPI &bull; GEMCOR'));
  assert.ok(html.includes('Reset my password'));
  assert.ok(html.includes('token=sample&amp;type=recovery'));
  assert.ok(!html.includes('href="' + tokenLink + '"'));
  assert.ok(html.includes("Didn't request this?"));
});

test('rejects unencrypted action links', () => {
  assert.throws(() => renderRecoveryEmail('http://example.com/token'), /HTTPS/);
  assert.throws(() => renderRecoveryEmail('javascript:alert(1)'), /HTTPS/);
});

test('sender keeps the configured SMTP address but displays RFP branding', () => {
  assert.deepEqual(recoveryFromAddress('RFP Desk <notifications@example.com>'), {
    name: 'RFP Monitoring System',
    address: 'notifications@example.com',
  });
  assert.deepEqual(recoveryFromAddress('notifications@example.com'), {
    name: 'RFP Monitoring System',
    address: 'notifications@example.com',
  });
  assert.throws(() => recoveryFromAddress('RFP Desk'), /From address is invalid/);
});
