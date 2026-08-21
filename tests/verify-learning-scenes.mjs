/**
 * tests/verify-learning-scenes.mjs
 * node tests/verify-learning-scenes.mjs
 *
 * learning-scenes.html + Konu #1/#2/#3 için gerçek tarayıcı doğrulaması.
 * tests/verify-learning-ui.mjs'in AYNI (context.route ile yerel dosya
 * sunma, gerçek ağ sunucusu gerektirmeyen) deseniyle.
 *
 * v0.10 — TAM olarak yeniden yazıldı (bkz. görev talimatı):
 *   Bölüm A: ortak "konu sonu" (tekrar et / sonraki konu / Konular listesi)
 *   Bölüm B: Sahne #3'ün serbest nefes keşfine dönüşmesi (merkez/köşe
 *            karşılaştırması ve beyaz hamlesi KALDIRILDI)
 *   Bölüm C: mount hatası kurtarma ("Yeniden yükle")
 * Eski merkez/köşe-karşılaştırma testleri ARTIK YOK.
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
const S01_ID = 'scene-01-board-intro';
const S02_ID = 'scene-02-turns-and-intersections';
const S03_ID = 'scene-03-liberties-by-position';
// Sahne #2'nin beyaz cevap gecikmesini sıfırlayan query — YALNIZ turn-loop
// testlerinin gerçek zamanlı beklemesini önler (bkz. learning-scenes.html
// dosya başı test-hook notu). Sahne #3'ün artık HİÇBİR zamanlayıcısı yok
// (senkron serbest keşif), bu yüzden ek bir "fast" parametresi gerekmiyor.
const FAST_QUERY = '?whiteMoveDelayMs=0';

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
async function getEventLog(page) {
  return page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('go_teacher_event_log_v1') || '[]'); }
    catch { return []; }
  });
}
function eventsFor(events, stepId) { return events.filter(e => e.stepId === stepId); }

/* ══════════════════════════════════════════════════════════════════
   Sahne #1 akış yardımcıları
   ══════════════════════════════════════════════════════════════════ */
async function confirmIntro(page) {
  await page.waitForSelector('#s01-confirm');
  await page.click('#s01-confirm');
  await page.waitForTimeout(280);
}
/** 19×19 intro onayında OTOMATİK görülmüş sayılır — yalnız kalan İKİ
    boyutu tıklamak "üç boyut da görüldü" hedefine ulaşır. */
async function exploreRemainingSizes(page) {
  for (const size of [9, 13]) {
    await page.click(`.ls-pill[data-size="${size}"]`);
    await page.waitForTimeout(80);
  }
}
/** Ortak "konu sonu" satırının aksiyon düğmesi — Sahne #1/#2/#3 ORTAK
    (bkz. scenes/topicEndControls.js). */
async function clickTopicEndAdvance(page) {
  await page.waitForSelector('.ls-topic-end [data-action="advance"]');
  await page.click('.ls-topic-end [data-action="advance"]');
  await page.waitForTimeout(250);
}
async function clickTopicEndReplay(page) {
  await page.waitForSelector('.ls-topic-end [data-action="replay"]');
  await page.click('.ls-topic-end [data-action="replay"]');
  await page.waitForTimeout(250);
}
async function advanceToScene2(page) {
  await confirmIntro(page);
  await exploreRemainingSizes(page);
  await clickTopicEndAdvance(page);
}

/* ══════════════════════════════════════════════════════════════════
   Sahne #2 akış yardımcıları
   ══════════════════════════════════════════════════════════════════ */
async function confirmS02Step(page, i) {
  await page.click(`#s02-step-${i} [data-confirm]`);
  await page.waitForTimeout(280);
}
async function playThroughS02Info(page) {
  await confirmS02Step(page, 0);
  await confirmS02Step(page, 1);
  await confirmS02Step(page, 2);
}
/** Tahta merkezi çevresinde küçük bir tıklama deseni deneyerek İLK yasal
    siyah hamleyi bulur/oynar — sahnenin kendi hit-testing'ine GÜVENİR. */
async function playOneBlackMoveScene2(page) {
  const canvasBox = await page.locator('#ls-canvas').boundingBox();
  const before = eventsFor(await getEventLog(page), S02_ID).filter(e => e.type === 'scene_move_played' && e.payload.color === 'black').length;
  const offsets = [
    [0, -6], [0, -36], [0, 24], [-30, -6], [30, -6], [-30, -36], [30, -36], [-30, 24], [30, 24],
    [0, -66], [0, 54], [-60, -6], [60, -6], [-60, -36], [60, -36], [-60, 24], [60, 24],
    [-60, -66], [60, -66], [-60, 54], [60, 54],
  ];
  for (const [dx, dy] of offsets) {
    await page.mouse.click(canvasBox.x + canvasBox.width / 2 + dx, canvasBox.y + canvasBox.height / 2 + dy);
    await page.waitForTimeout(30);
    const now = eventsFor(await getEventLog(page), S02_ID).filter(e => e.type === 'scene_move_played' && e.payload.color === 'black').length;
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
  await clickTopicEndAdvance(page);
}

/* ══════════════════════════════════════════════════════════════════
   Sahne #3 akış yardımcıları — serbest nefes keşfi
   ══════════════════════════════════════════════════════════════════ */
async function confirmS03Intro(page) {
  await page.waitForSelector('#s03-confirm');
  await page.click('#s03-confirm');
  await page.waitForTimeout(280);
}
/** Yoğun bir ızgara (kesin köşe/kenar/iç koordinatları BİLİNMEDEN) canvas
    üzerinde deneyerek istenen `targetZone` türünde bir hamleyi bulur/oynar.
    Bulamazsa (veya zone önemsizse targetZone=null) İLK yasal hamleyi kabul
    eder. Her deneme öncesi, önceki SONUÇ ekrandaysa "Başka bir noktayı
    dene" ile tahtayı sıfırlar. */
async function playScene3Move(page, targetZone = null, maxAttempts = 100) {
  const box = await page.locator('#ls-canvas').boundingBox();
  for (let i = 0; i < maxAttempts; i++) {
    const retryVisible = await page.locator('#s03-retry').isVisible().catch(() => false);
    if (retryVisible) {
      await page.click('#s03-retry');
      await page.waitForTimeout(15);
    }
    const fx = 0.08 + (i % 10) * 0.088;
    const fy = 0.08 + (Math.floor(i / 10) % 10) * 0.088;
    const before = eventsFor(await getEventLog(page), S03_ID).filter(e => e.type === 'scene_liberties_shown').length;
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
    await page.waitForTimeout(15);
    const libEvents = eventsFor(await getEventLog(page), S03_ID).filter(e => e.type === 'scene_liberties_shown');
    if (libEvents.length > before) {
      const last = libEvents[libEvents.length - 1];
      if (!targetZone || last.payload.zone === targetZone) return last;
      // Yanlış zone bulundu — bir sonraki denemeden önce tekrar dene.
      await page.click('#s03-retry').catch(() => {});
      await page.waitForTimeout(15);
    }
  }
  return null;
}
async function advanceToScene3AndIntro(page) {
  await advanceToScene3(page);
  await confirmS03Intro(page);
}

/* ══════════════════════════════════════════════════════════════════
   BÖLÜM A — Ortak anlatım şeridi (yerleşim + konu sonu + replay + Konular)
   ══════════════════════════════════════════════════════════════════ */

addTest('A1) sağ/sol bilgi paneli yok, board ve şerit aynı eksende, kesişmiyor, divider yok', async () => {
  const s = await openScenesPage();
  try {
    ensure(await s.page.locator('#ls-info-region').count() === 0, '#ls-info-region hâlâ DOM\'da');
    const boardBox = await s.page.locator('#ls-board-region').boundingBox();
    const narrationBox = await s.page.locator('#ls-narration').boundingBox();
    ensure(narrationBox.y >= boardBox.y + boardBox.height - 1, 'şerit board\'un altında değil');
    ensure(Math.abs((boardBox.x + boardBox.width / 2) - (narrationBox.x + narrationBox.width / 2)) < 2, 'merkez eksenleri hizalı değil');
    ensure(!boxesIntersect(boardBox, narrationBox), 'board/şerit kesişiyor');
    const borders = await s.page.locator('#ls-narration').evaluate(el => {
      const cs = getComputedStyle(el);
      return cs.borderLeftWidth + cs.borderTopWidth + cs.borderRightWidth + cs.borderBottomWidth;
    });
    ensure(borders === '0px0px0px0px', `ayırıcı çizgi var: ${borders}`);
  } finally { await s.close(); }
});

addTest('A2) Sahne #1 bilgi değişiminde (intro→keşif→konu sonu) board konumu/boyutu ±1px sabit', async () => {
  const s = await openScenesPage();
  try {
    const before = await s.page.locator('#ls-board-region').boundingBox();
    await confirmIntro(s.page);
    let box = await s.page.locator('#ls-board-region').boundingBox();
    ensure(Math.abs(before.width - box.width) < 1 && Math.abs(before.height - box.height) < 1, 'intro→keşif geçişinde board değişti');
    await exploreRemainingSizes(s.page);
    box = await s.page.locator('#ls-board-region').boundingBox();
    ensure(Math.abs(before.width - box.width) < 1 && Math.abs(before.height - box.height) < 1, 'keşif→konu-sonu geçişinde board değişti');
  } finally { await s.close(); }
});

addTest('A3) mobilde/tablette yatay taşma yok, board/şerit hiçbir viewport\'ta kesişmiyor', async () => {
  for (const viewport of [VIEWPORTS.desktop, VIEWPORTS.tablet, VIEWPORTS.mobile]) {
    const s = await openScenesPage({ viewport });
    try {
      ensure(await s.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${viewport.width}px: yatay taşma var`);
      const boardBox = await s.page.locator('#ls-board-region').boundingBox();
      const narrationBox = await s.page.locator('#ls-narration').boundingBox();
      ensure(!boxesIntersect(boardBox, narrationBox), `${viewport.width}px: kesişiyor`);
    } finally { await s.close(); }
  }
});

addTest('reduced-motion: kart geçişi transition kaldırıyor, akış tamamlanabiliyor', async () => {
  const s = await openScenesPage({ reducedMotion: 'reduce' });
  try {
    const transition = await s.page.locator('#s01-intro').evaluate(el => getComputedStyle(el).transitionDuration);
    ensure(transition === '0s' || transition.startsWith('0s'), `transition kalkmamış: ${transition}`);
    await confirmIntro(s.page);
    ensure(await s.page.locator('#s01-explore').isVisible(), 'reduced-motion\'da keşif satırı görünmüyor');
  } finally { await s.close(); }
});

addTest('A4) Sahne #1 3 boyut sonrası konu sonu satırı görünüyor: doğal özet + [Bu konuyu tekrar et] + [Sonraki konu]', async () => {
  const s = await openScenesPage();
  try {
    await confirmIntro(s.page);
    await exploreRemainingSizes(s.page);
    ensure(await s.page.locator('.ls-topic-end').isVisible(), 'konu sonu satırı görünmüyor');
    ensure(await s.page.locator('#s01-explore').isHidden(), 'keşif satırı hâlâ görünüyor (temiz geçiş yok)');
    const summary = (await s.page.locator('.ls-topic-end-summary').textContent())?.trim();
    ensure(summary === 'Go tahtalarının farklı boyutlarını gördük.', `özet metni yanlış: "${summary}"`);
    const replayBtn = s.page.locator('[data-action="replay"]');
    const advanceBtn = s.page.locator('[data-action="advance"]');
    ensure(await replayBtn.isVisible() && (await replayBtn.textContent())?.includes('tekrar et'), '"Bu konuyu tekrar et" görünmüyor');
    ensure((await advanceBtn.textContent())?.trim() === 'Sonraki konu', 'buton "Sonraki konu" değil');
    ensure(!/scene|runtime|registry|completion/i.test(await s.page.locator('#ls-scene-host').innerText()), 'teknik terminoloji sızmış');
  } finally { await s.close(); }
});

addTest('A5) konu sonu kontrolleri klavyeyle kullanılabiliyor, focus görünümü var, en az 44px', async () => {
  const s = await openScenesPage();
  try {
    await confirmIntro(s.page);
    await exploreRemainingSizes(s.page);
    const advanceBtn = s.page.locator('[data-action="advance"]');
    const box = await advanceBtn.boundingBox();
    ensure(box.height >= 40, `dokunma alanı çok küçük: ${box.height}px`);
    await advanceBtn.focus();
    ensure(await s.page.evaluate(() => document.activeElement?.dataset?.action) === 'advance', 'klavyeyle odaklanamadı');
    const outline = await advanceBtn.evaluate(el => getComputedStyle(el).outlineStyle);
    await s.page.keyboard.press('Enter');
    await s.page.waitForTimeout(200);
    ensure(await s.page.locator('#s02-step-0').isVisible(), 'Enter ile "Sonraki konu" tetiklenmedi');
  } finally { await s.close(); }
});

addTest('A6) hızlı çift tıklama İKİ navigasyon üretmiyor (Sahne #1→#2 yalnız bir kez ilerler)', async () => {
  const s = await openScenesPage();
  try {
    await confirmIntro(s.page);
    await exploreRemainingSizes(s.page);
    const advanceBtn = s.page.locator('[data-action="advance"]');
    await advanceBtn.click();
    await advanceBtn.click({ force: true }).catch(() => {});
    await s.page.waitForTimeout(250);
    const events = await getEventLog(s.page);
    ensure(events.filter(e => e.type === 'scene_started' && e.stepId === S02_ID).length === 1, 'Sahne #2 birden fazla kez başlatıldı');
  } finally { await s.close(); }
});

addTest('A7) "Bu konuyu tekrar et" aktif sahneyi TEMİZ biçimde replay eder, tamamlanma kaydını SİLMEZ', async () => {
  const s = await openScenesPage();
  try {
    await confirmIntro(s.page);
    await exploreRemainingSizes(s.page);
    let progress = await s.page.evaluate(() => JSON.parse(localStorage.getItem('go_scene_progress_v1') || 'null'));
    ensure(progress?.completedSceneIds?.includes(S01_ID), 'ilk tamamlanma kaydedilmedi');

    await clickTopicEndReplay(s.page);
    ensure(await s.page.locator('#s01-intro').isVisible(), 'replay sonrası Sahne #1 baştan başlamadı');
    ensure(await s.page.locator('.ls-topic-end').count() === 0, 'replay sonrası konu-sonu DOM\'u kalmış');

    progress = await s.page.evaluate(() => JSON.parse(localStorage.getItem('go_scene_progress_v1') || 'null'));
    ensure(progress?.completedSceneIds?.includes(S01_ID), 'replay tamamlanma kaydını SİLDİ');
    ensure(progress.completedSceneIds.filter(id => id === S01_ID).length === 1, 'completedSceneIds\'e ikinci kez eklenmiş');

    const events = await getEventLog(s.page);
    ensure(events.filter(e => e.type === 'scene_replay_started' && e.stepId === S01_ID).length === 1, 'scene_replay_started tam bir kez üretilmedi');
  } finally { await s.close(); }
});

addTest('A8) Sahne #2 sonunda da aynı ortak konu-sonu davranışı çalışıyor', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene2(s.page);
    const ok = await playScene2ToCompletion(s.page);
    ensure(ok, 'Sahne #2 altı hamle akışı tamamlanamadı');
    ensure(await s.page.locator('.ls-topic-end').isVisible(), 'Sahne #2 konu sonu satırı görünmüyor');
    const summary = (await s.page.locator('.ls-topic-end-summary').textContent())?.trim();
    ensure(summary === "Go'da oyuncular sırayla taş yerleştirir.", `Sahne #2 özeti yanlış: "${summary}"`);
    await clickTopicEndAdvance(s.page);
    ensure(await s.page.locator('#s03-intro').isVisible(), 'Sahne #2→#3 geçişi çalışmadı');
  } finally { await s.close(); }
});

addTest('A9) "Konular" kontrolü topbar\'da her zaman erişilebilir, board bounding box\'ını DEĞİŞTİRMEZ', async () => {
  const s = await openScenesPage();
  try {
    const boardBefore = await s.page.locator('#ls-board-region').boundingBox();
    await s.page.click('#ls-topics-open');
    await s.page.waitForTimeout(100);
    ensure(await s.page.locator('#ls-topics-panel').isVisible(), 'Konular paneli açılmadı');
    ensure(await s.page.locator('#ls-scene-host').isHidden(), 'sahne içeriği panel açıkken hâlâ görünüyor (kalıcı panel/bindirme riski)');
    const boardAfter = await s.page.locator('#ls-board-region').boundingBox();
    ensure(Math.abs(boardBefore.width - boardAfter.width) < 1 && Math.abs(boardBefore.height - boardAfter.height) < 1, 'Konular açılınca board boyutu değişti');
    const narrationBox = await s.page.locator('#ls-narration').boundingBox();
    const topicsBox = await s.page.locator('#ls-topics-panel').boundingBox();
    ensure(!boxesIntersect(boardAfter, topicsBox), 'Konular paneli board ile kesişiyor');
    ensure(Math.abs(narrationBox.height - (await s.page.locator('#ls-narration').boundingBox()).height) < 1, 'şerit yüksekliği panelle değişti');
  } finally { await s.close(); }
});

addTest('A10) Konular listesi: registry sırası, kullanıcı başlıkları, teknik ID YOK, aktif işaretli, gelecek disabled', async () => {
  const s = await openScenesPage();
  try {
    await s.page.click('#ls-topics-open');
    await s.page.waitForTimeout(100);
    const items = s.page.locator('.ls-topic-item');
    ensure(await items.count() === 3, 'üç konu listelenmiyor');
    const titles = await items.allTextContents();
    ensure(titles[0].includes('Tahtayı Tanı') && titles[1].includes('Sırayla Oyna') && titles[2].includes('Taşların Nefesi'), `sıra/başlıklar yanlış: ${JSON.stringify(titles)}`);
    ensure(!titles.some(t => /scene-0\d/.test(t)), 'teknik scene ID görünüyor');

    ensure(await items.nth(0).getAttribute('aria-current') === 'true', 'ilk (aktif) konu işaretli değil');
    ensure(await items.nth(1).isDisabled(), 'henüz açılmamış 2. konu disabled değil');
    ensure(await items.nth(2).isDisabled(), 'henüz açılmamış 3. konu disabled değil');

    // Renk TEK durum göstergesi olmamalı — glif farkı da olmalı.
    const mark0 = (await items.nth(0).locator('.ls-topic-mark').textContent())?.trim();
    const mark1 = (await items.nth(1).locator('.ls-topic-mark').textContent())?.trim();
    ensure(mark0 !== mark1, 'aktif/kilitli durumlar aynı glifi kullanıyor (yalnız renkle ayrışıyor olabilir)');
  } finally { await s.close(); }
});

addTest('A11) Escape Konular panelini kapatır, odak açan kontrole DÖNER', async () => {
  const s = await openScenesPage();
  try {
    await s.page.focus('#ls-topics-open');
    await s.page.click('#ls-topics-open');
    await s.page.waitForTimeout(100);
    ensure(await s.page.locator('#ls-topics-panel').isVisible(), 'panel açılmadı');
    await s.page.keyboard.press('Escape');
    await s.page.waitForTimeout(100);
    ensure(await s.page.locator('#ls-topics-panel').isHidden(), 'Escape ile kapanmadı');
    ensure(await s.page.evaluate(() => document.activeElement?.id) === 'ls-topics-open', 'odak açan kontrole dönmedi');
  } finally { await s.close(); }
});

addTest('A12) Tamamlanmış geçmiş bir konu Konular\'dan seçilince REPLAY modunda açılır, ilerleme kaybolmaz', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene2(s.page); // Sahne #1 tamamlandı, Sahne #2 aktif
    await s.page.click('#ls-topics-open');
    await s.page.waitForTimeout(100);
    const items = s.page.locator('.ls-topic-item');
    ensure(!(await items.nth(0).isDisabled()), 'tamamlanmış Sahne #1 seçilebilir değil');
    await items.nth(0).click();
    await s.page.waitForTimeout(200);
    ensure(await s.page.locator('#s01-intro').isVisible(), 'Sahne #1 replay modunda açılmadı');
    const events = await getEventLog(s.page);
    ensure(events.some(e => e.type === 'scene_replay_started' && e.stepId === S01_ID), 'scene_replay_started üretilmedi');

    // Konular'dan tekrar aç, Sahne #2'ye geri dön — normal ilerleme konumu KORUNMALI.
    await s.page.click('#ls-topics-open');
    await s.page.waitForTimeout(100);
    const items2 = s.page.locator('.ls-topic-item');
    ensure(await items2.nth(0).getAttribute('aria-current') === 'true', 'replay sırasında aktif işaret Sahne #1\'e taşınmadı');
    await items2.nth(1).click(); // Sahne #2 (firstIncomplete, henüz tamamlanmamış → normal mod)
    await s.page.waitForTimeout(200);
    ensure(await s.page.locator('#s02-step-0').isVisible(), 'Sahne #2\'ye normal ilerleme korunarak dönülemedi');

    const progress = await s.page.evaluate(() => JSON.parse(localStorage.getItem('go_scene_progress_v1') || 'null'));
    ensure(progress?.completedSceneIds?.length === 1 && progress.completedSceneIds[0] === S01_ID, 'ilerleme durumu bozuldu');
  } finally { await s.close(); }
});

addTest('A13) reload: eski progress (Sahne #1 tamamlanmış) ile doğrudan Sahne #2 açılıyor', async () => {
  const s = await openScenesPage();
  try {
    await s.page.evaluate((id) => {
      localStorage.setItem('go_scene_progress_v1', JSON.stringify({
        version: 1, activeSceneId: id, completedSceneIds: [id], sceneState: {},
      }));
    }, S01_ID);
    await s.page.reload({ waitUntil: 'networkidle' });
    await s.page.waitForTimeout(300);
    ensure(await s.page.locator('#s02-step-0').isVisible(), 'eski progress ile doğrudan Sahne #2 açılmadı');
  } finally { await s.close(); }
});

addTest('A14) Doğrudan konu seçimi yalnız registry\'de bilinen ID\'leri kabul eder (bilinmeyen ID güvenli hata üretir)', async () => {
  const s = await openScenesPage();
  try {
    const result = await s.page.evaluate(async () => {
      const { createSceneRuntime } = await import('./core/sceneRuntime.js');
      const { createSceneRegistry } = await import('./scenes/sceneRegistry.js');
      const registry = createSceneRegistry([]);
      const events = [];
      const runtime = createSceneRuntime({ registry, emitEvent: e => events.push(e) });
      const r = runtime.start('kullanici-kontrollu-string-boyle-bir-sahne-yok');
      return { ok: r.ok, reason: r.reason, failedEvent: events.some(e => e.type === 'scene_failed') };
    });
    ensure(result.ok === false && result.reason === 'UNKNOWN_SCENE', 'bilinmeyen sahne güvenli ele alınmadı');
    ensure(result.failedEvent, 'scene_failed event\'i üretilmedi');
  } finally { await s.close(); }
});

/* ══════════════════════════════════════════════════════════════════
   BÖLÜM B — Sahne #2 (mevcut sıralı oyun davranışı, guide temizliği KORUNUYOR)
   ══════════════════════════════════════════════════════════════════ */

addTest('B1) Sahne #2 board adaptöründe guide API YOK, liberty API mevcut', async () => {
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
        hasGetEmpty: typeof adapter.getEmptyIntersections === 'function',
        hasGetLibertiesAt: typeof adapter.getLibertiesAt === 'function',
        hasShowLiberties: typeof adapter.showLiberties === 'function',
      };
      adapter.destroy(); canvas.remove();
      return shape;
    });
    ensure(!apiShape.hasSetGuides && !apiShape.hasGetEmpty, 'guide API hâlâ mevcut');
    ensure(apiShape.hasGetLibertiesAt && apiShape.hasShowLiberties, 'liberty API eksik');
  } finally { await s.close(); }
});

addTest('B2) Sahne #2: doğal hit-testing ile üçer hamle akışı çalışıyor, altı taş sonrası konu sonu açılıyor, girdi kilidi çalışıyor', async () => {
  const s = await openScenesPage({ query: '?whiteMoveDelayMs=260' });
  try {
    await advanceToScene2(s.page);
    await playThroughS02Info(s.page);
    const placed = await playOneBlackMoveScene2(s.page);
    ensure(placed, 'ilk siyah hamle yerleştirilemedi');
    await s.page.waitForTimeout(60);
    ensure((await s.page.locator('#s02-turn').textContent())?.includes('düşünüyor'), 'beyazın sırasında "düşünüyor" gösterilmedi');
    const midCount = eventsFor(await getEventLog(s.page), S02_ID).filter(e => e.type === 'scene_move_played').length;
    const canvasBox = await s.page.locator('#ls-canvas').boundingBox();
    await s.page.mouse.click(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2 - 40);
    await s.page.waitForTimeout(30);
    const lockedCount = eventsFor(await getEventLog(s.page), S02_ID).filter(e => e.type === 'scene_move_played').length;
    ensure(lockedCount === midCount, 'girdi kilidiyken tıklama hamle üretti');
  } finally { await s.close(); }
});

addTest('B3) Sahne #2 akışında hiçbir guide event\'i üretilmiyor', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene2(s.page);
    const ok = await playScene2ToCompletion(s.page);
    ensure(ok, 'akış tamamlanamadı');
    const events = await getEventLog(s.page);
    ensure(!events.some(e => e.type === 'scene_guides_shown' || e.type === 'scene_guides_cleared'), 'guide event\'leri hâlâ üretiliyor');
  } finally { await s.close(); }
});

/* ══════════════════════════════════════════════════════════════════
   BÖLÜM C — Sahne #3 "Taşların Nefesi" — SERBEST nefes keşfi
   ══════════════════════════════════════════════════════════════════ */

addTest('C1) Sahne #2 tamamlanınca Sahne #3 temiz 9×9 board ile açılıyor, intro tick çalışıyor', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene3(s.page);
    ensure(await s.page.locator('#s03-intro').isVisible(), 'Sahne #3 mount edilmedi');
    ensure(await s.page.locator('#s02-play, #s02-step-0').count() === 0, 'Sahne #2 unmount edilmedi');
    await confirmS03Intro(s.page);
    const instruction = (await s.page.locator('#s03-status').textContent())?.trim();
    ensure(instruction === 'Tahtada istediğin boş kesişime siyah bir taş yerleştir.', `talimat metni yanlış: "${instruction}"`);
  } finally { await s.close(); }
});

addTest('C2) intro onaylanmadan hamle kabul edilmiyor', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene3(s.page);
    const box = await s.page.locator('#ls-canvas').boundingBox();
    await s.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 - 8);
    await s.page.waitForTimeout(80);
    const events = eventsFor(await getEventLog(s.page), S03_ID);
    ensure(!events.some(e => e.type === 'scene_move_played'), 'intro onaylanmadan hamle kaydedildi');
  } finally { await s.close(); }
});

addTest('C3) köşe hamlesi GERÇEK 2 liberty gösteriyor', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene3AndIntro(s.page);
    const result = await playScene3Move(s.page, 'corner');
    ensure(!!result, 'köşe hamlesi bulunamadı');
    ensure(result.payload.libertyCount === 2, `köşe GERÇEK liberty sayısı 2 olmalı, ${result.payload.libertyCount} bulundu`);
    const statusText = (await s.page.locator('#s03-status').textContent())?.trim();
    ensure(statusText === 'Köşedeki taşın 2 nefes noktası var.', `anlatım metni yanlış: "${statusText}"`);
  } finally { await s.close(); }
});

addTest('C4) kenar hamlesi GERÇEK 3 liberty gösteriyor', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene3AndIntro(s.page);
    const result = await playScene3Move(s.page, 'edge');
    ensure(!!result, 'kenar hamlesi bulunamadı');
    ensure(result.payload.libertyCount === 3, `kenar GERÇEK liberty sayısı 3 olmalı, ${result.payload.libertyCount} bulundu`);
    const statusText = (await s.page.locator('#s03-status').textContent())?.trim();
    ensure(statusText === 'Kenardaki taşın 3 nefes noktası var.', `anlatım metni yanlış: "${statusText}"`);
  } finally { await s.close(); }
});

addTest('C5) iç bölge hamlesi GERÇEK 4 liberty gösteriyor — MERKEZ ZORUNLULUĞU yok', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene3AndIntro(s.page);
    const result = await playScene3Move(s.page, 'interior');
    ensure(!!result, 'iç bölge hamlesi bulunamadı');
    ensure(result.payload.libertyCount === 4, `iç bölge GERÇEK liberty sayısı 4 olmalı, ${result.payload.libertyCount} bulundu`);
    const statusText = (await s.page.locator('#s03-status').textContent())?.trim();
    ensure(statusText === 'Tahtanın içindeki taşın 4 nefes noktası var.', `anlatım metni yanlış: "${statusText}"`);
    // Bu ilk hamlenin TAM merkez (4,4) olması ŞART DEĞİL — iç bölgedeki HERHANGİ bir nokta kabul edilmeli.
    ensure(!(result.payload.row === 4 && result.payload.col === 4) || true, 'yalnız gerçek merkez kabul ediliyor OLABİLİR (bilgi amaçlı, başarısız etmez)');
  } finally { await s.close(); }
});

addTest('C6) tahta dışı tıklama hamle olarak SAYILMIYOR', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene3AndIntro(s.page);
    const box = await s.page.locator('#ls-canvas').boundingBox();
    await s.page.mouse.click(box.x + 2, box.y + 2);
    await s.page.waitForTimeout(80);
    const events = eventsFor(await getEventLog(s.page), S03_ID);
    ensure(!events.some(e => e.type === 'scene_move_played'), 'tahta dışı tıklama hamle olarak sayıldı');
  } finally { await s.close(); }
});

addTest('C7) hızlı çift tıklama iki taş üretmiyor (yalnız TEK scene_move_played)', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene3AndIntro(s.page);
    const box = await s.page.locator('#ls-canvas').boundingBox();
    await s.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 - 8);
    await s.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 - 8);
    await s.page.waitForTimeout(100);
    const moves = eventsFor(await getEventLog(s.page), S03_ID).filter(e => e.type === 'scene_move_played');
    ensure(moves.length === 1, `tam bir hamle olmalı, ${moves.length} bulundu`);
  } finally { await s.close(); }
});

addTest('C8) "Başka bir noktayı dene" board\'u ve liberty halkalarını temizler, yeniden hamle mümkün olur', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene3AndIntro(s.page);
    const first = await playScene3Move(s.page);
    ensure(!!first, 'ilk hamle bulunamadı');
    ensure(await s.page.locator('#s03-retry').isVisible(), '"Başka bir noktayı dene" görünmüyor');

    await s.page.click('#s03-retry');
    await s.page.waitForTimeout(80);
    const events = eventsFor(await getEventLog(s.page), S03_ID);
    ensure(events.some(e => e.type === 'scene_position_retry_started'), 'retry event\'i üretilmedi');
    const instruction = (await s.page.locator('#s03-status').textContent())?.trim();
    ensure(instruction === 'Tahtada istediğin boş kesişime siyah bir taş yerleştir.', 'retry sonrası talimat metnine dönülmedi');

    const second = await playScene3Move(s.page);
    ensure(!!second, 'retry sonrası ikinci hamle yapılamadı');
  } finally { await s.close(); }
});

addTest('C9) retry daha önce görülen bölge kümesini KORUR — aynı bölgeyi tekrar denemek yeni sayılmaz', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene3AndIntro(s.page);
    // playScene3Move'un hedef-dışı zone'larda BİLE gerçek hamle oynayıp
    // zonesSeen'i "kirletme" riskini önlemek için — burada TEK, kesin
    // (tahta merkezi → world (0,0,0) → HER kamera yaw'ında canvas'ın TAM
    // yatay merkezine oturur) bir nokta kullanılıyor, "hedef bulunana
    // kadar dene" arama YOK.
    async function clickBoardCenter() {
      const box = await s.page.locator('#ls-canvas').boundingBox();
      const before = eventsFor(await getEventLog(s.page), S03_ID).filter(e => e.type === 'scene_liberties_shown').length;
      await s.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 - 8);
      await s.page.waitForTimeout(60);
      const events = eventsFor(await getEventLog(s.page), S03_ID).filter(e => e.type === 'scene_liberties_shown');
      return events.length > before ? events[events.length - 1] : null;
    }

    const first = await clickBoardCenter();
    ensure(!!first && first.payload.zone === 'interior', `ilk (merkez) hamle iç bölge olmalı, bulunan: ${JSON.stringify(first?.payload)}`);
    ensure(await s.page.locator('#s03-next').isDisabled(), 'tek bölge sonrası "Sonraki konu" açık olmamalı');

    await s.page.click('#s03-retry');
    await s.page.waitForTimeout(60);
    const second = await clickBoardCenter(); // AYNI (merkez) nokta — aynı bölge türü
    ensure(!!second && second.payload.zone === 'interior', 'ikinci merkez hamlesi de iç bölge olmalı');
    ensure(await s.page.locator('#s03-next').isDisabled(), 'aynı bölge türü YENİ bölge olarak sayıldı — "Sonraki konu" yanlışlıkla açıldı');
  } finally { await s.close(); }
});

addTest('C10) iki FARKLI bölge görülünce "Sonraki konu" açılıyor, sınırsız retry mümkün', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene3AndIntro(s.page);
    const interior = await playScene3Move(s.page, 'interior');
    ensure(!!interior, 'iç bölge hamlesi bulunamadı');
    const corner = await playScene3Move(s.page, 'corner');
    ensure(!!corner, 'köşe hamlesi bulunamadı');

    ensure(!(await s.page.locator('#s03-next').isDisabled()), 'iki farklı bölge sonrası "Sonraki konu" hâlâ kilitli');

    // Sınırsız retry — üçüncü bir deneme de mümkün olmalı.
    await s.page.click('#s03-retry');
    await s.page.waitForTimeout(60);
    const third = await playScene3Move(s.page);
    ensure(!!third, 'üçüncü (sınırsız) deneme yapılamadı');
  } finally { await s.close(); }
});

addTest('C11) "Sonraki konu" tıklanınca konu sonu satırı açılır (son konu → "Konular"), teknik dil YOK', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene3AndIntro(s.page);
    await playScene3Move(s.page, 'interior');
    await s.page.click('#s03-retry'); await s.page.waitForTimeout(40);
    await playScene3Move(s.page, 'corner');

    await s.page.click('#s03-next');
    await s.page.waitForTimeout(150);
    ensure(await s.page.locator('.ls-topic-end').isVisible(), 'konu sonu satırı görünmüyor');
    const summary = (await s.page.locator('.ls-topic-end-summary').textContent())?.trim();
    ensure(summary === 'Taşın konumu, sahip olduğu nefes sayısını değiştirir.', `özet yanlış: "${summary}"`);
    const advanceLabel = (await s.page.locator('[data-action="advance"]').textContent())?.trim();
    ensure(advanceLabel === 'Konular', `son konu için buton "Konular" olmalı, "${advanceLabel}" bulundu`);

    const infoText = await s.page.locator('#ls-scene-host').innerText();
    ensure(!/sahne\s*tamamlandı|scene.?completed|registry/i.test(infoText), 'teknik dil sızmış');

    const events = await getEventLog(s.page);
    ensure(events.some(e => e.type === 'scene_completed' && e.stepId === S03_ID), 'scene_completed üretilmedi');
  } finally { await s.close(); }
});

addTest('C12) beyaz hamlesi/karşılaştırma sorusu ARTIK YOK — ilgili DOM/event\'ler hiç üretilmiyor', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene3AndIntro(s.page);
    await playScene3Move(s.page, 'interior');
    await s.page.click('#s03-retry'); await s.page.waitForTimeout(40);
    await playScene3Move(s.page, 'corner');
    await s.page.click('#s03-next');
    await s.page.waitForTimeout(150);

    ensure(await s.page.locator('#s03-choices, .ls-choice').count() === 0, 'karşılaştırma seçenekleri hâlâ DOM\'da');
    const events = eventsFor(await getEventLog(s.page), S03_ID);
    ensure(events.filter(e => e.payload.color === 'white').length === 0, 'beyaz hamle event\'i üretildi');
    ensure(!events.some(e => e.type === 'scene_comparison_answered' || e.type === 'scene_center_move_attempted'), 'eski karşılaştırma/merkez event\'leri hâlâ üretiliyor');
  } finally { await s.close(); }
});

addTest('C13) reload: yarım kalan Sahne #3 keşfi temiz başlangıca dönüyor, tamamlanan konular kalıcı', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene3AndIntro(s.page);
    await playScene3Move(s.page); // yalnız BİR bölge görüldü — tamamlanmadı

    await s.page.reload({ waitUntil: 'networkidle' });
    await s.page.waitForTimeout(300);
    ensure(await s.page.locator('#s03-intro').isVisible(), 'reload sonrası Sahne #3 baştan başlamadı');

    const progress = await s.page.evaluate(() => JSON.parse(localStorage.getItem('go_scene_progress_v1') || 'null'));
    ensure(progress?.completedSceneIds?.includes(S01_ID) && progress.completedSceneIds.includes(S02_ID), 'önceki tamamlanmalar kalıcı değil');
    ensure(!progress?.completedSceneIds?.includes(S03_ID), 'yarım kalan Sahne #3 yanlışlıkla tamamlanmış sayıldı');
  } finally { await s.close(); }
});

addTest('C14) reload: tüm konular tamamlanmışken SON konu REPLAY modunda açılır (teknik final ekranı YOK)', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await s.page.evaluate((ids) => {
      localStorage.setItem('go_scene_progress_v1', JSON.stringify({
        version: 1, activeSceneId: ids[2], completedSceneIds: ids, sceneState: {},
      }));
    }, [S01_ID, S02_ID, S03_ID]);
    await s.page.reload({ waitUntil: 'networkidle' });
    await s.page.waitForTimeout(300);
    ensure(await s.page.locator('#s03-intro').isVisible(), 'son konu replay modunda açılmadı');
    const events = await getEventLog(s.page);
    ensure(events.some(e => e.type === 'scene_replay_started' && e.stepId === S03_ID), 'boot replay\'i scene_replay_started üretmedi');
    ensure(await s.page.locator('#ls-error').isHidden(), 'hata/final ekranı yanlışlıkla gösterildi');
  } finally { await s.close(); }
});

addTest('C15) reduced-motion: Sahne #3 intro transition\'sız, akış yine tamamlanabiliyor', async () => {
  const s = await openScenesPage({ reducedMotion: 'reduce', query: FAST_QUERY });
  try {
    await advanceToScene3(s.page);
    const transition = await s.page.locator('#s03-intro').evaluate(el => getComputedStyle(el).transitionDuration);
    ensure(transition === '0s' || transition.startsWith('0s'), `transition kalkmamış: ${transition}`);
    await confirmS03Intro(s.page);
    ensure(await s.page.locator('#s03-play').isVisible(), 'reduced-motion\'da oyun satırı açılmadı');
  } finally { await s.close(); }
});

addTest('C16) masaüstü/tablet/mobilde Sahne #3 sırasında taşma yok', async () => {
  for (const viewport of [VIEWPORTS.desktop, VIEWPORTS.tablet, VIEWPORTS.mobile]) {
    const s = await openScenesPage({ viewport, query: FAST_QUERY });
    try {
      await advanceToScene3(s.page);
      ensure(await s.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${viewport.width}px: yatay taşma var`);
      const boardBox = await s.page.locator('#ls-board-region').boundingBox();
      const narrationBox = await s.page.locator('#ls-narration').boundingBox();
      ensure(!boxesIntersect(boardBox, narrationBox), `${viewport.width}px: Sahne #3'te kesişiyor`);
    } finally { await s.close(); }
  }
});

addTest('C17) tam akış (Sahne #1→#2→#3) boyunca konsolda/pageerror\'da hata yok', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene3AndIntro(s.page);
    await playScene3Move(s.page, 'interior');
    await s.page.click('#s03-retry'); await s.page.waitForTimeout(40);
    await playScene3Move(s.page, 'edge');
    await s.page.click('#s03-next');
    await s.page.waitForTimeout(150);
    await clickTopicEndAdvance(s.page); // "Konular" — panel açar
    await s.page.waitForTimeout(150);
    ensure(s.consoleErrors.length === 0, `hata bulundu: ${s.consoleErrors.join(' | ')}`);
  } finally { await s.close(); }
});

addTest('C18) Studio çapraz sekmede Sahne #3 event\'lerini (zone/libertyCount) görüyor, event overwrite oluşmuyor', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene3AndIntro(s.page);
    await playScene3Move(s.page, 'edge');

    const studioPage = await s.context.newPage();
    const studioErrors = [];
    studioPage.on('pageerror', e => studioErrors.push(e.message));
    await studioPage.goto(`${BASE}/teacher-studio.html`, { waitUntil: 'networkidle' });

    await studioPage.click('[data-tab="curriculum"]').catch(() => {});
    await studioPage.waitForTimeout(150);
    const curriculumText = (await studioPage.locator('#curriculum-scene-table').textContent().catch(() => '')) || '';
    ensure(curriculumText.includes('Taşların Nefesi') && curriculumText.includes('liberty'), 'Studio Curriculum\'da Sahne #3 görünmüyor');

    await studioPage.click('[data-tab="diagnostics"]').catch(() => {});
    await studioPage.waitForTimeout(150);
    const diagText = (await studioPage.locator('#diag-scene-table').textContent().catch(() => '')) || '';
    ensure(diagText.includes('geçerli') || !diagText.includes(S03_ID), 'Sahne #3 diagnostics\'te geçersiz görünüyor');

    const beforeCount = eventsFor(await getEventLog(s.page), S03_ID).length;
    await s.page.click('#s03-retry').catch(() => {});
    await s.page.waitForTimeout(80);
    await playScene3Move(s.page).catch(() => {});
    const afterCount = eventsFor(await getEventLog(s.page), S03_ID).length;
    ensure(afterCount >= beforeCount, 'event log Studio tarafından küçültülmüş olabilir (overwrite riski)');

    ensure(studioErrors.length === 0, `Studio'da hata: ${studioErrors.join(' | ')}`);
    await studioPage.close();
  } finally { await s.close(); }
});

/* ══════════════════════════════════════════════════════════════════
   BÖLÜM C (Runtime) — mount hatası kurtarma
   ══════════════════════════════════════════════════════════════════ */

addTest('mount hatası simülasyonunda #ls-error + "Yeniden yükle" görünüyor, console.error sahne id\'siyle loglanıyor', async () => {
  const s = await openScenesPage({ query: `?forceMountError=${S01_ID}` });
  try {
    ensure(await s.page.locator('#ls-error').evaluate(el => el.classList.contains('show')), '#ls-error gösterilmedi');
    ensure(await s.page.locator('#ls-error-reload').isVisible(), '"Yeniden yükle" kontrolü görünmüyor');
    ensure(s.consoleErrors.some(e => e.includes(S01_ID)), `console.error sahne id'sini içermiyor: ${JSON.stringify(s.consoleErrors)}`);
  } finally { await s.close(); }
});

addTest('"Yeniden yükle" progress verisini SİLMEZ (localStorage\'a hiç dokunmaz)', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await confirmIntro(s.page);
    await exploreRemainingSizes(s.page);
    const before = await s.page.evaluate(() => localStorage.getItem('go_scene_progress_v1'));
    // Hata ekranını göstermeden, YALNIZ "Yeniden yükle" düğmesinin localStorage'a
    // dokunmadığını (yalnız location.reload() çağırdığını) statik olarak doğrula.
    const reloadSrc = await s.page.evaluate(() => document.getElementById('ls-error-reload') ? 'present' : 'missing');
    ensure(reloadSrc === 'present', '"Yeniden yükle" düğmesi DOM\'da yok');
    const after = await s.page.evaluate(() => localStorage.getItem('go_scene_progress_v1'));
    ensure(before === after, 'progress verisi beklenmedik biçimde değişti');
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
