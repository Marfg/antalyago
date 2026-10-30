/**
 * tests/verify-board3d.mjs
 * node tests/verify-board3d.mjs
 *
 * Ders sahnelerinin 3D tahtası (learning-scenes.html, adapters/board3d.js):
 * varsayılan tahta 3D'dir ve yalnız sahnenin boyutundaki GLB indirilir; 3D
 * beklenirken 2D tahta çizilmez, 3D taşlar 2D izdüşümün gösterdiği piksele
 * düşer, tıklanan nokta 3D'de taş olur, telefon hafif GLB'yi alır ve
 * ?tahta=2d ile hiçbir 3D dosyası indirilmez (2D yedek tahta).
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
const SNAPBACK = 'scene-15-snapback';

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

// WebGL'i başsız tarayıcıda yazılımla çizdir.
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function open(query, options = {}, { delayGlb = 0 } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...options });
  contexts.push(context);
  const requests = [];
  await context.route(BASE + '/**', async route => {
    if (delayGlb && route.request().url().includes('.glb')) await new Promise(r => setTimeout(r, delayGlb));
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
  await page.goto(`${BASE}/learning-scenes.html?${query}`, { waitUntil: 'load' });
  return { page, errors, requests };
}

const hook = (page, name, arg) => page.evaluate(([n, a]) => window.__lsTestBoardAdapter[n](a), [name, arg]);
// Yazılımla çizimde rAF yavaşlayabilir; koşullar zamanlayıcıyla yoklanır.
const ready3d = (page, stones) => page.waitForFunction(
  n => window.__lsTestBoardAdapter?.getBoard3dState()?.stones === n, stones, { timeout: 60000, polling: 300 });

/** Ekran görüntüsünde bir noktanın parlaklığı (0–255). */
async function luma(page, { x, y }) {
  const png = await page.screenshot({ clip: { x: Math.round(x) - 2, y: Math.round(y) - 2, width: 5, height: 5 } });
  return page.evaluate(async b64 => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    return sum / (d.length / 4);
  }, png.toString('base64'));
}

await test('3D taşlar 2D izdüşümün gösterdiği noktaya düşer', async () => {
  const { page, errors } = await open(`scene=${SNAPBACK}&exposeBoardAdapter=1`);
  await ready3d(page, 11);
  assert.equal((await hook(page, 'getBoard3dState')).size, 9);
  assert.equal(await page.locator('.ls-canvas-3d').count(), 1);
  assert.ok(await page.locator('#ls-canvas').evaluate(c => c.classList.contains('is-over-3d')), '2D tuval saydam katman olmalı');
  await page.waitForTimeout(800);
  const box = await page.locator('#ls-canvas').boundingBox();
  const at = async point => { const p = await hook(page, 'getPointScreen', point); return { x: box.x + p.x, y: box.y + p.y }; };
  // Snapback 1. adım: (sütun 4, satır 3) siyah, (3, 3) beyaz, (8, 8) boş.
  const black = await luma(page, await at({ row: 3, col: 4 }));
  const white = await luma(page, await at({ row: 3, col: 3 }));
  const empty = await luma(page, await at({ row: 7, col: 7 }));
  assert.ok(black < 90, `siyah taş koyu olmalı (${black.toFixed(0)})`);
  assert.ok(white > 150, `beyaz taş açık olmalı (${white.toFixed(0)})`);
  assert.ok(empty > 90 && Math.abs(empty - black) > 40, `boş nokta ahşap olmalı (${empty.toFixed(0)})`);
  assert.deepEqual(errors, []);
});

await test('tıklanan kesişim 3D tahtada taş olur', async () => {
  const { page, errors } = await open(`scene=${SNAPBACK}&exposeBoardAdapter=1`);
  await ready3d(page, 11);
  // Kurban hamlesi: siyah (3, 4).
  const pt = await hook(page, 'getPointScreen', { row: 4, col: 3 });
  const box = await page.locator('#ls-canvas').boundingBox();
  await page.mouse.click(box.x + pt.x, box.y + pt.y);
  await page.waitForFunction(() => window.__lsTestBoardAdapter.isOccupied({ row: 4, col: 3 }), null, { timeout: 15000, polling: 200 });
  await page.waitForFunction(() => window.__lsTestBoardAdapter.getBoard3dState().stones >= 12, null, { timeout: 15000, polling: 200 });
  assert.deepEqual(errors, []);
});

/** Ekran görüntüsünde bir noktanın ortalama rengi [r, g, b]. */
async function rgb(page, { x, y }) {
  const png = await page.screenshot({ clip: { x: Math.round(x) - 1, y: Math.round(y) - 1, width: 3, height: 3 } });
  return page.evaluate(async b64 => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const sum = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) sum[k] += d[i + k];
    return sum.map(v => v / (d.length / 4));
  }, png.toString('base64'));
}

await test('nefes işaretleri ve imleç 3D katmanda, ahşaptan ayrışan turkuazla çizilir', async () => {
  // Merdiven 1. adım: "Nefesleri göster" beyazın iki nefesini işaretler.
  const { page, errors } = await open(`scene=scene-13-ladder&exposeBoardAdapter=1`);
  await page.waitForFunction(() => window.__lsTestBoardAdapter?.getBoard3dState()?.stones > 0, null, { timeout: 60000, polling: 300 });
  await page.locator('#libs').click();
  await page.waitForFunction(() => (window.__lsTestBoardAdapter.getBoard3dState().marks.liberty || 0) > 0, null, { timeout: 15000, polling: 200 });
  await page.waitForTimeout(800);
  const box = await page.locator('#ls-canvas').boundingBox();
  const at = async point => { const p = await hook(page, 'getPointScreen', point); return { x: box.x + p.x, y: box.y + p.y }; };
  const [lib] = await hook(page, 'getLibertyPoints');
  const [r, g, b] = await rgb(page, await at(lib));
  assert.ok(g > r + 10 && b > r, `nefes noktası turkuaz olmalı (${[r, g, b].map(Math.round)})`);
  // İmleç: boş bir kesişimin üstünde 3D halka olarak çizilir.
  const empty = await at({ row: 7, col: 7 });
  await page.mouse.move(empty.x, empty.y);
  // Sahne imleçte hamle önizlemesi gösteriyorsa halka önizleme taşının çevresindedir.
  await page.waitForFunction(() => { const m = window.__lsTestBoardAdapter.getBoard3dState().marks; return m.hover === 1 || m.preview === 1; }, null, { timeout: 15000, polling: 200 });
  assert.deepEqual(errors, []);
});

await test('390px telefonda hafif GLB yüklenir, yatay taşma olmaz', async () => {
  const { page, errors, requests } = await open(`scene=${SNAPBACK}&exposeBoardAdapter=1`,
    { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await ready3d(page, 11);
  assert.ok(requests.includes('assets/board/ders-9-hafif.glb'), 'telefonda hafif GLB');
  assert.ok(!requests.includes('assets/board/ders-9.glb'));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'yatay taşma');
  assert.deepEqual(errors, []);
});

await test('varsayılan 3D: yalnız sahnenin GLB dosyası iner, 3D beklenirken 2D tahta çizilmez', async () => {
  const { page, errors, requests } = await open(`scene=${SNAPBACK}&exposeBoardAdapter=1`, {}, { delayGlb: 2500 });
  // Sahne taşları kuruldu ama GLB henüz gelmedi: 2D tuvalde ahşap yok, yalnız koyu zemin.
  await page.waitForFunction(() => window.__lsTestBoardAdapter?.isOccupied({ row: 3, col: 4 }), null, { timeout: 30000, polling: 100 });
  await page.waitForTimeout(300);
  assert.equal(await hook(page, 'getBoard3dState'), null, 'GLB gecikirken 3D hazır olmamalı');
  const box = await page.locator('#ls-canvas').boundingBox();
  const mid = await luma(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  assert.ok(mid < 40, `3D beklenirken tahta çizilmemeli (orta nokta parlaklığı ${mid.toFixed(0)})`);
  await ready3d(page, 11);
  const glbs = requests.filter(r => r.endsWith('.glb'));
  assert.deepEqual(glbs, ['assets/board/ders-9.glb'], 'yalnız 9×9 tahta inmeli');
  assert.deepEqual(errors, []);
});

await test('?tahta=2d ile 3D katmanı ve dosyaları hiç yüklenmez', async () => {
  const { page, errors, requests } = await open(`scene=${SNAPBACK}&tahta=2d&exposeBoardAdapter=1`);
  await page.waitForFunction(() => window.__lsTestBoardAdapter?.isOccupied({ row: 3, col: 4 }), null, { timeout: 30000, polling: 300 });
  await page.waitForTimeout(1500);
  assert.equal(await page.locator('.ls-canvas-3d').count(), 0);
  assert.equal(await hook(page, 'getBoard3dState'), null);
  assert.ok(!requests.some(r => r.includes('three-r169') || r.endsWith('.glb') || r.endsWith('board3d.js')), '3D dosyası istenmemeli');
  assert.deepEqual(errors, []);
});

await browser.close();
console.log('\nDers tahtası 3D denemesi: ' + pass + '/' + (pass + fail));
if (fail) {
  process.exit(1);
}
