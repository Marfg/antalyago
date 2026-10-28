/**
 * tests/verify-home-hero.mjs
 * node tests/verify-home-hero.mjs
 *
 * Ana sayfa 3D açılış tahtası (home/heroBoard.js): mini ders adımları,
 * serbest oyunda beyazın cevabı, telefonda taşma olmaması ve "hareketi
 * azalt" açıkken Three.js'in hiç yüklenmeyip sabit görselin kalması.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = path.resolve('.');
const BASE = 'http://antalyago.test';
const TYPES = { '.css': 'text/css', '.js': 'application/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' };

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

// WebGL'i başsız tarayıcıda yazılımla çizdir.
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function open(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...options });
  await context.route(BASE + '/**', async route => {
    const filePath = path.join(ROOT, decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\/+/, ''));
    try {
      await route.fulfill({ body: fs.readFileSync(filePath), contentType: TYPES[path.extname(filePath)] || 'text/html' });
    } catch {
      await route.abort();
    }
  });
  await context.route('https://fonts.**', route => route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(BASE + '/index.html', { waitUntil: 'load' });
  return { context, page, errors };
}

const heroData = (page, name) => page.locator('[data-hero-board]').getAttribute('data-hero-' + name);
const caption = page => page.locator('[data-hero-caption]').textContent();
const ready = page => page.waitForFunction(() => !document.querySelector('[data-hero-step]').disabled, null, { timeout: 15000 });

await test('mini ders dört adımda taşı aldırır, sonra serbest oyuna açılır', async () => {
  const { context, page, errors } = await open();
  await page.waitForSelector('[data-hero-board].is-live', { timeout: 20000 });
  assert.equal(await caption(page), 'Bir taşla başlayalım. Taşı tahtaya bırak.');
  assert.equal(await page.locator('[data-hero-step]').textContent(), 'Taşı bırak');

  const expected = [
    'Bu taşın 4 nefesi var: hemen yanındaki boş noktalar.',
    'Beyaz üç nefesi kapattı. Tek nefes kaldı; buna atari denir.',
    'Nefesi kalmayan taş tahtadan alınır. Go\'nun ilk kuralı bu.',
  ];
  for (let i = 0; i < expected.length; i++) {
    await page.locator('[data-hero-step]').click();
    await page.waitForFunction(phase => document.querySelector('[data-hero-board]').dataset.heroPhase === phase, String(i + 1), { timeout: 15000 });
    await ready(page);
    assert.equal(await caption(page), expected[i]);
  }
  assert.equal(await page.locator('[data-hero-step]').textContent(), 'Şimdi sen oyna');
  assert.ok(await page.locator('[data-hero-alt]').isHidden(), 'son adımda "Serbest oyna" gizlenmeli');

  await page.locator('[data-hero-step]').click();
  await page.waitForFunction(() => document.querySelector('[data-hero-board]').dataset.heroMode === 'free', null, { timeout: 15000 });
  await ready(page);
  assert.equal(await page.locator('[data-hero-step]').textContent(), 'Tahtayı temizle');
  assert.deepEqual(errors, []);
  await context.close();
});

await test('serbest oyunda konan siyah taşa beyaz cevap verir', async () => {
  const { context, page, errors } = await open();
  await page.waitForSelector('[data-hero-board].is-live', { timeout: 20000 });
  await ready(page);
  await page.locator('[data-hero-alt]').click();
  await page.waitForFunction(() => document.querySelector('[data-hero-board]').dataset.heroMode === 'free', null, { timeout: 15000 });
  await ready(page);
  assert.equal(await heroData(page, 'stones'), '0');

  const box = await page.locator('.hero-stage canvas').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForFunction(() => document.querySelector('[data-hero-board]').dataset.heroStones === '2', null, { timeout: 15000 });
  await ready(page);
  assert.match(await caption(page), /Sıra sende\./);

  await page.locator('[data-hero-alt]').click();
  await page.waitForFunction(() => document.querySelector('[data-hero-board]').dataset.heroMode === 'lesson', null, { timeout: 15000 });
  await ready(page);
  assert.equal(await caption(page), 'Bir taşla başlayalım. Taşı tahtaya bırak.');
  assert.deepEqual(errors, []);
  await context.close();
});

await test('390px telefonda tahta canlanır ve yatay taşma olmaz', async () => {
  const { context, page, errors } = await open({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await page.waitForSelector('[data-hero-board].is-live', { timeout: 20000 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'yatay taşma');
  const step = await page.locator('[data-hero-step]').boundingBox();
  assert.ok(step.width < 300, 'panel düğmesi tam genişliğe yayılmamalı');
  assert.deepEqual(errors, []);
  await context.close();
});

await test('"hareketi azalt" açıkken Three.js yüklenmez, sabit görsel kalır', async () => {
  const { context, page, errors } = await open({ reducedMotion: 'reduce' });
  await page.waitForTimeout(2000);
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('hero-3d')), false);
  assert.equal(await page.evaluate(() => Boolean(window.THREE)), false);
  assert.ok(await page.locator('.hero-panel').isHidden(), 'panel gizli kalmalı');
  assert.ok(await page.locator('.hero-visual img').isVisible(), 'görsel görünmeli');
  assert.deepEqual(errors, []);
  await context.close();
});

await browser.close();
console.log('\nAna sayfa açılış tahtası: ' + pass + '/' + (pass + fail));
if (fail) {
  process.exit(1);
}
