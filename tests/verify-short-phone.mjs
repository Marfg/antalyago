/**
 * tests/verify-short-phone.mjs
 * node tests/verify-short-phone.mjs
 *
 * Kısa telefonlarda anlatım alanı (styles/learning-scenes.css --board-room,
 * ladder/net/snapback-lesson.css): dar ekranda tahta genişlikle sınırlıdır,
 * anlatım alanı tahtanın kullanmadığı dikey paydan uzar. Yazı ve düğmeler
 * kaymadan sığar, tahta boyu ise anlatım en kısa hâlindeyken olduğu gibi
 * kalır. Masaüstü düzeni değişmez. Hız için 2D yedek tahta kullanılır.
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
const LESSONS = ['scene-13-ladder', 'scene-14-net', 'scene-15-snapback'];
const PHONES = [[320, 640], [360, 640], [375, 667], [390, 844]];

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
const phone = ([width, height]) => ({ viewport: { width, height }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });

/** narrationH verilirse anlatım yüksekliği o değere zorlanır (karşılaştırma için). */
async function context(options, narrationH = null) {
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
  if (narrationH) {
    await ctx.addInitScript(h => {
      document.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style');
        style.textContent = `:root body { --narration-h: ${h}px !important; }`;
        document.head.appendChild(style);
      });
    }, narrationH);
  }
  return ctx;
}

async function open(ctx, scene) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(`${BASE}/learning-scenes.html?welcome=0&tahta=2d&scene=${scene}`, { waitUntil: 'load' });
  await page.locator('#ls-narration button:visible').first().waitFor();
  await page.waitForTimeout(300);
  return { page, errors };
}

/** Anlatım alanının kayma miktarı ve birincil düğmenin alanın içinde görünüp görünmediği. */
const narration = page => page.evaluate(() => {
  const n = document.getElementById('ls-narration');
  const box = n.getBoundingClientRect();
  const next = document.getElementById('next');
  const r = next && next.getBoundingClientRect();
  return {
    height: n.clientHeight,
    scroll: n.scrollHeight - n.clientHeight,
    nextInside: !r || (r.top >= box.top - 1 && r.bottom <= box.bottom + 1),
  };
});

/** Tahtanın tuvaldeki genişliği (ahşap renkli piksellerin yatay yayılımı). */
const boardWidth = page => page.evaluate(() => {
  const c = document.getElementById('ls-canvas');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let lo = Infinity;
  let hi = -1;
  for (let y = 0; y < c.height; y += 2) {
    for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4;
      if (d[i] > 140 && d[i + 1] > 90 && d[i] - d[i + 2] > 50) { lo = Math.min(lo, x); hi = Math.max(hi, x); }
    }
  }
  return hi - lo;
});

for (const size of PHONES) {
  await test(`${size.join('×')}: 1–12. sahnelerde anlatım alanı kaymaz`, async () => {
    const ctx = await context(phone(size));
    for (const scene of SCENES) {
      const { page, errors } = await open(ctx, scene);
      const m = await narration(page);
      assert.ok(m.scroll <= 1, `${scene}: anlatım alanı ${m.scroll} px kayıyor (yükseklik ${m.height})`);
      assert.deepEqual(errors, []);
      await page.close();
    }
  });
}

for (const size of PHONES) {
  await test(`${size.join('×')}: Merdiven/Ağ/Snapback'in her adımında birincil düğme görünür, alan kaymaz`, async () => {
    const ctx = await context(phone(size));
    for (const scene of LESSONS) {
      const { page, errors } = await open(ctx, scene);
      const dots = page.locator('#steps button');
      const count = await dots.count();
      for (let i = 0; i < count; i++) {
        await dots.nth(i).click();
        await page.waitForTimeout(120);
        const m = await narration(page);
        assert.ok(m.nextInside, `${scene} ${i + 1}. adım: birincil düğme anlatım alanının dışında`);
        // Merdiven'in kamerası tahtanın altında daha çok pay ister; kısa telefonda
        // tahta küçülmeden ancak bu kadar yer açılabiliyor (son adımda fazladan
        // bir seçenek satırı da var). Eylem çubuğu yapışkan olduğundan düğmeler
        // yine görünür (yukarıda denetlendi). main'de bu kayma 49 px'e varıyordu.
        const allowed = scene === 'scene-13-ladder' ? 16 : 1;
        assert.ok(m.scroll <= allowed, `${scene} ${i + 1}. adım: anlatım alanı ${m.scroll} px kayıyor (yükseklik ${m.height})`);
      }
      assert.deepEqual(errors, []);
      await page.close();
    }
  });
}

await test('uzayan anlatım alanı tahtayı küçültmez', async () => {
  // 320×568'de anlatım yüksekliği main'deki gibi kalır (orada pay yok); yalnız uzayan boylar denetlenir.
  for (const size of PHONES) {
    for (const [scene, step] of [['scene-03-liberties-by-position'], ['scene-12-connections'], ['scene-13-ladder', 0], ['scene-13-ladder', 8]]) {
      const widths = [];
      for (const forced of [null, 96]) {
        const { page } = await open(await context(phone(size), forced), scene);
        if (step !== undefined) {
          // Anlatım 96 px'e zorlanınca noktalar kayan alanda kalır; doğrudan tıklanır.
          await page.locator('#steps button').nth(step).evaluate(button => button.click());
        }
        await page.waitForTimeout(1300);
        widths.push(await boardWidth(page));
      }
      assert.ok(Math.abs(widths[0] - widths[1]) <= 1, `${size.join('×')} ${scene}${step !== undefined ? ' ' + (step + 1) + '. adım' : ''}: tahta ${widths[1]} px yerine ${widths[0]} px`);
    }
  }
});

await test('masaüstü: anlatım yüksekliği değişmez, 13–15 kaymaz', async () => {
  const ctx = await context({ viewport: { width: 1280, height: 800 } });
  const { page, errors } = await open(ctx, 'scene-03-liberties-by-position');
  assert.equal((await narration(page)).height, 120, 'varsayılan anlatım yüksekliği 15vh');
  for (const scene of LESSONS) {
    const lesson = await open(ctx, scene);
    const m = await narration(lesson.page);
    assert.ok(m.scroll <= 1, `${scene}: anlatım alanı ${m.scroll} px kayıyor`);
    errors.push(...lesson.errors);
  }
  assert.deepEqual(errors, []);
});

await browser.close();
console.log('\nKısa telefon düzeni: ' + pass + '/' + (pass + fail));
if (fail) {
  process.exit(1);
}
