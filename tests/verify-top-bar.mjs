/**
 * tests/verify-top-bar.mjs
 * node tests/verify-top-bar.mjs
 *
 * Ders sahnelerinin üst çubuğu ve adım noktaları (learning-scenes.html,
 * styles/learning-scenes.css, styles/lesson-help-drawer.css): "Konular"
 * düğmesi tamamlanan konu sayısını gösterir ve bir konu bitince hemen
 * güncellenir; ses düğmesi ikonludur, durumu aria-pressed ile bildirir ve
 * tercih saklanır. Üst çubuktaki ve Merdiven/Ağ/Snapback adım noktalarındaki
 * dokunma hedefleri en az 44 px yüksektir. Hız için 2D yedek tahta kullanılır.
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
const DESKTOP = { viewport: { width: 1280, height: 800 } };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };
const SMALL = { viewport: { width: 320, height: 640 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };

async function context(options = DESKTOP, progress = null) {
  const ctx = await browser.newContext(options);
  contexts.push(ctx);
  await ctx.route(BASE + '/**', async route => {
    const filePath = path.join(ROOT, decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\/+/, ''));
    try {
      await route.fulfill({ body: fs.readFileSync(filePath), contentType: TYPES[path.extname(filePath)] || 'text/html' });
    } catch {
      await route.abort();
    }
  });
  await ctx.route('https://fonts.**', route => route.abort());
  if (progress) {
    await ctx.addInitScript(ids => {
      if (!localStorage.getItem('go_scene_progress_v1')) {
        localStorage.setItem('go_scene_progress_v1', JSON.stringify({ version: 1, activeSceneId: null, completedSceneIds: ids, sceneState: {} }));
      }
    }, progress);
  }
  return ctx;
}

async function open(ctx, query) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(`${BASE}/learning-scenes.html?welcome=0&tahta=2d${query}`, { waitUntil: 'load' });
  return { page, errors };
}

const count = page => page.locator('#ls-topics-count').textContent();

await test('Konular düğmesi tamamlanan konu sayısını gösterir', async () => {
  const fresh = await open(await context(), '');
  await fresh.page.waitForSelector('#s01-confirm');
  assert.equal(await count(fresh.page), '0/17');
  assert.equal(await fresh.page.getByRole('button', { name: /^Konular/ }).count(), 1);
  const seeded = await open(await context(DESKTOP, ['scene-01-board-intro', 'scene-02-turns-and-intersections', 'scene-03-liberties-by-position']), '&scene=scene-15-snapback');
  await seeded.page.locator('.lb-help-toggle').waitFor();
  assert.equal(await count(seeded.page), '3/17');
  assert.deepEqual([...fresh.errors, ...seeded.errors], []);
});

await test('bir konu bitince sayaç sayfa yenilenmeden artar', async () => {
  const { page, errors } = await open(await context(), '');
  await page.click('#s01-confirm');
  await page.waitForTimeout(280);
  for (const size of [9, 13]) {
    await page.click(`.ls-pill[data-size="${size}"]`);
    await page.waitForTimeout(80);
  }
  await page.locator('.ls-topic-end').waitFor();
  assert.equal(await count(page), '1/17');
  assert.deepEqual(errors, []);
});

await test('ses düğmesi ikonlu, durumu aria-pressed ile bildirir ve tercih saklanır', async () => {
  const ctx = await context();
  const { page, errors } = await open(ctx, '&scene=scene-15-snapback');
  const sound = page.getByRole('button', { name: 'Ses' });
  await sound.waitFor();
  assert.equal(await sound.getAttribute('aria-pressed'), 'false');
  assert.ok(await page.locator('#ls-sound-toggle .ls-sound-off').isVisible(), 'kapalıyken çarpı görünmeli');
  assert.equal(await page.locator('#ls-sound-toggle .ls-sound-on').isVisible(), false);
  await sound.click();
  assert.equal(await sound.getAttribute('aria-pressed'), 'true');
  assert.equal(await sound.getAttribute('title'), 'Ses açık');
  assert.ok(await page.locator('#ls-sound-toggle .ls-sound-on').isVisible(), 'açıkken ses dalgaları görünmeli');
  await page.reload({ waitUntil: 'load' });
  assert.equal(await page.locator('#ls-sound-toggle').getAttribute('aria-pressed'), 'true', 'tercih saklanmalı');
  assert.deepEqual(errors, []);
});

for (const [label, options] of [['masaüstü', DESKTOP], ['390px telefon', PHONE], ['320px telefon', SMALL]]) {
  await test(`${label}: üst çubuk ve adım noktaları 44 px, taşma ve çakışma yok`, async () => {
    const ctx = await context(options);
    for (const scene of ['scene-13-ladder', 'scene-14-net', 'scene-15-snapback']) {
      const { page, errors } = await open(ctx, `&scene=${scene}`);
      await page.locator('#steps button').first().waitFor();
      const m = await page.evaluate(() => {
        const r = el => el.getBoundingClientRect();
        const top = ['#ls-topbar a', '#ls-topics-open', '#ls-sound-toggle'].map(s => r(document.querySelector(s)));
        const narration = r(document.getElementById('ls-narration'));
        const dots = [...document.querySelectorAll('#steps button')].map(r);
        return {
          topH: Math.min(...top.map(b => b.height)),
          soundW: top[2].width,
          gap: top[2].left - top[1].right,
          dotH: Math.min(...dots.map(b => b.height)),
          dotW: Math.min(...dots.map(b => b.width)),
          oneRow: new Set(dots.map(b => Math.round(b.top))).size === 1,
          inside: dots[0].left >= narration.left && dots[dots.length - 1].right <= narration.right,
          overflow: document.documentElement.scrollWidth > innerWidth,
        };
      });
      assert.ok(m.topH >= 44, `${scene}: üst çubuk hedefi ${m.topH} px`);
      assert.ok(m.soundW >= 44, `${scene}: ses düğmesi ${m.soundW} px geniş`);
      assert.ok(m.gap >= 8, `${scene}: Konular ile ses düğmesi çakışıyor (${m.gap} px)`);
      assert.ok(m.dotH >= 44, `${scene}: adım noktası ${m.dotH} px yüksek`);
      assert.ok(m.dotW >= 30, `${scene}: adım noktası ${m.dotW} px geniş`);
      assert.ok(m.oneRow, `${scene}: adım noktaları tek satır olmalı`);
      assert.ok(m.inside, `${scene}: adım noktaları anlatım alanında kırpılıyor`);
      assert.ok(!m.overflow, `${scene}: yatay taşma`);
      assert.deepEqual(errors, []);
      await page.close();
    }
  });
}

await test('adım noktasına dokunmak o adımı açar', async () => {
  const { page, errors } = await open(await context(PHONE), '&scene=scene-13-ladder');
  const dots = page.locator('#steps button');
  await dots.first().waitFor();
  await dots.nth(2).tap();
  assert.equal(await dots.nth(2).getAttribute('aria-pressed'), 'true');
  assert.equal(await dots.first().getAttribute('aria-pressed'), 'false');
  assert.match(await page.locator('#heading').textContent(), /^3 \/ 9/);
  assert.deepEqual(errors, []);
});

await browser.close();
console.log('\nÜst çubuk ve adım noktaları: ' + pass + '/' + (pass + fail));
if (fail) {
  process.exit(1);
}
