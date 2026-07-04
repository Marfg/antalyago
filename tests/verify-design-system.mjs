import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = path.resolve('.');
const BASE = 'http://antalyago.test';
const PAGES = ['problem.html', 'robot.html', 'oyna.html'];
const BAN = ['rgb(212, 168, 75)', 'rgb(200, 168, 75)', 'rgb(184, 134, 26)', 'rgb(224, 190, 104)'];


function pickChromiumExecutable() {
  const fromEnv = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  return null;
}


function pickInstalledBrowser() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
  ];
  return candidates.find(candidate => fs.existsSync(candidate)) || null;
}

async function launchChromium() {
  const executablePath = pickChromiumExecutable();
  const launchOptions = { headless: true };
  if (executablePath) {
    return chromium.launch({ ...launchOptions, executablePath });
  }
  try {
    return await chromium.launch(launchOptions);
  } catch (error) {
    const message = String(error?.message || error);
    if (/EPERM|EACCES|spawn/i.test(message)) {
      try {
        return await chromium.launch({ ...launchOptions, channel: 'chrome' });
      } catch {}
      const installed = pickInstalledBrowser();
      if (installed) {
        return await chromium.launch({ ...launchOptions, executablePath: installed });
      }
    }
    throw error;
  }
}

let pass = 0;
let fail = 0;
const test = async (name, fn) => {
  try {
    await fn();
    pass += 1;
    console.log('  ?', name);
  } catch (error) {
    fail += 1;
    console.error('  ?', name, '-', error.message);
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
      wood: styles.getPropertyValue('--wood').trim()
    };
  });

  assert.equal(vars.gold, vars.primary);
  assert.equal(vars.border, vars.surfaceBorder);
  assert.equal(vars.panel, vars.surfaceRaised);
  assert.equal(vars.wood, vars.primary);

  await browserContext.close();
});

for (const theme of ['light', 'dark']) {
  await test(`tema d??mesi ${theme} g?r?n?m?nde ?al???r`, async () => {
    const browserContext = await context({ width: 1280, height: 720 });
    const page = await browserContext.newPage();
    await page.addInitScript(value => localStorage.setItem('antalyago-theme', value), theme);

    for (const name of PAGES) {
      await page.goto(BASE + '/' + name, { waitUntil: 'domcontentloaded' });
      await waitForPage(page);

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
  await test(`${viewport.width}?${viewport.height} yatay ta?ma yok`, async () => {
    const browserContext = await context(viewport);
    const page = await browserContext.newPage();
    await page.addInitScript(() => localStorage.setItem('antalyago-theme', 'dark'));

    for (const name of PAGES) {
      await page.goto(BASE + '/' + name, { waitUntil: 'domcontentloaded' });
      await waitForPage(page);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
      assert(overflow, `${name} yatay ta?ma ?retiyor`);
    }

    await browserContext.close();
  });
}

await test('reduced-motion durumda ge?i?ler kapan?r', async () => {
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

for (const name of PAGES) {
  for (const theme of ['light', 'dark']) {
    await test(`${name} ${theme} ekran g?r?nt?s?`, async () => {
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

console.log(`
Tasar?m sistemi do?rulamas?: ${pass}/${pass + fail}`);
if (fail) {
  process.exit(1);
}
