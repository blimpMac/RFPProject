import assert from 'node:assert/strict';
import { chromium, type Page } from '@playwright/test';
import { renderEmail } from '../../server/email/templates.ts';

const request = {
  rfp_number: 'RFP-UAT-LAYOUT',
  requestor_name: 'Layout Verification User',
  requestor_email: 'layout@example.com',
  company: 'Greenlight Power Inc.',
  department: 'Sales',
  project_class: 'Email QA',
  rfp_type: 'Trade Suppliers',
  supplier_payee: 'Email Layout Test Supplier',
  amount: 123.45,
  required_payment_date: '2026-11-30',
  purpose_description: 'Verify that email forms remain full-width and structurally valid.',
};

async function verifyCardWidth(page: Page, viewportWidth: number) {
  const card = await page.locator('table[width="620"]').first().boundingBox();
  const header = await page
    .getByText('RFP Monitoring System', { exact: true })
    .locator('..')
    .boundingBox();
  assert.ok(card && header);
  assert.ok(card.width >= Math.min(620, viewportWidth - 24) - 2);
  assert.ok(
    Math.abs(card.width - header.width) <= 2,
    'Email header must span the full card width.',
  );
}

async function verifyReview(page: Page, viewportWidth: number) {
  const email = renderEmail(
    'supervisor_review',
    request,
    { reviewToken: 'layout-verification-token' },
    'https://greenlight-rfp.vercel.app',
    [{ name: 'supporting-document.png', url: 'https://example.com/document.png' }],
  );
  await page.setViewportSize({ width: viewportWidth, height: 1100 });
  await page.setContent(email.html);
  await verifyCardWidth(page, viewportWidth);
  const boxes = await Promise.all(
    ['Approve', 'Reject', 'Return for Correction'].map(async (name) => {
      const box = await page.getByRole('link', { name, exact: true }).boundingBox();
      assert.ok(box, `${name} must be visible.`);
      return box;
    }),
  );
  assert.ok(boxes.every((box) => Math.abs(box.y - boxes[0].y) <= 1));
  for (let index = 1; index < boxes.length; index += 1) {
    assert.ok(boxes[index].x > boxes[index - 1].x + boxes[index - 1].width);
  }
  const card = await page.locator('table[width="620"]').first().boundingBox();
  assert.ok(card);
  assert.ok(boxes[2].x + boxes[2].width <= card.x + card.width);
}

async function verifyReceipt(page: Page, viewportWidth: number) {
  const email = renderEmail(
    'processing_started',
    request,
    { processingDueAt: '2026-11-30T15:00:00+08:00' },
    'https://greenlight-rfp.vercel.app',
    [],
  );
  await page.setViewportSize({ width: viewportWidth, height: 1100 });
  await page.setContent(email.html);
  await verifyCardWidth(page, viewportWidth);
  const receiptTitle = await page
    .getByText('REQUEST FOR PAYMENT (RFP)', { exact: true })
    .boundingBox();
  const rfpNumber = await page.getByText('RFP-UAT-LAYOUT', { exact: true }).last().boundingBox();
  assert.ok(receiptTitle && rfpNumber);
  assert.ok(receiptTitle.width > 180);
  assert.ok(rfpNumber.x > receiptTitle.x, 'Receipt values must remain beside their labels.');
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  for (const width of [375, 800]) {
    await verifyReview(page, width);
    await verifyReceipt(page, width);
  }
  console.log(
    JSON.stringify({ ok: true, widths: [375, 800], buttonsInline: true, receiptFullWidth: true }),
  );
} finally {
  await browser.close();
}
