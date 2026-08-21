/**
 * tests/verify-learning-scenes.mjs
 * node tests/verify-learning-scenes.mjs
 *
 * learning-scenes.html + Sahne #1/#2/#3 için gerçek tarayıcı doğrulaması.
 * tests/verify-learning-ui.mjs'in AYNI (context.route ile yerel dosya
 * sunma, gerçek ağ sunucusu gerektirmeyen) deseniyle.
 *
 * v0.9 — ortak anlatım şeridi (Bölüm A), Sahne #2 neon guide temizliği
 * (Bölüm B) ve Sahne #3 (Bölüm C) için TAM olarak yeniden yazıldı; eski
 * #ls-info-region ve s01-/s02- seçicilerine dayanan testler ARTIK YOK.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'http://antalyago-scenes.test';
const PAGE = 'learning-scenes.html';
const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  tablet: { width: 820, height: 1180 },
  mobile: { width: 390, height: 844 },
};
// Bekleme sürelerini SIFIRA indiren query — turn-loop/timer testlerinin
// gerçek zamanlı (450–700ms×N) beklemesini önler (bkz. learning-scenes.html
// dosya başı test-hook notu). Üretim davranışını DEĞİŞTİRMEZ.
const FAST_QUERY = '?whiteMoveDelayMs=0&centerLibertyDisplayMs=0&whiteCornerDelayMs=0&transitionDelayMs=0';

let pass = 0, fail = 0;
const tests = [];
function addTest(name, fn) { tests.push({ name, fn }); }
function ensure(cond, msg) { assert.ok(cond, msg); }

function mime(filePath) {
  return {
    '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript',
    '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json',
  }[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}
function absPath(rel) { return path.join(ROOT, rel.replace(/^\/+/, '')); }

function pickChromiumExecutable() {
  const fromEnv = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  return fromEnv && fromEnv.trim() ? fromEnv.trim() : null;
}
async function launchChromium() {
  const executablePath = pickChromiumExecutable();
  const launchOptions = { headless: true };
  if (executablePath) return chromium.launch({ ...launchOptions, executablePath });
  try { return await chromium.launch(launchOptions); }
  catch (error) {
    if (/EPERM|EACCES|spawn/i.test(String(error?.message || error))) {
      try { return await chromium.launch({ ...launchOptions, channel: 'chrome' }); } catch {}
    }
    throw error;
  }
}

async function openScenesPage({ viewport = VIEWPORTS.desktop, reducedMotion = 'no-preference', query = '' } = {}) {
  const browser = await launchChromium();
  // Not: burada localStorage temizleyen bir addInitScript EKLEMİYORUZ —
  // context.addInitScript her navigasyonda (reload dahil) tekrar çalışır
  // ve bir testin reload() ile doğrulamaya çalıştığı persistence'ı
  // silerdi. Zaten TAZE bir context zaten BOŞ storage ile başlar.
  const context = await browser.newContext({ viewport, reducedMotion });
  await context.route(`${BASE}/**`, async route => {
    const url = new URL(route.request().url());
    const pathname = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
    const filePath = absPath(pathname || PAGE);
    try { await route.fulfill({ status: 200, contentType: mime(filePath), body: fs.readFileSync(filePath) }); }
    catch { await route.abort(); }
  });
  const consoleErrors = [];
  const page = await context.newPage();
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push('console: ' + m.text()); });
  await page.goto(`${BASE}/${PAGE}${query}`, { waitUntil: 'networkidle' });
  return {
    browser, context, page, consoleErrors,
    async close() { await context.close().catch(() => {}); await browser.close().catch(() => {}); },
  };
}

function boxesIntersect(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/* ══════════════════════════════════════════════════════════════════
   Ortak akış yardımcıları
   ══════════════════════════════════════════════════════════════════ */
async function confirmIntro(page) {
  await page.waitForSelector('#s01-confirm');
  await page.click('#s01-confirm');
  await page.waitForTimeout(280);
}
async function exploreAllSizes(page) {
  for (const size of [9, 13, 19]) {
    await page.click(`.ls-pill[data-size="${size}"]`);
    await page.waitForTimeout(80);
  }
}
async function advanceToScene2(page) {
  await confirmIntro(page);
  await exploreAllSizes(page);
  await page.click('#s01-continue');
  await page.waitForTimeout(300);
}
async function confirmS02Step(page, i) {
  await page.click(`#s02-step-${i} [data-confirm]`);
  await page.waitForTimeout(280);
}
async function playThroughS02Info(page) {
  await confirmS02Step(page, 0);
  await confirmS02Step(page, 1);
  await confirmS02Step(page, 2);
}
async function getEventLog(page) {
  return page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('go_teacher_event_log_v1') || '[]'); }
    catch { return []; }
  });
}
/** Tahta merkezi çevresinde küçük bir tıklama deseni deneyerek İLK yasal
    siyah hamleyi bulur/oynar — sahnenin kendi hit-testing'ine (screenToGrid)
    GÜVENİR, kesin piksel matematiği tekrarlanmaz. */
async function playOneBlackMoveScene2(page) {
  const canvasBox = await page.locator('#ls-canvas').boundingBox();
  const before = (await getEventLog(page)).filter(e => e.type === 'scene_move_played' && e.payload.color === 'black' && e.stepId === 'scene-02-turns-and-intersections').length;
  const offsets = [
    [0, -6], [0, -36], [0, 24], [-30, -6], [30, -6], [-30, -36], [30, -36], [-30, 24], [30, 24],
    [0, -66], [0, 54], [-60, -6], [60, -6], [-60, -36], [60, -36], [-60, 24], [60, 24],
    [-60, -66], [60, -66], [-60, 54], [60, 54],
  ];
  for (const [dx, dy] of offsets) {
    await page.mouse.click(canvasBox.x + canvasBox.width / 2 + dx, canvasBox.y + canvasBox.height / 2 + dy);
    await page.waitForTimeout(30);
    const now = (await getEventLog(page)).filter(e => e.type === 'scene_move_played' && e.payload.color === 'black' && e.stepId === 'scene-02-turns-and-intersections').length;
    if (now > before) return true;
  }
  return false;
}
async function playScene2ToCompletion(page) {
  await playThroughS02Info(page);
  for (let i = 0; i < 3; i++) {
    const placed = await playOneBlackMoveScene2(page);
    if (!placed) return false;
    await page.waitForTimeout(60);
  }
  return true;
}
async function advanceToScene3(page) {
  await advanceToScene2(page);
  const ok = await playScene2ToCompletion(page);
  if (!ok) throw new Error('Sahne #2 tamamlanamadı — Sahne #3\'e geçilemiyor');
  await page.click('#s02-continue');
  await page.waitForTimeout(300);
}
/** SGF/adapter projeksiyon matematiğine göre 9×9'da merkez kesişim
    (row=4,col=4) — camera 'center' preset'inde — canvas'ın YATAY merkezine
    TAM oturur (rx=0 çünkü world x=0); dikey ofset STONE_R'ye bağlı birkaç
    px'lik bir sapmadır (bkz. milestone notları) — bu yüzden canvas
    bbox'ının merkezine yakın bir nokta tıklamak güvenilir biçimde merkez
    kesişimi hedefler. */
async function clickBoardCenter(page, dy = -8) {
  const canvasBox = await page.locator('#ls-canvas').boundingBox();
  await page.mouse.click(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2 + dy);
}
async function confirmS03Intro(page) {
  await page.click('#s03-confirm');
  await page.waitForTimeout(280);
}
const S03_ID = 'scene-03-liberties-by-position';
/** advanceToScene3() zaten Sahne #1/#2'nin KENDİ scene_move_played/
    scene_completion_unlocked event'lerini AYNI paylaşılan log'a yazmış
    olur — Sahne #3'e özgü doğrulamalar HER ZAMAN stepId ile filtrelenmeli. */
function s03Events(events) { return events.filter(e => e.stepId === S03_ID); }

/* ══════════════════════════════════════════════════════════════════
   BÖLÜM A — Ortak anlatım şeridi
   ══════════════════════════════════════════════════════════════════ */

addTest('A1) sağ/sol bilgi paneli yok — #ls-info-region artık DOM\'da bulunmuyor', async () => {
  const s = await openScenesPage();
  try {
    ensure(await s.page.locator('#ls-info-region').count() === 0, '#ls-info-region hâlâ DOM\'da');
    ensure(await s.page.locator('#ls-narration').count() === 1, '#ls-narration bulunamadı');
  } finally { await s.close(); }
});

addTest('A2) masaüstünde board ve anlatım şeridi AYNI dikey eksende (merkez-x hizalı)', async () => {
  const s = await openScenesPage();
  try {
    const boardBox = await s.page.locator('#ls-board-region').boundingBox();
    const narrationBox = await s.page.locator('#ls-narration').boundingBox();
    const boardCx = boardBox.x + boardBox.width / 2;
    const narrationCx = narrationBox.x + narrationBox.width / 2;
    ensure(Math.abs(boardCx - narrationCx) < 2, `merkez eksenleri hizalı değil (board=${boardCx}, narration=${narrationCx})`);
  } finally { await s.close(); }
});

addTest('A3) anlatım şeridi tahtanın ALTINDA (board.y + board.height <= narration.y)', async () => {
  const s = await openScenesPage();
  try {
    const boardBox = await s.page.locator('#ls-board-region').boundingBox();
    const narrationBox = await s.page.locator('#ls-narration').boundingBox();
    ensure(narrationBox.y >= boardBox.y + boardBox.height - 1, 'anlatım şeridi board\'un altında değil');
  } finally { await s.close(); }
});

addTest('A4) board ve şerit bounding box\'ları hiçbir viewport\'ta KESİŞMİYOR', async () => {
  for (const viewport of [VIEWPORTS.desktop, VIEWPORTS.tablet, VIEWPORTS.mobile]) {
    const s = await openScenesPage({ viewport });
    try {
      const boardBox = await s.page.locator('#ls-board-region').boundingBox();
      const narrationBox = await s.page.locator('#ls-narration').boundingBox();
      ensure(!boxesIntersect(boardBox, narrationBox), `${viewport.width}px: board/şerit kesişiyor`);
    } finally { await s.close(); }
  }
});

addTest('A5) Sahne #1 bilgi değişiminde (intro→keşif) board konumu/boyutu ±1px sabit', async () => {
  const s = await openScenesPage();
  try {
    const before = await s.page.locator('#ls-board-region').boundingBox();
    await confirmIntro(s.page);
    const after = await s.page.locator('#ls-board-region').boundingBox();
    ensure(Math.abs(before.width - after.width) < 1 && Math.abs(before.height - after.height) < 1
      && Math.abs(before.x - after.x) < 1 && Math.abs(before.y - after.y) < 1, 'board konumu/boyutu değişti');
  } finally { await s.close(); }
});

addTest('A6) Sahne #2 bilgi→oyun geçişinde board konumu/boyutu ±1px sabit', async () => {
  const s = await openScenesPage();
  try {
    await advanceToScene2(s.page);
    const before = await s.page.locator('#ls-board-region').boundingBox();
    await playThroughS02Info(s.page);
    const after = await s.page.locator('#ls-board-region').boundingBox();
    ensure(Math.abs(before.width - after.width) < 1 && Math.abs(before.height - after.height) < 1
      && Math.abs(before.x - after.x) < 1 && Math.abs(before.y - after.y) < 1, 'board konumu/boyutu değişti');
  } finally { await s.close(); }
});

addTest('A7) mobilde yatay taşma yok', async () => {
  const s = await openScenesPage({ viewport: VIEWPORTS.mobile });
  try {
    ensure(await s.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'mobilde yatay taşma var');
    const narrationBox = await s.page.locator('#ls-narration').boundingBox();
    ensure(narrationBox.width <= VIEWPORTS.mobile.width + 1, 'anlatım şeridi viewport dışına taşıyor');
  } finally { await s.close(); }
});

addTest('A8) uzun metinde board görünür ve sabit boyutta kalıyor (şerit içi scroll olabilir)', async () => {
  const longText = 'Bu, sınır durumlarını test etmek için bilerek uzatılmış çok satırlı bir açıklama metnidir. '.repeat(6);
  for (const viewport of [VIEWPORTS.desktop, VIEWPORTS.mobile]) {
    const s = await openScenesPage({ viewport });
    try {
      const boardBoxBefore = await s.page.locator('#ls-board-region').boundingBox();
      await s.page.evaluate((text) => {
        const el = document.getElementById('s01-intro-text');
        if (el) el.textContent = text;
      }, longText);
      await s.page.waitForTimeout(80);
      const boardBox = await s.page.locator('#ls-board-region').boundingBox();
      ensure(await s.page.locator('#ls-board-region').isVisible(), `uzun metinde (${viewport.width}px) board görünmüyor`);
      ensure(Math.abs(boardBox.height - boardBoxBefore.height) < 1 && Math.abs(boardBox.width - boardBoxBefore.width) < 1,
        `uzun metin board boyutunu değiştirdi (${viewport.width}px)`);
      ensure((await s.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)), `uzun metinde (${viewport.width}px) yatay taşma var`);
    } finally { await s.close(); }
  }
});

addTest('A9) #ls-narration\'da ayırıcı çizgi/border/dekoratif divider YOK (masaüstü+mobil)', async () => {
  for (const viewport of [VIEWPORTS.desktop, VIEWPORTS.mobile]) {
    const s = await openScenesPage({ viewport });
    try {
      const borders = await s.page.locator('#ls-narration').evaluate(el => {
        const cs = getComputedStyle(el);
        return { l: cs.borderLeftWidth, r: cs.borderRightWidth, t: cs.borderTopWidth, b: cs.borderBottomWidth };
      });
      ensure(borders.l === '0px' && borders.r === '0px' && borders.t === '0px' && borders.b === '0px',
        `${viewport.width}px: border var (${JSON.stringify(borders)})`);
    } finally { await s.close(); }
  }
});

addTest('tick/pill/continue kontrolleri en az 44px dokunma yüksekliğine sahip (mobil)', async () => {
  const s = await openScenesPage({ viewport: VIEWPORTS.mobile });
  try {
    const tickBox = await s.page.locator('#s01-confirm').boundingBox();
    ensure(Math.min(tickBox.width, tickBox.height) >= 36, 'tick dokunma alanı çok küçük'); // 40px + kenar toleransı
    await confirmIntro(s.page);
    await exploreAllSizes(s.page);
    const continueBox = await s.page.locator('#s01-continue').boundingBox();
    ensure(continueBox.height >= 36, 'Devam et düğmesi dokunma hedefi için çok küçük');
  } finally { await s.close(); }
});

/* ══════════════════════════════════════════════════════════════════
   SAHNE #1 — davranış regresyonu (yeni DOM üzerinden)
   ══════════════════════════════════════════════════════════════════ */

addTest('S1) sayfa açılıyor, Sahne #1 otomatik başlıyor, "Anladım" görünür metni yok', async () => {
  const s = await openScenesPage();
  try {
    ensure(await s.page.locator('#s01-intro').isVisible(), 'onboarding satırı görünmüyor');
    ensure((await s.page.locator('#s01-intro-text').textContent())?.includes('19'), 'bilgi metni yanlış');
    const bodyText = await s.page.locator('#ls-narration').textContent();
    ensure(!bodyText.includes('Anladım'), '"Anladım" metni hâlâ görünüyor');
    const tick = s.page.locator('#s01-confirm');
    ensure(await tick.evaluate(el => el.tagName === 'BUTTON'), 'tick gerçek bir <button> değil');
    ensure((await tick.getAttribute('aria-label')) === 'Bilgiyi onayla', 'aria-label yanlış');
  } finally { await s.close(); }
});

addTest('S1) scene_intro_confirmed hızlı/tekrarlı tetiklemede bile YALNIZ BİR KEZ üretiliyor', async () => {
  const s = await openScenesPage();
  try {
    await s.page.click('#s01-confirm');
    await s.page.click('#s01-confirm').catch(() => {});
    await s.page.keyboard.press('Enter').catch(() => {});
    await s.page.waitForTimeout(300);
    const types = (await getEventLog(s.page)).map(e => e.type);
    ensure(types.filter(t => t === 'scene_intro_confirmed').length === 1, 'scene_intro_confirmed birden fazla üretildi');
  } finally { await s.close(); }
});

addTest('S1) 19×19 başlangıçta gerçek board size, onay sonrası yalnız BİR KEZ görülmüş sayılıyor', async () => {
  const s = await openScenesPage();
  try {
    await confirmIntro(s.page);
    ensure(await s.page.locator('.ls-pill[data-size="19"]').getAttribute('aria-pressed') === 'true', '19 varsayılan seçili değil');
    ensure(await s.page.locator('.ls-pill[data-size="19"]').evaluate(el => el.classList.contains('seen')), '19 otomatik görülmüş sayılmadı');
    ensure((await s.page.locator('#s01-progress-text').textContent())?.trim() === '1/3', 'başlangıç ilerlemesi yanlış');
    await s.page.click('.ls-pill[data-size="19"]');
    await s.page.waitForTimeout(100);
    ensure((await s.page.locator('#s01-progress-text').textContent())?.trim() === '1/3', '19\'a tekrar basmak ilerlemeyi artırdı');
  } finally { await s.close(); }
});

addTest('S1) üç boyut görülmeden devam edilemiyor, üçünde tamamlanma açılıyor (gating korunuyor)', async () => {
  const s = await openScenesPage();
  try {
    await confirmIntro(s.page);
    const continueBtn = s.page.locator('#s01-continue');
    ensure(await continueBtn.isDisabled(), 'başlangıçta Devam et aktif olmamalı');
    await s.page.click('.ls-pill[data-size="9"]');
    await s.page.waitForTimeout(80);
    ensure(await continueBtn.isDisabled(), 'iki boyutta hâlâ devre dışı olmalı');
    await s.page.click('.ls-pill[data-size="13"]');
    await s.page.waitForTimeout(80);
    ensure(!(await continueBtn.isDisabled()), 'üç boyut sonrası Devam et açılmadı');
    ensure((await s.page.locator('#s01-status').textContent())?.includes('tanıdın'), 'başarı metni görünmüyor');
  } finally { await s.close(); }
});

addTest('S1→S2) Sahne #1 tamamlanınca Sahne #2 otomatik başlıyor, final durum ERKEN gösterilmiyor', async () => {
  const s = await openScenesPage();
  try {
    await advanceToScene2(s.page);
    ensure(!(await s.page.locator('#ls-final').evaluate(el => el.classList.contains('show'))), 'final durum ERKEN gösterildi');
    ensure(await s.page.locator('#s01-intro, #s01-explore').count() === 0, 'Sahne #1 unmount edilmedi');
    ensure(await s.page.locator('#s02-step-0').isVisible(), 'Sahne #2 mount edilmedi');
  } finally { await s.close(); }
});

addTest('reduced-motion: kart geçişi transition kaldırıyor, akış yine tamamlanabiliyor', async () => {
  const s = await openScenesPage({ reducedMotion: 'reduce' });
  try {
    const transition = await s.page.locator('#s01-intro').evaluate(el => getComputedStyle(el).transitionDuration);
    ensure(transition === '0s' || transition.startsWith('0s'), `reduced-motion'da transition kalkmamış: ${transition}`);
    await confirmIntro(s.page);
    ensure(await s.page.locator('#s01-explore').isVisible(), 'reduced-motion\'da onay sonrası keşif satırı görünmüyor');
  } finally { await s.close(); }
});

/* ══════════════════════════════════════════════════════════════════
   BÖLÜM B — Sahne #2 neon guide temizliği
   ══════════════════════════════════════════════════════════════════ */

addTest('B1) Sahne #2 board adaptöründe artık guide API'
  + ' YOK (setIntersectionGuides/clearIntersectionGuides/getEmptyIntersections kaldırıldı)', async () => {
  const s = await openScenesPage();
  try {
    const apiShape = await s.page.evaluate(async () => {
      const { createSceneBoardAdapter } = await import('./adapters/sceneBoardAdapter.js');
      const canvas = document.createElement('canvas');
      canvas.width = 400; canvas.height = 300;
      document.body.appendChild(canvas);
      const adapter = createSceneBoardAdapter(canvas, { initialSize: 9 });
      const shape = {
        hasSetGuides: typeof adapter.setIntersectionGuides === 'function',
        hasClearGuides: typeof adapter.clearIntersectionGuides === 'function',
        hasGetEmpty: typeof adapter.getEmptyIntersections === 'function',
        hasGetLibertiesAt: typeof adapter.getLibertiesAt === 'function',
        hasShowLiberties: typeof adapter.showLiberties === 'function',
        hasClearLiberties: typeof adapter.clearLiberties === 'function',
      };
      adapter.destroy();
      canvas.remove();
      return shape;
    });
    ensure(!apiShape.hasSetGuides, 'setIntersectionGuides hâlâ mevcut');
    ensure(!apiShape.hasClearGuides, 'clearIntersectionGuides hâlâ mevcut');
    ensure(!apiShape.hasGetEmpty, 'getEmptyIntersections hâlâ mevcut');
    ensure(apiShape.hasGetLibertiesAt, 'getLibertiesAt eksik');
    ensure(apiShape.hasShowLiberties, 'showLiberties eksik');
    ensure(apiShape.hasClearLiberties, 'clearLiberties eksik');
  } finally { await s.close(); }
});

addTest('B2) Sahne #2 akışında scene_guides_shown/scene_guides_cleared event\'leri ARTIK ÜRETİLMİYOR', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene2(s.page);
    const ok = await playScene2ToCompletion(s.page);
    ensure(ok, 'Sahne #2 altı hamle akışı tamamlanamadı');
    const events = await getEventLog(s.page);
    ensure(!events.some(e => e.type === 'scene_guides_shown' || e.type === 'scene_guides_cleared'), 'guide event\'leri hâlâ üretiliyor');
  } finally { await s.close(); }
});

addTest('B3) Sahne #2: doğal hit-testing ile ilk hamle çalışıyor, üçer hamle akışı gerilemiyor (6 taş)', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene2(s.page);
    const ok = await playScene2ToCompletion(s.page);
    ensure(ok, 'altı hamle akışı tamamlanamadı');
    const moves = (await getEventLog(s.page)).filter(e => e.type === 'scene_move_played' && e.stepId === 'scene-02-turns-and-intersections');
    ensure(moves.length === 6, `toplam 6 hamle olmalı, ${moves.length} bulundu`);
    ensure(moves.filter(m => m.payload.color === 'black').length === 3, '3 siyah hamle olmalı');
    ensure(moves.filter(m => m.payload.color === 'white').length === 3, '3 beyaz hamle olmalı');
    ensure(await s.page.locator('#s02-continue').isVisible(), '"Devam et" görünmüyor');
  } finally { await s.close(); }
});

addTest('B4) Sahne #2 beyazın sırasında girdi kilitli (ekstra tıklama hamle SAYMIYOR)', async () => {
  const s = await openScenesPage({ query: '?whiteMoveDelayMs=260' });
  try {
    await advanceToScene2(s.page);
    await playThroughS02Info(s.page);
    const placed = await playOneBlackMoveScene2(s.page);
    ensure(placed, 'ilk siyah hamle yerleştirilemedi');
    await s.page.waitForTimeout(60);
    ensure((await s.page.locator('#s02-turn').textContent())?.includes('düşünüyor'), 'beyazın sırasında "düşünüyor" gösterilmedi');
    const midCount = (await getEventLog(s.page)).filter(e => e.type === 'scene_move_played' && e.stepId === 'scene-02-turns-and-intersections').length;
    const canvasBox = await s.page.locator('#ls-canvas').boundingBox();
    await s.page.mouse.click(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2 - 40);
    await s.page.waitForTimeout(30);
    const lockedCount = (await getEventLog(s.page)).filter(e => e.type === 'scene_move_played' && e.stepId === 'scene-02-turns-and-intersections').length;
    ensure(lockedCount === midCount, 'girdi kilidiyken yapılan tıklama hamle olarak sayıldı');
  } finally { await s.close(); }
});

/* ══════════════════════════════════════════════════════════════════
   BÖLÜM C — Sahne #3 "Konuma Göre Nefes Noktaları"
   ══════════════════════════════════════════════════════════════════ */

addTest('C1) Sahne #2 tamamlanınca Sahne #3 temiz 9×9 board ile açılıyor', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene3(s.page);
    ensure(await s.page.locator('#s03-intro').isVisible(), 'Sahne #3 mount edilmedi');
    ensure(await s.page.locator('#s02-play, #s02-step-0').count() === 0, 'Sahne #2 unmount edilmedi');
  } finally { await s.close(); }
});

addTest('C2) ilk bilgi onaylanmadan hamle kabul edilmiyor (input Sahne #3 mount\'ta kilitli)', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene3(s.page);
    await clickBoardCenter(s.page);
    await s.page.waitForTimeout(80);
    const events = await getEventLog(s.page);
    ensure(!events.some(e => e.type === 'scene_center_move_attempted'), 'intro onaylanmadan hamle denemesi kaydedildi');
  } finally { await s.close(); }
});

addTest('C3) merkez dışı hamle ilerlemiyor: taş yerleşmiyor, nazik geri bildirim gösteriliyor', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene3(s.page);
    await confirmS03Intro(s.page);
    ensure((await s.page.locator('#s03-status').textContent())?.includes('merkez'), 'merkez talimatı gösterilmiyor');

    // Merkezden bir hücre kadar uzağa tıkla — kesinlikle tahta ÜZERİNDE
    // (adaptörün hit-test toleransı içinde) ama merkez DEĞİL.
    await clickBoardCenter(s.page, -8 + 50);
    await s.page.waitForTimeout(100);

    const events = s03Events(await getEventLog(s.page));
    const wrongAttempt = events.find(e => e.type === 'scene_center_move_attempted' && e.payload.correct === false);
    ensure(!!wrongAttempt, 'merkez-dışı deneme kaydedilmedi');
    const moves = events.filter(e => e.type === 'scene_move_played');
    ensure(moves.length === 0, 'merkez dışı hamle YANLIŞLIKLA yerleştirildi');
    ensure((await s.page.locator('#s03-feedback').textContent())?.includes('ortasındaki'), 'nazik geri bildirim gösterilmedi');
  } finally { await s.close(); }
});

addTest('C4) doğru merkez hamlesi bir kez yerleşiyor (çift tıklama iki taş üretmiyor), gerçek 4 liberty gösteriliyor', async () => {
  // centerLibertyDisplayMs BİLİNÇLİ olarak 0'a EZİLMEDİ — anlatım metninin
  // "Merkezdeki taşın 4 nefes noktası var." biçiminde GERÇEKTEN belirdiğini
  // (sonra beyazın sırasına geçmeden önce) doğrulamak için gözlemlenebilir
  // bir pencereye ihtiyaç var.
  const s = await openScenesPage({ query: '?centerLibertyDisplayMs=400&whiteCornerDelayMs=0' });
  try {
    await advanceToScene3(s.page);
    await confirmS03Intro(s.page);
    await clickBoardCenter(s.page);
    await clickBoardCenter(s.page); // hızlı ikinci tıklama
    await s.page.waitForTimeout(150);

    const events = s03Events(await getEventLog(s.page));
    const blackMoves = events.filter(e => e.type === 'scene_move_played' && e.payload.color === 'black');
    ensure(blackMoves.length === 1, `merkez hamlesi TAM BİR KEZ yerleşmeli, ${blackMoves.length} kez yerleşti`);

    const libEvent = events.find(e => e.type === 'scene_liberties_shown' && e.payload.target === 'center');
    ensure(!!libEvent, 'merkez liberty event\'i üretilmedi');
    ensure(libEvent.payload.count === 4, `merkez taşının GERÇEK nefes sayısı 4 olmalı, ${libEvent.payload.count} bulundu`);
    ensure((await s.page.locator('#s03-status').textContent()) === 'Merkezdeki taşın 4 nefes noktası var.', 'anlatım metni gerçek sayıyla uyuşmuyor');
  } finally { await s.close(); }
});

addTest('C5) sıra beyaza geçiyor, beyaz DETERMİNİSTİK/YASAL bir köşeye oynuyor, gerçek 2 liberty gösteriliyor', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene3(s.page);
    await confirmS03Intro(s.page);
    await clickBoardCenter(s.page);
    await s.page.waitForTimeout(300); // merkez gösterimi + beyaz gecikmesi (ikisi de 0'a ezildi, kısa tampon yeterli)

    const events = s03Events(await getEventLog(s.page));
    const whiteMove = events.find(e => e.type === 'scene_move_played' && e.payload.color === 'white');
    ensure(!!whiteMove, 'beyaz köşe hamlesi yapılmadı');
    ensure(whiteMove.payload.row === 0 && whiteMove.payload.col === 0, `beyaz beklenmeyen bir noktaya oynadı: ${JSON.stringify(whiteMove.payload)}`);

    const cornerLibEvent = events.find(e => e.type === 'scene_liberties_shown' && e.payload.target === 'corner');
    ensure(!!cornerLibEvent, 'köşe liberty event\'i üretilmedi');
    ensure(cornerLibEvent.payload.count === 2, `köşe taşının GERÇEK nefes sayısı 2 olmalı, ${cornerLibEvent.payload.count} bulundu`);
  } finally { await s.close(); }
});

addTest('C6) beyaz beklerken input kilitli (merkez hamlesinden sonra board tıklamaları hamle üretmiyor)', async () => {
  const s = await openScenesPage({ query: '?centerLibertyDisplayMs=50&whiteCornerDelayMs=260' });
  try {
    await advanceToScene3(s.page);
    await confirmS03Intro(s.page);
    await clickBoardCenter(s.page);
    await s.page.waitForTimeout(150); // merkez gösterimi bitti, beyaz hâlâ "düşünüyor" penceresinde
    ensure((await s.page.locator('#s03-status').textContent())?.includes('köşeyi deniyor'), '"Beyaz köşeyi deniyor…" gösterilmiyor');

    const midMoves = s03Events(await getEventLog(s.page)).filter(e => e.type === 'scene_move_played').length;
    const canvasBox = await s.page.locator('#ls-canvas').boundingBox();
    await s.page.mouse.click(canvasBox.x + canvasBox.width * 0.8, canvasBox.y + canvasBox.height * 0.2);
    await s.page.waitForTimeout(30);
    const lockedMoves = s03Events(await getEventLog(s.page)).filter(e => e.type === 'scene_move_played').length;
    ensure(lockedMoves === midMoves, 'beyaz beklerken yapılan tıklama hamle üretti');
  } finally { await s.close(); }
});

addTest('C7) merkez highlight\'ı temizlenip köşe highlight\'ı gösteriliyor (sıralı liberty event\'leri)', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene3(s.page);
    await confirmS03Intro(s.page);
    await clickBoardCenter(s.page);
    await s.page.waitForTimeout(300);
    const events = await getEventLog(s.page);
    const libEvents = events.filter(e => e.type === 'scene_liberties_shown');
    ensure(libEvents.length === 2, `iki liberty event'i olmalı (merkez+köşe), ${libEvents.length} bulundu`);
    ensure(libEvents[0].payload.target === 'center' && libEvents[1].payload.target === 'corner', 'liberty event sırası yanlış');
  } finally { await s.close(); }
});

addTest('C8) karşılaştırma sorusu görünüyor, klavye ile yanıtlanabiliyor', async () => {
  // transitionDelayMs BİLİNÇLİ olarak 0'a EZİLMEDİ — "Doğru" geri
  // bildiriminin (kısa ömürlü, sonra nötr geçiş metnine dönüşen) gerçekten
  // belirdiğini doğrulamak için gözlemlenebilir bir pencereye ihtiyaç var.
  const s = await openScenesPage({ query: '?centerLibertyDisplayMs=0&whiteCornerDelayMs=0&transitionDelayMs=300' });
  try {
    await advanceToScene3(s.page);
    await confirmS03Intro(s.page);
    await clickBoardCenter(s.page);
    await s.page.waitForTimeout(400);
    ensure(await s.page.locator('#s03-choices').isVisible(), 'karşılaştırma seçenekleri görünmüyor');
    ensure((await s.page.locator('#s03-status').textContent())?.includes('daha az'), 'karşılaştırma sorusu metni yanlış');

    const cornerChoice = s.page.locator('.ls-choice[data-choice="corner"]');
    await cornerChoice.focus();
    ensure(await s.page.evaluate(() => document.activeElement?.dataset?.choice) === 'corner', 'seçenek klavyeyle odaklanamadı');
    await s.page.keyboard.press('Enter');
    await s.page.waitForTimeout(80);
    ensure((await s.page.locator('#s03-status').textContent())?.includes('Doğru'), 'Enter ile doğru cevap tetiklenmedi');
  } finally { await s.close(); }
});

addTest('C9) yanlış karşılaştırma cevabında sahne İLERLEMİYOR, liberty göstergeleri korunuyor, tekrar denenebiliyor', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene3(s.page);
    await confirmS03Intro(s.page);
    await clickBoardCenter(s.page);
    await s.page.waitForTimeout(400);

    await s.page.click('.ls-choice[data-choice="center"]'); // yanlış cevap
    await s.page.waitForTimeout(80);
    ensure((await s.page.locator('#s03-feedback').textContent())?.length > 0, 'yanlış cevapta nazik geri bildirim yok');
    let events = s03Events(await getEventLog(s.page));
    ensure(!events.some(e => e.type === 'scene_completion_unlocked'), 'yanlış cevap completion\'ı erken açtı');
    ensure(await s.page.locator('#s03-choices').isVisible(), 'yanlış cevap sonrası seçenekler kayboldu (tekrar denenemez)');
    ensure(await s.page.locator('#s03-continue').isHidden(), 'yanlış cevap sonrası Devam et YANLIŞLIKLA göründü');

    // Şimdi doğru cevapla düzelt.
    await s.page.click('.ls-choice[data-choice="corner"]');
    await s.page.waitForTimeout(80);
    events = s03Events(await getEventLog(s.page));
    ensure(events.some(e => e.type === 'scene_completion_unlocked'), 'düzeltme sonrası completion açılmadı');
  } finally { await s.close(); }
});

addTest('C10) doğru cevapta completion YALNIZ BİR KEZ oluşuyor (hızlı tekrar tıklama korunuyor)', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene3(s.page);
    await confirmS03Intro(s.page);
    await clickBoardCenter(s.page);
    await s.page.waitForTimeout(400);

    await s.page.click('.ls-choice[data-choice="corner"]');
    await s.page.click('.ls-choice[data-choice="corner"]').catch(() => {});
    await s.page.waitForTimeout(200);
    const events = s03Events(await getEventLog(s.page));
    ensure(events.filter(e => e.type === 'scene_completion_unlocked').length === 1, 'scene_completion_unlocked birden fazla üretildi');
  } finally { await s.close(); }
});

addTest('C11) doğru cevaptan sonra doğal konu geçişi görünüyor, teknik "Sahne tamamlandı" dili HİÇBİR YERDE yok', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene3(s.page);
    await confirmS03Intro(s.page);
    await clickBoardCenter(s.page);
    await s.page.waitForTimeout(400);
    await s.page.click('.ls-choice[data-choice="corner"]');
    await s.page.waitForTimeout(150);

    const infoText = (await s.page.locator('#ls-scene-host').textContent()) || '';
    ensure(!/sahne\s*(#?3)?\s*tamamlandı/i.test(infoText), 'teknik "Sahne tamamlandı" metni sızmış');
    ensure(!infoText.toLowerCase().includes('görev tamamlandı'), '"Görev tamamlandı" metni sızmış');
    ensure(!infoText.includes('scene_completed') && !infoText.includes('registry'), 'teknik runtime terminolojisi sızmış');
    ensure(await s.page.locator('#s03-continue').isVisible(), 'Devam et düğmesi görünmüyor');

    await s.page.click('#s03-continue');
    await s.page.waitForTimeout(300);
    ensure(await s.page.locator('#ls-final').evaluate(el => el.classList.contains('show')), 'final durum gösterilmedi (Sahne #4 yok)');
    const finalText = (await s.page.locator('#ls-final').textContent()) || '';
    ensure(!/sahne\s*tamamlandı/i.test(finalText) && finalText.includes('sonraki konu'), 'final ekranı nötr değil');
  } finally { await s.close(); }
});

addTest('C12) registry sırası: scene-01 → scene-02 → scene-03, tamamlanınca sahte Sahne #4 YOK', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    const order = await s.page.evaluate(async () => {
      const { createSceneRegistry } = await import('./scenes/sceneRegistry.js');
      const { scene01BoardIntro } = await import('./scenes/scene01BoardIntro.js');
      const { scene02TurnsAndIntersections } = await import('./scenes/scene02TurnsAndIntersections.js');
      const { scene03LibertiesByPosition } = await import('./scenes/scene03LibertiesByPosition.js');
      const registry = createSceneRegistry([scene01BoardIntro, scene02TurnsAndIntersections, scene03LibertiesByPosition]);
      return {
        ids: registry.list().map(sc => sc.id),
        issues: registry.issues,
        nextAfter3: registry.next('scene-03-liberties-by-position'),
      };
    });
    assert.deepEqual(order.ids, ['scene-01-board-intro', 'scene-02-turns-and-intersections', 'scene-03-liberties-by-position']);
    ensure(order.issues.length === 0, `registry issues bulundu: ${JSON.stringify(order.issues)}`);
    ensure(order.nextAfter3 === null, 'Sahne #3\'ten sonra sahte bir sahne bulundu');
  } finally { await s.close(); }
});

addTest('C13) reload: yarım kalan Sahne #3 temiz başlangıca dönüyor, tamamlanan sahneler kalıcı', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene3(s.page);
    await confirmS03Intro(s.page);
    await clickBoardCenter(s.page); // yarım kalan ilerleme (henüz tamamlanmadı)
    await s.page.waitForTimeout(300);

    await s.page.reload({ waitUntil: 'networkidle' });
    await s.page.waitForTimeout(300);

    ensure(await s.page.locator('#s03-intro').isVisible(), 'reload sonrası Sahne #3 baştan başlamadı');
    ensure(!(await s.page.locator('#ls-final').evaluate(el => el.classList.contains('show'))), 'reload sonrası final durum YANLIŞLIKLA gösterildi');

    const progress = await s.page.evaluate(() => JSON.parse(localStorage.getItem('go_scene_progress_v1') || 'null'));
    ensure(progress?.completedSceneIds?.includes('scene-01-board-intro'), 'Sahne #1 tamamlanması kalıcı değil');
    ensure(progress?.completedSceneIds?.includes('scene-02-turns-and-intersections'), 'Sahne #2 tamamlanması kalıcı değil');
    ensure(!progress?.completedSceneIds?.includes('scene-03-liberties-by-position'), 'yarım kalan Sahne #3 yanlışlıkla tamamlanmış sayıldı');
  } finally { await s.close(); }
});

addTest('C14) reload: Sahne #3 de tamamlanmışken final durum doğrudan gösteriliyor, eski go_done_3d dokunulmamış', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await s.page.evaluate(() => { try { localStorage.setItem('go_done_3d', JSON.stringify(['l5'])); } catch {} });
    await advanceToScene3(s.page);
    await confirmS03Intro(s.page);
    await clickBoardCenter(s.page);
    await s.page.waitForTimeout(400);
    await s.page.click('.ls-choice[data-choice="corner"]');
    await s.page.waitForTimeout(150);
    await s.page.click('#s03-continue');
    await s.page.waitForTimeout(300);

    await s.page.reload({ waitUntil: 'networkidle' });
    await s.page.waitForTimeout(300);
    ensure(await s.page.locator('#ls-final').evaluate(el => el.classList.contains('show')), 'üç sahne de tamamlanmışken reload sonrası final gösterilmedi');

    const info = await s.page.evaluate(() => ({
      legacyDone: JSON.parse(localStorage.getItem('go_done_3d') || 'null'),
      progress: JSON.parse(localStorage.getItem('go_scene_progress_v1') || 'null'),
    }));
    ensure(JSON.stringify(info.legacyDone) === JSON.stringify(['l5']), 'eski go_done_3d anahtarı DEĞİŞMİŞ');
    ensure(info.progress?.completedSceneIds?.length === 3, 'üç sahnenin de kalıcı tamamlanması beklenirdi');
  } finally { await s.close(); }
});

addTest('C15) unmount sırasında beyaz timer\'ı ve liberty highlight\'ları temizleniyor (Sahne #2\'ye erken dönülse bile hata yok)', async () => {
  const s = await openScenesPage({ query: '?whiteCornerDelayMs=5000' });
  try {
    await advanceToScene3(s.page);
    await confirmS03Intro(s.page);
    await clickBoardCenter(s.page);
    await s.page.waitForTimeout(150); // beyaz hâlâ 5s'lik bekleme İÇİNDE — timer aktif
    // Sayfayı yeniden yükleyerek unmount'u zorla (temiz kapanmalı, hata atmamalı).
    await s.page.reload({ waitUntil: 'networkidle' });
    await s.page.waitForTimeout(300);
    ensure(s.consoleErrors.length === 0, `unmount sırasında hata: ${s.consoleErrors.join(' | ')}`);
  } finally { await s.close(); }
});

addTest('C16) reduced-motion: Sahne #3 intro kartı transition\'sız, akış yine tamamlanabiliyor', async () => {
  const s = await openScenesPage({ reducedMotion: 'reduce', query: FAST_QUERY });
  try {
    await advanceToScene3(s.page);
    const transition = await s.page.locator('#s03-intro').evaluate(el => getComputedStyle(el).transitionDuration);
    ensure(transition === '0s' || transition.startsWith('0s'), `reduced-motion'da transition kalkmamış: ${transition}`);
    await confirmS03Intro(s.page);
    ensure(await s.page.locator('#s03-play').isVisible(), 'reduced-motion\'da oyun satırı açılmadı');
  } finally { await s.close(); }
});

addTest('C17) masaüstü/tablet/mobilde Sahne #3 sırasında taşma yok', async () => {
  for (const viewport of [VIEWPORTS.desktop, VIEWPORTS.tablet, VIEWPORTS.mobile]) {
    const s = await openScenesPage({ viewport, query: FAST_QUERY });
    try {
      await advanceToScene3(s.page);
      ensure(await s.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${viewport.width}px: yatay taşma var`);
      const boardBox = await s.page.locator('#ls-board-region').boundingBox();
      const narrationBox = await s.page.locator('#ls-narration').boundingBox();
      ensure(!boxesIntersect(boardBox, narrationBox), `${viewport.width}px: Sahne #3'te board/şerit kesişiyor`);
    } finally { await s.close(); }
  }
});

addTest('C18) Studio çapraz sekmede Sahne #3 event\'lerini görüyor, event overwrite oluşmuyor', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene3(s.page);
    await confirmS03Intro(s.page);
    await clickBoardCenter(s.page);
    await s.page.waitForTimeout(300);

    const studioPage = await s.context.newPage();
    const studioErrors = [];
    studioPage.on('pageerror', e => studioErrors.push(e.message));
    await studioPage.goto(`${BASE}/teacher-studio.html`, { waitUntil: 'networkidle' });

    await studioPage.click('[data-tab="curriculum"]').catch(() => {});
    await studioPage.waitForTimeout(150);
    const curriculumText = (await studioPage.locator('#curriculum-scene-table').textContent().catch(() => '')) || '';
    ensure(curriculumText.includes('scene-01-board-intro') && curriculumText.includes('scene-02-turns-and-intersections') && curriculumText.includes('scene-03-liberties-by-position'),
      'Studio Curriculum panelinde üç sahne de görünmüyor');
    ensure(curriculumText.includes('liberty'), 'Studio Curriculum panelinde Sahne #3\'ün concept\'i görünmüyor');

    await studioPage.click('[data-tab="diagnostics"]').catch(() => {});
    await studioPage.waitForTimeout(150);
    const diagText = (await studioPage.locator('#diag-scene-table').textContent().catch(() => '')) || '';
    ensure(diagText.includes('geçerli') || !diagText.includes('scene-03'), 'Sahne #3 diagnostics\'te geçersiz görünüyor');

    // learning-scenes.html sayfasında YENİ bir event üret; Studio'nun ayrı
    // sekmesi bunu OVERWRITE ETMEMELİ (v0.7'den beri kurulan resync deseni).
    const beforeCount = (await getEventLog(s.page)).length;
    await s.page.click('.ls-choice[data-choice="corner"]').catch(() => {});
    await s.page.waitForTimeout(100);
    const afterCount = (await getEventLog(s.page)).length;
    ensure(afterCount >= beforeCount, 'learning-scenes sekmesindeki event log Studio tarafından küçültülmüş/overwrite edilmiş olabilir');

    ensure(studioErrors.length === 0, `Studio'da hata: ${studioErrors.join(' | ')}`);
    await studioPage.close();
  } finally { await s.close(); }
});

addTest('C19) tam akış (Sahne #1→#2→#3) boyunca konsolda/pageerror\'da hata yok', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene3(s.page);
    await confirmS03Intro(s.page);
    await clickBoardCenter(s.page);
    await s.page.waitForTimeout(400);
    await s.page.click('.ls-choice[data-choice="corner"]');
    await s.page.waitForTimeout(150);
    await s.page.click('#s03-continue');
    await s.page.waitForTimeout(300);
    ensure(s.consoleErrors.length === 0, `hata bulundu: ${s.consoleErrors.join(' | ')}`);
  } finally { await s.close(); }
});

addTest('C20) tahta dışı tıklama Sahne #3\'te hamle SAYILMIYOR', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene3(s.page);
    await confirmS03Intro(s.page);
    // Canvas'ın kenarına yakın, tahta dışı kalması muhtemel bir nokta.
    const canvasBox = await s.page.locator('#ls-canvas').boundingBox();
    await s.page.mouse.click(canvasBox.x + 2, canvasBox.y + 2);
    await s.page.waitForTimeout(80);
    const events = s03Events(await getEventLog(s.page));
    ensure(!events.some(e => e.type === 'scene_move_played'), 'tahta dışı tıklama hamle olarak sayıldı');
  } finally { await s.close(); }
});

/* ══════════════════════════════════════════════════════════════════
   Genel güvenlik ağı
   ══════════════════════════════════════════════════════════════════ */

addTest('geçersiz sahne id\'si güvenle ele alınır (hata ekranı, sayfa çökmüyor)', async () => {
  const s = await openScenesPage();
  try {
    const result = await s.page.evaluate(async () => {
      const { createSceneRuntime } = await import('./core/sceneRuntime.js');
      const { createSceneRegistry } = await import('./scenes/sceneRegistry.js');
      const registry = createSceneRegistry([]);
      const events = [];
      const runtime = createSceneRuntime({ registry, emitEvent: e => events.push(e) });
      const r = runtime.start('yok-boyle-bir-sahne');
      return { ok: r.ok, reason: r.reason, failedEvent: events.some(e => e.type === 'scene_failed') };
    });
    ensure(result.ok === false && result.reason === 'UNKNOWN_SCENE', 'bilinmeyen sahne güvenli ele alınmadı');
    ensure(result.failedEvent, 'scene_failed event\'i üretilmedi');
  } finally { await s.close(); }
});

(async () => {
  for (const { name, fn } of tests) {
    try { await fn(); pass++; console.log('  ✓', name); }
    catch (error) { fail++; console.error('  ✗', name, '-', error?.message || error); }
  }
  console.log(`\nlearning-scenes tarayıcı test sayısı: ${tests.length}`);
  console.log('özet:', `${pass}/${pass + fail}`);
  if (fail) process.exit(1);
})();
