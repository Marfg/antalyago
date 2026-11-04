/**
 * tests/verify-robot-engine.mjs
 * node tests/verify-robot-engine.mjs
 *
 * Gerçek model, gerçek worker. Sahte worker kullanan verify-robot.mjs'nin
 * göremediğini dener: model repodan yüklenir, robot yasal hamle üretir,
 * tahmini alan tahtayla tutarlıdır. TensorFlow.js CDN'den geldiği için ağ
 * gerekir ve yazılım grafiğinde yavaştır, bu yüzden test-all dışındadır.
 */
import { chromium } from 'playwright-core';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3121;
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.glb': 'model/gltf-binary' };
const server = http.createServer((request, response) => {
  const file = path.join(ROOT, decodeURIComponent(new URL(request.url, 'http://x').pathname));
  fs.readFile(file, (error, body) => {
    if (error) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    response.end(body);
  });
}).listen(PORT);

let passed = 0, failed = 0;
const assert = (value, message) => { if (!value) throw new Error(message); };
async function test(name, fn) {
  try { await fn(); console.log('  ✓', name); passed++; } catch (error) { console.error('  ✗', name, '-', error.message); failed++; }
}

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.goto(`http://localhost:${PORT}/robot.html?e2e=1`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__robotTest);
const state = () => page.evaluate(() => window.__robotTest.state());
const myTurn = () => page.waitForFunction(() => { const s = window.__robotTest.state(); return s.toPlay === 1 && !s.thinking && s.phase === 'play'; }, null, { timeout: 60000 });

await test('model repodan yüklenir, yedeğe düşülmez', async () => {
  await page.waitForFunction(() => window.__robotTest.state().engineState !== 'loading', null, { timeout: 60000 });
  assert((await state()).engineState === 'ready', 'motor hazır olmalı');
});

await test('robot handikaplı konumda yasal ilk hamleyi yapar', async () => {
  await myTurn();
  const s = await state();
  assert(s.stones === 5 && s.history === 1, 'beyaz taş eklenmeli');
});

await test('üç el boyunca yasal oyun sürer', async () => {
  for (let i = 0; i < 3; i++) {
    await myTurn();
    const move = await page.evaluate(() => {
      const { stones } = window.__robotTest.board();
      const free = stones.map((cell, point) => (cell ? -1 : point)).filter(point => point >= 0);
      return free[(free.length / 2) | 0];
    });
    await page.evaluate(point => window.__robotTest.play(point % 9, (point / 9) | 0), move);
    await page.waitForFunction(h => window.__robotTest.state().history > h, 2 * i + 2, { timeout: 60000 });
  }
  await myTurn();
  assert((await state()).phase === 'play', 'oyun sürmeli');
});

await test('tahmini alan dört taşlı siyahı önde gösterir', async () => {
  await page.click('#rb-hint');
  await page.click('[data-tool="estimate"]');
  await page.getByText(/Siyah ≈ \d+ · Beyaz ≈ \d+/).waitFor({ timeout: 60000 });
  const text = await page.textContent('#rb-estimate-text');
  const [, black, white] = text.match(/Siyah ≈ (\d+) · Beyaz ≈ (\d+)/).map(Number);
  assert(black + white === 81, 'toplam 81 olmalı: ' + text);
  assert(black > white, 'dört taşlı siyah önde olmalı: ' + text);
});

await test('hamle ipucu boş bir nokta önerir', async () => {
  await page.click('[data-tool="move"]');
  await page.waitForFunction(() => /^[A-J]\d/.test(document.getElementById('rb-hint-text').textContent), null, { timeout: 60000 });
  const [text, board] = await page.evaluate(() => [document.getElementById('rb-hint-text').textContent, window.__robotTest.board()]);
  const [, letter, digit] = text.match(/^([A-J])(\d)/);
  const x = 'ABCDEFGHJ'.indexOf(letter), y = 9 - Number(digit);
  assert(board.stones[y * 9 + x] === 0, 'önerilen nokta boş olmalı: ' + text);
});

await test('sayfa hatasız çalıştı', async () => { assert(errors.length === 0, errors.join(' | ')); });

await browser.close();
server.close();
console.log(`\nToplam: ${passed + failed}  ✓ ${passed}  ✗ ${failed}`);
if (failed) process.exit(1);
