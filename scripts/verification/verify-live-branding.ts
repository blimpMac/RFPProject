import { mkdir } from 'node:fs/promises';
import { chromium, type Page } from '@playwright/test';

const liveUrl = 'https://greenlight-rfp.vercel.app';
const currentYear = new Date().getFullYear();

type LogoStyles = {
  lockupBoxShadow: string;
  logoFilters: string[];
};

async function verifyFooter(page: Page) {
  const greenlightCopyright = `© ${currentYear} Greenlight Power Inc.`;
  const gemcorCopyright = `© ${currentYear} Greenmetal Electric Manufacturing Corp.`;

  await page.getByText(greenlightCopyright, { exact: true }).waitFor();
  await page.getByText(gemcorCopyright, { exact: true }).waitFor();

  const combinedCredit = await page.getByText(/GREENLIGHT POWER\s*×\s*GEMCOR/i).count();
  if (combinedCredit > 0) throw new Error('The obsolete combined company credit is still visible.');
}

async function verifyDarkModeLogos(page: Page) {
  await page.evaluate(`localStorage.setItem('rfp-theme', 'light')`);
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await page.waitForFunction(`document.documentElement.dataset.theme === 'dark'`);

  const logoStyles = await page.evaluate<LogoStyles>(`(() => {
    const lockup = document.querySelector('.brand-lockup');
    const logos = Array.from(document.querySelectorAll('.brand-logo'));
    if (!lockup || logos.length !== 2) throw new Error('Company logos were not rendered.');
    return {
      lockupBoxShadow: getComputedStyle(lockup).boxShadow,
      logoFilters: logos.map((logo) => getComputedStyle(logo).filter)
    };
  })()`);

  if (logoStyles.lockupBoxShadow !== 'none') {
    throw new Error(`Logo container still has a shadow: ${logoStyles.lockupBoxShadow}`);
  }
  if (logoStyles.logoFilters.some((filter) => filter !== 'none')) {
    throw new Error(`Dark-mode logo filter is still active: ${logoStyles.logoFilters.join(', ')}`);
  }
}

await mkdir('artifacts/branding', { recursive: true });
const browser = await chromium.launch();

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(liveUrl, { waitUntil: 'networkidle' });
  await verifyFooter(page);
  await verifyDarkModeLogos(page);
  await page.screenshot({ path: 'artifacts/branding/dark-desktop.png', fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: 'networkidle' });
  await verifyFooter(page);
  await page.screenshot({ path: 'artifacts/branding/dark-phone.png', fullPage: true });

  console.log(
    JSON.stringify(
      {
        ok: true,
        darkModeLogoGlow: false,
        separateCompanyCredits: true,
        viewports: ['desktop-1440', 'phone-390'],
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
