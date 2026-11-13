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
const widths = [320, 375, 768, 1024, 1279, 1280, 1366, 1440, 1920, 2560];
const browser = await chromium.launch({ headless: true });

type Metrics = {
  visible: boolean;
  hitTest: boolean;
  top: number;
  left: number;
  right: number;
  width: number;
  labelVisible: boolean;
  navIconVisible: boolean;
  sidebarWidth: number;
  documentWidth: number;
  viewportWidth: number;
  inputHeight: number;
  actionHeight: number;
  headerPosition: string;
  headerBottom: number;
  mainTop: number;
};

function markup() {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body>
<div class="admin-shell admin-shell-collapsed min-h-screen">
  <button id="menu-toggle" type="button" class="admin-navigation-trigger focus-ring" aria-label="Open navigation" aria-expanded="false" aria-controls="staff-sidebar">
    <svg width="21" height="21" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
  </button>
  <aside id="staff-sidebar" class="admin-sidebar fixed inset-y-0 left-0 z-30 flex flex-col overflow-hidden admin-sidebar-is-collapsed">
    <div class="admin-brand flex h-[5.25rem] shrink-0 items-center px-3">
      <a href="#overview" class="admin-brand-link flex min-w-0 items-center gap-3 px-2">RFP CONTROL</a>
    </div>
    <nav id="staff-navigation" class="admin-sidebar-navigation min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-3 pb-3 pt-4" aria-label="Staff navigation">
      <div class="mb-5">
        <p class="admin-nav-label">Workspace</p>
        <a href="#overview" class="admin-sidebar-link admin-sidebar-link-active">
          <span class="admin-nav-icon"><svg width="18" height="18" aria-hidden="true"><circle cx="9" cy="9" r="7" fill="currentColor"/></svg></span>
          <span data-nav-label="true" class="min-w-0"><strong>Overview</strong><small>Monitoring home</small></span>
        </a>
        <a href="#approvals" class="admin-sidebar-link">
          <span class="admin-nav-icon"><svg width="18" height="18" aria-hidden="true"><rect x="1" y="1" width="16" height="16" fill="currentColor"/></svg></span>
          <span class="min-w-0"><strong>Approval queue</strong><small>Finance</small></span>
        </a>
      </div>
    </nav>
    <div class="admin-sidebar-footer shrink-0 p-3">
      <a href="#manual" class="admin-sidebar-link w-full">
        <span class="admin-nav-icon"><svg width="18" height="18" aria-hidden="true"><rect x="2" y="1" width="14" height="16" fill="currentColor"/></svg></span>
        <span class="min-w-0"><strong>User Manual</strong><small>Help</small></span>
      </a>
    </div>
  </aside>
  <div class="admin-content transition-all">
    <header class="admin-topbar flex min-h-[5.25rem] items-center gap-3 px-4 sm:gap-4 lg:px-6">
      <h1 class="min-w-0 flex-1">Overview</h1>
      <button type="button" class="admin-account-trigger">Account</button>
    </header>
    <main id="main-content" class="page-enter mx-auto w-full max-w-[100rem] p-4 sm:p-6 lg:p-8">
      <section class="card p-5"><button type="button" class="btn btn-secondary">Refresh</button><input class="input" value="Example" aria-label="Example input"></section>
      <div style="min-height:1800px">Dashboard scrolling area</div>
    </main>
  </div>
</div>
<script>
  (() => {
    const button = document.getElementById('menu-toggle');
    const sidebar = document.getElementById('staff-sidebar');
    const shell = document.querySelector('.admin-shell');
    const isDesktop = () => matchMedia('(min-width: 1280px)').matches;
    let collapsed = true;
    let opened = false;
    const setOpen = (value) => {
      opened = value;
      sidebar.classList.toggle('admin-sidebar-open', value);
      button.classList.toggle('admin-navigation-trigger-open', value);
    };
    sidebar.addEventListener('mouseenter', () => {
      if (isDesktop() && collapsed) sidebar.classList.add('admin-sidebar-is-peeked');
    });
    sidebar.addEventListener('mouseleave', () => sidebar.classList.remove('admin-sidebar-is-peeked'));
    button.addEventListener('click', () => {
      if (isDesktop()) {
        collapsed = !collapsed;
        sidebar.classList.toggle('admin-sidebar-is-collapsed', collapsed);
        sidebar.classList.remove('admin-sidebar-is-peeked');
        shell.classList.toggle('admin-shell-collapsed', collapsed);
      } else setOpen(!opened);
      button.setAttribute('aria-expanded', String(isDesktop() ? !collapsed : opened));
    });
  })();
</script>
</body>
</html>`;
}

async function inspect(page: import('@playwright/test').Page): Promise<Metrics> {
  // The server-side verification tsconfig intentionally excludes DOM types.
  // Evaluate a browser-owned string, as the project's other Playwright scripts do.
  return page.evaluate<Metrics>(`(() => {
    const button = document.querySelector('#menu-toggle');
    const navLabel = document.querySelector('[data-nav-label]');
    const navIcon = document.querySelector('.admin-nav-icon');
    const sidebar = document.querySelector('#staff-sidebar');
    const input = document.querySelector('.input');
    const action = document.querySelector('.btn');
    const header = document.querySelector('.admin-topbar');
    const main = document.querySelector('#main-content');
    const rect = button.getBoundingClientRect();
    const style = getComputedStyle(button);
    const center = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    const labelStyle = getComputedStyle(navLabel);
    const iconStyle = getComputedStyle(navIcon);
    const asideRect = sidebar.getBoundingClientRect();
    const navIconRect = navIcon.getBoundingClientRect();
    return {
      visible: style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0.9 &&
        rect.width > 35 && rect.height > 35 && rect.left >= 0 && rect.right <= innerWidth &&
        rect.top >= 0 && rect.bottom <= innerHeight,
      hitTest: Boolean(center?.closest('#menu-toggle')),
      top: rect.top,
      left: rect.left,
      right: rect.right,
      width: rect.width,
      labelVisible: labelStyle.display !== 'none' && labelStyle.visibility !== 'hidden',
      navIconVisible: iconStyle.display !== 'none' && iconStyle.visibility !== 'hidden' &&
        navIconRect.right > 0 && navIconRect.left < innerWidth &&
        asideRect.left >= -1,
      sidebarWidth: asideRect.width,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
      inputHeight: input.getBoundingClientRect().height,
      actionHeight: action.getBoundingClientRect().height,
      headerPosition: getComputedStyle(header).position,
      headerBottom: header.getBoundingClientRect().bottom,
      mainTop: main.getBoundingClientRect().top,
    };
  })()`);
}
try {
  for (const width of widths) {
    const page = await browser.newPage({ viewport: { width, height: 850 } });
    await page.setContent(markup());
    await page.addStyleTag({ content: stylesheet });
    const collapsed = await inspect(page);
    assert.ok(
      collapsed.visible,
      `Burger is not visible at CSS width ${width}: ${JSON.stringify(collapsed)}`,
    );
    assert.ok(collapsed.hitTest, `Burger is blocked by another element at width ${width}`);
    assert.equal(
      collapsed.headerPosition,
      'relative',
      `Dashboard header must not stick over charts at width ${width}`,
    );
    assert.ok(
      collapsed.mainTop >= collapsed.headerBottom - 1,
      `Dashboard header overlaps content at width ${width}: ${JSON.stringify(collapsed)}`,
    );
    assert.ok(
      collapsed.documentWidth <= collapsed.viewportWidth + 2,
      `Horizontal overflow at width ${width}: ${JSON.stringify(collapsed)}`,
    );

    await page.evaluate('window.scrollTo(0, 520)');
    const scrolled = await inspect(page);
    assert.ok(
      scrolled.visible && scrolled.hitTest,
      `Burger disappears when scrolled at width ${width}: ${JSON.stringify(scrolled)}`,
    );
    await page.evaluate('window.scrollTo(0, 0)');

    if (width >= 1280) {
      assert.ok(
        collapsed.navIconVisible,
        `Compact sidebar icons are not available at width ${width}`,
      );
      assert.ok(!collapsed.labelVisible, `Compact sidebar shows crowded labels at width ${width}`);
      await page.locator('#staff-sidebar').hover({ position: { x: 40, y: 180 } });
      await page.waitForFunction(
        "document.querySelector('#staff-sidebar').getBoundingClientRect().width > 200",
      );
      const hovered = await inspect(page);
      assert.ok(
        hovered.sidebarWidth > 200 && hovered.labelVisible,
        `Hover did not expose navigation at width ${width}: ${JSON.stringify(hovered)}`,
      );
      await page.mouse.move(Math.min(width - 20, 700), 350);
      await page.getByRole('button', { name: 'Open navigation' }).click();
      await page.waitForFunction(
        "document.querySelector('#staff-sidebar').getBoundingClientRect().width > 200",
      );
      const pinned = await inspect(page);
      assert.ok(
        pinned.sidebarWidth > 200 && pinned.labelVisible,
        `Click did not pin sidebar at width ${width}: ${JSON.stringify(pinned)}`,
      );
    } else {
      await page.getByRole('button', { name: 'Open navigation' }).click();
      await page.waitForFunction(
        "document.querySelector('#staff-sidebar').getBoundingClientRect().left >= -1",
      );
      const opened = await inspect(page);
      assert.ok(
        opened.navIconVisible && opened.labelVisible,
        `Mobile/tablet drawer not visible at width ${width}: ${JSON.stringify(opened)}`,
      );
      const aside = page.locator('#staff-sidebar');
      const box = await aside.boundingBox();
      assert.ok(
        box && box.x >= -1 && box.x < width,
        `Drawer is outside viewport at width ${width}`,
      );
    }

    const zoomTest = await browser.newPage({ viewport: { width, height: 850 } });
    await zoomTest.setContent(markup());
    await zoomTest.addStyleTag({ content: stylesheet });
    await zoomTest.evaluate("document.body.style.zoom = '1.5'");
    const zoomed = await inspect(zoomTest);
    assert.ok(
      zoomed.visible && zoomed.hitTest,
      `Burger is missing after 150% visual zoom at width ${width}: ${JSON.stringify(zoomed)}`,
    );
    console.log(
      JSON.stringify({
        cssWidth: width,
        collapsed,
        zoomed: { visible: zoomed.visible, hitTest: zoomed.hitTest },
      }),
    );
    await page.close();
    await zoomTest.close();
  }
} finally {
  await browser.close();
}
console.log(
  'PASS: navigation icon, hover choices, click/pin, scroll and 150% zoom at all tested widths.',
);
