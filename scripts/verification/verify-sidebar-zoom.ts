import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const assets = await readdir('dist/assets');
const cssFiles = assets.filter((file) => file.endsWith('.css'));
assert.ok(cssFiles.length, 'Production stylesheet was not generated.');
const stylesheet = (
  await Promise.all(cssFiles.map((file) => readFile(join('dist/assets', file), 'utf8')))
).join('\n');
const browser = await chromium.launch({ headless: true });
const widths = [320, 375, 768, 1024, 1279, 1280, 1366, 1440, 1800, 1920];

function markup() {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body>
<div class="admin-shell admin-shell-collapsed min-h-screen">
  <aside id="staff-sidebar" class="admin-sidebar fixed inset-y-0 left-0 z-30 flex flex-col overflow-hidden admin-sidebar-is-collapsed">
    <div class="admin-brand flex h-[5.25rem] shrink-0 items-center px-3">
      <button id="desktop-toggle" type="button" class="admin-navigation-trigger admin-navigation-desktop focus-ring" aria-label="Open navigation" aria-expanded="false">
        <svg width="20" height="20" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2"/></svg>
      </button>
      <a class="admin-brand-link flex min-w-0 items-center gap-3 px-2" href="#overview">RFP CONTROL</a>
    </div>
    <nav class="admin-sidebar-navigation min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-3 pb-3 pt-4">
      <p class="admin-nav-label">Workspace</p>
      <a class="admin-sidebar-link" href="#overview">
        <span class="admin-nav-icon"><svg width="18" height="18"><circle cx="9" cy="9" r="7" fill="currentColor"/></svg></span>
        <span class="min-w-0" data-sidebar-label><strong>Overview</strong></span>
      </a>
    </nav>
  </aside>
  <div class="admin-content transition-all">
    <header class="admin-topbar flex min-h-[5.25rem] items-center gap-3 px-4 sm:gap-4 lg:px-6">
      <div class="admin-navigation-dropdown relative shrink-0" id="dropdown-anchor">
        <button id="dropdown-toggle" class="admin-dropdown-trigger focus-ring" type="button" aria-expanded="false" aria-controls="staff-navigation-dropdown" aria-label="Navigation menu">
          <svg class="admin-dropdown-chevron" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <nav id="staff-navigation-dropdown" class="admin-dropdown-panel" aria-label="Staff navigation menu" hidden>
          <div class="admin-dropdown-group">
            <p class="admin-dropdown-heading">Workspace</p>
            <a href="#overview" class="admin-dropdown-link"><span>Overview</span></a>
            <a href="#approvals" class="admin-dropdown-link"><span>Approval queue</span></a>
          </div>
        </nav>
      </div>
      <div class="admin-topbar-title min-w-0 flex-1">
        <p>Operations workspace</p>
        <h1>Overview</h1>
      </div>
      <button type="button" class="admin-account-trigger">Account</button>
    </header>
    <main id="main-content" class="page-enter mx-auto w-full max-w-[100rem] p-4 sm:p-6 lg:p-8">
      <section class="card p-5"><button class="btn btn-secondary">Refresh</button><input class="input" value="Example"></section>
      <div style="min-height:1500px">Scrolling area</div>
    </main>
  </div>
</div>
<script>
  (() => {
    const sidebar = document.getElementById('staff-sidebar');
    const desktop = document.getElementById('desktop-toggle');
    const dropdown = document.getElementById('dropdown-toggle');
    const panel = document.getElementById('staff-navigation-dropdown');
    const anchor = document.getElementById('dropdown-anchor');
    const setDropdown = (open) => {
      panel.hidden = !open;
      dropdown.setAttribute('aria-expanded', String(open));
    };
    dropdown.addEventListener('click', () => setDropdown(panel.hidden));
    document.addEventListener('pointerdown', (event) => {
      if (!anchor.contains(event.target)) setDropdown(false);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') setDropdown(false);
    });
    panel.addEventListener('click', (event) => {
      if (event.target.closest('a')) setDropdown(false);
    });
    sidebar.addEventListener('mouseenter', () => sidebar.classList.add('admin-sidebar-is-peeked'));
    sidebar.addEventListener('mouseleave', () => sidebar.classList.remove('admin-sidebar-is-peeked'));
    desktop.addEventListener('click', () => sidebar.classList.add('admin-sidebar-is-peeked'));
  })();
</script>
</body></html>`;
}

async function isVisible(page: import('@playwright/test').Page, selector: string) {
  return page.locator(selector).isVisible();
}

try {
  for (const width of widths) {
    const page = await browser.newPage({ viewport: { width, height: 850 } });
    await page.setContent(markup());
    await page.addStyleTag({ content: stylesheet });
    await page.waitForTimeout(350);

    const compact = width < 1280;
    assert.equal(await isVisible(page, '#dropdown-toggle'), compact);
    assert.equal(await isVisible(page, '#desktop-toggle'), !compact);
    assert.ok(
      await page.evaluate('document.documentElement.scrollWidth <= innerWidth + 2'),
      `Horizontal document overflow at width ${width}`,
    );

    if (compact) {
      const geometry = await page.evaluate<{
        triggerRight: number;
        titleLeft: number;
        triggerWidth: number;
      }>(`(() => {
        const trigger = document.querySelector('#dropdown-toggle').getBoundingClientRect();
        const title = document.querySelector('.admin-topbar-title').getBoundingClientRect();
        return { triggerRight: trigger.right, titleLeft: title.left, triggerWidth: trigger.width };
      })()`);
      assert.ok(
        geometry.triggerWidth <= 48 && geometry.titleLeft - geometry.triggerRight < 35,
        `Dropdown and title are misaligned at ${width}px: ${JSON.stringify(geometry)}`,
      );
      const trigger = page.locator('#dropdown-toggle');
      assert.equal(await trigger.locator('.admin-dropdown-chevron').count(), 1);
      assert.equal((await trigger.innerText()).trim(), '');
      await trigger.click();
      assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
      await page.waitForTimeout(250);
      const rotation = await page.evaluate<string>(
        "getComputedStyle(document.querySelector('#dropdown-toggle .admin-dropdown-chevron')).transform",
      );
      assert.equal(rotation, 'matrix(-1, 0, 0, -1, 0, 0)');
      assert.ok(await isVisible(page, '#staff-navigation-dropdown'));
      const menuWithinViewport = await page.evaluate<boolean>(
        "(() => { const rect = document.querySelector('#staff-navigation-dropdown').getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth + 1; })()",
      );
      assert.ok(menuWithinViewport, `Dropdown overflows at width ${width}`);
      await page.keyboard.press('Escape');
      assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
      await trigger.click();
      await page.mouse.click(width - 20, 650);
      assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
      await trigger.click();
      await page.locator('#staff-navigation-dropdown a').first().click();
      assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
    } else {
      const desktop = page.locator('#desktop-toggle');
      await desktop.click();
      await page.waitForFunction(
        "document.querySelector('#staff-sidebar').getBoundingClientRect().width > 200",
      );
      await page.mouse.move(width - 40, 350);
      await page.waitForFunction(
        "document.querySelector('#staff-sidebar').getBoundingClientRect().width < 100",
      );
    }

    // 1440 CSS px represents a typical PC at 100% zoom; 1800 CSS px
    // represents the same 1440px device width at 80% browser zoom.
    for (const zoom of [0.8, 1]) {
      await page.evaluate(`document.body.style.zoom = '${zoom}'`);
      const selector = compact ? '#dropdown-toggle' : '#desktop-toggle';
      assert.ok(await isVisible(page, selector), `Navigation missing at ${width}px/${zoom}`);
      await page.evaluate("document.body.style.zoom = '1'");
    }

    console.log(`PASS: navigation at width ${width} (dropdown=${compact})`);
    await page.close();
  }
} finally {
  await browser.close();
}
console.log('PASS: dropdown click, dismissal, responsive width and desktop 100%/80% zoom.');
