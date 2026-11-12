import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const indexHtml = await readFile('index.html', 'utf8');
const bootstrap = indexHtml.match(/<script>([\s\S]*?)<\/script>/)?.[1];
if (!bootstrap) throw new Error('The inline theme bootstrap was not found.');
const browser = await chromium.launch();
const pageErrors: string[] = [];

try {
  const page = await browser.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.evaluate(`(() => {
    const frame = document.createElement('iframe');
    frame.title = 'Sandboxed theme bootstrap';
    frame.sandbox.add('allow-scripts');
    frame.srcdoc = '<script>' + ${JSON.stringify(bootstrap)} + '<\\/script><h1>Theme sandbox ready</h1>';
    document.body.append(frame);
  })()`);
  const frame = page.frames().find((candidate) => candidate !== page.mainFrame());
  if (!frame) throw new Error('The sandboxed theme frame was not created.');
  await frame.getByRole('heading', { name: 'Theme sandbox ready' }).waitFor();
  if (pageErrors.length) throw new Error(`Sandboxed theme errors: ${pageErrors.join(' | ')}`);
  console.log(JSON.stringify({ ok: true, storageDenied: true, pageErrors }, null, 2));
} finally {
  await browser.close();
}
