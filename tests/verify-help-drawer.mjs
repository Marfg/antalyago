/**
 * tests/verify-help-drawer.mjs
 * node tests/verify-help-drawer.mjs
 *
 * Merdiven, Ağ ve Snapback derslerinin alt çubuğu (scenes/lessonHelpDrawer.js):
 * yardımcı düğmeler kapalı bir "Yardım" panelinde durur; panel açılır, aç/kapa
 * düğmelerinde açık kalır, ipucu ve yeni denemede kapanır, Escape ve dışarı
 * dokunuşla kapanır. Panel anlatım alanının içinde kırpılmadan görünür, telefonda
 * çubuk tek satırdır. Hız için 2D yedek tahta kullanılır (çekmece tahtadan bağımsız).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = path.resolve('.');
const BASE = 'http://antalyago.test';
const TYPES = { '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

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
    await Promise.all(contexts.splice(0).map(c => c.close().catch(() => {})));
  }
};

const browser = await chromium.launch({ headless: true });
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };

async function open(scene, options = { viewport: { width: 1280, height: 800 } }) {
  const context = await browser.newContext(options);
  contexts.push(context);
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
  await page.goto(`${BASE}/learning-scenes.html?scene=${scene}&welcome=0&tahta=2d&exposeBoardAdapter=1`, { waitUntil: 'load' });
  await page.locator('.lb-help-toggle').waitFor({ timeout: 30000 });
  return { page, errors };
}

const panelOpen = page => page.locator('.lb-panel').isVisible();
const libertyCount = page => page.evaluate(() => window.__lsTestBoardAdapter.getLibertyPoints().length);

await test('yardımcı düğmeler kapalı panelde; Önceki adım, Yardım ve Devam çubukta', async () => {
  const { page, errors } = await open('scene-15-snapback');
  assert.equal(await panelOpen(page), false);
  for (const id of ['libs', 'hint', 'reset']) assert.equal(await page.locator('#' + id).isVisible(), false, id + ' gizli olmalı');
  assert.equal(await page.locator('.lb-help-toggle').getAttribute('aria-expanded'), 'false');
  assert.equal(await page.getByRole('button', { name: 'Önceki adım' }).count(), 1);
  assert.ok(await page.locator('#next').isVisible());
  assert.deepEqual(errors, []);
});

await test('aç/kapa düğmesi paneli açık bırakır, ipucu ve yeni deneme kapatır', async () => {
  const { page, errors } = await open('scene-15-snapback');
  await page.locator('.lb-help-toggle').click();
  assert.equal(await page.locator('.lb-help-toggle').getAttribute('aria-expanded'), 'true');
  await page.locator('#libs').click();
  assert.equal(await page.locator('#libs').getAttribute('aria-pressed'), 'true');
  assert.equal(await panelOpen(page), true, 'nefesler açılınca panel açık kalmalı');
  await page.locator('#libs').click();
  await page.locator('#hint').click();
  assert.equal(await panelOpen(page), false, 'ipucundan sonra panel kapanmalı');
  assert.ok(await libertyCount(page) > 0, 'ipucu noktası tahtada işaretlenmeli');
  await page.locator('.lb-help-toggle').click();
  await page.locator('#reset').click();
  assert.equal(await panelOpen(page), false, 'yeni denemeden sonra panel kapanmalı');
  assert.equal(await libertyCount(page), 0, 'yeni deneme işaretleri temizlemeli');
  assert.deepEqual(errors, []);
});

await test('Escape ve panel dışına dokunuş paneli kapatır', async () => {
  const { page, errors } = await open('scene-14-net');
  await page.locator('.lb-help-toggle').click();
  await page.keyboard.press('Escape');
  assert.equal(await panelOpen(page), false);
  assert.ok(await page.locator('.lb-help-toggle').evaluate(el => el === document.activeElement), 'odak Yardım düğmesine dönmeli');
  await page.locator('.lb-help-toggle').click();
  await page.locator('#story').click();
  assert.equal(await panelOpen(page), false);
  assert.deepEqual(errors, []);
});

await test('Merdiven: rota anahtarı panelde çalışır, açık yardım çubukta işaretlenir', async () => {
  const { page, errors } = await open('scene-13-ladder');
  await page.locator('.lb-help-toggle').click();
  await page.locator('#route').click();
  assert.equal(await page.locator('#route').getAttribute('aria-pressed'), 'true');
  assert.equal(await panelOpen(page), true);
  await page.keyboard.press('Escape');
  const dot = await page.locator('.lb-help-toggle').evaluate(el => getComputedStyle(el, '::after').content);
  assert.notEqual(dot, 'none', 'panel kapalıyken açık yardım göstergesi görünmeli');
  assert.deepEqual(errors, []);
});

for (const [label, options] of [['masaüstü', { viewport: { width: 1280, height: 800 } }], ['390px telefon', PHONE]]) {
  await test(`${label}: panel anlatım alanında kırpılmaz, çubuk tek satır ve taşma yok`, async () => {
    for (const scene of ['scene-13-ladder', 'scene-14-net', 'scene-15-snapback']) {
      const { page, errors } = await open(scene, options);
      await page.locator('.lb-help-toggle').click();
      const m = await page.evaluate(() => {
        const r = el => el.getBoundingClientRect();
        const narration = r(document.getElementById('ls-narration')), panel = r(document.querySelector('.lb-panel'));
        const bar = document.querySelector('.lb-bar'), tops = [...bar.children].map(c => Math.round(r(c).top + r(c).height / 2));
        const targets = [...bar.querySelectorAll('button')].filter(b => b.offsetParent).map(b => Math.round(r(b).height));
        return { inside: panel.top >= narration.top && panel.bottom <= narration.bottom, oneRow: Math.max(...tops) - Math.min(...tops) <= 4, small: Math.min(...targets), overflow: document.documentElement.scrollWidth > innerWidth, barBottom: r(bar).bottom, vh: innerHeight };
      });
      assert.ok(m.inside, `${scene}: panel anlatım alanının içinde olmalı`);
      assert.ok(m.oneRow, `${scene}: çubuk tek satır olmalı`);
      assert.ok(m.small >= 44, `${scene}: dokunma hedefi en az 44 px (${m.small})`);
      assert.ok(!m.overflow, `${scene}: yatay taşma`);
      assert.ok(m.barBottom <= m.vh, `${scene}: çubuk ekranda görünmeli`);
      assert.deepEqual(errors, []);
    }
  });
}

await browser.close();
console.log('\nYardım çekmecesi: ' + pass + '/' + (pass + fail));
if (fail) {
  process.exit(1);
}
