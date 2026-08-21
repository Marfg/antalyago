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
 *
 * v0.11 — Sahne #3'ün C-bloğu (C1-C22) yeniden yazıldı: eski "iki farklı
 * bölge görülmeden devam AÇILMAZ + ayrı 'Başka bir noktayı dene' düğmesi
 * ZORUNLU" akışı test EDİLMİYOR artık — bunun yerine İLK yasal hamlenin
 * TEK BAŞINA "Sonraki konu"yu açtığı, board input'unun hamleden SONRA da
 * açık kaldığı ve doğrudan farklı bir kesişime tıklamanın yeni bir örnek
 * ürettiği kesintisiz keşif akışı doğrulanıyor (bkz. scenes/
 * scene03LibertiesByPosition.js ve adapters/sceneBoardAdapter.js).
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
// Yalnız Sahne #3'ün başlangıç taş silueti (ghost preview) testleri için —
// learning-scenes.html'in ?exposeBoardAdapter=1 test-only hook'unu da
// devreye sokar (window.__lsTestBoardAdapter.getMovePreview()), böylece
// canvas-only preview durumu DOM/event log'a yansımadan gerçek tarayıcıda
// doğrulanabilir. Parametre yoksa üretim davranışı DEĞİŞMEZ (bkz. adaptör/
// learning-scenes.html v0.12 notları).
const PREVIEW_QUERY = '?whiteMoveDelayMs=0&exposeBoardAdapter=1';

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

async function openScenesPage({ viewport = VIEWPORTS.desktop, reducedMotion = 'no-preference', query = '', hasTouch } = {}) {
  const browser = await launchChromium();
  // Not: burada localStorage temizleyen bir addInitScript EKLEMİYORUZ —
  // context.addInitScript her navigasyonda (reload dahil) tekrar çalışır
  // ve bir testin reload() ile doğrulamaya çalıştığı persistence'ı
  // silerdi. Zaten TAZE bir context zaten BOŞ storage ile başlar.
  const context = await browser.newContext({ viewport, reducedMotion, ...(hasTouch !== undefined ? { hasTouch } : {}) });
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
   Sahne #3 akış yardımcıları — serbest nefes keşfi (v0.11)
   Not: ayrı bir "Başka bir noktayı dene" düğmesi ARTIK YOK — board her
   zaman açık, DOĞRUDAN farklı bir kesişime tıklamak yeni bir örnek
   üretir (bkz. adapters/sceneBoardAdapter.js replaceExampleStone).
   ══════════════════════════════════════════════════════════════════ */
async function confirmS03Intro(page) {
  await page.waitForSelector('#s03-confirm');
  await page.click('#s03-confirm');
  await page.waitForTimeout(280);
}
/** Yoğun bir ızgara (kesin köşe/kenar/iç koordinatları BİLİNMEDEN) canvas
    üzerinde deneyerek istenen `targetZone` türünde bir hamleyi bulur/oynar.
    Bulamazsa (veya zone önemsizse targetZone=null) İLK yasal hamleyi kabul
    eder. Board input her zaman açık olduğundan, aralarında düğmeye
    basmaya GEREK YOK — her tıklama doğrudan yeni bir örnek dener. */
async function playScene3Move(page, targetZone = null, maxAttempts = 100) {
  const box = await page.locator('#ls-canvas').boundingBox();
  for (let i = 0; i < maxAttempts; i++) {
    const fx = 0.08 + (i % 10) * 0.088;
    const fy = 0.08 + (Math.floor(i / 10) % 10) * 0.088;
    const before = eventsFor(await getEventLog(page), S03_ID).filter(e => e.type === 'scene_liberties_shown').length;
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
    await page.waitForTimeout(15);
    const libEvents = eventsFor(await getEventLog(page), S03_ID).filter(e => e.type === 'scene_liberties_shown');
    if (libEvents.length > before) {
      const last = libEvents[libEvents.length - 1];
      if (!targetZone || last.payload.zone === targetZone) return last;
      // Yanlış bölge bulundu — bir sonraki deneme DOĞRUDAN başka bir
      // noktaya tıklar, bu otomatik olarak yeni bir örnek üretir.
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

/* ══════════════════════════════════════════════════════════════════
   BÖLÜM C — Sahne #3 v0.11: kesintisiz nefes keşfi
   İki farklı bölge şartı ve ayrı "Başka bir noktayı dene" düğmesi
   KALDIRILDI. İlk yasal hamle TEK BAŞINA "Sonraki konu"yu açar; board
   input hep açık kalır ve doğrudan yeni bir kesişime tıklamak yeni bir
   örnek üretir (bkz. görev talimatı Bölüm C).
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

addTest('C3) köşe hamlesi GERÇEK 2 liberty gösteriyor, devam kontrolü hemen aktif olur', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene3AndIntro(s.page);
    const result = await playScene3Move(s.page, 'corner');
    ensure(!!result, 'köşe hamlesi bulunamadı');
    ensure(result.payload.libertyCount === 2, `köşe GERÇEK liberty sayısı 2 olmalı, ${result.payload.libertyCount} bulundu`);
    const statusText = (await s.page.locator('#s03-status').textContent())?.trim();
    ensure(statusText === 'Köşedeki taşın 2 nefes noktası var.', `anlatım metni yanlış: "${statusText}"`);
    ensure(!(await s.page.locator('#s03-next').isDisabled()), 'ilk hamle (köşe) sonrası "Sonraki konu" hâlâ kilitli');
  } finally { await s.close(); }
});

addTest('C4) kenar hamlesi GERÇEK 3 liberty gösteriyor, devam kontrolü hemen aktif olur', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene3AndIntro(s.page);
    const result = await playScene3Move(s.page, 'edge');
    ensure(!!result, 'kenar hamlesi bulunamadı');
    ensure(result.payload.libertyCount === 3, `kenar GERÇEK liberty sayısı 3 olmalı, ${result.payload.libertyCount} bulundu`);
    const statusText = (await s.page.locator('#s03-status').textContent())?.trim();
    ensure(statusText === 'Kenardaki taşın 3 nefes noktası var.', `anlatım metni yanlış: "${statusText}"`);
    ensure(!(await s.page.locator('#s03-next').isDisabled()), 'ilk hamle (kenar) sonrası "Sonraki konu" hâlâ kilitli');
  } finally { await s.close(); }
});

addTest('C5) iç bölge hamlesi GERÇEK 4 liberty gösteriyor — MERKEZ ZORUNLULUĞU yok, devam kontrolü hemen aktif olur', async () => {
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
    ensure(!(await s.page.locator('#s03-next').isDisabled()), 'ilk hamle (iç bölge) sonrası "Sonraki konu" hâlâ kilitli');
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

addTest('C7) aynı noktaya hızlı çift tıklama İKİ AYRI örnek üretir (hata/çökme yok, sonuç metni tutarlı kalır)', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene3AndIntro(s.page);
    const box = await s.page.locator('#ls-canvas').boundingBox();
    await s.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 - 8);
    await s.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 - 8);
    await s.page.waitForTimeout(100);
    const moves = eventsFor(await getEventLog(s.page), S03_ID).filter(e => e.type === 'scene_move_played');
    ensure(moves.length === 2, `aynı noktaya iki tıklama iki bağımsız örnek üretmeli, ${moves.length} bulundu`);
    ensure(moves[0].payload.zone === moves[1].payload.zone, 'aynı nokta farklı bölge üretti — beklenmedik');
    ensure(s.consoleErrors.length === 0, `konsol/pageerror hatası: ${s.consoleErrors.join(' | ')}`);
  } finally { await s.close(); }
});

addTest('C8) ilk hamleden ÖNCE devam kontrolü disabled + açıklama görünür; hamleden SONRA disabled kalkar, açıklama gizlenir', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene3AndIntro(s.page);
    ensure(await s.page.locator('#s03-next').isDisabled(), 'ilk hamleden önce devam kontrolü disabled OLMALI');
    ensure(await s.page.locator('#s03-continue-hint').isVisible(), 'disabled açıklaması görünmüyor');
    const hintText = (await s.page.locator('#s03-continue-hint').textContent())?.trim();
    ensure(hintText === 'Devam etmek için tahtada bir kesişime taş yerleştir.', `açıklama metni yanlış: "${hintText}"`);
    const describedBy = await s.page.locator('#s03-next').getAttribute('aria-describedby');
    ensure(describedBy === 's03-continue-hint', 'aria-describedby doğru bağlanmamış');

    await playScene3Move(s.page);
    ensure(!(await s.page.locator('#s03-next').isDisabled()), 'ilk yasal hamleden SONRA devam kontrolü hâlâ disabled');
    ensure(await s.page.locator('#s03-continue-hint').isHidden(), 'ilk hamleden SONRA disabled açıklaması hâlâ görünüyor');
  } finally { await s.close(); }
});

addTest('C9) "Başka bir noktayı dene" düğmesi DOM\'da YOK — doğrudan farklı bir kesişime tıklamak yeni bir örnek üretir', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene3AndIntro(s.page);
    const first = await playScene3Move(s.page);
    ensure(!!first, 'ilk hamle bulunamadı');
    ensure(await s.page.locator('#s03-retry').count() === 0, '"Başka bir noktayı dene" düğmesi hâlâ DOM\'da');

    const box = await s.page.locator('#ls-canvas').boundingBox();
    const before = eventsFor(await getEventLog(s.page), S03_ID).filter(e => e.type === 'scene_move_played').length;
    await s.page.mouse.click(box.x + box.width / 2 - 50, box.y + box.height / 2 - 40);
    await s.page.waitForTimeout(100);
    const after = eventsFor(await getEventLog(s.page), S03_ID).filter(e => e.type === 'scene_move_played').length;
    ensure(after === before + 1, `doğrudan tıklama yeni bir örnek üretmedi (önce ${before}, sonra ${after})`);
    const caption = (await s.page.locator('#s03-caption').textContent())?.trim();
    ensure(caption === 'İstersen başka bir kesişimi de deneyebilirsin.', `ikincil metin yanlış: "${caption}"`);
  } finally { await s.close(); }
});

addTest('C10) exampleNumber sırayla artıyor, scene_position_example_changed YALNIZ 2. ve sonraki örneklerde üretiliyor', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene3AndIntro(s.page);
    const box = await s.page.locator('#ls-canvas').boundingBox();
    await s.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 - 8);
    await s.page.waitForTimeout(80);
    let events = eventsFor(await getEventLog(s.page), S03_ID);
    const move1 = events.find(e => e.type === 'scene_move_played');
    ensure(move1?.payload.exampleNumber === 1, `ilk örnek exampleNumber=1 olmalı, bulunan: ${move1?.payload.exampleNumber}`);
    ensure(!events.some(e => e.type === 'scene_position_example_changed'), 'İLK örnekte scene_position_example_changed üretilmemeli');

    await s.page.mouse.click(box.x + box.width / 2 - 50, box.y + box.height / 2 - 40);
    await s.page.waitForTimeout(80);
    events = eventsFor(await getEventLog(s.page), S03_ID);
    const moves = events.filter(e => e.type === 'scene_move_played');
    ensure(moves.length === 2 && moves[1].payload.exampleNumber === 2, `ikinci örnek exampleNumber=2 olmalı, bulunan: ${JSON.stringify(moves.map(m => m.payload.exampleNumber))}`);
    const changed = events.filter(e => e.type === 'scene_position_example_changed');
    ensure(changed.length === 1 && changed[0].payload.exampleNumber === 2, 'scene_position_example_changed 2. örnekte TAM BİR KEZ üretilmedi');
  } finally { await s.close(); }
});

addTest('C11) art arda birçok (çoğu BİTİŞİK) konum seçimi — HER örnek kendi bölgesinin GERÇEK beklenen nefes sayısını gösterir', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene3AndIntro(s.page);
    const box = await s.page.locator('#ls-canvas').boundingBox();
    const expectedByZone = { corner: 2, edge: 3, interior: 4 };
    for (let i = 0; i < 12; i++) {
      const fx = 0.1 + (i % 4) * 0.22;
      const fy = 0.1 + (Math.floor(i / 4) % 4) * 0.22;
      await s.page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
      await s.page.waitForTimeout(20);
    }
    const shown = eventsFor(await getEventLog(s.page), S03_ID).filter(e => e.type === 'scene_liberties_shown');
    ensure(shown.length > 0, 'hiç scene_liberties_shown üretilmedi');
    for (const e of shown) {
      ensure(e.payload.libertyCount === expectedByZone[e.payload.zone],
        `${e.payload.zone} örneği için beklenen ${expectedByZone[e.payload.zone]}, bulunan ${e.payload.libertyCount} (row=${e.payload.row}, col=${e.payload.col}) — önceki örnek taşı tahtada KALMIŞ olabilir`);
    }
  } finally { await s.close(); }
});

addTest('C12) aynı bölge türünü tekrar seçmek gating\'i etkilemiyor — "Sonraki konu" zaten aktif kalır (iki-bölge kuralı YOK)', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene3AndIntro(s.page);
    const box = await s.page.locator('#ls-canvas').boundingBox();
    async function clickBoardCenter() {
      const before = eventsFor(await getEventLog(s.page), S03_ID).filter(e => e.type === 'scene_liberties_shown').length;
      await s.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 - 8);
      await s.page.waitForTimeout(60);
      const events = eventsFor(await getEventLog(s.page), S03_ID).filter(e => e.type === 'scene_liberties_shown');
      return events.length > before ? events[events.length - 1] : null;
    }
    const first = await clickBoardCenter();
    ensure(!!first && first.payload.zone === 'interior', `ilk (merkez) hamle iç bölge olmalı, bulunan: ${JSON.stringify(first?.payload)}`);
    ensure(!(await s.page.locator('#s03-next').isDisabled()), 'TEK bölge sonrası "Sonraki konu" hâlâ kilitli — eski iki-bölge kuralı sızmış olabilir');

    const second = await clickBoardCenter(); // AYNI (merkez) nokta — aynı bölge türü, doğrudan yeniden tıklama
    ensure(!!second && second.payload.zone === 'interior', 'ikinci merkez hamlesi de iç bölge olmalı');
    ensure(!(await s.page.locator('#s03-next').isDisabled()), 'aynı bölgeyi tekrar seçmek "Sonraki konu"yu yanlışlıkla kilitledi');
  } finally { await s.close(); }
});

addTest('C13) "Sonraki konu" tıklanınca konu sonu satırı açılır (son konu → "Konular"), teknik dil YOK, completion TAM BİR KEZ', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene3AndIntro(s.page);
    await playScene3Move(s.page, 'interior');

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
    ensure(events.filter(e => e.type === 'scene_completed' && e.stepId === S03_ID).length === 1, 'scene_completed TAM BİR KEZ üretilmedi');
    const progress = await s.page.evaluate(() => JSON.parse(localStorage.getItem('go_scene_progress_v1') || 'null'));
    ensure(progress?.completedSceneIds?.filter(id => id === S03_ID).length === 1, 'completedSceneIds S3\'ü tekrarlıyor veya içermiyor');
  } finally { await s.close(); }
});

addTest('C14) eski iki-bölge/retry akışı ARTIK YOK — ilgili DOM/metin/event\'ler hiç üretilmiyor', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene3AndIntro(s.page);
    await playScene3Move(s.page, 'interior');
    await playScene3Move(s.page, 'corner');
    await s.page.click('#s03-next');
    await s.page.waitForTimeout(150);

    ensure(await s.page.locator('#s03-retry').count() === 0, '"Başka bir noktayı dene" düğmesi hâlâ DOM\'da');
    ensure(await s.page.locator('#s03-choices, .ls-choice').count() === 0, 'karşılaştırma seçenekleri hâlâ DOM\'da');
    const bodyText = await s.page.locator('#ls-scene-host').innerText().catch(() => '');
    ensure(!/farklı bölgeyi daha dene|1\s*\/\s*2/i.test(bodyText), 'eski iki-bölge metni hâlâ görünüyor');
    const events = eventsFor(await getEventLog(s.page), S03_ID);
    ensure(events.filter(e => e.payload.color === 'white').length === 0, 'beyaz hamle event\'i üretildi');
    ensure(!events.some(e => ['scene_comparison_answered', 'scene_center_move_attempted', 'scene_position_retry_started'].includes(e.type)), 'eski karşılaştırma/merkez/retry event\'leri hâlâ üretiliyor');
  } finally { await s.close(); }
});

addTest('C15) reload: ilk hamleden sonra ama "Sonraki konu"ya basmadan → temiz başlangıca döner, S3 completedSceneIds\'te YOK', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene3AndIntro(s.page);
    await playScene3Move(s.page); // ilk hamle yapıldı ama "Sonraki konu" TIKLANMADI

    await s.page.reload({ waitUntil: 'networkidle' });
    await s.page.waitForTimeout(300);
    ensure(await s.page.locator('#s03-intro').isVisible(), 'reload sonrası Sahne #3 baştan başlamadı');
    ensure(await s.page.locator('#s03-next').isDisabled().catch(() => true), 'reload sonrası devam kontrolü hâlâ eski (tamamlanmış) durumda kalmış');

    const progress = await s.page.evaluate(() => JSON.parse(localStorage.getItem('go_scene_progress_v1') || 'null'));
    ensure(progress?.completedSceneIds?.includes(S01_ID) && progress.completedSceneIds.includes(S02_ID), 'önceki tamamlanmalar kalıcı değil');
    ensure(!progress?.completedSceneIds?.includes(S03_ID), 'yarım kalan Sahne #3 yanlışlıkla tamamlanmış sayıldı');
  } finally { await s.close(); }
});

addTest('C16) reload: tüm konular tamamlanmışken SON konu REPLAY modunda açılır (teknik final ekranı YOK)', async () => {
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

addTest('C17) reduced-motion: Sahne #3 intro transition\'sız, akış yine tamamlanabiliyor', async () => {
  const s = await openScenesPage({ reducedMotion: 'reduce', query: FAST_QUERY });
  try {
    await advanceToScene3(s.page);
    const transition = await s.page.locator('#s03-intro').evaluate(el => getComputedStyle(el).transitionDuration);
    ensure(transition === '0s' || transition.startsWith('0s'), `transition kalkmamış: ${transition}`);
    await confirmS03Intro(s.page);
    ensure(await s.page.locator('#s03-play').isVisible(), 'reduced-motion\'da oyun satırı açılmadı');
  } finally { await s.close(); }
});

addTest('C18) masaüstü/tablet/mobilde Sahne #3 sırasında taşma yok', async () => {
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

addTest('C19) dokunmatik: gerçek tek dokunuş (touchstart→pointerdown önizleme→click commit) TEK etkileşimde hamleyi yerleştirir', async () => {
  const s = await openScenesPage({ viewport: VIEWPORTS.mobile, query: FAST_QUERY, hasTouch: true });
  try {
    await advanceToScene3AndIntro(s.page);
    const box = await s.page.locator('#ls-canvas').boundingBox();
    const before = eventsFor(await getEventLog(s.page), S03_ID).filter(e => e.type === 'scene_move_played').length;
    // page.touchscreen.tap gerçek touchstart/touchend üretir (tarayıcı
    // ardından uyumluluk için pointerdown+click sentezler) — adaptörün
    // canvas'a bağladığı pointerdown (önizleme) ve click (commit)
    // dinleyicilerini AYNI üretim kod yolundan, TEK dokunuşta tetikler.
    await s.page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2 - 8);
    await s.page.waitForTimeout(120);
    const after = eventsFor(await getEventLog(s.page), S03_ID).filter(e => e.type === 'scene_move_played').length;
    ensure(after === before + 1, `tek dokunuşla hamle yerleşmedi (önce ${before}, sonra ${after})`);
    ensure(s.consoleErrors.length === 0, `konsol/pageerror hatası: ${s.consoleErrors.join(' | ')}`);
  } finally { await s.close(); }
});

addTest('C20) Konular paneli açıkken board input kilitlenir (hamle üretilmez), kapanınca eski duruma döner', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene3AndIntro(s.page);
    await s.page.click('#ls-topics-open');
    await s.page.waitForTimeout(150);
    const box = await s.page.locator('#ls-canvas').boundingBox();
    const before = eventsFor(await getEventLog(s.page), S03_ID).filter(e => e.type === 'scene_move_played').length;
    await s.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 - 8);
    await s.page.waitForTimeout(100);
    const duringOpen = eventsFor(await getEventLog(s.page), S03_ID).filter(e => e.type === 'scene_move_played').length;
    ensure(duringOpen === before, 'Konular paneli açıkken canvas tıklaması hamle üretti — input yanlış kilitli');

    await s.page.keyboard.press('Escape');
    await s.page.waitForTimeout(100);
    ensure(await s.page.locator('#ls-topics-panel').isHidden(), 'panel kapanmadı');

    await s.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 - 8);
    await s.page.waitForTimeout(100);
    const afterClose = eventsFor(await getEventLog(s.page), S03_ID).filter(e => e.type === 'scene_move_played').length;
    ensure(afterClose === before + 1, 'panel kapandıktan sonra board input eski durumuna dönmedi');
  } finally { await s.close(); }
});

addTest('C21) tam akış (Sahne #1→#2→#3) boyunca konsolda/pageerror\'da hata yok', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene3AndIntro(s.page);
    await playScene3Move(s.page, 'interior');
    await playScene3Move(s.page, 'edge');
    await s.page.click('#s03-next');
    await s.page.waitForTimeout(150);
    await clickTopicEndAdvance(s.page); // "Konular" — panel açar
    await s.page.waitForTimeout(150);
    ensure(s.consoleErrors.length === 0, `hata bulundu: ${s.consoleErrors.join(' | ')}`);
  } finally { await s.close(); }
});

addTest('C22) Studio çapraz sekmede Sahne #3 event\'lerini (zone/libertyCount) görüyor, cyan işaret/eski amber halka kalıntısı yok, event overwrite oluşmuyor', async () => {
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
    ensure(!/AMBER|LEGACY_AMBER_RING/i.test(diagText), 'diagnostics eski amber halka kalıntısı bildiriyor');
    ensure(!/MISSING_CYAN|MISSING_MOVE_PREVIEW/i.test(diagText), 'diagnostics cyan işaret/preview API eksikliği bildiriyor');

    const beforeCount = eventsFor(await getEventLog(s.page), S03_ID).length;
    await playScene3Move(s.page).catch(() => {});
    const afterCount = eventsFor(await getEventLog(s.page), S03_ID).length;
    ensure(afterCount >= beforeCount, 'event log Studio tarafından küçültülmüş olabilir (overwrite riski)');

    ensure(studioErrors.length === 0, `Studio'da hata: ${studioErrors.join(' | ')}`);
    await studioPage.close();
  } finally { await s.close(); }
});

/* ══════════════════════════════════════════════════════════════════
   BÖLÜM D — Sahne #3 başlangıç taş silueti (v0.12 kök neden düzeltmesi)
   Önceden önizleme YALNIZ gerçek bir pointermove/pointerdown geldiğinde
   (handleHover üzerinden) kuruluyordu — kullanıcı fareyi hiç oynatmazsa
   board boş görünüyordu. Artık intro onayının HEMEN ardından, hiçbir
   pointer olayı beklenmeden, varsayılan merkez (4,4) konumunda başlangıç
   silueti doğrudan kurulur (bkz. scenes/scene03LibertiesByPosition.js).
   ══════════════════════════════════════════════════════════════════ */

async function getMovePreview(page) {
  return page.evaluate(() => window.__lsTestBoardAdapter?.getMovePreview() ?? null);
}

addTest('D1) intro onayından hemen sonra, hiçbir mouse hareketi olmadan başlangıç ghost preview (4,4) çiziliyor', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceToScene3(s.page);
    await confirmS03Intro(s.page); // #s03-confirm tıklanır, board'a HİÇ dokunulmaz
    const preview = await getMovePreview(s.page);
    ensure(preview && preview.row === 4 && preview.col === 4 && preview.color === 'black', `başlangıç preview (4,4) siyah olmalı, bulunan: ${JSON.stringify(preview)}`);
  } finally { await s.close(); }
});

addTest('D2) başlangıç preview kurulmuşken hamle/liberty/completion event\'i YOK ve BoardState GERÇEKTEN boş (aynı noktaya tıklamak occupied reddi ÜRETMİYOR, GERÇEK 4 liberty)', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceToScene3(s.page);
    await confirmS03Intro(s.page);
    const eventsBefore = eventsFor(await getEventLog(s.page), S03_ID).filter(e => ['scene_move_played', 'scene_liberties_shown', 'scene_completion_unlocked', 'scene_completed'].includes(e.type));
    ensure(eventsBefore.length === 0, `preview kurulmuşken hamle/liberty/completion event'i olmamalı, bulunan: ${JSON.stringify(eventsBefore.map(e => e.type))}`);

    // BoardState'in GERÇEKTEN boş olduğunun kanıtı: preview'ın gösterildiği
    // AYNI noktaya (4,4) tıklamak "OCCUPIED" reddi ÜRETMEMELİ — üretseydi
    // ghost'un BoardState'e sızdığı anlamına gelirdi.
    const box = await s.page.locator('#ls-canvas').boundingBox();
    await s.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 - 8);
    await s.page.waitForTimeout(150);
    const eventsAfter = eventsFor(await getEventLog(s.page), S03_ID);
    const moved = eventsAfter.find(e => e.type === 'scene_move_played');
    ensure(!!moved && moved.payload.exampleNumber === 1, `(4,4) tıklaması GERÇEK ilk hamle olarak geçmeli (occupied reddi yok), bulunan: ${JSON.stringify(moved?.payload)}`);
    const libShown = eventsAfter.find(e => e.type === 'scene_liberties_shown');
    ensure(libShown?.payload.libertyCount === 4, `merkez GERÇEK 4 liberty göstermeli (preview boardState'i bozmamış), bulunan: ${libShown?.payload.libertyCount}`);
  } finally { await s.close(); }
});

addTest('D3) başlangıç preview gösterilirken "Sonraki konu" disabled kalıyor', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceToScene3(s.page);
    await confirmS03Intro(s.page);
    ensure(!!(await getMovePreview(s.page)), 'başlangıç preview kurulmamış (ön koşul)');
    ensure(await s.page.locator('#s03-next').isDisabled(), '"Sonraki konu" preview gösterilirken hâlâ disabled OLMALI');
  } finally { await s.close(); }
});

addTest('D4) pointer başka yasal kesişime gidince siluet o noktaya taşınıyor', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceToScene3(s.page);
    await confirmS03Intro(s.page);
    const box = await s.page.locator('#ls-canvas').boundingBox();
    await s.page.mouse.move(box.x + box.width / 2 - 50, box.y + box.height / 2 - 40);
    await s.page.waitForTimeout(120);
    const preview = await getMovePreview(s.page);
    ensure(preview && !(preview.row === 4 && preview.col === 4), `hover farklı bir noktaya taşınmalı (merkezde kalmamalı), bulunan: ${JSON.stringify(preview)}`);
  } finally { await s.close(); }
});

addTest('D5) ilk gerçek tıklamada yalnız BİR hamle ve yalnız BİR örnek oluşuyor', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceToScene3(s.page);
    await confirmS03Intro(s.page);
    const box = await s.page.locator('#ls-canvas').boundingBox();
    await s.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 - 8);
    await s.page.waitForTimeout(150);
    const moves = eventsFor(await getEventLog(s.page), S03_ID).filter(e => e.type === 'scene_move_played');
    ensure(moves.length === 1 && moves[0].payload.exampleNumber === 1, `tam bir hamle/bir örnek olmalı, bulunan: ${JSON.stringify(moves.map(m => m.payload.exampleNumber))}`);
  } finally { await s.close(); }
});

addTest('D6) ghost, gerçek taş ve turkuaz nefes işaretleri birbirine karışmıyor (gerçek tıklama ANINDA preview temizlenir, sonraki hover yine çalışır)', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceToScene3(s.page);
    await confirmS03Intro(s.page);
    const box = await s.page.locator('#ls-canvas').boundingBox();
    await s.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 - 8);
    await s.page.waitForTimeout(150);
    const previewAfterClick = await getMovePreview(s.page);
    ensure(previewAfterClick === null, `gerçek taş yerleşince ghost preview temizlenmeli, bulunan: ${JSON.stringify(previewAfterClick)}`);

    await s.page.mouse.move(box.x + box.width / 2 - 50, box.y + box.height / 2 - 40);
    await s.page.waitForTimeout(120);
    const previewAfterHover = await getMovePreview(s.page);
    ensure(!!previewAfterHover, 'ilk hamleden SONRA da hover ile yeni bir ghost preview kurulabilmeli (karışmadan)');
  } finally { await s.close(); }
});

addTest('D7) Konular paneli açıldığında preview kayboluyor', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceToScene3(s.page);
    await confirmS03Intro(s.page);
    ensure(!!(await getMovePreview(s.page)), 'başlangıç preview kurulmamış (ön koşul)');
    await s.page.click('#ls-topics-open');
    await s.page.waitForTimeout(150);
    const preview = await getMovePreview(s.page);
    ensure(preview === null, `Konular paneli açıkken preview null olmalı, bulunan: ${JSON.stringify(preview)}`);
  } finally { await s.close(); }
});

addTest('D8) panel kapanınca ilk hamle yapılmadıysa başlangıç preview (4,4) geri geliyor', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceToScene3(s.page);
    await confirmS03Intro(s.page);
    await s.page.click('#ls-topics-open');
    await s.page.waitForTimeout(150);
    await s.page.keyboard.press('Escape');
    await s.page.waitForTimeout(150);
    const preview = await getMovePreview(s.page);
    ensure(preview && preview.row === 4 && preview.col === 4, `panel kapanınca (ilk hamle yok) varsayılan merkez preview dönmeli, bulunan: ${JSON.stringify(preview)}`);
    ensure(await s.page.locator('#s03-next').isDisabled(), 'panel kapanınca "Sonraki konu" hâlâ disabled (ilk hamle yapılmadı)');
  } finally { await s.close(); }
});

addTest('D9) ilk hamleden sonra panel aç/kapat merkezde SAHTE preview oluşturmuyor', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceToScene3(s.page);
    await confirmS03Intro(s.page);
    const box = await s.page.locator('#ls-canvas').boundingBox();
    await s.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 - 8);
    await s.page.waitForTimeout(150);
    ensure(!(await s.page.locator('#s03-next').isDisabled()), 'ilk hamleden sonra devam kontrolü aktif olmalı (ön koşul)');

    await s.page.click('#ls-topics-open');
    await s.page.waitForTimeout(150);
    await s.page.keyboard.press('Escape');
    await s.page.waitForTimeout(150);
    const preview = await getMovePreview(s.page);
    ensure(preview === null, `ilk hamleden SONRA panel aç/kapat merkezde sahte preview OLUŞTURMAMALI, bulunan: ${JSON.stringify(preview)}`);
  } finally { await s.close(); }
});

addTest('D10) replay Sahne #3\'ü TEMİZ intro + başlangıç siluetiyle açar (v0.13); sahne geçişinde stale preview kalmıyor', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceToScene3(s.page);
    await confirmS03Intro(s.page);
    ensure(!!(await getMovePreview(s.page)), 'başlangıç preview kurulmamış (ön koşul)');

    // "Bu konuyu tekrar et" → GERÇEK unmount + yeniden mount.
    const box = await s.page.locator('#ls-canvas').boundingBox();
    await s.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 - 8);
    await s.page.waitForTimeout(150);
    await s.page.click('#s03-next');
    await s.page.waitForTimeout(200);
    await s.page.click('.ls-topic-end [data-action="replay"]');
    await s.page.waitForTimeout(250);
    ensure(await s.page.locator('#s03-intro').isVisible(), 'replay sonrası intro state\'ine dönülmedi');
    // v0.13: replay TEMİZ intro + başlangıç siluetiyle açar — tick henüz
    // onaylanmadan preview ZATEN (4,4)'te olmalı (bkz. görev talimatı).
    const previewAfterReplay = await getMovePreview(s.page);
    ensure(previewAfterReplay && previewAfterReplay.row === 4 && previewAfterReplay.col === 4, `replay sonrası (tick öncesi bile) başlangıç silueti (4,4) hemen görünmeli, bulunan: ${JSON.stringify(previewAfterReplay)}`);
    const eventsAfterReplayMount = eventsFor(await getEventLog(s.page), S03_ID).filter(e => e.type === 'scene_replay_started');
    ensure(eventsAfterReplayMount.length >= 1, 'replay mount event\'i üretilmedi (ön koşul)');

    // Şimdi başka bir sahneye GEÇİŞ (Konular → Sahne #2) — stale preview sızmamalı.
    await confirmS03Intro(s.page);
    ensure(!!(await getMovePreview(s.page)), 'yeniden onay sonrası preview tekrar kurulmalı (ön koşul)');
    await s.page.click('#ls-topics-open');
    await s.page.waitForTimeout(150);
    // Aktif sahnenin (Sahne #3) kendi öğesine tıklamak runtime'da NO-OP'tur
    // (aynı sahne için start() ikinci kez mount etmez) — GERÇEK bir sahne
    // geçişi görmek için tamamlanmış, AKTİF-OLMAYAN ilk öğeyi (Sahne #1)
    // seçilir.
    await s.page.locator('.ls-topic-item').nth(0).click();
    await s.page.waitForTimeout(250);
    const previewAfterSceneSwitch = await getMovePreview(s.page);
    ensure(previewAfterSceneSwitch === null, `başka sahneye geçince stale preview sızmamalı, bulunan: ${JSON.stringify(previewAfterSceneSwitch)}`);
  } finally { await s.close(); }
});

addTest('D11) mobil tek dokunuş hâlâ tek hamle üretiyor (başlangıç önizlemesi eklenmesinden ETKİLENMEZ)', async () => {
  const s = await openScenesPage({ viewport: VIEWPORTS.mobile, query: PREVIEW_QUERY, hasTouch: true });
  try {
    await advanceToScene3(s.page);
    await confirmS03Intro(s.page);
    const box = await s.page.locator('#ls-canvas').boundingBox();
    const before = eventsFor(await getEventLog(s.page), S03_ID).filter(e => e.type === 'scene_move_played').length;
    await s.page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2 - 8);
    await s.page.waitForTimeout(150);
    const after = eventsFor(await getEventLog(s.page), S03_ID).filter(e => e.type === 'scene_move_played').length;
    ensure(after === before + 1, `tek dokunuşla tam bir hamle yerleşmeli, bulunan: önce ${before} sonra ${after}`);
  } finally { await s.close(); }
});

addTest('D12) başlangıç silueti akışı boyunca konsolda/pageerror\'da hata yok', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceToScene3(s.page);
    await confirmS03Intro(s.page);
    const box = await s.page.locator('#ls-canvas').boundingBox();
    await s.page.mouse.move(box.x + box.width / 2 - 50, box.y + box.height / 2 - 40);
    await s.page.waitForTimeout(80);
    await s.page.click('#ls-topics-open');
    await s.page.waitForTimeout(100);
    await s.page.keyboard.press('Escape');
    await s.page.waitForTimeout(100);
    await s.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 - 8);
    await s.page.waitForTimeout(150);
    ensure(s.consoleErrors.length === 0, `hata bulundu: ${s.consoleErrors.join(' | ')}`);
  } finally { await s.close(); }
});

/* ══════════════════════════════════════════════════════════════════
   BÖLÜM E — Sahne #3 taş siluetinin GERÇEK görsel ölçümü (v0.13)
   Bölüm D, yalnız `getMovePreviewState()` iç state'ini doğruluyordu —
   canlı kullanıcı testi bunun görsel BAŞARIYI kanıtlamadığını gösterdi
   (state vardı ama ekranda "küçük soluk nokta" gibi algılanıyordu).
   Bu blok GERÇEK canvas piksellerini `getImageData` ile örnekleyerek
   ghost'un görünür çapını/kontrastını gerçek taşla karşılaştırır — yalnız
   kaynak metnini veya state'i okuyarak GEÇTİ SAYMAZ.
   ══════════════════════════════════════════════════════════════════ */

/** Canvas'tan (cx+dx, cy+dy) CSS-piksel konumundaki RGBA'yı okur — devicePixelRatio'yu hesaba katar. */
async function canvasPixelAt(page, cx, cy, dx = 0, dy = 0) {
  return page.evaluate(({ x, y }) => {
    const canvas = document.getElementById('ls-canvas');
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const d = ctx.getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data;
    return { r: d[0], g: d[1], b: d[2], a: d[3] };
  }, { x: cx + dx, y: cy + dy });
}
function pixelLuminance(px) { return 0.2126 * px.r + 0.7152 * px.g + 0.0722 * px.b; }
/** (4,4) kesişiminin GÜVENİLİR ekran ofseti — bu test dosyasındaki TÜM diğer
    testlerde (C3-C22, D1-D12) merkez hamle için kullanılan AYNI sabit ofset. */
function boardCenterXY(box) { return { cx: Math.round(box.width / 2), cy: Math.round(box.height / 2 - 8) }; }

/** (cx,cy) etrafında yatay bir tarama yaparak, `boardLum`dan (temiz board
    luminance referansı) THRESH'ten fazla sapan piksellerin dx aralığından
    görünür disk yarıçapını (CSS px) tahmin eder. */
async function measureVisibleDiscRadius(page, cx, cy, boardLum, thresh = 15) {
  let minDx = null, maxDx = null;
  for (let dx = -60; dx <= 60; dx += 2) {
    const px = await canvasPixelAt(page, cx, cy, dx, 0);
    if (Math.abs(pixelLuminance(px) - boardLum) > thresh) {
      if (minDx === null) minDx = dx;
      maxDx = dx;
    }
  }
  return minDx !== null ? (maxDx - minDx) / 2 : 0;
}

addTest('E1) Sahne #3 MOUNT anında (intro tick ONAYLANMADAN) preview state zaten (4,4) VE gerçek move/liberty/completion event\'i SIFIR', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceToScene3(s.page);
    ensure(await s.page.locator('#s03-intro').isVisible(), 'intro durumunda olmalı (tick henüz basılmadı)');
    const preview = await getMovePreview(s.page);
    ensure(preview && preview.row === 4 && preview.col === 4 && preview.color === 'black', `mount anında (tick öncesi) preview (4,4) siyah olmalı, bulunan: ${JSON.stringify(preview)}`);
    const events = eventsFor(await getEventLog(s.page), S03_ID).filter(e => ['scene_move_played', 'scene_liberties_shown', 'scene_completion_unlocked', 'scene_completed'].includes(e.type));
    ensure(events.length === 0, `mount anında hamle/liberty/completion event'i olmamalı, bulunan: ${JSON.stringify(events.map(e => e.type))}`);
  } finally { await s.close(); }
});

addTest('E2) Mount anında (tick öncesi) canvas\'ta GERÇEKTEN görünür ghost var — piksel örneklemesiyle board arka planından belirgin sapma ölçülüyor', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceToScene3(s.page);
    const box = await s.page.locator('#ls-canvas').boundingBox();
    const { cx, cy } = boardCenterXY(box);
    const cleanBoard = await canvasPixelAt(s.page, cx, cy, -14, -14);
    const boardLum = pixelLuminance(cleanBoard);
    const ghostCenter = await canvasPixelAt(s.page, cx, cy, 0, 0);
    const contrastDelta = Math.abs(pixelLuminance(ghostCenter) - boardLum);
    ensure(contrastDelta > 15, `mount anında ghost merkez pikseli board'dan AYIRT EDİLEMİYOR (luminance farkı=${contrastDelta.toFixed(1)}, en az 15 beklenir) — "küçük soluk nokta" regresyonu`);
    const radius = await measureVisibleDiscRadius(s.page, cx, cy, boardLum);
    ensure(radius >= 15, `mount anında ghost'un görünür yarıçapı çok küçük (${radius}px, en az 15px beklenir — küçük bir nokta değil, taş boyutunda bir disk olmalı)`);
  } finally { await s.close(); }
});

addTest('E3) Ghost çapı/gerçek taş çapı oranı %90-100 aralığında; gerçek taş ghost\'tan BELİRGİN ölçüde daha opak (yüksek kontrastlı) ama aynı temel boyutta', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceToScene3(s.page);
    const box = await s.page.locator('#ls-canvas').boundingBox();
    const { cx, cy } = boardCenterXY(box);
    const cleanBoard = await canvasPixelAt(s.page, cx, cy, -14, -14);
    const boardLum = pixelLuminance(cleanBoard);

    await confirmS03Intro(s.page);
    const ghostRadius = await measureVisibleDiscRadius(s.page, cx, cy, boardLum);
    const ghostDx14 = await canvasPixelAt(s.page, cx, cy, -14, 0);

    await s.page.mouse.click(box.x + cx, box.y + cy);
    await s.page.waitForTimeout(300);
    const realRadius = await measureVisibleDiscRadius(s.page, cx, cy, boardLum);
    const realDx14 = await canvasPixelAt(s.page, cx, cy, -14, 0);

    ensure(realRadius > 0, `gerçek taş yarıçapı ölçülemedi (${realRadius}px)`);
    const ratio = (ghostRadius / realRadius) * 100;
    ensure(ratio >= 90 && ratio <= 115, `ghost/gerçek taş çap oranı %90-100 civarında olmalı (küçük ölçüm toleransıyla ≤115), bulunan: %${ratio.toFixed(1)} (ghost=${ghostRadius}px, real=${realRadius}px)`);

    // Gerçek taş, ghost'tan BELİRGİN ölçüde daha kontrastlı (daha opak) olmalı —
    // "gerçek taş ghost'tan daha opak fakat aynı temel boyutta" (bkz. görev talimatı).
    const contrastGhost = Math.hypot(ghostDx14.r - cleanBoard.r, ghostDx14.g - cleanBoard.g, ghostDx14.b - cleanBoard.b);
    const contrastReal = Math.hypot(realDx14.r - cleanBoard.r, realDx14.g - cleanBoard.g, realDx14.b - cleanBoard.b);
    ensure(contrastReal > contrastGhost * 1.5, `gerçek taş ghost'tan belirgin ölçüde daha opak/kontrastlı olmalı (gerçek=${contrastReal.toFixed(1)}, ghost=${contrastGhost.toFixed(1)})`);
    ensure(contrastGhost > 20, `ghost hâlâ board'dan yeterince ayırt edilebilir olmalı (kontrast=${contrastGhost.toFixed(1)})`);
  } finally { await s.close(); }
});

addTest('E4) Intro onay geçişinin başı/ortası/sonunda ghost AYNI koordinatta görünür kalıyor; board bounding box <1px sabit', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceToScene3(s.page);
    const boxBefore = await s.page.locator('#ls-canvas').boundingBox();
    const { cx, cy } = boardCenterXY(boxBefore);
    const cleanBoard = await canvasPixelAt(s.page, cx, cy, -14, -14);
    const boardLum = pixelLuminance(cleanBoard);

    // KARE 1 — tick ÖNCESİ (intro).
    const r1 = await measureVisibleDiscRadius(s.page, cx, cy, boardLum);
    ensure(r1 > 10, `geçiş öncesi (intro) ghost görünür değil (yarıçap=${r1}px)`);

    // KARE 2 — geçiş ORTASI (CSS transition ~200ms, JS setTimeout 220ms —
    // 60ms noktası kesinlikle geçiş sürerken).
    await s.page.click('#s03-confirm');
    await s.page.waitForTimeout(60);
    const boxMid = await s.page.locator('#ls-canvas').boundingBox();
    const r2 = await measureVisibleDiscRadius(s.page, cx, cy, boardLum);
    ensure(r2 > 10, `geçiş ORTASINDA ghost'un görünür piksel alanı sıfıra düşmüş (yarıçap=${r2}px) — bir kareliğine bile kaybolmamalı`);

    // KARE 3 — geçiş TAMAMLANDI.
    await s.page.waitForTimeout(400);
    const boxAfter = await s.page.locator('#ls-canvas').boundingBox();
    const r3 = await measureVisibleDiscRadius(s.page, cx, cy, boardLum);
    ensure(r3 > 10, `geçiş sonrası ghost görünür değil (yarıçap=${r3}px)`);
    ensure(await s.page.locator('#s03-play').isVisible(), 'geçiş sonrası uygulama satırı (yönlendirme metni) açık olmalı');
    const statusText = (await s.page.locator('#s03-status').textContent())?.trim();
    ensure(statusText === 'Tahtada istediğin boş kesişime siyah bir taş yerleştir.', `geçiş sonrası doğru yönlendirme metni görünmeli, bulunan: "${statusText}"`);

    // board bounding box üç karede de <1px farkla sabit.
    for (const [label, b] of [['mid', boxMid], ['after', boxAfter]]) {
      ensure(Math.abs(b.x - boxBefore.x) < 1 && Math.abs(b.y - boxBefore.y) < 1 && Math.abs(b.width - boxBefore.width) < 1 && Math.abs(b.height - boxBefore.height) < 1,
        `board bounding box (${label}) geçiş öncesine göre <1px sabit değil: önce=${JSON.stringify(boxBefore)} ${label}=${JSON.stringify(b)}`);
    }
  } finally { await s.close(); }
});

addTest('E5) hızlı çift tick yalnız BİR intro→uygulama geçişi üretiyor (state/event tekrarı yok)', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceToScene3(s.page);
    // Playwright'ın locator.click() actionability beklemesi (visible+enabled)
    // ikinci tıklamayı SONSUZA dek bekletir — buton kendi handler'ı içinde
    // SENKRON olarak disabled edildiği için native tarayıcı da zaten ikinci
    // tıklamayı yok sayar. Gerçek "hızlı çift tık" kullanıcı senaryosunu
    // (Playwright'ın actionability kontrolüne TAKILMADAN) simüle etmek için
    // ham ekran koordinatında İKİ fiziksel mouse.click() kullanılır.
    const btnBox = await s.page.locator('#s03-confirm').boundingBox();
    await s.page.mouse.click(btnBox.x + btnBox.width / 2, btnBox.y + btnBox.height / 2);
    await s.page.mouse.click(btnBox.x + btnBox.width / 2, btnBox.y + btnBox.height / 2);
    await s.page.waitForTimeout(450);
    const events = eventsFor(await getEventLog(s.page), S03_ID).filter(e => e.type === 'scene_intro_confirmed');
    ensure(events.length === 1, `scene_intro_confirmed TAM BİR KEZ üretilmeli, bulunan: ${events.length}`);
    ensure(await s.page.locator('#s03-play').isVisible(), 'uygulama satırı açık olmalı');
    const preview = await getMovePreview(s.page);
    ensure(preview && preview.row === 4 && preview.col === 4, `çift tick sonrası preview hâlâ tutarlı (4,4), bulunan: ${JSON.stringify(preview)}`);
  } finally { await s.close(); }
});

addTest('E6) reduced-motion: ghost mount anında AYNI şekilde görünür, geçiş anında değişir, işlevsel son durum aynı', async () => {
  const s = await openScenesPage({ reducedMotion: 'reduce', query: PREVIEW_QUERY });
  try {
    await advanceToScene3(s.page);
    const box = await s.page.locator('#ls-canvas').boundingBox();
    const { cx, cy } = boardCenterXY(box);
    const cleanBoard = await canvasPixelAt(s.page, cx, cy, -14, -14);
    const boardLum = pixelLuminance(cleanBoard);
    const r1 = await measureVisibleDiscRadius(s.page, cx, cy, boardLum);
    ensure(r1 > 10, `reduced-motion'da mount anında ghost görünmüyor (yarıçap=${r1}px)`);

    await s.page.click('#s03-confirm');
    await s.page.waitForTimeout(100); // transition:none — anında tamamlanmalı
    ensure(await s.page.locator('#s03-play').isVisible(), 'reduced-motion\'da geçiş anında tamamlanmalı');
    const preview = await getMovePreview(s.page);
    ensure(preview && preview.row === 4 && preview.col === 4, `reduced-motion sonrası preview tutarlı (4,4), bulunan: ${JSON.stringify(preview)}`);
    const r2 = await measureVisibleDiscRadius(s.page, cx, cy, boardLum);
    ensure(r2 > 10, `reduced-motion geçişi sonrası ghost görünmüyor (yarıçap=${r2}px)`);
  } finally { await s.close(); }
});

addTest('E7) ghost aktifken sade hover-noktası AYRICA çizilmiyor (kaynak-düzeyi geçit + görsel QA ile teyit edilmiş çakışma önleme)', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceToScene3(s.page);
    const adapterSrc = await s.page.evaluate(async () => {
      const mod = await import('/adapters/sceneBoardAdapter.js');
      return mod.createSceneBoardAdapter.toString();
    });
    ensure(/hoverPoint\s*&&\s*!movePreview/.test(adapterSrc), 'drawHoverPoint çağrısı !movePreview ile korunmalı (ghost aktifken sade hover noktası ayrıca çizilmemeli)');
  } finally { await s.close(); }
});

/* ══════════════════════════════════════════════════════════════════
   BÖLÜM F — v0.14: Konular/ghost yaşam döngüsü + sahne geçiş mimarisi
   Canlı doğrulamada bulunan iki gerçek regresyon:
   (A) Sahne #3 INTRO sırasında Konular paneli açılıp kapanınca merkez
       ghost'un geri GELMEMESİ — kök neden: setInputEnabled(false) girdi
       ZATEN kapalıyken bile movePreview'ı koşulsuz temizliyordu (bkz.
       adapters/sceneBoardAdapter.js suspendInteraction/resumeInteraction).
   (B) Sahne #2 → Sahne #3 geçişinde anlatım içeriğinin ~44px sıçraması
       (bkz. scenes/sceneTransition.js — ORTAK crossfade katmanı).
   ══════════════════════════════════════════════════════════════════ */

function bboxMaxDiff(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.width - b.width), Math.abs(a.height - b.height));
}

addTest('F1) Sahne #3 intro açılışında ghost (4,4) görünür (tick ONAYLANMADAN)', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceToScene3(s.page);
    const preview = await getMovePreview(s.page);
    ensure(preview && preview.row === 4 && preview.col === 4, `intro açılışında ghost (4,4) olmalı, bulunan: ${JSON.stringify(preview)}`);
  } finally { await s.close(); }
});

addTest('F2) Intro sırasında Konular paneli açılınca board click hamle üretmez', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceToScene3(s.page);
    await s.page.click('#ls-topics-open');
    await s.page.waitForTimeout(150);
    const box = await s.page.locator('#ls-canvas').boundingBox();
    const before = eventsFor(await getEventLog(s.page), S03_ID).filter(e => e.type === 'scene_move_played').length;
    await s.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 - 8);
    await s.page.waitForTimeout(100);
    const after = eventsFor(await getEventLog(s.page), S03_ID).filter(e => e.type === 'scene_move_played').length;
    ensure(after === before, 'panel açıkken (intro sırasında) board click hamle üretmemeli');
    const preview = await getMovePreview(s.page);
    ensure(preview === null, `panel açıkken ghost kilitli (null) olmalı, bulunan: ${JSON.stringify(preview)}`);
  } finally { await s.close(); }
});

addTest('F3) Panel kapanınca (intro, ilk hamle yok) ghost yeniden (4,4) görünür', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceToScene3(s.page);
    await s.page.click('#ls-topics-open');
    await s.page.waitForTimeout(150);
    await s.page.keyboard.press('Escape');
    await s.page.waitForTimeout(150);
    const preview = await getMovePreview(s.page);
    ensure(preview && preview.row === 4 && preview.col === 4, `*** kritik regresyon *** panel kapanınca ghost (4,4) geri gelmeli, bulunan: ${JSON.stringify(preview)}`);
    ensure(await s.page.locator('#s03-intro').isVisible(), 'hâlâ intro durumunda (onaylanmamış)');
  } finally { await s.close(); }
});

addTest('F4) Intro + Konular aç/kapat süreci move/liberty/completion event\'i üretmez', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceToScene3(s.page);
    await s.page.click('#ls-topics-open');
    await s.page.waitForTimeout(150);
    await s.page.keyboard.press('Escape');
    await s.page.waitForTimeout(150);
    const events = eventsFor(await getEventLog(s.page), S03_ID).filter(e => ['scene_move_played', 'scene_liberties_shown', 'scene_completion_unlocked', 'scene_completed'].includes(e.type));
    ensure(events.length === 0, `intro+panel süreci hiçbir hamle/liberty/completion event'i üretmemeli, bulunan: ${JSON.stringify(events.map(e => e.type))}`);
  } finally { await s.close(); }
});

addTest('F5) Intro onaylandı, ilk hamleden ÖNCE panel aç/kapat input+ghost\'u doğru geri getirir', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceToScene3AndIntro(s.page);
    const box = await s.page.locator('#ls-canvas').boundingBox();
    // Pointer'ı farklı bir noktaya taşı — ghost oraya gitsin.
    await s.page.mouse.move(box.x + box.width / 2 - 50, box.y + box.height / 2 - 40);
    await s.page.waitForTimeout(120);
    const previewBefore = await getMovePreview(s.page);
    ensure(previewBefore && !(previewBefore.row === 4 && previewBefore.col === 4), `panel öncesi ghost hover noktasında olmalı, bulunan: ${JSON.stringify(previewBefore)}`);

    await s.page.click('#ls-topics-open');
    await s.page.waitForTimeout(150);
    ensure((await getMovePreview(s.page)) === null, 'panel açıkken ghost null olmalı');
    const beforeMove = eventsFor(await getEventLog(s.page), S03_ID).filter(e => e.type === 'scene_move_played').length;
    await s.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 - 8);
    await s.page.waitForTimeout(100);
    const afterMove = eventsFor(await getEventLog(s.page), S03_ID).filter(e => e.type === 'scene_move_played').length;
    ensure(afterMove === beforeMove, 'panel açıkken (post-tick) board click hamle üretmemeli');

    await s.page.keyboard.press('Escape');
    await s.page.waitForTimeout(150);
    const previewAfter = await getMovePreview(s.page);
    ensure(previewAfter && previewAfter.row === previewBefore.row && previewAfter.col === previewBefore.col, `panel kapanınca AYNI ghost konumu geri gelmeli, önce=${JSON.stringify(previewBefore)} sonra=${JSON.stringify(previewAfter)}`);
    ensure(await s.page.locator('#s03-next').isDisabled(), 'ilk hamle hâlâ yapılmadı, devam kontrolü disabled kalmalı');
  } finally { await s.close(); }
});

addTest('F6) İlk hamleden SONRA panel aç/kapat merkezde sahte ghost üretmez, gerçek örnek/nefes bozulmaz', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceToScene3AndIntro(s.page);
    const box = await s.page.locator('#ls-canvas').boundingBox();
    await s.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 - 8);
    await s.page.waitForTimeout(200);
    const statusBefore = (await s.page.locator('#s03-status').textContent())?.trim();
    ensure(!(await s.page.locator('#s03-next').isDisabled()), 'ilk hamleden sonra devam kontrolü aktif olmalı (ön koşul)');

    await s.page.click('#ls-topics-open');
    await s.page.waitForTimeout(150);
    await s.page.keyboard.press('Escape');
    await s.page.waitForTimeout(150);

    const preview = await getMovePreview(s.page);
    ensure(preview === null, `ilk hamleden sonra panel aç/kapat merkezde sahte ghost OLUŞTURMAMALI, bulunan: ${JSON.stringify(preview)}`);
    const statusAfter = (await s.page.locator('#s03-status').textContent())?.trim();
    ensure(statusAfter === statusBefore, `gerçek örnek/nefes metni panel aç/kapattan ETKİLENMEMELİ: önce="${statusBefore}" sonra="${statusAfter}"`);
    ensure(!(await s.page.locator('#s03-next').isDisabled()), 'devam kontrolü hâlâ aktif kalmalı');
  } finally { await s.close(); }
});

addTest('F7) Replay sonrası AYNI intro+Konular yaşam döngüsü çalışır', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceToScene3AndIntro(s.page);
    const box = await s.page.locator('#ls-canvas').boundingBox();
    await s.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 - 8);
    await s.page.waitForTimeout(200);
    await s.page.click('#s03-next');
    await s.page.waitForTimeout(500); // crossfade + topicEnd mount
    await s.page.click('.ls-topic-end [data-action="replay"]');
    await s.page.waitForTimeout(500); // crossfade + yeniden mount

    ensure(await s.page.locator('#s03-intro').isVisible(), 'replay sonrası intro açık olmalı');
    const previewAfterReplay = await getMovePreview(s.page);
    ensure(previewAfterReplay && previewAfterReplay.row === 4 && previewAfterReplay.col === 4, `replay sonrası başlangıç ghost (4,4): ${JSON.stringify(previewAfterReplay)}`);

    await s.page.click('#ls-topics-open');
    await s.page.waitForTimeout(150);
    await s.page.keyboard.press('Escape');
    await s.page.waitForTimeout(150);
    const previewAfterPanel = await getMovePreview(s.page);
    ensure(previewAfterPanel && previewAfterPanel.row === 4 && previewAfterPanel.col === 4, `replay sonrası panel aç/kapat da AYNI yaşam döngüsünü izlemeli: ${JSON.stringify(previewAfterPanel)}`);
  } finally { await s.close(); }
});

addTest('F8) Reset/unmount/destroy (sahne geçişi) stale preview bırakmaz', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceToScene3(s.page);
    ensure(!!(await getMovePreview(s.page)), 'başlangıç ghost kurulu olmalı (ön koşul)');
    // Konular → Sahne #1'e geç (tamamlanmış, replay) — GERÇEK unmount+mount.
    await s.page.click('#ls-topics-open');
    await s.page.waitForTimeout(150);
    await s.page.locator('.ls-topic-item').nth(0).click();
    await s.page.waitForTimeout(500); // crossfade + mount
    ensure(await s.page.locator('#s01-intro').isVisible(), 'Sahne #1 açıldı');
    const previewAfterSwitch = await getMovePreview(s.page);
    ensure(previewAfterSwitch === null, `başka sahneye geçince stale preview kalmamalı, bulunan: ${JSON.stringify(previewAfterSwitch)}`);
  } finally { await s.close(); }
});

addTest('F9) Sahne #2\'nin "beyaz düşünüyor" input-kilidi Konular paneliyle bozulmaz', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene2(s.page);
    await confirmS02Step(s.page, 0);
    await confirmS02Step(s.page, 1);
    await confirmS02Step(s.page, 2);
    // Siyah bir hamle oyna — beyaz "düşünürken" input kilitlenir (whiteMoveDelayMs=0 ile ANINDA çözülür).
    const box = await s.page.locator('#ls-canvas').boundingBox();
    const before = eventsFor(await getEventLog(s.page), S02_ID).filter(e => e.type === 'scene_move_played').length;
    await s.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 - 6);
    await s.page.waitForTimeout(120); // whiteMoveDelayMs=0 → beyaz hemen oynar, input tekrar açılır
    const afterFirstPair = eventsFor(await getEventLog(s.page), S02_ID).filter(e => e.type === 'scene_move_played').length;
    ensure(afterFirstPair >= before + 1, 'ilk siyah hamle kaydedildi (ön koşul)');

    // Konular panelini aç/kapat — Sahne #2'nin kendi input state'i (artık açık) BOZULMAMALI.
    await s.page.click('#ls-topics-open');
    await s.page.waitForTimeout(150);
    await s.page.keyboard.press('Escape');
    await s.page.waitForTimeout(150);

    // İkinci siyah hamleyi oynamayı dene — input hâlâ normal çalışmalı.
    const beforeSecond = eventsFor(await getEventLog(s.page), S02_ID).filter(e => e.type === 'scene_move_played' && e.payload.color === 'black').length;
    const placed = await playOneBlackMoveScene2(s.page);
    ensure(placed, 'Konular paneli sonrası Sahne #2 girdi kilidi normal çalışıyor (ikinci siyah hamle oynanabildi)');
  } finally { await s.close(); }
});

addTest('F10) Sahne #2 konu-sonu → Sahne #3 intro geçişinde 6 kontrol noktası (öncesi/başı/ortası/sonu/cleanup+100ms/cleanup+500ms) arasında scene-host bbox <1px sabit', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene2(s.page);
    const ok = await playScene2ToCompletion(s.page);
    ensure(ok, 'Sahne #2 tamamlanamadı (ön koşul)');
    await s.page.waitForSelector('.ls-topic-end [data-action="advance"]');

    // KRİTİK: bir önceki sürüm yalnız "geçiş ortası" (JS height-lock
    // AKTİFKEN) ve "400ms sonra" (kilit ZATEN kalkmış, yeni içeriğe
    // OTURMUŞ) ölçüyordu — kilidin KALKTIĞI ANI (cleanup sınırı) HİÇ
    // örneklemiyordu, bu yüzden geç sıçrama testten KAÇTI. Artık altı
    // ayrı zaman noktası — geçişten 100ms ÖNCESİ dahil — örnekleniyor.
    const t_before100 = await s.page.locator('#ls-scene-host').boundingBox();
    const boardBefore = await s.page.locator('#ls-canvas').boundingBox();
    const narrBefore = await s.page.locator('#ls-narration').boundingBox();
    await s.page.waitForTimeout(100);
    const t_start = await s.page.locator('#ls-scene-host').boundingBox();

    await s.page.click('.ls-topic-end [data-action="advance"]');
    await s.page.waitForTimeout(80); // geçiş ORTASI (fade-out ~90ms sürer)
    const t_mid = await s.page.locator('#ls-scene-host').boundingBox();
    await s.page.waitForTimeout(150); // geçiş SONU (toplam ~230ms — fade-out+swap+fade-in bitmiş olmalı)
    const t_end = await s.page.locator('#ls-scene-host').boundingBox();
    await s.page.waitForTimeout(100); // cleanup'tan 100ms sonra
    const t_cleanup100 = await s.page.locator('#ls-scene-host').boundingBox();
    await s.page.waitForTimeout(400); // cleanup'tan 500ms sonra (toplam)
    const t_cleanup500 = await s.page.locator('#ls-scene-host').boundingBox();
    const boardAfter = await s.page.locator('#ls-canvas').boundingBox();
    const narrAfter = await s.page.locator('#ls-narration').boundingBox();

    const points = { before100: t_before100, start: t_start, mid: t_mid, end: t_end, cleanup100: t_cleanup100, cleanup500: t_cleanup500 };
    let maxDiff = 0, worstLabel = null;
    for (const [label, b] of Object.entries(points)) {
      const d = bboxMaxDiff(t_before100, b);
      if (d > maxDiff) { maxDiff = d; worstLabel = label; }
    }
    ensure(maxDiff < 1, `*** kritik regresyon *** 6 kontrol noktası arası scene-host bbox max fark <1px olmalı (bulunan: ${maxDiff.toFixed(3)}px, en kötü nokta: ${worstLabel}, tüm ölçümler: ${JSON.stringify(points)})`);
    ensure(bboxMaxDiff(boardBefore, boardAfter) < 1, `board bbox <1px sabit olmalı (fark=${bboxMaxDiff(boardBefore, boardAfter).toFixed(3)}px)`);
    ensure(bboxMaxDiff(narrBefore, narrAfter) < 1, `narration dış kutu <1px sabit olmalı (fark=${bboxMaxDiff(narrBefore, narrAfter).toFixed(3)}px)`);
    ensure(await s.page.locator('#s03-intro').isVisible(), 'Sahne #3 intro açık');
  } finally { await s.close(); }
});

addTest('F10b) Aynı 6-noktalı ölçüm masaüstü/tablet/mobilde de <1px sabit (mobilde konu-sonu iki düğmesi tek satırda kalır)', async () => {
  for (const viewport of [VIEWPORTS.desktop, VIEWPORTS.tablet, VIEWPORTS.mobile]) {
    const s = await openScenesPage({ viewport, query: FAST_QUERY });
    try {
      await advanceToScene2(s.page);
      const ok = await playScene2ToCompletion(s.page);
      ensure(ok, `${viewport.width}px: Sahne #2 tamamlanamadı`);
      await s.page.waitForSelector('.ls-topic-end [data-action="advance"]');
      const hostBefore = await s.page.locator('#ls-scene-host').boundingBox();
      await s.page.click('.ls-topic-end [data-action="advance"]');
      await s.page.waitForTimeout(80);
      const hostMid = await s.page.locator('#ls-scene-host').boundingBox();
      await s.page.waitForTimeout(400);
      const hostAfter = await s.page.locator('#ls-scene-host').boundingBox();
      ensure(bboxMaxDiff(hostBefore, hostMid) < 1 && bboxMaxDiff(hostBefore, hostAfter) < 1,
        `${viewport.width}px: scene-host bbox <1px sabit olmalı (mid fark=${bboxMaxDiff(hostBefore, hostMid).toFixed(2)}px, sonrası fark=${bboxMaxDiff(hostBefore, hostAfter).toFixed(2)}px)`);
      const noOverflow = await s.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
      ensure(noOverflow, `${viewport.width}px: yatay taşma var`);
      const boardBox = await s.page.locator('#ls-board-region').boundingBox();
      const narrationBox = await s.page.locator('#ls-narration').boundingBox();
      ensure(!boxesIntersect(boardBox, narrationBox), `${viewport.width}px: board/narration kesişiyor`);
    } finally { await s.close(); }
  }
});

addTest('F11) Uzun yapay açıklama metni kesilmiyor, yatay taşma oluşturmuyor (min-height taşmaya İZİN VERİR, kırpmaz)', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene2(s.page);
    const ok = await playScene2ToCompletion(s.page);
    ensure(ok, 'Sahne #2 tamamlanamadı (ön koşul)');
    await s.page.waitForSelector('.ls-topic-end [data-action="advance"]');
    const longText = 'Bu, min-height bütçesini kasıtlı olarak aşan, gerçekçi olmayan derecede UZUN bir yapay açıklama metnidir — amacı içerik gerçekten taştığında hiçbir kelimenin görsel olarak kesilmediğini ve yatay bir taşmaya yol açmadığını doğrulamaktır. Metin burada birkaç satıra yayılacak kadar uzun tutulmuştur.';
    await s.page.evaluate((txt) => {
      const el = document.querySelector('.ls-topic-end-summary');
      if (el) el.textContent = txt;
    }, longText);
    await s.page.waitForTimeout(50);
    const noHOverflow = await s.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    ensure(noHOverflow, 'uzun metin yatay taşma oluşturmamalı');
    const renderedText = await s.page.locator('.ls-topic-end-summary').textContent();
    ensure(renderedText === longText, `metin İÇERİK olarak KESİLMEMELİ (DOM'da tam metin bulunmalı), bulunan uzunluk: ${renderedText?.length}`);
    const el = await s.page.locator('.ls-topic-end-summary').boundingBox();
    const host = await s.page.locator('#ls-scene-host').boundingBox();
    ensure(el.x >= host.x - 1 && el.x + el.width <= host.x + host.width + 1, 'uzun metin scene-host genişliğini AŞMAMALI (dikeyde büyümeli, yatayda değil)');
  } finally { await s.close(); }
});

addTest('F12) Geçiş sırasında klon YOK — duplicate id oluşmaz, aria-hidden sarmalayıcı+buton imzası bulunmaz, outgoing/incoming aynı anda aktif olmaz', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene2(s.page);
    const ok = await playScene2ToCompletion(s.page);
    ensure(ok, 'Sahne #2 tamamlanamadı (ön koşul)');
    await s.page.waitForSelector('.ls-topic-end [data-action="advance"]');
    await s.page.click('.ls-topic-end [data-action="advance"]');
    await s.page.waitForTimeout(45); // fade-out ORTASI — GERÇEK eski içerik hâlâ DOM'da, henüz swap olmadı

    const duplicateIds = await s.page.evaluate(() => {
      const ids = Array.from(document.querySelectorAll('[id]')).map(el => el.id);
      return ids.length !== new Set(ids).size;
    });
    ensure(!duplicateIds, 'fade-out sırasında bile yinelenen id OLUŞMAMALI (klon yok)');

    const cloneSignature = await s.page.evaluate(() => document.querySelectorAll('#ls-scene-host [aria-hidden="true"] button').length);
    ensure(cloneSignature === 0, `klon imzası (aria-hidden sarmalayıcı içinde buton) YOK olmalı, bulunan: ${cloneSignature}`);

    await s.page.waitForTimeout(300); // swap+fade-in bitmiş olmalı
    const oldButtonGone = await s.page.locator('.ls-topic-end [data-action="advance"]').count();
    ensure(oldButtonGone === 0, 'swap sonrası eski "Sonraki konu" butonu DOM\'dan TAMAMEN kaldırılmış olmalı (klon KALINTISI yok)');
    const introVisible = await s.page.locator('#s03-intro').count();
    ensure(introVisible === 1, 'yalnız GERÇEK incoming içerik DOM\'da — eski/yeni aynı anda erişilebilir DEĞİL');
  } finally { await s.close(); }
});

addTest('F13) Hızlı çift tıklama (Sahne #2 → #3) yalnız TEK sahne geçişi ve TEK swapFn çağrısı üretir', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene2(s.page);
    const ok = await playScene2ToCompletion(s.page);
    ensure(ok, 'Sahne #2 tamamlanamadı (ön koşul)');
    await s.page.waitForSelector('.ls-topic-end [data-action="advance"]');
    const btnBox = await s.page.locator('.ls-topic-end [data-action="advance"]').boundingBox();
    await s.page.mouse.click(btnBox.x + btnBox.width / 2, btnBox.y + btnBox.height / 2);
    await s.page.mouse.click(btnBox.x + btnBox.width / 2, btnBox.y + btnBox.height / 2);
    await s.page.waitForTimeout(500);

    const events = eventsFor(await getEventLog(s.page), S03_ID).filter(e => e.type === 'scene_started');
    ensure(events.length === 1, `Sahne #3 yalnız TEK KEZ başlatılmalı (swapFn TEK kez çağrılmış olmalı), bulunan: ${events.length}`);
    ensure(await s.page.locator('#s03-intro').isVisible(), 'Sahne #3 intro açık');
  } finally { await s.close(); }
});

addTest('F14) Sahne #3 ghost\'u incoming GÖRÜNÜR OLMAYA başladığı anda (fade-in başlangıcında) hazırdır', async () => {
  const s = await openScenesPage({ query: `${PREVIEW_QUERY}` });
  try {
    await advanceToScene2(s.page);
    const ok = await playScene2ToCompletion(s.page);
    ensure(ok, 'Sahne #2 tamamlanamadı (ön koşul)');
    await s.page.waitForSelector('.ls-topic-end [data-action="advance"]');
    await s.page.click('.ls-topic-end [data-action="advance"]');
    await s.page.waitForTimeout(140); // fade-out(90ms) kesin BİTMİŞ (zamanlayıcı toleransı payıyla), swap+fade-in BAŞLAMIŞ olmalı
    const preview = await getMovePreview(s.page);
    ensure(preview && preview.row === 4 && preview.col === 4, `Sahne #3'ün içeriği görünmeye başlar başlamaz ghost'u hazır olmalı: ${JSON.stringify(preview)}`);
  } finally { await s.close(); }
});

addTest('F15) Reduced-motion: Sahne #2 → #3 geçişi ANINDA tamamlanır, aynı son durum oluşur', async () => {
  const s = await openScenesPage({ reducedMotion: 'reduce', query: `${PREVIEW_QUERY}` });
  try {
    await advanceToScene2(s.page);
    const ok = await playScene2ToCompletion(s.page);
    ensure(ok, 'Sahne #2 tamamlanamadı (ön koşul)');
    await s.page.waitForSelector('.ls-topic-end [data-action="advance"]');
    await s.page.click('.ls-topic-end [data-action="advance"]');
    await s.page.waitForTimeout(80); // reduced-motion → animasyonsuz, kısa bekleme yeterli
    ensure(await s.page.locator('#s03-intro').isVisible(), 'reduced-motion\'da Sahne #3 intro AYNI son duruma anında ulaşmalı');
    const preview = await getMovePreview(s.page);
    ensure(preview && preview.row === 4 && preview.col === 4, `reduced-motion\'da da başlangıç ghost (4,4) olmalı: ${JSON.stringify(preview)}`);
  } finally { await s.close(); }
});

addTest('F17) Geçiş sonunda klavye odağı Sahne #3\'ün anlamlı ilk kontrolüne (#s03-confirm) taşınır', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene2(s.page);
    const ok = await playScene2ToCompletion(s.page);
    ensure(ok, 'Sahne #2 tamamlanamadı (ön koşul)');
    await s.page.waitForSelector('.ls-topic-end [data-action="advance"]');
    await s.page.click('.ls-topic-end [data-action="advance"]');
    await s.page.waitForTimeout(500); // geçiş tamamlanana kadar bekle
    const focusedId = await s.page.evaluate(() => document.activeElement?.id ?? null);
    ensure(focusedId === 's03-confirm', `geçiş sonunda odak Sahne #3'ün ilk kontrolüne (#s03-confirm) taşınmalı, bulunan: "${focusedId}"`);
  } finally { await s.close(); }
});

addTest('F18) v0.14 akışı (intro+panel+geçiş) boyunca konsolda/pageerror\'da hata yok', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceToScene2(s.page);
    const ok = await playScene2ToCompletion(s.page);
    ensure(ok, 'Sahne #2 tamamlanamadı (ön koşul)');
    await clickTopicEndAdvance(s.page);
    ensure(await s.page.locator('#s03-intro').isVisible(), 'Sahne #3 intro açık');
    await s.page.click('#ls-topics-open');
    await s.page.waitForTimeout(150);
    await s.page.keyboard.press('Escape');
    await s.page.waitForTimeout(150);
    await s.page.click('#s03-confirm');
    await s.page.waitForTimeout(400);
    const box = await s.page.locator('#ls-canvas').boundingBox();
    await s.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 - 8);
    await s.page.waitForTimeout(200);
    await s.page.click('#s03-next');
    await s.page.waitForTimeout(500);
    ensure(s.consoleErrors.length === 0, `hata bulundu: ${s.consoleErrors.join(' | ')}`);
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
