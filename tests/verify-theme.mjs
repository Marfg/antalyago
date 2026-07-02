import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = path.resolve('.');
const BASE = 'http://antalyago.test';
const PAGES = ['index.html', 'go-nedir.html', 'ogren-3d.html', 'problem.html', 'robot.html', 'oyna.html'];

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

const assertOk = (value, message) => {
  if (!value) {
    throw new Error(message);
  }
};

const browser = await chromium.launch({ headless: true });

async function context(viewport = { width: 1280, height: 720 }) {
  const browserContext = await browser.newContext({ viewport });

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
            : filePath.endsWith('.webp')
              ? 'image/webp'
              : 'text/html';

      await route.fulfill({ body, contentType });
    } catch {
      await route.abort();
    }
  });

  return browserContext;
}

async function waitForAssets(page) {
  await page.waitForFunction(() =>
    Array.from(document.images).every(image => image.complete && image.naturalWidth > 0)
  );

  await page.evaluate(async () => {
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }
  });
}

await test('alt? sayfa tasar?m sistemi ve tema kontrol? ta??yor', async () => {
  for (const name of PAGES) {
    const html = fs.readFileSync(name, 'utf8');
    assertOk(html.includes('styles/design-system.css'), name + ' tasar?m sistemi yok');
    assertOk(html.includes('styles/theme-compat.css'), name + ' uyumluluk CSS yok');
    assertOk(html.includes('core/theme.js'), name + ' tema beti?i yok');
    assertOk(html.includes('data-theme-toggle'), name + ' tema kontrol? yok');
  }
});

await test('ana sayfa yeni i?erik ve hedefleri ta??yor', async () => {
  const html = fs.readFileSync('index.html', 'utf8');
  assertOk(html.includes('ogren-3d.html'), '??ren CTA yok');
  assertOk(html.includes('robot.html') && html.includes('9&times;9'), 'robot CTA yanl??');
  assertOk(!html.includes('Uyarlanabilir robot'), 'eski robot ifadesi kald?');
  assertOk(html.includes('Temel seviye 9&times;9 pratik robotu'), 'yeni robot ifadesi yok');
});

await test('saklanan tema sayfalar aras?nda korunur ve kontrol e?le?ir', async () => {
  const browserContext = await context();
  const page = await browserContext.newPage();

  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await waitForAssets(page);
  await page.locator('[data-theme-toggle]').click();

  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');

  await page.goto(BASE + '/go-nedir.html', { waitUntil: 'domcontentloaded' });
  await waitForAssets(page);

  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  assert.equal(await page.locator('[data-theme-toggle]').getAttribute('aria-label'), 'Gündüz temasına geç');
  assert.equal(await page.locator('[data-theme-toggle]').getAttribute('aria-pressed'), 'true');

  await browserContext.close();
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 720 }
]) {
  await test(viewport.width + '?' + viewport.height + ' ana sayfada yatay ta?ma yok', async () => {
    const browserContext = await context(viewport);
    const page = await browserContext.newPage();

    await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
    await waitForAssets(page);

    assertOk(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'yatay ta?ma');
    await page.locator('h1').waitFor();

    await browserContext.close();
  });
}

for (const theme of ['light', 'dark']) {
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 390, height: 844 }
  ]) {
    const browserContext = await context(viewport);
    const page = await browserContext.newPage();

    await page.addInitScript(value => localStorage.setItem('antalyago-theme', value), theme);
    await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
    await waitForAssets(page);
    await page.screenshot({ path: 'tests/home-' + viewport.width + '-' + theme + '.png' });

    await browserContext.close();
  }
}

await browser.close();
console.log('\nTema/UI do?rulamas?: ' + pass + '/' + (pass + fail));
if (fail) {
  process.exit(1);
}

