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
    console.log('  \u2713', name);
  } catch (error) {
    fail += 1;
    console.error('  \u2717', name, '-', error.message);
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

await test('altı sayfa tasarım sistemi ve tema kontrolü taşıyor', async () => {
  for (const name of PAGES) {
    const html = fs.readFileSync(name, 'utf8');
    assertOk(html.includes('styles/design-system.css'), name + ' tasarım sistemi yok');
    assertOk(html.includes('styles/theme-compat.css'), name + ' uyumluluk CSS yok');
    assertOk(html.includes('core/theme.js'), name + ' tema betiği yok');
    assertOk(html.includes('data-theme-toggle'), name + ' tema kontrolü yok');
    assertOk(html.includes('data-theme="dark"'), name + ' statik tema dark değil');
  }
});

await test('ana sayfa yeni içerik ve hedefleri taşıyor', async () => {
  const html = fs.readFileSync('index.html', 'utf8');
  assertOk(html.includes('ogren-3d.html'), 'öğren CTA yok');
  assertOk(html.includes('robot.html') && html.includes('9&times;9'), 'robot CTA yanlış');
  assertOk(!html.includes('Uyarlanabilir robot'), 'eski robot ifadesi kaldı');
  assertOk(html.includes('Temel seviye 9&times;9 pratik robotu'), 'yeni robot ifadesi yok');
});

await test('saklanan tema sayfalar arasında korunur ve kontrol eşleşir', async () => {
  const browserContext = await context();
  const page = await browserContext.newPage();

  await page.addInitScript(() => {
    if (!localStorage.getItem('antalyago-theme')) {
      localStorage.setItem('antalyago-theme', 'light');
    }
  });
  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await waitForAssets(page);

  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
  await page.locator('[data-theme-toggle]').click();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');

  await page.goto(BASE + '/go-nedir.html', { waitUntil: 'domcontentloaded' });
  await waitForAssets(page);

  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  assert.equal(await page.locator('[data-theme-toggle]').getAttribute('aria-label'), 'G\u00fcnd\u00fcz temas\u0131na ge\u00e7');
  assert.equal(await page.locator('[data-theme-toggle]').getAttribute('aria-pressed'), 'true');

  await browserContext.close();
});

await test('localStorage hatas\u0131nda dark ile a\u00e7\u0131l\u0131r', async () => {
  const browserContext = await context();
  const page = await browserContext.newPage();

  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('blocked');
      }
    });
  });
  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await waitForAssets(page);

  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  await browserContext.close();
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 720 }
]) {
  await test(viewport.width + '×' + viewport.height + ' ana sayfada yatay ta\u015fma yok', async () => {
    const browserContext = await context(viewport);
    const page = await browserContext.newPage();

    await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
    await waitForAssets(page);

    assertOk(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'yatay ta\u015fma');
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
console.log('\nTema/UI do\u011frulamas\u0131: ' + pass + '/' + (pass + fail));
if (fail) {
  process.exit(1);
}

