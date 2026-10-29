/**
 * tests/verify-home-hero.mjs
 * node tests/verify-home-hero.mjs
 *
 * Ana sayfa açılış sahnesi (home/heroBoard.js): posterdeki atari anından
 * başlayan mini ders, dersin baştan izlenmesi, serbest oyunda beyazın cevabı,
 * kaydırmayla kameranın yükselmesi, telefonda taşma olmaması ve "hareketi
 * azalt" açıkken Three.js'in hiç yüklenmeyip posterin kalması.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = path.resolve('.');
const BASE = 'http://antalyago.test';
const TYPES = {
  '.css': 'text/css', '.js': 'application/javascript', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.json': 'application/json', '.glb': 'model/gltf-binary',
};

let pass = 0;
let fail = 0;
const contexts = [];
const test = async (name, fn) => {
  try {
    await fn();
    pass += 1;
    console.log('  ✓', name);
  } catch (error) {
    fail += 1;
    console.error('  ✗', name, '-', error.message);
  } finally {
    // Başarısız bir test sahneyi açık bırakıp sonrakileri yavaşlatmasın.
    await Promise.all(contexts.splice(0).map(c => c.close().catch(() => {})));
  }
};

// WebGL'i başsız tarayıcıda yazılımla çizdir.
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function open(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...options });
  contexts.push(context);
  const requests = [];
  await context.route(BASE + '/**', async route => {
    const filePath = path.join(ROOT, decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\/+/, ''));
    requests.push(path.relative(ROOT, filePath).replace(/\\/g, '/'));
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
  return { context, page, errors, requests };
}

const heroData = (page, name) => page.locator('[data-hero-board]').getAttribute('data-hero-' + name);
const caption = page => page.locator('[data-hero-caption]').textContent();
// Yazılımla çizimde rAF yavaşlayabilir; koşullar zamanlayıcıyla yoklanır.
const ready = page => page.waitForFunction(() => !document.querySelector('[data-hero-step]').disabled, null, { timeout: 15000, polling: 200 });
const until = (page, name, value) => page.waitForFunction(
  ([n, v]) => document.querySelector('[data-hero-board]').dataset[n] === v, [name, value], { timeout: 15000, polling: 200 });
const live = page => page.waitForSelector('[data-hero-board].is-live', { timeout: 30000 });
const scrollSpan = page => page.evaluate(() => document.querySelector('[data-hero-board]').offsetHeight - document.querySelector('.hero-pin').offsetHeight);

const ATARI = 'Beyaz üç nefesi kapattı. Tek nefes kaldı; buna atari denir.';
const CAPTURED = 'Nefesi kalmayan taş tahtadan alınır. Go\'nun ilk kuralı bu.';
const FIRST = 'Bir taşla başlayalım. Taşı tahtaya bırak.';

await test('açılış posterdeki atari anıyla başlar; son nefes kapanınca taş alınır', async () => {
  const { context, page, errors } = await open();
  await live(page);
  assert.equal(await heroData(page, 'phase'), '2');
  assert.equal(await heroData(page, 'stones'), '6', 'atari dizilimi ve iki uzak taş');
  assert.equal(await caption(page), ATARI);
  assert.equal(await page.locator('[data-hero-step]').textContent(), 'Son nefesi kapat');

  await page.locator('[data-hero-step]').click();
  await until(page, 'heroPhase', '3');
  await ready(page);
  assert.equal(await caption(page), CAPTURED);
  assert.equal(await heroData(page, 'stones'), '6', 'beyaz konar, siyah alınır');
  assert.equal(await page.locator('[data-hero-step]').textContent(), 'Şimdi sen oyna');
  assert.equal(await page.locator('[data-hero-alt]').textContent(), 'Mini dersi baştan izle');
  assert.ok(await page.locator('[data-hero-board]').evaluate(el => el.classList.contains('is-moving')), 'kamera hareket etmeli');
  assert.deepEqual(errors, []);
  await context.close();
});

await test('mini ders baştan dört adımda ilerler, sonra serbest oyuna açılır', async () => {
  const { context, page, errors } = await open();
  await live(page);
  await page.locator('[data-hero-step]').click();
  await until(page, 'heroPhase', '3');
  await ready(page);
  await page.locator('[data-hero-alt]').click();
  await until(page, 'heroPhase', '0');
  await ready(page);
  assert.equal(await caption(page), FIRST);
  assert.equal(await heroData(page, 'stones'), '0');

  const expected = ['Bu taşın 4 nefesi var: hemen yanındaki boş noktalar.', ATARI, CAPTURED];
  for (let i = 0; i < expected.length; i++) {
    await page.locator('[data-hero-step]').click();
    await until(page, 'heroPhase', String(i + 1));
    await ready(page);
    assert.equal(await caption(page), expected[i]);
  }
  await page.locator('[data-hero-step]').click();
  await until(page, 'heroMode', 'free');
  await ready(page);
  assert.equal(await page.locator('[data-hero-step]').textContent(), 'Tahtayı temizle');
  assert.deepEqual(errors, []);
  await context.close();
});

await test('serbest oyunda konan siyah taşa beyaz cevap verir', async () => {
  const { context, page, errors } = await open();
  await live(page);
  await page.locator('[data-hero-alt]').click();
  await until(page, 'heroMode', 'free');
  await ready(page);
  assert.equal(await heroData(page, 'stones'), '0');

  const point = await page.locator('[data-hero-board]').evaluate(el => el.heroPointFor(4, 4));
  await page.mouse.click(point.x, point.y);
  await until(page, 'heroStones', '2');
  await ready(page);
  assert.match(await caption(page), /Sıra sende\./);

  await page.locator('[data-hero-alt]').click();
  await until(page, 'heroPhase', '0');
  await ready(page);
  assert.equal(await caption(page), FIRST);
  assert.deepEqual(errors, []);
  await context.close();
});

await test('kaydırınca kamera yükselir, sonra sayfa akmaya devam eder', async () => {
  const { context, page, errors } = await open();
  await live(page);
  assert.equal(await heroData(page, 'progress'), '0.00');
  const span = await scrollSpan(page);
  assert.ok(span > 300, 'açılış kaydırma payı olmalı');
  await page.evaluate(y => scrollTo(0, y), span);
  await until(page, 'heroProgress', '1.00');
  assert.ok(await page.locator('[data-hero-board]').evaluate(el => el.classList.contains('is-moving')));
  await page.evaluate(y => scrollTo({ top: y, behavior: 'instant' }), span + 400);
  await page.waitForFunction(() => document.querySelector('.hero-pin').getBoundingClientRect().top < 0, null, { timeout: 5000 })
    .catch(() => { throw new Error('sabitleme bitince açılış yukarı kaymalı'); });
  assert.deepEqual(errors, []);
  await context.close();
});

await test('390px telefonda telefon posteri ve hafif GLB seçilir, yatay taşma olmaz', async () => {
  const { context, page, errors, requests } = await open({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await live(page);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'yatay taşma');
  assert.match(await page.locator('.hero-poster img').evaluate(img => img.currentSrc), /poster-telefon\.webp$/);
  assert.ok(requests.includes('assets/hero/goban-hafif.glb'), 'telefonda hafif GLB yüklenmeli');
  assert.ok(!requests.includes('assets/hero/goban.glb'));
  await page.evaluate(y => scrollTo(0, y), await scrollSpan(page));
  await until(page, 'heroProgress', '1.00');
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.hero-panel')).opacity === '1');
  const step = await page.locator('[data-hero-step]').boundingBox();
  assert.ok(step.width < 300, 'panel düğmesi tam genişliğe yayılmamalı');
  assert.deepEqual(errors, []);
  await context.close();
});

await test('"hareketi azalt" açıkken Three.js yüklenmez, poster kalır, açılış sabitlenmez', async () => {
  const { context, page, errors, requests } = await open({ reducedMotion: 'reduce' });
  await page.waitForTimeout(2000);
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('hero-3d')), false);
  assert.ok(!requests.some(r => r.includes('three-r169') || r.endsWith('.glb')), '3D dosyası istenmemeli');
  assert.ok(await page.locator('.hero-panel').isHidden(), 'panel gizli kalmalı');
  assert.ok(await page.locator('.hero-poster img').isVisible(), 'poster görünmeli');
  const span = await scrollSpan(page);
  assert.equal(span, 0, 'kaydırma payı olmamalı');
  assert.deepEqual(errors, []);
  await context.close();
});

await browser.close();
console.log('\nAna sayfa açılış sahnesi: ' + pass + '/' + (pass + fail));
if (fail) {
  process.exit(1);
}
