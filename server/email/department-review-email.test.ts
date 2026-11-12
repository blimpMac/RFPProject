import assert from 'node:assert/strict';
import test from 'node:test';
import { renderEmail, renderEmailPreview } from './templates.ts';

const request = {
  rfp_number: 'RFP-0248',
  requestor_name: 'Juan Dela Cruz',
  requestor_email: 'juan@example.com',
  company: 'Greenlight Power Inc.',
  department: 'Operations',
  project_class: 'Maintenance',
  rfp_type: 'Supplier Payment',
  supplier_payee: 'Vendor',
  amount: 1500,
  required_payment_date: '2026-11-15',
  purpose_description: 'Site maintenance supplies',
};

const url = 'https://greenlight-rfp.vercel.app/';

test('real department approval messages display three secure action links, not old single CTA', () => {
  const email = renderEmail(
    'supervisor_review',
    request,
    { reviewToken: 'secure-department-token' },
    url,
    [],
  );
  for (const action of ['approve', 'reject', 'return']) {
    assert.ok(email.html.includes(
      `https://greenlight-rfp.vercel.app/review/secure-department-token?action=${action}`,
    ), `Missing review button ${action}`);
  }
  assert.match(email.html, />Approve<\/a>/);
  assert.match(email.html, />Reject<\/a>/);
  assert.match(email.html, />Return for Correction<\/a>/);
  assert.doesNotMatch(email.html, />Open secure review<\/a>/);
  assert.match(email.html, /confirm your choice/i);
});

test('empty review token does not generate a fake approval link', () => {
  const email = renderEmail('supervisor_review', request, {}, url, []);
  assert.doesNotMatch(email.html, /href="[^"]*\/review\//);
  assert.match(email.html, /No active review link was included/);
});

test('emailed preview clearly disables sample approval buttons and invalid links', () => {
  const email = renderEmailPreview('supervisor_review', url);
  assert.match(email.html, /DEMO PREVIEW ONLY/);
  assert.match(email.html, /Return for Correction/);
  assert.doesNotMatch(email.html, /href="[^"]*\/review\/preview-only-not-valid/);
});

test('review links are correctly normalized without double slash', () => {
  const email = renderEmail('supervisor_review', request, { reviewToken: 'a+b/c' }, url, []);
  assert.match(email.html, /\/review\/a%2Bb%2Fc\?action=approve/);
});
