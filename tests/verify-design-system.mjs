import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = path.resolve('.');
const BASE = 'http://antalyago.test';
const PAGES = [
  { name: 'problem.html', css: 'styles/problem-page.css' },
  { name: 'robot.html', css: 'styles/robot-page.css' },
  { name: 'oyna.html', css: 'styles/play-page.css' }
];
const BAN = ['rgb(212, 168, 75)', 'rgb(200, 168, 75)', 'rgb(184, 134, 26)', 'rgb(224, 190, 104)'];

function pickChromiumExecutable() {
  const fromEnv = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  return fromEnv && fromEnv.trim() ? fromEnv.trim() : null;
}

async function launchChromium() {
  const executablePath = pickChromiumExecutable();
  return executablePath
    ? chromium.launch({ headless: true, executablePath })
    : chromium.launch({ headless: true });
}

let pass = 0;
let fail = 0;
const test = async (name, fn) => {
  try {
    await fn();
    pass += 1;
    console.log('  ✓', name);
  } catch (error) {
    fail += 1;
    console.error('  ✗', name, '-', error.message);
  }
};

async function context(viewport = { width: 1280, height: 720 }) {
  const browser = await launchChromium();
  const browserContext = await browser.newContext({ viewport });
  const closeContext = browserContext.close.bind(browserContext);
  browserContext.close = async () => {
    await closeContext().catch(() => {});
    await browser.close().catch(() => {});
  };
  await browserContext.route(BASE + '/**', async route => {
    const url = new URL(route.request().url());
    const pathname = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const filePath = path.join(ROOT, pathname);
    try {
      const body = fs.readFileSync(filePath);
      const contentType = filePath.endsWith('.css')
        ? 'text/css'
        : filePath.endsWith('.js')
          ? 'application/javascript'
          : filePath.endsWith('.png')
            ? 'image/png'
            : 'text/html';
      await route.fulfill({ body, contentType });
    } catch {
      await route.abort();
    }
  });
  return browserContext;
}

async function waitForPage(page) {
  await page.waitForFunction(() => Array.from(document.images).every(img => img.complete && img.naturalWidth > 0));
  await page.evaluate(async () => {
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }
  });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForTimeout(250);
}

async function assertCssOrder(page, cssName) {
  const order = await page.evaluate(() => Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(link => link.getAttribute('href') || ''));
  const designIndex = order.indexOf('styles/design-system.css');
  const compatIndex = order.indexOf('styles/theme-compat.css');
  const pageIndex = order.indexOf(cssName);
  assert(designIndex !== -1, `missing design-system.css for ${cssName}`);
  assert(compatIndex !== -1, `missing theme-compat.css for ${cssName}`);
  assert(pageIndex !== -1, `missing ${cssName}`);
  assert(designIndex < compatIndex, `wrong stylesheet order for ${cssName}: design-system should load before theme-compat`);
  assert(compatIndex < pageIndex, `wrong stylesheet order for ${cssName}: page CSS should load last`);
}

async function assertNoStyleTags(page) {
  const count = await page.evaluate(() => document.querySelectorAll('style').length);
  assert.equal(count, 0, 'embedded style tags should be removed');
}

await test('legacy shell pages adopt semantic theme variables', async () => {
  const browserContext = await context();
  const page = await browserContext.newPage();

  await page.addInitScript(() => localStorage.setItem('antalyago-theme', 'dark'));
  await page.goto(BASE + '/problem.html', { waitUntil: 'domcontentloaded' });
  await waitForPage(page);

  const vars = await page.evaluate(() => {
    const styles = getComputedStyle(document.body);
    return {
      gold: styles.getPropertyValue('--gold').trim(),
      primary: styles.getPropertyValue('--primary').trim(),
      border: styles.getPropertyValue('--border').trim(),
      surfaceBorder: styles.getPropertyValue('--surface-border').trim(),
      panel: styles.getPropertyValue('--panel').trim(),
      surfaceRaised: styles.getPropertyValue('--surface-raised').trim(),
      wood: styles.getPropertyValue('--wood').trim(),
      woodBoard: styles.getPropertyValue('--wood-board').trim()
    };
  });

  assert.equal(vars.gold, vars.primary);
  assert.equal(vars.border, vars.surfaceBorder);
  assert.equal(vars.panel, vars.surfaceRaised);
  assert.equal(vars.wood, vars.primary);
  assert.equal(vars.woodBoard, await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--board-surround').trim()));

  await browserContext.close();
});

for (const theme of ['light', 'dark']) {
  await test(`theme toggle works in ${theme} mode`, async () => {
    const browserContext = await context({ width: 1280, height: 720 });
    const page = await browserContext.newPage();
    await page.addInitScript(value => localStorage.setItem('antalyago-theme', value), theme);

    for (const { name, css } of PAGES) {
      await page.goto(BASE + '/' + name, { waitUntil: 'domcontentloaded' });
      await waitForPage(page);
      await assertNoStyleTags(page);
      await assertCssOrder(page, css);

      assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), theme);
      const toggle = page.locator('[data-theme-toggle]');
      await toggle.focus();
      const outline = await toggle.evaluate(node => getComputedStyle(node).outlineWidth);
      assert.notEqual(outline, '0px');

      const bg = await toggle.evaluate(node => getComputedStyle(node).backgroundColor);
      assert(!BAN.includes(bg), `${name} theme toggle still looks gold-ish: ${bg}`);

      await toggle.click();
      const nextTheme = theme === 'dark' ? 'light' : 'dark';
      assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), nextTheme);
      await page.locator('[data-theme-toggle]').click();
      assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), theme);
    }

    await browserContext.close();
  });
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 720 }
]) {
  await test(`${viewport.width}x${viewport.height} horizontal overflow check`, async () => {
    const browserContext = await context(viewport);
    const page = await browserContext.newPage();
    await page.addInitScript(() => localStorage.setItem('antalyago-theme', 'dark'));

    for (const { name, css } of PAGES) {
      await page.goto(BASE + '/' + name, { waitUntil: 'domcontentloaded' });
      await waitForPage(page);
      await assertNoStyleTags(page);
      await assertCssOrder(page, css);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
      assert(overflow, `${name} yatay taşma üretiyor`);
    }

    await browserContext.close();
  });
}

await test('reduced-motion disables transitions', async () => {
  const browser = await launchChromium();
  const browserContext = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce' });
  const closeContext = browserContext.close.bind(browserContext);
  browserContext.close = async () => {
    await closeContext().catch(() => {});
    await browser.close().catch(() => {});
  };
  await browserContext.route(BASE + '/**', async route => {
    const url = new URL(route.request().url());
    const pathname = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const filePath = path.join(ROOT, pathname);
    try {
      const body = fs.readFileSync(filePath);
      const contentType = filePath.endsWith('.css')
        ? 'text/css'
        : filePath.endsWith('.js')
          ? 'application/javascript'
          : 'text/html';
      await route.fulfill({ body, contentType });
    } catch {
      await route.abort();
    }
  });

  const page = await browserContext.newPage();
  await page.addInitScript(() => localStorage.setItem('antalyago-theme', 'dark'));
  await page.goto(BASE + '/robot.html', { waitUntil: 'domcontentloaded' });
  await waitForPage(page);

  const duration = await page.locator('[data-theme-toggle]').evaluate(node => getComputedStyle(node).transitionDuration);
  assert.equal(duration, '0s');

  await browserContext.close();
});

await test('problem help/result states render', async () => {
  const browserContext = await context({ width: 1280, height: 720 });
  const page = await browserContext.newPage();
  await page.addInitScript(() => localStorage.setItem('antalyago-theme', 'dark'));
  await page.goto(BASE + '/problem.html', { waitUntil: 'domcontentloaded' });
  await waitForPage(page);

  await page.evaluate(() => {
    showHint();
    document.getElementById('overlay-correct').classList.add('show');
  });

  await page.locator('#hint-box').waitFor({ state: 'visible' });
  await page.locator('#overlay-correct').waitFor({ state: 'visible' });
  assert(await page.locator('#hint-box').isVisible());
  assert(await page.locator('#overlay-correct').isVisible());

  await browserContext.close();
});

await test('robot thinking/gameover states render', async () => {
  const browserContext = await context({ width: 1280, height: 720 });
  const page = await browserContext.newPage();
  await page.addInitScript(() => localStorage.setItem('antalyago-theme', 'dark'));
  await page.goto(BASE + '/robot.html', { waitUntil: 'domcontentloaded' });
  await waitForPage(page);

  await page.evaluate(() => {
    document.getElementById('think-bar').classList.add('show');
    const modal = document.getElementById('gameover');
    modal.classList.add('show');
    document.getElementById('go-winner').textContent = 'Oyun Bitti';
    document.getElementById('go-score').textContent = 'Siyah kazandı';
    document.getElementById('go-komi').textContent = 'Komi: 6.5';
    document.getElementById('go-territory').textContent = 'Diyalog ve sonuç alanı görünür';
  });

  await page.locator('#think-bar').waitFor({ state: 'visible' });
  await page.locator('#gameover').waitFor({ state: 'visible' });
  assert(await page.locator('#think-bar').isVisible());
  assert(await page.locator('#gameover').isVisible());

  await browserContext.close();
});

await test('play lobby/modal states render', async () => {
  const browserContext = await context({ width: 1280, height: 720 });
  const page = await browserContext.newPage();
  await page.addInitScript(() => localStorage.setItem('antalyago-theme', 'dark'));
  await page.goto(BASE + '/oyna.html', { waitUntil: 'domcontentloaded' });
  await waitForPage(page);

  await page.evaluate(() => {
    document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active'));
    document.getElementById('screen-lobby').classList.add('active');
    const modal = document.getElementById('modal-newroom');
    modal.classList.add('show');
    document.getElementById('room-name-input').value = 'Test Odası';
  });

  await page.locator('#screen-lobby').waitFor({ state: 'visible' });
  await page.locator('#modal-newroom.show').waitFor({ state: 'visible' });
  assert(await page.locator('#screen-lobby').isVisible());
  assert(await page.locator('#modal-newroom.show').isVisible());

  await browserContext.close();
});

for (const { name } of PAGES) {
  for (const theme of ['light', 'dark']) {
    await test(`${name} ${theme} screenshot`, async () => {
      const browserContext = await context({ width: 1280, height: 720 });
      const page = await browserContext.newPage();
      await page.addInitScript(value => localStorage.setItem('antalyago-theme', value), theme);
      await page.goto(BASE + '/' + name, { waitUntil: 'domcontentloaded' });
      await waitForPage(page);
      await page.screenshot({ path: `tests/design-system-${name.replace('.html', '')}-1280-${theme}.png` });
      await browserContext.close();
    });
  }
}

console.log(`Tasarım sistemi doğrulaması: ${pass}/${pass + fail}`);
if (fail) {
  process.exit(1);
}
