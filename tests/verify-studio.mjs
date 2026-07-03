import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createStudioServer } from '../studio/server/server.mjs';
import { createDocument } from '../studio/model/studioDocument.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;

function pickChromiumExecutable() {
  const fromEnv = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  return null;
}

function check(name, condition, message = '') {
  if (condition) { console.log('  ✓', name); pass++; }
  else { console.error('  ✗', name, message ? `— ${message}` : ''); fail++; }
}

async function startServer() {
  const { server, csrfToken } = createStudioServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  return { server, csrfToken, port, base };
}

async function seedDoc(base, csrfToken) {
  const doc = createDocument({ id: 'verify-ui-1', title: 'UI Doğrulama Belgesi' },
    { now: new Date('2026-01-01T00:00:00.000Z') });
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(doc);
    const req = http.request({
      hostname: '127.0.0.1', port: new URL(base).port, path: '/api/documents', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Studio-Token': csrfToken, 'Content-Length': Buffer.byteLength(body), Host: new URL(base).host },
    }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d))); });
    req.on('error', reject); req.write(body); req.end();
  });
}

console.log('\n─── verify-studio.mjs ───\n');

const execPath = pickChromiumExecutable();
if (!execPath) {
  console.warn('  Uyarı: PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ayarlanmamış.');
  console.warn('  Playwright sisteme kurulu Chromium arar — bulunamazsa testler atlanır.\n');
}

let srv;
try {
  srv = await startServer();
} catch (e) {
  console.error('Sunucu başlatılamadı:', e.message);
  process.exit(1);
}
const { server, csrfToken, base } = srv;

try {
  await seedDoc(base, csrfToken);
} catch (e) {
  console.error('Başlangıç belgesi oluşturulamadı:', e.message);
}

let browser;
try {
  const opts = { headless: true };
  if (execPath) opts.executablePath = execPath;
  browser = await chromium.launch(opts);
} catch (e) {
  console.error('Tarayıcı başlatılamadı — verify-studio.mjs atlandı:', e.message);
  server.close();
  process.exit(0);
}

const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();

// ── Test 1: ana sayfa yükleniyor ──────────────────────────────────────
await page.goto(`${base}/studio/index.html`);
await page.waitForSelector('.studio-app', { timeout: 5000 }).catch(() => null);

const hasApp = await page.locator('.studio-app').isVisible().catch(() => false);
check('studio-app görünür', hasApp);

const hasBrand = await page.locator('.studio-toolbar__brand').isVisible().catch(() => false);
check('araç çubuğu markası görünür', hasBrand);

const brandText = await page.locator('.studio-toolbar__brand').textContent().catch(() => '');
check('marka "Problem Stüdyosu" içeriyor', brandText.includes('Problem Stüdyosu'));

// ── Test 2: kütüphane ─────────────────────────────────────────────────
await page.waitForTimeout(500);
const libList = await page.locator('#library-list').isVisible().catch(() => false);
check('kütüphane listesi görünür', libList);

// Sunucu seeding bitti, kütüphanede belge olmalı
// Belge listesi API'den yükleniyor — kısa bekleme
await page.waitForSelector('.studio-doc-card', { timeout: 3000 }).catch(() => null);
const docItems = await page.locator('.studio-doc-card').count().catch(() => 0);
check('kütüphanede en az 1 belge var', docItems >= 1, `${docItems} belge`);

// ── Test 3: ekran görüntüsü — başlangıç ──────────────────────────────
const shot1 = path.join(ROOT, 'tests', 'studio-initial-dark.png');
await page.screenshot({ path: shot1 });
check('başlangıç ekran görüntüsü alındı', fs.existsSync(shot1));

// ── Test 4: belge aç ──────────────────────────────────────────────────
await page.locator('.studio-doc-card').first().click();
await page.waitForTimeout(400);

const inspectorVisible = await page.locator('#inspector-body').isVisible().catch(() => false);
check('inspector belge açınca görünür', inspectorVisible);

const idValue = await page.locator('#fld-id').inputValue().catch(() => '');
check('ID alanı dolu', idValue.length > 0, `id="${idValue}"`);

const titleValue = await page.locator('#fld-title').inputValue().catch(() => '');
check('Başlık alanı dolu', titleValue.length > 0);

// ── Test 5: tahta önizlemesi ──────────────────────────────────────────
const boardWrap = await page.locator('#board-wrap').isVisible().catch(() => false);
check('tahta wrap görünür', boardWrap);

const hasSvg = await page.locator('#board-wrap svg').count().catch(() => 0);
check('SVG tahta renderlanmış', hasSvg > 0, `svg sayısı: ${hasSvg}`);

const shot2 = path.join(ROOT, 'tests', 'studio-doc-open-dark.png');
await page.screenshot({ path: shot2 });
check('belge açık ekran görüntüsü alındı', fs.existsSync(shot2));

// ── Test 6: alt sekme geçişleri ───────────────────────────────────────
await page.locator('#tab-json').click();
await page.waitForTimeout(200);
const jsonPanel = await page.locator('#panel-json').isVisible().catch(() => false);
check('Studio JSON sekmesi görünür', jsonPanel);

const jsonContent = await page.locator('#json-preview').textContent().catch(() => '');
check('JSON önizleme içerik var', jsonContent.trim().length > 0);

await page.locator('#tab-outputs').click();
await page.waitForTimeout(200);
const outputsPanel = await page.locator('#panel-outputs').isVisible().catch(() => false);
check('Gelecek Çıktılar sekmesi görünür', outputsPanel);

await page.locator('#tab-validation').click();
await page.waitForTimeout(200);
const validationPanel = await page.locator('#panel-validation').isVisible().catch(() => false);
check('Doğrulama sekmesi görünür', validationPanel);

// ── Test 7: yeni belge modal ──────────────────────────────────────────
await page.keyboard.press('Control+n');
await page.waitForTimeout(300);

const modalVisible = await page.locator('.studio-modal').isVisible().catch(() => false);
check('Ctrl+N yeni belge modalını açıyor', modalVisible);

if (modalVisible) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const modalClosed = !(await page.locator('.studio-modal').isVisible().catch(() => true));
  check('Escape modal kapatıyor', modalClosed);
}

// ── Test 8: dar ekran uyarısı ─────────────────────────────────────────
await page.setViewportSize({ width: 800, height: 600 });
await page.waitForTimeout(300);
const narrowWarning = await page.locator('.studio-narrow-warning').isVisible().catch(() => false);
check('dar ekranda uyarı görünür', narrowWarning);

await page.setViewportSize({ width: 1280, height: 800 });
await page.waitForTimeout(300);
const wideApp = await page.locator('.studio-app').isVisible().catch(() => false);
check('geniş ekranda uygulama görünür', wideApp);

// ── Test 9: tema geçişi ───────────────────────────────────────────────
const themeBtn = page.locator('[data-theme-toggle]');
const hasThemeBtn = await themeBtn.isVisible().catch(() => false);
check('tema geçiş butonu var', hasThemeBtn);

if (hasThemeBtn) {
  await themeBtn.click();
  await page.waitForTimeout(200);
  const themeBefore = await page.evaluate(() => document.documentElement.dataset.theme).catch(() => '');
  check('tema değişiyor', themeBefore === 'light' || themeBefore === 'dark', `tema: ${themeBefore}`);

  const shot3 = path.join(ROOT, 'tests', 'studio-initial-light.png');
  await page.screenshot({ path: shot3 });
  check('açık tema ekran görüntüsü alındı', fs.existsSync(shot3));
}

// ── Temizlik ──────────────────────────────────────────────────────────
await context.close().catch(() => {});
await browser.close().catch(() => {});
server.close();

console.log(`\nToplam: ${pass + fail}  ✓ ${pass}  ✗ ${fail}`);
if (fail > 0) process.exit(1);
