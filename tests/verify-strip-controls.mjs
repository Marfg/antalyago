/**
 * tests/verify-strip-controls.mjs
 * node tests/verify-strip-controls.mjs
 *
 * 1–12. ders sahnelerinin anlatım alanındaki düğmeler (styles/learning-scenes.css
 * .ls-tick, .ls-strip-btn, .ls-pill): bilgi onayı Merdiven/Ağ/Snapback ders
 * çubuğundaki gibi yazılı "Devam →" düğmesidir, ikincil (ghost) düğmeler
 * altın dolgulu görünmez, tüm dokunma hedefleri en az 44 px'tir ve anlatım
 * alanı taşmaz. Hız için 2D yedek tahta kullanılır.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = path.resolve('.');
const BASE = 'http://antalyago.test';
const TYPES = { '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const SCENES = ['scene-01-board-intro', 'scene-02-turns-and-intersections', 'scene-03-liberties-by-position', 'scene-04-group-liberties',
  'scene-05-liberty-assessment', 'scene-06-capture-basics', 'scene-07-capture-practice', 'scene-08-illegal-moves',
  'scene-09-ko-rule', 'scene-10-endgame-counting', 'scene-11-two-eyes', 'scene-12-connections'];
// Bilgi onayıyla açılan sahneler ve onay düğmeleri.
const CONFIRM = {
  'scene-01-board-intro': '#s01-confirm', 'scene-02-turns-and-intersections': '[data-confirm="0"]',
  'scene-03-liberties-by-position': '#s03-confirm', 'scene-04-group-liberties': '#s04-confirm',
  'scene-05-liberty-assessment': '#s05-confirm', 'scene-09-ko-rule': '#s09-confirm',
  'scene-10-endgame-counting': '#s10-confirm', 'scene-11-two-eyes': '#s11-confirm',
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
    await Promise.all(contexts.splice(0).map(c => c.close().catch(() => {})));
  }
};

const browser = await chromium.launch({ headless: true });
const DESKTOP = { viewport: { width: 1280, height: 800 } };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };
const SMALL = { viewport: { width: 320, height: 640 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };

async function open(options, scene) {
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
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(`${BASE}/learning-scenes.html?welcome=0&tahta=2d&scene=${scene}`, { waitUntil: 'load' });
  await page.locator('#ls-narration button:visible').first().waitFor();
  await page.waitForTimeout(300);
  return { page, errors };
}

/** Anlatım alanındaki görünür düğmelerin ölçüleri ve alanın taşması. */
const measure = page => page.evaluate(() => {
  const narration = document.getElementById('ls-narration');
  const buttons = [...narration.querySelectorAll('button')]
    .filter(b => b.offsetParent && getComputedStyle(b).visibility !== 'hidden')
    .map(b => { const r = b.getBoundingClientRect(); return { text: b.textContent.trim(), h: r.height, w: r.width }; });
  return {
    buttons,
    clipped: narration.scrollHeight > narration.clientHeight + 1,
    overflow: document.documentElement.scrollWidth > innerWidth,
  };
});

// 320×640'ta anlatım alanı 96 px'tir ve birçok sahnede (main'de de) kayar;
// orada yalnız düğme boyu ve yatay taşma denetlenir.
for (const [label, options, clip] of [['masaüstü', DESKTOP, true], ['390px telefon', PHONE, true], ['320px telefon', SMALL, false]]) {
  await test(`${label}: 1–12. sahnelerde düğmeler ≥44 px${clip ? ', anlatım alanı taşmaz' : ''}`, async () => {
    for (const scene of SCENES) {
      const { page, errors } = await open(options, scene);
      const m = await measure(page);
      for (const b of m.buttons) {
        assert.ok(b.h >= 44 && b.w >= 44, `${scene}: "${b.text}" ${Math.round(b.w)}×${Math.round(b.h)} px`);
      }
      if (clip) assert.ok(!m.clipped, `${scene}: anlatım alanı kayıyor`);
      assert.ok(!m.overflow, `${scene}: yatay taşma`);
      assert.deepEqual(errors, []);
      await page.close();
    }
  });
}

await test('bilgi onayı yazılı "Devam →" birincil düğmesidir; onaylanınca yeşile döner', async () => {
  for (const [scene, selector] of Object.entries(CONFIRM)) {
    const { page, errors } = await open(DESKTOP, scene);
    const confirm = page.locator(selector);
    assert.equal(await confirm.evaluate(b => b === document.querySelector('#ls-narration').querySelector('.ls-tick')), true, `${scene}: onay .ls-tick olmalı`);
    assert.equal(await page.getByRole('button', { name: /^Devam/ }).first().evaluate(b => b.classList.contains('ls-tick')), true, `${scene}: erişilebilir adı "Devam"`);
    const look = await confirm.evaluate(b => ({ after: getComputedStyle(b, '::after').content, bg: getComputedStyle(b).backgroundColor, radius: getComputedStyle(b).borderRadius }));
    assert.equal(look.after, '"→"', `${scene}: ok işareti`);
    assert.equal(look.bg, 'rgb(200, 168, 75)', `${scene}: altın dolgu`);
    assert.equal(look.radius, '12px', `${scene}: ders çubuğuyla aynı köşe`);
    assert.deepEqual(errors, []);
    await page.close();
  }
  const { page } = await open(DESKTOP, 'scene-01-board-intro');
  await page.click('#s01-confirm');
  const done = await page.locator('#s01-confirm').evaluate(b => ({ after: getComputedStyle(b, '::after').content, cls: b.classList.contains('ls-confirmed') }));
  assert.deepEqual(done, { after: '"✓"', cls: true });
});

await test('ikincil düğmeler (İpucu, Pas, Bu konuyu tekrar et) şeffaf, birincil altın', async () => {
  const bg = (page, sel) => page.locator(sel).first().evaluate(b => getComputedStyle(b).backgroundColor);
  for (const [scene, sel] of [['scene-06-capture-basics', '[data-action="hint"]'], ['scene-07-capture-practice', '[data-action="pass"]'], ['scene-08-illegal-moves', '[data-action="hint"]']]) {
    const { page } = await open(DESKTOP, scene);
    assert.equal(await bg(page, sel), 'rgba(0, 0, 0, 0)', `${scene}: ${sel} şeffaf olmalı`);
    await page.close();
  }
  const { page, errors } = await open(PHONE, 'scene-01-board-intro');
  await page.click('#s01-confirm');
  await page.waitForTimeout(280);
  for (const size of [9, 13]) {
    await page.click(`.ls-pill[data-size="${size}"]`);
    await page.waitForTimeout(80);
  }
  await page.locator('.ls-topic-end').waitFor();
  await page.waitForTimeout(300);
  // Dokunuş sonrası :hover kalabilir (%8 altın); önemli olan dolgulu olmaması.
  assert.match(await bg(page, '.ls-topic-end [data-action="replay"]'), /^rgba\(.*, 0(\.0\d+)?\)$/);
  assert.equal(await bg(page, '.ls-topic-end [data-action="advance"]'), 'rgb(200, 168, 75)');
  const m = await measure(page);
  assert.ok(m.buttons.every(b => b.h >= 44), 'konu sonu düğmeleri 44 px');
  assert.deepEqual(errors, []);
});

await browser.close();
console.log('\n1–12. sahne düğmeleri: ' + pass + '/' + (pass + fail));
if (fail) {
  process.exit(1);
}
