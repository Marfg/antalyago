/**
 * tests/verify-robot.mjs
 * node tests/verify-robot.mjs
 *
 * Robot sayfası gerçek tarayıcıda. Motor worker'ı sahtedir, tahta gerçektir:
 * akışlar, tıklama-taş eşleşmesi, handikap merdiveni, ipucu araçları, sayım.
 * Gerçek model `tests/verify-robot-engine.mjs` içinde denenir.
 */
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'http://antalyago.test';
const LADDER_KEY = 'antalyago.robotLadder.v1';
let passed = 0, failed = 0;
const assert = (value, message) => { if (!value) throw new Error(message); };
async function test(name, fn) {
  try { await fn(); console.log('  ✓', name); passed++; } catch (error) { console.error('  ✗', name, '-', error.message); failed++; }
}
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.glb': 'model/gltf-binary' };
const mime = file => TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';

const browser = await chromium.launch({ headless: true });

async function open(options = {}) {
  const ctx = await browser.newContext({ viewport: options.viewport || { width: 1280, height: 720 }, hasTouch: !!options.touch, isMobile: !!options.touch });
  await ctx.route(`${BASE}/**`, async route => {
    const file = path.join(ROOT, new URL(route.request().url()).pathname);
    try { await route.fulfill({ status: 200, contentType: mime(file), body: fs.readFileSync(file) }); } catch { await route.abort(); }
  });
  await ctx.addInitScript(({ engineOk, robot, ownership, key, ladder }) => {
    if (ladder !== null) try { localStorage.setItem(key, JSON.stringify(ladder)); } catch {}
    window.__engineCalls = [];
    class FakeWorker extends EventTarget {
      constructor(url) {
        super();
        this.url = String(url);
        if (this.url.includes('robotEngine')) setTimeout(() => this.emit({ type: 'READY', ok: engineOk }), 0);
      }
      emit(data) { this.dispatchEvent(new MessageEvent('message', { data })); }
      postMessage(data) {
        window.__engineCalls.push({ type: data.type, worker: this.url });
        if (data.type === 'MOVE_PROFILE') {
          setTimeout(() => this.emit({ ok: true, type: data.type, move: { x: 0, y: 0 } }), 0);
          return;
        }
        const { grid, toPlay } = data.position;
        const free = [];
        grid.forEach((cell, point) => { if (!cell) free.push(point); });
        const top = free[free.length - 1];
        const analysis = {
          moves: [{ point: 40, x: 4, y: 4, visits: 6, prior: 0.6 }],
          winrate: 0.5,
          ownership: Float32Array.from({ length: 81 }, () => ownership),
        };
        setTimeout(() => this.emit({ type: 'RESULT', id: data.id, ok: true, kind: data.type, analysis, point: robot === 'pass' ? -1 : top }), 0);
        void toPlay;
      }
      terminate() {}
    }
    window.Worker = FakeWorker;
  }, { engineOk: options.engineOk ?? true, robot: options.robot || 'move', ownership: options.ownership ?? 0, key: LADDER_KEY, ladder: options.ladder ?? null });
  if (options.block) await ctx.route(options.block, route => route.abort());
  const page = await ctx.newPage();
  await page.goto(`${BASE}/${options.path || 'robot.html?e2e=1'}`, { waitUntil: 'domcontentloaded' });
  if (options.path) return { ctx, page };
  await page.waitForFunction(() => window.__robotTest);
  return { ctx, page };
}
const state = page => page.evaluate(() => window.__robotTest.state());
const myTurn = page => page.waitForFunction(() => { const s = window.__robotTest.state(); return s.toPlay === 1 && !s.thinking && s.phase === 'play'; });
async function clickPoint(page, x, y) {
  const point = await page.evaluate(([a, b]) => window.__robotTest.screenOf(a, b), [x, y]);
  const box = await page.locator('#rb-canvas').boundingBox();
  await page.mouse.click(box.x + point.x, box.y + point.y);
}

await test('ana sayfa ve öğrenme ekranı robota yönlendirir', async () => {
  const { ctx, page } = await open({ path: 'index.html' });
  const link = page.getByRole('link', { name: '9×9 Oyuna Başla' });
  await link.waitFor();
  assert((await link.getAttribute('href')) === 'robot.html', 'ana oyun bağlantısı');
  await ctx.close();
});

await test('yeni oyuncu dört taşla başlar, ilk hamleyi robot yapar', async () => {
  const { ctx, page } = await open();
  await myTurn(page);
  const s = await state(page);
  assert(s.stones === 5 && s.history === 1, 'dört siyah + robot hamlesi bekleniyordu');
  assert(s.komi === 0.5, 'handikapta komi 0,5');
  assert((await page.textContent('#rb-lead')).includes('dört taşın'), 'açıklama basamağı göstermeli');
  assert((await page.textContent('#rb-level')).includes('1 / 5'), 'basamak etiketi');
  await ctx.close();
});

await test('panel ana sayfa yazı dilini kullanır', async () => {
  const { ctx, page } = await open();
  const heading = await page.locator('#rb-title').evaluate(el => getComputedStyle(el).fontFamily);
  assert(heading.includes('Noto Serif'), 'başlık Noto Serif olmalı: ' + heading);
  const button = await page.locator('#rb-hint').evaluate(el => [...el.classList].join(' '));
  assert(button.includes('button-primary'), 'İpucu birincil düğme');
  await ctx.close();
});

await test('eski kabuk kalktı: renk seçimi, modal ve maskot yok', async () => {
  const { ctx, page } = await open();
  for (const selector of ['#cp-b', '#cp-w', '#gameover', '#review-overlay', '#mascot-btn', '#think-bar']) {
    assert(await page.locator(selector).count() === 0, selector + ' kalmış');
  }
  await ctx.close();
});

await test('tahtaya tıklamak taşı tam o noktaya koyar', async () => {
  const { ctx, page } = await open();
  await myTurn(page);
  await clickPoint(page, 4, 3);
  await page.waitForFunction(() => window.__robotTest.state().history >= 2);
  const stones = await page.evaluate(() => window.__robotTest.board().stones);
  assert(stones[3 * 9 + 4] === 1, 'siyah taş (4,3) noktasında olmalı');
  await ctx.close();
});

await test('sürükleyerek döndürmek taş koymaz', async () => {
  const { ctx, page } = await open();
  await myTurn(page);
  const before = (await state(page)).stones;
  const box = await page.locator('#rb-canvas').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(cx + 80, cy + 30, { steps: 8 });
  await page.mouse.up({ button: 'right' });
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 80, cy + 30, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  assert((await state(page)).stones === before, 'sürükleme taş ekledi');
  await ctx.close();
});

await test('telefonda hamle önce önizlenir, ikinci dokunuş oynar', async () => {
  const { ctx, page } = await open({ viewport: { width: 390, height: 844 }, touch: true });
  await myTurn(page);
  const before = (await state(page)).history;
  const point = await page.evaluate(() => window.__robotTest.screenOf(4, 3));
  const box = await page.locator('#rb-canvas').boundingBox();
  await page.touchscreen.tap(box.x + point.x, box.y + point.y);
  await page.getByText('Onaylamak için').waitFor();
  assert((await state(page)).history === before, 'ilk dokunuş oynamamalı');
  await page.touchscreen.tap(box.x + point.x, box.y + point.y);
  await page.waitForFunction(h => window.__robotTest.state().history > h, before);
  await ctx.close();
});

for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 1280, height: 720 }]) {
  await test(`${viewport.width}×${viewport.height}: tahta ve denetimler sığar`, async () => {
    const { ctx, page } = await open({ viewport });
    await myTurn(page);
    const size = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: innerWidth }));
    assert(size.sw <= size.vw, 'yatay taşma var');
    for (const [x, y] of [[0, 0], [8, 0], [0, 8], [8, 8]]) {
      const point = await page.evaluate(([a, b]) => window.__robotTest.screenOf(a, b), [x, y]);
      const box = await page.locator('#rb-canvas').boundingBox();
      assert(point.x >= 0 && point.x <= box.width && point.y >= 0 && point.y <= box.height, `köşe ${x},${y} tuval dışında`);
    }
    for (const selector of ['#rb-hint', '#rb-pass']) {
      const box = await page.locator(selector).boundingBox();
      assert(box && box.height >= 44, selector + ' 44 px altında');
    }
    await ctx.close();
  });
}

await test('teslim iki basış ister, basamak düşmez, sonraki oyun başlar', async () => {
  const { ctx, page } = await open({ ladder: { version: 1, level: 2, wins: 2, games: 2 } });
  await page.waitForFunction(() => window.__robotTest.state().phase === 'play');
  await page.click('#rb-resign');
  assert((await state(page)).phase === 'play', 'ilk basış bitirmemeli');
  await page.click('#rb-resign');
  await page.getByRole('heading', { name: 'Robot kazandı.' }).waitFor();
  assert((await state(page)).level === 2, 'yenilgi basamağı değiştirmemeli');
  await page.click('#rb-next');
  await page.waitForFunction(() => window.__robotTest.state().phase === 'play');
  await ctx.close();
});

await test('galibiyet taş azaltır ve basamak kalıcıdır', async () => {
  const { ctx, page } = await open();
  await myTurn(page);
  await page.evaluate(() => window.__robotTest.forceResult(true));
  await page.getByRole('heading', { name: 'Kazandın.' }).waitFor();
  await page.click('#rb-next');
  await page.waitForFunction(() => window.__robotTest.state().level === 1);
  await myTurn(page);
  assert((await state(page)).stones === 4, 'üç taş + robot hamlesi bekleniyordu');
  assert((await page.textContent('#rb-lead')).includes('üç taşın'), 'açıklama güncellenmeli');
  await page.reload();
  await page.waitForFunction(() => window.__robotTest?.state().level === 1);
  await ctx.close();
});

await test('eşit basamaklarda ilk hamle oyuncunun, son basamakta komi 6,5', async () => {
  const { ctx, page } = await open({ ladder: { version: 1, level: 3, wins: 3, games: 3 } });
  await myTurn(page);
  let s = await state(page);
  assert(s.stones === 0 && s.komi === 0.5, 'handikapsız, komi 0,5');
  await ctx.close();
  const last = await open({ ladder: { version: 1, level: 4, wins: 4, games: 4 } });
  await myTurn(last.page);
  s = await state(last.page);
  assert(s.stones === 0 && s.komi === 6.5, 'eşit oyunda komi 6,5');
  await last.ctx.close();
});

await test('Yeniden başla oyun ortasında iki basış ister', async () => {
  const { ctx, page } = await open();
  await myTurn(page);
  await clickPoint(page, 4, 3);
  await myTurn(page);
  await page.waitForFunction(() => window.__robotTest.state().history >= 3);
  await page.click('#rb-new');
  assert((await state(page)).history >= 3, 'ilk basış silmemeli');
  await page.click('#rb-new');
  await page.waitForFunction(() => window.__robotTest.state().history <= 1);
  await ctx.close();
});

await test('ipucu menüsünde yalnız hamle ve tahmini alan var; hamle işaret ve metin üretir', async () => {
  const { ctx, page } = await open();
  await myTurn(page);
  await page.click('#rb-hint');
  const tools = await page.locator('[data-tool]').evaluateAll(els => els.map(el => el.dataset.tool));
  assert(tools.join() === 'move,estimate', `beklenmeyen araçlar: ${tools}`);
  await page.click('[data-tool="move"]');
  await page.getByText('E5').waitFor();
  assert(await page.evaluate(() => Boolean(window.__robotTest.board().preview)), 'hayalet taş gösterilmeli');
  await clickPoint(page, 2, 4);
  await page.waitForFunction(() => document.getElementById('rb-hint-text').hidden);
  await ctx.close();
});

await test('tahmini alan açılır, pul ve toplam gösterir, hamleden sonra yenilenir', async () => {
  const { ctx, page } = await open({ ownership: 0.8 });
  await myTurn(page);
  await page.click('#rb-hint');
  await page.click('[data-tool="estimate"]');
  await page.getByText(/Siyah ≈ \d+ · Beyaz ≈ \d+/).waitFor();
  assert((await page.evaluate(() => window.__robotTest.board().marks.length)) > 40, 'bölge pulları görünmeli');
  assert((await page.locator('[data-tool="estimate"]').getAttribute('aria-pressed')) === 'true', 'anahtar durumu');
  assert((await page.textContent('#rb-estimate-text')).includes('Sen öndesin'), 'kim önde yazmalı');
  const calls = await page.evaluate(() => window.__engineCalls.filter(c => c.type === 'ANALYZE').length);
  await clickPoint(page, 4, 3);
  await page.waitForFunction(n => window.__engineCalls.filter(c => c.type === 'ANALYZE').length > n, calls);
  await page.click('[data-tool="estimate"]');
  await page.waitForFunction(() => window.__robotTest.board().marks.length === 0);
  assert(await page.locator('#rb-estimate').isHidden(), 'gösterge kapanmalı');
  await ctx.close();
});

await test('iki pas sayıma götürür, ölü taş önerilir, onayla oyun biter', async () => {
  const { ctx, page } = await open({ robot: 'pass', ownership: 0.9, ladder: { version: 1, level: 3, wins: 3, games: 3 } });
  await myTurn(page);
  await page.evaluate(() => window.__robotTest.setPosition(['X X X X X . . . .', 'X . . . X . . . .', 'X . O . X . . . .', 'X . . . X . . . .', 'X X X X X . . . .', '. . . . . . . . .', '. . . . . . . . .', '. . . . . . . . .', '. . . . . . . . .']));
  await page.click('#rb-pass');
  await page.waitForFunction(() => window.__robotTest.state().phase === 'counting');
  await page.waitForFunction(() => window.__robotTest.state().dead === 1);
  await page.getByText(/Siyah \d+ · Beyaz \d+/).waitFor();
  assert(await page.locator('#rb-confirm').isVisible(), 'onay düğmesi');
  assert(await page.locator('#rb-hint').isHidden(), 'sayımda ipucu gizlenmeli');
  await page.click('#rb-confirm');
  await page.getByRole('heading', { name: 'Kazandın.' }).waitFor();
  assert((await state(page)).level === 4, 'galibiyet merdiveni işlemeli');
  await ctx.close();
});

await test('robot pas geçince ko yasağı ve sıra doğru, oyun sürer', async () => {
  const { ctx, page } = await open({ robot: 'pass', ladder: { version: 1, level: 3, wins: 3, games: 3 } });
  await myTurn(page);
  await page.waitForTimeout(400);   // ilk kare çizilsin
  await clickPoint(page, 4, 4);
  await page.getByText('Robot pas geçti').waitFor();
  const s = await state(page);
  assert(s.phase === 'play' && s.toPlay === 1, 'sıra oyuncuda kalmalı');
  await ctx.close();
});

await test('model yüklenmezse yedek motor oynar ve kullanıcıya söylenir', async () => {
  const { ctx, page } = await open({ engineOk: false });
  await page.waitForFunction(() => window.__engineCalls.some(c => c.type === 'MOVE_PROFILE'));
  await myTurn(page);
  await page.click('#rb-hint');
  await page.click('[data-tool="move"]');
  await page.getByText('robot modeli gerekli').waitFor();
  await ctx.close();
});

await test('sayfa kodu yüklenemezse sonsuz bekleme yerine kullanıcıya söylenir', async () => {
  const { ctx, page } = await open({ path: 'robot.html', block: '**/core/hintTools.js*' });
  await page.getByText('Robot açılamadı').waitFor();
  assert(await page.locator('#rb-actions').isHidden(), 'çalışmayan düğmeler gizlenmeli');
  await ctx.close();
});

await browser.close();
console.log(`\nToplam: ${passed + failed}  ✓ ${passed}  ✗ ${failed}`);
if (failed) process.exit(1);
