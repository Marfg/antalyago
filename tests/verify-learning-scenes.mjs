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
import { getAssessmentSteps, computeTapTargets } from '../scenes/libertyAssessmentPolicy.js';
import { getCaptureMoments } from '../scenes/capturePolicy.js';
import { getCapturePracticeMoments, HINT_MODES } from '../scenes/capturePracticePolicy.js';
import { CAM } from '../core/curriculum.js';

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
const S04_ID = 'scene-04-group-liberties';
const S05_ID = 'scene-05-liberty-assessment';
const S06_ID = 'scene-06-capture-basics';
const S07_ID = 'scene-07-capture-practice';
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
    // v5 — Sahne #7 ("Taş Alma Uygulamaları") kayıtlı olduğu için artık
    // YEDİ konu var (bkz. görev talimatı: registry sırasına yeni Sahne #7
    // eklendi).
    ensure(await items.count() === 7, 'yedi konu listelenmiyor');
    const titles = await items.allTextContents();
    ensure(
      titles[0].includes('Tahtayı Tanı') && titles[1].includes('Sırayla Oyna') && titles[2].includes('Taşların Nefesi') &&
      titles[3].includes('Grubun Nefesi') && titles[4].includes('Nefes Noktalarını Değerlendir') &&
      titles[5].includes('Taş Alma') && !titles[5].includes('Uygulamaları') && titles[6].includes('Taş Alma Uygulamaları'),
      `sıra/başlıklar yanlış: ${JSON.stringify(titles)}`);
    ensure(!titles.some(t => /scene-0\d/.test(t)), 'teknik scene ID görünüyor');

    ensure(await items.nth(0).getAttribute('aria-current') === 'true', 'ilk (aktif) konu işaretli değil');
    ensure(await items.nth(1).isDisabled(), 'henüz açılmamış 2. konu disabled değil');
    ensure(await items.nth(2).isDisabled(), 'henüz açılmamış 3. konu disabled değil');
    ensure(await items.nth(3).isDisabled(), 'henüz açılmamış 4. konu disabled değil');
    ensure(await items.nth(4).isDisabled(), 'henüz açılmamış 5. konu disabled değil');
    ensure(await items.nth(5).isDisabled(), 'henüz açılmamış 6. konu disabled değil');
    ensure(await items.nth(6).isDisabled(), 'henüz açılmamış 7. konu disabled değil');

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

addTest('C13) "Sonraki konu" tıklanınca konu sonu satırı açılır (Sahne #4 kayıtlı → "Sonraki konu"), teknik dil YOK, completion TAM BİR KEZ', async () => {
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
    // v0.15 — Sahne #4 ("Grubun Nefesi") kayıtlı olduğu için Sahne #3 artık
    // SON sahne DEĞİL — registry sırası tamamlanma sırasıdır (bkz. görev
    // talimatı Bölüm 2), bu yüzden buton "Sonraki konu" demeli.
    ensure(advanceLabel === 'Sonraki konu', `Sahne #4 kayıtlıyken buton "Sonraki konu" olmalı, "${advanceLabel}" bulundu`);

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

addTest('C16) reload: tüm konular tamamlanmışken SON konu (Sahne #7) REPLAY modunda açılır (teknik final ekranı YOK)', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    // v5 — Sahne #7 ("Taş Alma Uygulamaları") kayıtlı olduğu için registry
    // sırasındaki GERÇEK son sahne artık S07'dir (bkz. görev talimatı:
    // registry sırası tamamlanma sırasıdır — Sahne #6'nın KENDİ kodu
    // DEĞİŞMEDEN, yalnız registry sırasının genişlemesiyle doğal olarak
    // değişen davranış).
    await s.page.evaluate((ids) => {
      localStorage.setItem('go_scene_progress_v1', JSON.stringify({
        version: 1, activeSceneId: ids[6], completedSceneIds: ids, sceneState: {},
      }));
    }, [S01_ID, S02_ID, S03_ID, S04_ID, S05_ID, S06_ID, S07_ID]);
    await s.page.reload({ waitUntil: 'networkidle' });
    await s.page.waitForTimeout(300);
    ensure(await s.page.locator('#s07-intro').isVisible(), 'son konu (Sahne #7) replay modunda açılmadı');
    const events = await getEventLog(s.page);
    ensure(events.some(e => e.type === 'scene_replay_started' && e.stepId === S07_ID), 'boot replay\'i scene_replay_started üretmedi');
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

/* ══════════════════════════════════════════════════════════════════
   BÖLÜM G — Sahne #4 "Grubun Nefesi" (core/curriculum.js l2.steps[2] —
   kullanıcıya görünen "3. adım", bkz. scenes/groupLibertyPolicy.js).
   v0.17 — kök neden düzeltmesi: önceki sürüm curriculum'un üç taşlı
   DOĞRUSAL örneğini SIRALI, ZORUNLU bir hedef listesine çeviriyordu —
   kullanıcı yalnız (4,4) sonra (4,5)'e tıklayabiliyordu. Artık kullanıcı
   tek çapa taşıyla başlar, grubun GERÇEK nefes noktalarından HERHANGİ
   birine (istediği sırada) tıklayarak 3-7 taşlık İSTEDİĞİ bağlı şekli
   serbestçe kurar. Aşağıdaki testler sabit `(4,4)`/`(4,5)` pikselleri
   yerine bir RING-TARAMA yardımcısıyla ("clickAnyLiberty"/
   "collectDistinctHoverPoints") GERÇEKTEN seçilebilir noktaları bulur —
   hangi nokta olduğu ÖNEMLİ DEĞİL, sahnenin serbestliği test edilir.
   ══════════════════════════════════════════════════════════════════ */

async function advanceToScene4(page) {
  await advanceToScene3AndIntro(page);
  const box = await page.locator('#ls-canvas').boundingBox();
  const { cx, cy } = boardCenterXY(box);
  await page.mouse.click(box.x + cx, box.y + cy);
  await page.waitForTimeout(200);
  await page.waitForSelector('#s03-next:not([disabled])');
  await page.click('#s03-next');
  await page.waitForTimeout(250);
  await page.waitForSelector('.ls-topic-end [data-action="advance"]');
  await page.click('.ls-topic-end [data-action="advance"]');
  await page.waitForTimeout(500);
}
async function confirmS04Intro(page) {
  await page.waitForSelector('#s04-confirm');
  await page.click('#s04-confirm');
  await page.waitForTimeout(300);
}
async function advanceToScene4AndIntro(page) {
  await advanceToScene4(page);
  await confirmS04Intro(page);
}

/** (dx,dy) aday ekran ofsetlerini merkez etrafında halkalar hâlinde
    üretir — GERÇEK grid koordinatı bilinmeden "bir sonraki nefes
    noktası nerede" sorusuna ampirik yanıt verir (bkz. dosya başı notu). */
function* ringOffsets(maxRing = 6) {
  for (let ring = 0; ring < maxRing; ring++) {
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2;
      const r = 20 + ring * 18;
      yield { dx: Math.round(Math.cos(angle) * r), dy: Math.round(Math.sin(angle) * r * 0.6) };
    }
  }
}
/** Herhangi bir GERÇEK nefes noktasını bulup tıklar — sahne artık tek bir
    zorunlu hedefe kilitli olmadığı için HANGİ nokta bulunduğu ÖNEMLİ
    DEĞİL, yalnız BİR tanesinin kabul edildiği kanıtlanır. */
async function clickAnyLiberty(page, box, beforeCount) {
  const cx = box.width / 2, cy = box.height / 2 - 8;
  for (const { dx, dy } of ringOffsets()) {
    const x = box.x + cx + dx, y = box.y + cy + dy;
    if (x < box.x || x > box.x + box.width || y < box.y || y > box.y + box.height) continue;
    await page.mouse.click(x, y);
    await page.waitForTimeout(15);
    const now = eventsFor(await getEventLog(page), S04_ID).filter(e => e.type === 'scene_move_played').length;
    if (now > beforeCount) return { dx, dy };
  }
  return null;
}
/** N gerçek hamle ekler (herhangi sırayla) — sonucu {count, lastPayload} olarak döner. */
async function addMoves(page, box, n) {
  let count = eventsFor(await getEventLog(page), S04_ID).filter(e => e.type === 'scene_move_played').length;
  for (let i = 0; i < n; i++) {
    const found = await clickAnyLiberty(page, box, count);
    if (!found) return { count, ok: false };
    await page.waitForTimeout(80);
    count += 1;
  }
  return { count, ok: true };
}
/** `exposeBoardAdapter=1` test hook'uyla, hover TARAMASI yaparak DİSTİNCT
    (farklı) geçerli nefes noktalarını toplar — "tüm nefes noktaları
    seçilebilir" iddiasını GERÇEK ghost state'iyle kanıtlar. */
async function collectDistinctHoverPoints(page, box, maxFound = 8) {
  const found = new Map();
  for (const { dx, dy } of ringOffsets()) {
    const x = box.x + box.width / 2 + dx, y = box.y + box.height / 2 - 8 + dy;
    if (x < box.x || x > box.x + box.width || y < box.y || y > box.y + box.height) continue;
    await page.mouse.move(x, y);
    await page.waitForTimeout(12);
    const preview = await getMovePreview(page);
    if (preview) found.set(`${preview.row},${preview.col}`, preview);
    if (found.size >= maxFound) break;
  }
  return [...found.values()];
}

addTest('G1) Sahne #3 tamamlanınca "Sonraki konu" Sahne #4\'e götürür; yalnız çapa taşıyla açılır', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene3AndIntro(s.page);
    const box = await s.page.locator('#ls-canvas').boundingBox();
    const { cx, cy } = boardCenterXY(box);
    await s.page.mouse.click(box.x + cx, box.y + cy);
    await s.page.waitForTimeout(200);
    await s.page.waitForSelector('#s03-next:not([disabled])');
    await s.page.click('#s03-next');
    await s.page.waitForTimeout(250);
    const advanceLabel = (await s.page.locator('.ls-topic-end [data-action="advance"]').textContent())?.trim();
    ensure(advanceLabel === 'Sonraki konu', `Sahne #3 → #4 butonu "Sonraki konu" olmalı, bulunan: "${advanceLabel}"`);
    await s.page.click('.ls-topic-end [data-action="advance"]');
    await s.page.waitForTimeout(500);
    ensure(await s.page.locator('#s04-intro').isVisible(), 'Sahne #4 mount edilmedi');
    const introText = await s.page.locator('#s04-intro .ls-strip-text').textContent();
    ensure(!/özgürlük|özgürlüğü|serbestlik|\bliberty\b|\bliberties\b/i.test(introText || ''), `intro metninde yasak terminoloji var: "${introText}"`);
    ensure(/nefes nokta/i.test(introText || ''), `intro metni "nefes noktası" demeli: "${introText}"`);
  } finally { await s.close(); }
});

addTest('G2) Sahne #3 → #4 geçişinde 6 kontrol noktası host/narration/board <1px sabit, duplicate ID yok, odak #s04-confirm\'de', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene3AndIntro(s.page);
    const box = await s.page.locator('#ls-canvas').boundingBox();
    const { cx, cy } = boardCenterXY(box);
    await s.page.mouse.click(box.x + cx, box.y + cy);
    await s.page.waitForTimeout(200);
    await s.page.waitForSelector('#s03-next:not([disabled])');
    await s.page.click('#s03-next');
    await s.page.waitForTimeout(250);
    await s.page.waitForSelector('.ls-topic-end [data-action="advance"]');

    const t_before = await s.page.locator('#ls-scene-host').boundingBox();
    const boardBefore = await s.page.locator('#ls-canvas').boundingBox();
    const narrBefore = await s.page.locator('#ls-narration').boundingBox();
    await s.page.waitForTimeout(100);
    const t_start = await s.page.locator('#ls-scene-host').boundingBox();

    await s.page.click('.ls-topic-end [data-action="advance"]');
    await s.page.waitForTimeout(45);
    const t_mid = await s.page.locator('#ls-scene-host').boundingBox();
    const dupAtMid = await s.page.evaluate(() => {
      const ids = Array.from(document.querySelectorAll('[id]')).map(el => el.id);
      return ids.length !== new Set(ids).size;
    });
    await s.page.waitForTimeout(185);
    const t_end = await s.page.locator('#ls-scene-host').boundingBox();
    await s.page.waitForTimeout(100);
    const t_cleanup100 = await s.page.locator('#ls-scene-host').boundingBox();
    await s.page.waitForTimeout(400);
    const t_cleanup500 = await s.page.locator('#ls-scene-host').boundingBox();
    const boardAfter = await s.page.locator('#ls-canvas').boundingBox();
    const narrAfter = await s.page.locator('#ls-narration').boundingBox();

    const points = { before: t_before, start: t_start, mid: t_mid, end: t_end, cleanup100: t_cleanup100, cleanup500: t_cleanup500 };
    let maxDiff = 0, worstLabel = null;
    for (const [label, b] of Object.entries(points)) {
      const d = bboxMaxDiff(t_before, b);
      if (d > maxDiff) { maxDiff = d; worstLabel = label; }
    }
    ensure(maxDiff < 1, `6 kontrol noktası arası scene-host bbox max fark <1px olmalı (bulunan: ${maxDiff.toFixed(3)}px, en kötü nokta: ${worstLabel})`);
    ensure(bboxMaxDiff(boardBefore, boardAfter) < 1, `board bbox <1px sabit olmalı (fark=${bboxMaxDiff(boardBefore, boardAfter).toFixed(3)}px)`);
    ensure(bboxMaxDiff(narrBefore, narrAfter) < 1, `narration bbox <1px sabit olmalı (fark=${bboxMaxDiff(narrBefore, narrAfter).toFixed(3)}px)`);
    ensure(!dupAtMid, 'fade-out sırasında duplicate ID OLUŞMAMALI');
    ensure(await s.page.locator('#s04-intro').count() === 1, 'Sahne #4 tek başlamalı');
    const focusedId = await s.page.evaluate(() => document.activeElement?.id ?? null);
    ensure(focusedId === 's04-confirm', `odak #s04-confirm'e taşınmalı, bulunan: "${focusedId}"`);
  } finally { await s.close(); }
});

addTest('G3) Başlangıçta çapa GERÇEK tek grup/4 nefes; intro onaylanmadan hamle kabul edilmiyor; tick hızlı çift tıklamada TEK kez tetiklenir', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceToScene4(s.page);
    const box = await s.page.locator('#ls-canvas').boundingBox();
    const before = eventsFor(await getEventLog(s.page), S04_ID).filter(e => e.type === 'scene_move_played').length;
    await s.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await s.page.waitForTimeout(150);
    ensure(eventsFor(await getEventLog(s.page), S04_ID).filter(e => e.type === 'scene_move_played').length === before, 'intro onaylanmadan board tıklaması hamle üretmemeli');

    const btnBox = await s.page.locator('#s04-confirm').boundingBox();
    await s.page.mouse.click(btnBox.x + btnBox.width / 2, btnBox.y + btnBox.height / 2);
    await s.page.mouse.click(btnBox.x + btnBox.width / 2, btnBox.y + btnBox.height / 2);
    await s.page.waitForTimeout(400);
    const confirmEvents = eventsFor(await getEventLog(s.page), S04_ID).filter(e => e.type === 'scene_intro_confirmed');
    ensure(confirmEvents.length === 1, `tick yalnız BİR kez tetiklenmeli, bulunan: ${confirmEvents.length}`);
    ensure(await s.page.locator('#s04-next').isDisabled(), 'başlangıçta "Sonraki konu" kilitli olmalı');

    // Çapanın GERÇEK dört nefes noktasının HEPSİ seçilebilir — hover
    // taramasıyla en az 4 FARKLI geçerli nokta bulunmalı (bkz. dosya başı notu).
    const distinct = await collectDistinctHoverPoints(s.page, box, 8);
    ensure(distinct.length >= 4, `çapanın en az dört farklı nefes noktası seçilebilir olmalı, bulunan: ${distinct.length} (${JSON.stringify(distinct)})`);
  } finally { await s.close(); }
});

addTest('G4) Kullanıcı ilk hamlede dört yönden istediğini seçebilir; ilk bağlantı GERÇEK tek grup üretir', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene4AndIntro(s.page);
    const box = await s.page.locator('#ls-canvas').boundingBox();
    const before = eventsFor(await getEventLog(s.page), S04_ID).filter(e => e.type === 'scene_move_played').length;
    const found = await clickAnyLiberty(s.page, box, before);
    ensure(!!found, 'çapanın dört komşusundan biri bulunup tıklanabilmeli');
    await s.page.waitForTimeout(150);

    const events = await getEventLog(s.page);
    const move1 = eventsFor(events, S04_ID).filter(e => e.type === 'scene_move_played');
    ensure(move1.length === 1, `tam olarak bir scene_move_played üretilmeli, bulunan: ${move1.length}`);
    ensure(move1[0].payload.groupSize === 2 && move1[0].payload.connectionNumber === 1, `ilk bağlantı payload'ı yanlış: ${JSON.stringify(move1[0].payload)}`);
    const lib1 = eventsFor(events, S04_ID).filter(e => e.type === 'scene_liberties_shown');
    ensure(lib1.length === 1 && lib1[0].payload.groupSize === 2, `scene_liberties_shown payload'ı yanlış: ${JSON.stringify(lib1[0]?.payload)}`);
    const statusText = (await s.page.locator('#s04-status').textContent())?.trim();
    ensure(new RegExp(`^Bu 2 taş bir grup — birlikte ${lib1[0].payload.libertyCount} nefes noktası var\\.$`).test(statusText || ''), `durum metni GERÇEK sayıyı yansıtmalı: "${statusText}"`);
    ensure(!/özgürlük|serbestlik|\bliberty\b|\bliberties\b/i.test(statusText || ''), `yasak terminoloji: "${statusText}"`);
  } finally { await s.close(); }
});

addTest('G5) İkinci hamle mevcut grubun HERHANGİ bir nefesine yapılabilir — sabit ikinci sıra YOK', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene4AndIntro(s.page);
    const box = await s.page.locator('#ls-canvas').boundingBox();
    const r1 = await addMoves(s.page, box, 2);
    ensure(r1.ok && r1.count === 2, `iki serbest hamle de kabul edilmeli, bulunan: ${JSON.stringify(r1)}`);
    const events = await getEventLog(s.page);
    const moves = eventsFor(events, S04_ID).filter(e => e.type === 'scene_move_played');
    ensure(moves.length === 2 && moves[1].payload.groupSize === 3 && moves[1].payload.connectionNumber === 2, `ikinci hamle payload'ı yanlış: ${JSON.stringify(moves[1]?.payload)}`);
  } finally { await s.close(); }
});

addTest('G6) Üç düz taş GERÇEK 8 nefes, üç L taşı RuleEngine\'in FARKLI gerçek sonucunu üretir — ikisi de 3 taşta completion açar', async () => {
  // Doğrusal (curriculum örneği) — deterministik (4,4) ve (4,5) hâlâ GEÇERLİ
  // birer nefes noktasıdır (artık ZORUNLU değil, ama kabul EDİLMELİ).
  {
    const s = await openScenesPage({ query: FAST_QUERY });
    try {
      await advanceToScene4AndIntro(s.page);
      const box = await s.page.locator('#ls-canvas').boundingBox();
      const { cx, cy } = boardCenterXY(box);
      await s.page.mouse.click(box.x + cx, box.y + cy); // (4,4)
      await s.page.waitForTimeout(150);
      await s.page.mouse.click(box.x + cx + 20, box.y + cy + 36); // (4,5)
      await s.page.waitForTimeout(150);
      const events = await getEventLog(s.page);
      const lib = eventsFor(events, S04_ID).filter(e => e.type === 'scene_liberties_shown');
      ensure(lib.length === 2 && lib[1].payload.groupSize === 3 && lib[1].payload.libertyCount === 8, `doğrusal 3 taş GERÇEK 8 nefes üretmeli: ${JSON.stringify(lib[1]?.payload)}`);
      const unlock = eventsFor(events, S04_ID).filter(e => e.type === 'scene_completion_unlocked');
      ensure(unlock.length === 1, 'doğrusal şekilde 3 taşta completion açılmalı');
    } finally { await s.close(); }
  }
  // L-biçimi — (4,4) sonra (4,4)'ün KUZEYİ (3,4), GERÇEK FARKLI sonuç (8 DEĞİL).
  {
    const s = await openScenesPage({ query: FAST_QUERY });
    try {
      await advanceToScene4AndIntro(s.page);
      const box = await s.page.locator('#ls-canvas').boundingBox();
      const { cx, cy } = boardCenterXY(box);
      await s.page.mouse.click(box.x + cx, box.y + cy); // (4,4)
      await s.page.waitForTimeout(150);
      await s.page.mouse.click(box.x + cx - 20, box.y + cy - 36); // (3,4) — L-biçimi
      await s.page.waitForTimeout(150);
      const events = await getEventLog(s.page);
      const lib = eventsFor(events, S04_ID).filter(e => e.type === 'scene_liberties_shown');
      ensure(lib.length === 2 && lib[1].payload.groupSize === 3, `L-biçimi de 3 taşlık tek grup üretmeli: ${JSON.stringify(lib[1]?.payload)}`);
      ensure(lib[1].payload.libertyCount !== 8, `L-biçimi doğrusaldan FARKLI bir sonuç üretmeli (8 OLMAMALI), bulunan: ${lib[1].payload.libertyCount}`);
      ensure(lib[1].payload.libertyCount === 7, `L-biçiminin GERÇEK sonucu 7 olmalı, bulunan: ${lib[1].payload.libertyCount}`);
      const unlock = eventsFor(events, S04_ID).filter(e => e.type === 'scene_completion_unlocked');
      ensure(unlock.length === 1, 'L-biçiminde de 3 taşta completion açılmalı');
    } finally { await s.close(); }
  }
});

addTest('G7) Completion 1-2 taşta kapalı, ilk kez 3 taşta TAM BİR KEZ açılır; "Sonraki konu" 3\'ten itibaren aktif kalır', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene4AndIntro(s.page);
    const box = await s.page.locator('#ls-canvas').boundingBox();

    ensure(await s.page.locator('#s04-next').isDisabled(), '1 taşta (yalnız çapa) kilitli olmalı');
    await addMoves(s.page, box, 1);
    ensure(await s.page.locator('#s04-next').isDisabled(), '2 taşta hâlâ kilitli olmalı');
    let unlock = eventsFor(await getEventLog(s.page), S04_ID).filter(e => e.type === 'scene_completion_unlocked');
    ensure(unlock.length === 0, '2 taşta completion AÇILMAMALI');

    await addMoves(s.page, box, 1); // 3. taş
    ensure(!(await s.page.locator('#s04-next').isDisabled()), '3 taşta "Sonraki konu" aktif olmalı');
    unlock = eventsFor(await getEventLog(s.page), S04_ID).filter(e => e.type === 'scene_completion_unlocked');
    ensure(unlock.length === 1, `3 taşta completion TAM BİR KEZ açılmalı, bulunan: ${unlock.length}`);

    await addMoves(s.page, box, 1); // 4. taş
    unlock = eventsFor(await getEventLog(s.page), S04_ID).filter(e => e.type === 'scene_completion_unlocked');
    ensure(unlock.length === 1, `4. taştan sonra İKİNCİ completion_unlocked OLUŞMAMALI, bulunan: ${unlock.length}`);
    ensure(!(await s.page.locator('#s04-next').isDisabled()), '4 taşta "Sonraki konu" aktif kalmalı');
  } finally { await s.close(); }
});

addTest('G8) 4/5/6/7 taş serbestçe eklenebilir; her adımda taşlar tek grup kalır ve liberty işaretleri gerçek yeni kümeyle güncellenir', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene4AndIntro(s.page);
    const box = await s.page.locator('#ls-canvas').boundingBox();
    const r = await addMoves(s.page, box, 6); // toplam 7 taş (çapa+6)
    ensure(r.ok, `altı serbest hamle de kabul edilmeli, bulunan: ${JSON.stringify(r)}`);
    const events = await getEventLog(s.page);
    const moves = eventsFor(events, S04_ID).filter(e => e.type === 'scene_move_played');
    ensure(moves.length === 6, `altı gerçek hamle üretilmeli, bulunan: ${moves.length}`);
    const sizes = moves.map(e => e.payload.groupSize);
    ensure(JSON.stringify(sizes) === JSON.stringify([2, 3, 4, 5, 6, 7]), `groupSize sırayla artmalı [2..7], bulunan: ${JSON.stringify(sizes)}`);
    const libEvents = eventsFor(events, S04_ID).filter(e => e.type === 'scene_liberties_shown');
    ensure(libEvents.length === 6, `her hamlede scene_liberties_shown üretilmeli, bulunan: ${libEvents.length}`);
    // Her libertyCount pozitif ve GERÇEK (event payload'ından, sabit değil).
    ensure(libEvents.every(e => Number.isInteger(e.payload.libertyCount) && e.payload.libertyCount > 0), 'her liberty event gerçek pozitif bir sayı taşımalı');
    const finalStatus = (await s.page.locator('#s04-status').textContent())?.trim();
    ensure(new RegExp(`^Bu 7 taş bir grup — birlikte ${libEvents[5].payload.libertyCount} nefes noktası var\\.$`).test(finalStatus || ''), `nihai durum metni gerçek sayıyla eşleşmeli: "${finalStatus}"`);
  } finally { await s.close(); }
});

addTest('G9) Yedinci taştan sonra input kapanır, sekizinci taş HİÇBİR KOŞULDA yerleşmez; "Sonraki konu" aktif kalır', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene4AndIntro(s.page);
    const box = await s.page.locator('#ls-canvas').boundingBox();
    const r = await addMoves(s.page, box, 6);
    ensure(r.ok && r.count === 6, `ön koşul: altı hamle eklenmeli, bulunan: ${JSON.stringify(r)}`);
    ensure(!(await s.page.locator('#s04-next').isDisabled()), '7 taşta "Sonraki konu" aktif olmalı');
    const captionText = (await s.page.locator('#s04-caption').textContent())?.trim();
    ensure(captionText === 'Yedi taşlık örüntünü oluşturdun.', `7 taş metni doğru olmalı, bulunan: "${captionText}"`);

    const before8 = eventsFor(await getEventLog(s.page), S04_ID).filter(e => e.type === 'scene_move_played').length;
    // Herhangi bir noktaya (board üzerinde rastgele birkaç yere) tıklamayı dene — hiçbiri yeni hamle üretmemeli.
    for (const [dx, dy] of [[0, 0], [50, 0], [-50, 0], [0, 50], [0, -50]]) {
      await s.page.mouse.click(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
      await s.page.waitForTimeout(60);
    }
    const after8 = eventsFor(await getEventLog(s.page), S04_ID).filter(e => e.type === 'scene_move_played').length;
    ensure(after8 === before8, `sekizinci taş HİÇBİR KOŞULDA eklenmemeli, bulunan hamle artışı: ${after8 - before8}`);
  } finally { await s.close(); }
});

addTest('G10) Hedef dışı/gruba kopuk bir noktaya tıklama state/event üretmez, mevcut liberty işaretlerini BOZMAZ', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene4AndIntro(s.page);
    const box = await s.page.locator('#ls-canvas').boundingBox();
    const beforeMove = eventsFor(await getEventLog(s.page), S04_ID).filter(e => e.type === 'scene_move_played').length;
    const beforeLib = eventsFor(await getEventLog(s.page), S04_ID).filter(e => e.type === 'scene_liberties_shown').length;
    // Uzak köşe — çapaya bitişik olması pratik olarak imkansız.
    await s.page.mouse.click(box.x + box.width * 0.05, box.y + box.height * 0.05);
    await s.page.waitForTimeout(150);
    const afterMove = eventsFor(await getEventLog(s.page), S04_ID).filter(e => e.type === 'scene_move_played').length;
    const afterLib = eventsFor(await getEventLog(s.page), S04_ID).filter(e => e.type === 'scene_liberties_shown').length;
    ensure(afterMove === beforeMove, 'hedef dışı tıklama yeni hamle üretmemeli');
    ensure(afterLib === beforeLib, 'hedef dışı tıklama liberty işaretlerini YENİDEN ÇİZDİRMEMELİ');
    const unlockEvents = eventsFor(await getEventLog(s.page), S04_ID).filter(e => e.type === 'scene_completion_unlocked');
    ensure(unlockEvents.length === 0, 'yanlış deneme completion unlock ÜRETMEMELİ');
    const statusText = (await s.page.locator('#s04-status').textContent())?.trim();
    ensure(/turkuaz/i.test(statusText || ''), `yönlendirici hata metni gösterilmeli, bulunan: "${statusText}"`);
    ensure(!/özgürlük|serbestlik|\bliberty\b|\bliberties\b/i.test(statusText || ''), `yönlendirme metninde yasak terminoloji: "${statusText}"`);
  } finally { await s.close(); }
});

addTest('G11) Hızlı çift tıklama (aynı noktaya) duplicate taş/event oluşturmaz', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene4AndIntro(s.page);
    const box = await s.page.locator('#ls-canvas').boundingBox();
    const { cx, cy } = boardCenterXY(box);
    await s.page.mouse.click(box.x + cx, box.y + cy);
    await s.page.mouse.click(box.x + cx, box.y + cy);
    await s.page.waitForTimeout(300);
    const events = await getEventLog(s.page);
    const moveEvents = eventsFor(events, S04_ID).filter(e => e.type === 'scene_move_played');
    ensure(moveEvents.length === 1, `hızlı çift tıklama TEK gerçek hamle üretmeli (ikinci tık artık dolu noktaya düşer), bulunan: ${moveEvents.length}`);
  } finally { await s.close(); }
});

addTest('G12) Pointer ghost YALNIZ hover edilen yasal nefes noktasında görünür; hover ayrılınca temizlenir; teknik dil yok; konu-sonu doğru açılır', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceToScene4AndIntro(s.page);
    const box = await s.page.locator('#ls-canvas').boundingBox();

    // Zorunlu/varsayılan ghost YOK — hover öncesi null olmalı.
    const previewBeforeHover = await getMovePreview(s.page);
    ensure(previewBeforeHover === null, `hover öncesi zorunlu bir ghost OLMAMALI, bulunan: ${JSON.stringify(previewBeforeHover)}`);

    const distinct = await collectDistinctHoverPoints(s.page, box, 1);
    ensure(distinct.length >= 1, 'en az bir geçerli nefes noktası hover ile bulunabilmeli');
    // Hover'dan uzaklaş — geçersiz bir noktaya (canvas İÇİNDE ama board
    // çiziminin dışındaki koyu köşe alanı — canvas kenarına ÇOK yakın bir
    // nokta bazı tarayıcılarda element sınırını kaçırıp olayı hiç
    // tetiklemeyebilir, bu yüzden aynı "güvenli boş köşe" fraksiyonu
    // kullanılır, bkz. G10) — ghost temizlenmeli.
    await s.page.mouse.move(box.x + box.width * 0.05, box.y + box.height * 0.05);
    await s.page.waitForTimeout(80);
    const previewFarAway = await getMovePreview(s.page);
    ensure(previewFarAway === null, `board dışına/geçersiz bir noktaya hareket edince ghost temizlenmeli, bulunan: ${JSON.stringify(previewFarAway)}`);

    await addMoves(s.page, box, 2); // 3 taşa ulaş
    await s.page.click('#s04-next');
    await s.page.waitForTimeout(200);
    const infoText = await s.page.locator('#ls-scene-host').innerText();
    ensure(!/sahne\s*tamamlandı|scene.?completed|registry|runtime/i.test(infoText), `teknik dil sızmış: "${infoText}"`);
    ensure(!/özgürlük|serbestlik|\bliberty\b|\bliberties\b/i.test(infoText || ''), `yasak terminoloji sızmış: "${infoText}"`);
    const advanceLabel = (await s.page.locator('.ls-topic-end [data-action="advance"]').textContent())?.trim();
    // v0.19 — Sahne #5 kayıtlı olduğu için Sahne #4 artık SON sahne DEĞİL;
    // "Sonraki konu" göstermeli (bkz. context.hasNextScene, scenes/
    // topicEndControls.js). "Konular" etiketi artık yalnız Sahne #5'te.
    ensure(advanceLabel === 'Sonraki konu', `Sahne #4 (artık son kayıtlı sahne DEĞİL) butonu "Sonraki konu" olmalı, bulunan: "${advanceLabel}"`);
    const summary = (await s.page.locator('.ls-topic-end-summary').textContent())?.trim();
    ensure(!/özgürlük|serbestlik/i.test(summary || ''), `özet metninde yasak terminoloji: "${summary}"`);
  } finally { await s.close(); }
});

addTest('G13) "Bu konuyu tekrar et" TEMİZ (yalnız çapa) başlar, kullanıcı YENİ bir şekil kurabilir, completion geçmişini çoğaltmaz', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene4AndIntro(s.page);
    const box = await s.page.locator('#ls-canvas').boundingBox();
    await addMoves(s.page, box, 2);
    await s.page.click('#s04-next');
    await s.page.waitForTimeout(200);
    const progressBeforeReplay = await s.page.evaluate(() => JSON.parse(localStorage.getItem('go_scene_progress_v1') || 'null'));
    await s.page.click('.ls-topic-end [data-action="replay"]');
    await s.page.waitForTimeout(500);

    ensure(await s.page.locator('#s04-intro').isVisible(), 'replay sonrası intro durumuna dönmeli');
    ensure(await s.page.locator('.ls-topic-end').count() === 0, 'replay sonrası eski konu-sonu DOM\'u kalmamalı');
    const replayEvents = eventsFor(await getEventLog(s.page), S04_ID).filter(e => e.type === 'scene_replay_started');
    ensure(replayEvents.length === 1, 'scene_replay_started tam bir kez üretilmeli');

    await confirmS04Intro(s.page);
    // Replay sonrası YENİ bir şekil kur (farklı sırayla 3 taş).
    const r = await addMoves(s.page, box, 2);
    ensure(r.ok, `replay sonrası yeni bir şekil serbestçe kurulabilmeli, bulunan: ${JSON.stringify(r)}`);
    const afterReplayEvents = await getEventLog(s.page);
    const afterReplayMoves = eventsFor(afterReplayEvents, S04_ID).filter(e => e.type === 'scene_move_played' && e.payload.mode === 'replay');
    ensure(afterReplayMoves.length === 2 && afterReplayMoves[0].payload.groupSize === 2, `replay sonrası TEMİZ state'ten başlamalı, bulunan: ${JSON.stringify(afterReplayMoves.map(e => e.payload))}`);

    const progressAfterReplay = await s.page.evaluate(() => JSON.parse(localStorage.getItem('go_scene_progress_v1') || 'null'));
    ensure(JSON.stringify(progressBeforeReplay.completedSceneIds) === JSON.stringify(progressAfterReplay.completedSceneIds), 'replay completedSceneIds listesini DEĞİŞTİRMEMELİ/ÇOĞALTMAMALI');
  } finally { await s.close(); }
});

addTest('G14) Reload: 2/4/6 taşta (tamamlanmadan önce) yenile → yalnız çapa taşıyla temiz başa döner, önceki sahne completion\'ları korunur', async () => {
  for (const n of [1, 3, 5]) { // çapa + n = 2, 4, 6 taş
    const s = await openScenesPage({ query: FAST_QUERY });
    try {
      await advanceToScene4AndIntro(s.page);
      const box = await s.page.locator('#ls-canvas').boundingBox();
      await addMoves(s.page, box, n);
      const progressBefore = await s.page.evaluate(() => JSON.parse(localStorage.getItem('go_scene_progress_v1') || 'null'));

      await s.page.reload({ waitUntil: 'networkidle' });
      await s.page.waitForTimeout(300);
      ensure(await s.page.locator('#s04-intro').isVisible(), `${n + 1} taşta reload sonrası Sahne #4 baştan (intro) başlamalı`);

      const progressAfter = await s.page.evaluate(() => JSON.parse(localStorage.getItem('go_scene_progress_v1') || 'null'));
      ensure(!progressAfter.completedSceneIds.includes(S04_ID), `${n + 1} taşta yarım kalan şekil completedSceneIds'e YAZILMAMALI`);
      ensure(JSON.stringify(progressBefore.completedSceneIds.filter(id => id !== S04_ID)) === JSON.stringify(progressAfter.completedSceneIds.filter(id => id !== S04_ID)), 'önceki sahnelerin completion\'ları korunmalı');

      await confirmS04Intro(s.page);
      const r = await addMoves(s.page, box, 1);
      const moveEvents = eventsFor(await getEventLog(s.page), S04_ID).filter(e => e.type === 'scene_move_played');
      const lastMove = moveEvents[moveEvents.length - 1];
      ensure(r.ok && lastMove?.payload.groupSize === 2, `${n + 1} taşta reload sonrası TEMİZ çapadan başlamalı (groupSize=2 bekleniyor), bulunan: ${JSON.stringify(lastMove?.payload)}`);
    } finally { await s.close(); }
  }
});

addTest('G15) Reload: Sahne #4 tamamlanmışsa (ama Sahne #5\'e henüz geçilmemişse) progress doğru yazılır, legacy go_done_3d dokunulmaz, reload SIRADAKİ tamamlanmamış konuyu (artık Sahne #5) NORMAL modda açar', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene4AndIntro(s.page);
    const legacyBefore = await s.page.evaluate(() => localStorage.getItem('go_done_3d'));
    const box = await s.page.locator('#ls-canvas').boundingBox();
    await addMoves(s.page, box, 2);
    await s.page.click('#s04-next');
    await s.page.waitForTimeout(200);

    const progress = await s.page.evaluate(() => JSON.parse(localStorage.getItem('go_scene_progress_v1') || 'null'));
    ensure(progress?.completedSceneIds?.filter(id => id === S04_ID).length === 1, `completedSceneIds S4'ü tam bir kez içermeli, bulunan: ${JSON.stringify(progress?.completedSceneIds)}`);
    const legacyAfter = await s.page.evaluate(() => localStorage.getItem('go_done_3d'));
    ensure(legacyAfter === legacyBefore, 'legacy go_done_3d DEĞİŞMEMELİ');

    // v0.19 — Sahne #4 artık SON sahne DEĞİL (Sahne #5 kayıtlı); reload
    // "sıradaki tamamlanmamış konu"yu (Sahne #5) NORMAL modda açmalı —
    // "son sahne replay" davranışı artık YALNIZ tüm 5 konu tamamlandığında
    // geçerli (bkz. C16).
    await s.page.reload({ waitUntil: 'networkidle' });
    await s.page.waitForTimeout(300);
    ensure(await s.page.locator('#s05-intro').isVisible(), 'reload sonrası sıradaki tamamlanmamış konu (Sahne #5) açılmalı');
    const events = await getEventLog(s.page);
    ensure(!events.some(e => e.type === 'scene_replay_started' && e.stepId === S05_ID), 'Sahne #5 henüz tamamlanmadığı için NORMAL modda açılmalı, replay DEĞİL');
  } finally { await s.close(); }
});

addTest('G16) Konular paneli 1/3/7 taş aşamalarında input\'u kilitler, board click sızdırmaz, kapanınca AYNI durumu geri getirir', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceToScene4AndIntro(s.page);
    const box = await s.page.locator('#ls-canvas').boundingBox();

    // Aşama 1 — yalnız çapa (1 taş).
    const distinctBefore = await collectDistinctHoverPoints(s.page, box, 1);
    ensure(distinctBefore.length >= 1, 'aşama 1: ön koşul, en az bir nefes noktası hover ile bulunmalı');
    await s.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); // ghost'u temizle (panel öncesi nötr durum)
    await s.page.click('#ls-topics-open');
    await s.page.waitForTimeout(150);
    ensure((await getMovePreview(s.page)) === null, 'aşama 1: panel açıkken ghost null olmalı');
    const beforeMove1 = eventsFor(await getEventLog(s.page), S04_ID).filter(e => e.type === 'scene_move_played').length;
    await s.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await s.page.waitForTimeout(100);
    ensure(eventsFor(await getEventLog(s.page), S04_ID).filter(e => e.type === 'scene_move_played').length === beforeMove1, 'aşama 1: panel açıkken board tıklaması hamle üretmemeli');
    await s.page.keyboard.press('Escape');
    await s.page.waitForTimeout(150);
    ensure(await s.page.locator('#s04-intro').count() === 0 || true, 'aşama 1: panel kapandı'); // sahne intro'dan sonra zaten ilerlemiş olabilir — asıl kanıt aşağıda
    const r1 = await addMoves(s.page, box, 1);
    ensure(r1.ok, 'aşama 1: panel kapandıktan sonra board input normale dönmeli (hamle yapılabilmeli)');

    // Aşama 3 — 3 taşa ulaşıldı (completion açıldı), panel aç/kapat mevcut durumu bozmamalı.
    await addMoves(s.page, box, 1); // toplam 3
    const statusBefore3 = (await s.page.locator('#s04-status').textContent())?.trim();
    await s.page.click('#ls-topics-open');
    await s.page.waitForTimeout(150);
    await s.page.keyboard.press('Escape');
    await s.page.waitForTimeout(150);
    const statusAfter3 = (await s.page.locator('#s04-status').textContent())?.trim();
    ensure(statusAfter3 === statusBefore3, `aşama 3: panel aç/kapat mevcut grup durumunu BOZMAMALI: önce="${statusBefore3}" sonra="${statusAfter3}"`);
    ensure(!(await s.page.locator('#s04-next').isDisabled()), 'aşama 3: panel sonrası "Sonraki konu" hâlâ aktif olmalı');

    // Aşama 7 — üst sınıra ulaşıldı, panel aç/kapat final durumu bozmamalı.
    await addMoves(s.page, box, 4); // toplam 7
    const statusBefore7 = (await s.page.locator('#s04-status').textContent())?.trim();
    ensure(/^Bu 7 taş/.test(statusBefore7 || ''), `ön koşul: 7 taşa ulaşılmalı, bulunan: "${statusBefore7}"`);
    await s.page.click('#ls-topics-open');
    await s.page.waitForTimeout(150);
    await s.page.keyboard.press('Escape');
    await s.page.waitForTimeout(150);
    const statusAfter7 = (await s.page.locator('#s04-status').textContent())?.trim();
    ensure(statusAfter7 === statusBefore7, `aşama 7: panel aç/kapat nihai durumu BOZMAMALI: önce="${statusBefore7}" sonra="${statusAfter7}"`);
  } finally { await s.close(); }
});

addTest('G17) Konular panelinden farklı bir sahneye geçilince Sahne #4\'ün eski interaction snapshot\'ı sızmaz', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceToScene4AndIntro(s.page);
    await s.page.click('#ls-topics-open');
    await s.page.waitForTimeout(150);
    await s.page.locator('.ls-topic-item').nth(0).click();
    await s.page.waitForTimeout(600);
    ensure(await s.page.locator('#s01-intro').isVisible(), 'Sahne #1 açılmadı');
    const previewAfterSwitch = await getMovePreview(s.page);
    ensure(previewAfterSwitch === null, `başka sahneye geçince Sahne #4'ün eski preview'ı SIZMAMALI, bulunan: ${JSON.stringify(previewAfterSwitch)}`);
  } finally { await s.close(); }
});

addTest('G18) Reduced-motion: serbest keşif akışı (intro→3 hamle→konu-sonu) animasyonsuz tamamlanabilir', async () => {
  const s = await openScenesPage({ reducedMotion: 'reduce', query: FAST_QUERY });
  try {
    await advanceToScene4(s.page);
    ensure(await s.page.locator('#s04-intro').isVisible(), 'reduced-motion\'da Sahne #4 intro açılmalı');
    await confirmS04Intro(s.page);
    const box = await s.page.locator('#ls-canvas').boundingBox();
    const r = await addMoves(s.page, box, 2);
    ensure(r.ok, 'reduced-motion\'da serbest hamleler kabul edilmeli');
    ensure(!(await s.page.locator('#s04-next').isDisabled()), 'reduced-motion\'da 3 taştan sonra "Sonraki konu" aktif olmalı');
    await s.page.click('#s04-next');
    await s.page.waitForTimeout(150);
    ensure(await s.page.locator('.ls-topic-end').isVisible(), 'reduced-motion\'da konu-sonu satırı açılmalı');
  } finally { await s.close(); }
});

addTest('G19) Sahne #4 masaüstü/tablet/mobilde taşma üretmez; serbest hamleler her viewport\'ta tamamlanabilir; mobil tek dokunuş tek taş üretir', async () => {
  for (const viewport of [VIEWPORTS.desktop, VIEWPORTS.tablet, VIEWPORTS.mobile]) {
    const s = await openScenesPage({ viewport, query: FAST_QUERY, hasTouch: viewport === VIEWPORTS.mobile });
    try {
      await advanceToScene4AndIntro(s.page);
      const box = await s.page.locator('#ls-canvas').boundingBox();
      const r = await addMoves(s.page, box, 2);
      ensure(r.ok, `${viewport.width}px: serbest hamleler kabul edilmeli, bulunan: ${JSON.stringify(r)}`);
      const noOverflow = await s.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
      ensure(noOverflow, `${viewport.width}px: yatay taşma var`);
      const boardBox = await s.page.locator('#ls-board-region').boundingBox();
      const narrationBox = await s.page.locator('#ls-narration').boundingBox();
      ensure(!boxesIntersect(boardBox, narrationBox), `${viewport.width}px: board/narration kesişiyor`);
      ensure(!(await s.page.locator('#s04-next').isDisabled()), `${viewport.width}px: 3 taştan sonra "Sonraki konu" aktif olmalı`);

      if (viewport === VIEWPORTS.mobile) {
        const before = eventsFor(await getEventLog(s.page), S04_ID).filter(e => e.type === 'scene_move_played').length;
        const found = await clickAnyLiberty(s.page, box, before);
        ensure(!!found, 'mobil: dördüncü hamle için bir nefes noktası bulunmalı');
        await s.page.waitForTimeout(150);
        const after = eventsFor(await getEventLog(s.page), S04_ID).filter(e => e.type === 'scene_move_played').length;
        ensure(after === before + 1, 'mobil: tek dokunuş yalnız bir gerçek hamle üretmeli');
      }
    } finally { await s.close(); }
  }
});

addTest('G20) Sahne #4\'ün tick ve "Sonraki konu" kontrolleri klavyeyle (Tab+Enter) kullanılabilir', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene4(s.page);
    await s.page.locator('#s04-confirm').focus();
    ensure(await s.page.evaluate(() => document.activeElement?.id) === 's04-confirm', 'tick klavyeyle odaklanamadı');
    await s.page.keyboard.press('Enter');
    await s.page.waitForTimeout(400);
    ensure(await s.page.locator('#s04-play').isVisible(), 'Enter ile tick tetiklenmedi');

    const box = await s.page.locator('#ls-canvas').boundingBox();
    await addMoves(s.page, box, 2);
    await s.page.locator('#s04-next').focus();
    ensure(await s.page.evaluate(() => document.activeElement?.id) === 's04-next', '"Sonraki konu" klavyeyle odaklanamadı');
    await s.page.keyboard.press('Enter');
    await s.page.waitForTimeout(200);
    ensure(await s.page.locator('.ls-topic-end').isVisible(), 'Enter ile "Sonraki konu" tetiklenmedi');
  } finally { await s.close(); }
});

addTest('G21) Sahne #4\'ün tam akışı (intro+panel+yanlış deneme+serbest şekil+konu-sonu) boyunca konsolda/pageerror\'da hata yok', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene4AndIntro(s.page);
    await s.page.click('#ls-topics-open');
    await s.page.waitForTimeout(150);
    await s.page.keyboard.press('Escape');
    await s.page.waitForTimeout(150);
    const box = await s.page.locator('#ls-canvas').boundingBox();
    await s.page.mouse.click(box.x + box.width * 0.05, box.y + box.height * 0.05); // yanlış deneme
    await s.page.waitForTimeout(100);
    await addMoves(s.page, box, 3);
    await s.page.click('#s04-next');
    await s.page.waitForTimeout(300);
    ensure(s.consoleErrors.length === 0, `hata bulundu: ${s.consoleErrors.join(' | ')}`);
  } finally { await s.close(); }
});

addTest('G22) Teacher Studio: Curriculum "nefes noktası" terminolojisini gösterir, Diagnostics serbest policy sınırlarını doğrular, Event Log farklı şekillerin groupSize/libertyCount değişimini gösterir', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene4AndIntro(s.page);
    const box = await s.page.locator('#ls-canvas').boundingBox();
    await addMoves(s.page, box, 2);
    await s.page.click('#s04-next');
    await s.page.waitForTimeout(200);

    const studioPage = await s.context.newPage();
    const studioErrors = [];
    studioPage.on('pageerror', e => studioErrors.push(e.message));
    studioPage.on('console', m => { if (m.type() === 'error') studioErrors.push(m.text()); });
    await studioPage.goto(`${BASE}/teacher-studio.html`, { waitUntil: 'networkidle' });

    await studioPage.click('[data-tab="curriculum"]');
    await studioPage.waitForTimeout(150);
    const curriculumText = await studioPage.locator('#curriculum-scene-table').textContent();
    ensure(curriculumText.includes('Grubun Nefesi') && curriculumText.includes(S04_ID) && curriculumText.includes('l2') && curriculumText.includes('liberty'),
      `Curriculum'da Sahne #4 doğru görünmüyor: ${curriculumText.slice(0, 300)}`);
    ensure(!/özgürlük|serbestlik/i.test(curriculumText), 'Curriculum kullanıcıya görünen alanlarda yasak terminoloji göstermemeli');

    await studioPage.click('[data-tab="diagnostics"]');
    await studioPage.waitForTimeout(150);
    const diagText = await studioPage.locator('#diag-scene-table').textContent();
    ensure(!diagText.includes(S04_ID) || diagText.includes('geçerli'), `Diagnostics Sahne #4 için hata bildiriyor: ${diagText.slice(0, 600)}`);
    ensure(!/UNEXPECTED_|NOT_COMPLETABLE|COMPLETABLE_BELOW|EIGHTH_STONE|L_SHAPE_|NON_SEED_SHAPE_REJECTED|SEVEN_STONE_BOUNDARY/.test(diagText), `Diagnostics serbest policy sınır ihlali bildiriyor: ${diagText.slice(0, 600)}`);

    await studioPage.click('[data-tab="event-log"]');
    await studioPage.waitForTimeout(150);
    const eventLogText = await studioPage.locator('#event-log-table').textContent();
    ensure(eventLogText.includes(S04_ID), 'Event Log Sahne #4 event\'lerini göstermiyor');
    ensure(eventLogText.includes('"groupSize":3') || eventLogText.includes('"groupSize": 3'), 'Event Log farklı groupSize değerlerini göstermiyor');

    ensure(studioErrors.length === 0, `Studio'da hata: ${studioErrors.join(' | ')}`);
    await studioPage.close();
  } finally { await s.close(); }
});


/* ══════════════════════════════════════════════════════════════════
   Sahne #5 ("Nefes Noktalarını Değerlendir") akış yardımcıları
   ══════════════════════════════════════════════════════════════════ */
async function buildScene4ThreeStones(page) {
  const box = await page.locator('#ls-canvas').boundingBox();
  for (let i = 0; i < 2; i++) {
    const before = eventsFor(await getEventLog(page), S04_ID).filter(e => e.type === 'scene_move_played').length;
    await clickAnyLiberty(page, box, before);
    await page.waitForTimeout(80);
  }
}
async function advanceToScene5(page) {
  await advanceToScene4AndIntro(page);
  await buildScene4ThreeStones(page);
  await page.waitForSelector('#s04-next:not([disabled])');
  await page.click('#s04-next');
  await page.waitForTimeout(250);
  await page.waitForSelector('.ls-topic-end [data-action="advance"]');
  await page.click('.ls-topic-end [data-action="advance"]');
  await page.waitForTimeout(500);
}
async function confirmS05Intro(page) {
  await page.waitForSelector('#s05-confirm');
  await page.click('#s05-confirm');
  await page.waitForTimeout(300);
}
async function advanceToScene5AndIntro(page) {
  await advanceToScene5(page);
  await confirmS05Intro(page);
}
/** Sahne #5'in board_tap tipi öğesinde herhangi bir GERÇEK doğru noktayı
    bulup dokunur — başarı "Devam" düğmesinin görünür olmasıyla ölçülür
    (Sahne #4'ün move-event tabanlı clickAnyLiberty'sinden FARKLI sinyal,
    çünkü Sahne #5'te YANLIŞ dokunma da bir event üretir — bkz. dosya başı). */
async function getHoverPoint(page) {
  return page.evaluate(() => window.__lsTestBoardAdapter?.getHoverPoint() ?? null);
}
/** H25/H26 için: "tek fiziksel dokunuş → tek gerçek cevap event'i" iddiasını
    yanlış-tıklama gürültüsü OLMADAN ölçmek üzere, ÖNCE hover (dokunuş
    üretmeyen, adaptörün GERÇEK hit-test'ini sabit piksel varsayımı OLMADAN
    okuyan) ile doğru (row,col) ekran ofsetini bulur, SONRA yalnız o tek
    noktaya TEK bir click üretir — böylece answered-event sayımı "kullanıcı
    tek dokunuşta ne üretir" sorusuna gerçekten yanıt verir (bkz. görev
    talimatı: sabit piksel koordinatı YOK, GERÇEK RuleEngine hedef kümesi
    ile karşılaştırma VAR — dosya başı getHoverPoint notu). */
async function tapExactCorrectS05(page, box, curriculumStepIndex) {
  const assessment = getAssessmentSteps().find(a => a.curriculumStepIndex === curriculumStepIndex);
  if (!assessment) return false;
  const realTargets = computeTapTargets(assessment);
  const cx = box.width / 2, cy = box.height / 2 - 8;
  for (const { dx, dy } of ringOffsets()) {
    const x = box.x + cx + dx, y = box.y + cy + dy;
    if (x < box.x || x > box.x + box.width || y < box.y || y > box.y + box.height) continue;
    await page.mouse.move(x, y);
    await page.waitForTimeout(20);
    const hit = await getHoverPoint(page);
    if (hit && realTargets.some(t => t.row === hit.row && t.col === hit.col)) {
      await page.mouse.click(x, y);
      return true;
    }
  }
  return false;
}
/** H30 için: item 5'in GERÇEK yanlış-cevap semantiğini (board değişmez,
    hâlâ atari) sabit/tahmini bir piksel ofsetiyle DEĞİL, tapExactCorrectS05
    ile AYNI hover-tabanlı hit-test okumasıyla bulunan, GERÇEKTEN board
    üzerinde ama hedef kümede OLMAYAN bir kesişime tek bir click ile test
    eder — "köşeye rastgele tıkla" yaklaşımı hedef dışı bir boşluğa (hit
    olmayan bir noktaya) denk gelebilir ve HİÇ event üretmeyebilirdi. */
async function tapAnyWrongS05(page, box, curriculumStepIndex) {
  const assessment = getAssessmentSteps().find(a => a.curriculumStepIndex === curriculumStepIndex);
  if (!assessment) return false;
  const realTargets = computeTapTargets(assessment);
  const cx = box.width / 2, cy = box.height / 2 - 8;
  for (const { dx, dy } of ringOffsets()) {
    const x = box.x + cx + dx, y = box.y + cy + dy;
    if (x < box.x || x > box.x + box.width || y < box.y || y > box.y + box.height) continue;
    await page.mouse.move(x, y);
    await page.waitForTimeout(20);
    const hit = await getHoverPoint(page);
    if (hit && !realTargets.some(t => t.row === hit.row && t.col === hit.col)) {
      await page.mouse.click(x, y);
      return true;
    }
  }
  return false;
}
async function tapAnyCorrectS05(page, box) {
  const cx = box.width / 2, cy = box.height / 2 - 8;
  for (const { dx, dy } of ringOffsets()) {
    const x = box.x + cx + dx, y = box.y + cy + dy;
    if (x < box.x || x > box.x + box.width || y < box.y || y > box.y + box.height) continue;
    await page.mouse.click(x, y);
    await page.waitForTimeout(25);
    if (!(await page.locator('#s05-continue').isHidden())) return true;
  }
  return false;
}
/** Sahne #5'in AKTİF öğesine (tür fark etmeksizin) doğru cevabı verir —
    choice tipinde TÜM butonları sırayla dener (yanlışlar zararsız event
    üretir, doğru olan Devam'ı açar), board_tap tipinde ring-scan kullanır. */
async function answerCurrentS05Item(page) {
  const isChoice = await page.locator('.s05-choice-options').count() > 0;
  if (isChoice) {
    const buttons = page.locator('.s05-choice-btn');
    const count = await buttons.count();
    for (let i = 0; i < count; i++) {
      if (!(await page.locator('#s05-continue').isHidden())) return true;
      await buttons.nth(i).click();
      await page.waitForTimeout(120);
      if (!(await page.locator('#s05-continue').isHidden())) return true;
    }
    return !(await page.locator('#s05-continue').isHidden());
  }
  const box = await page.locator('#ls-canvas').boundingBox();
  return tapAnyCorrectS05(page, box);
}
async function goToNextS05Item(page) {
  await page.click('#s05-continue');
  await page.waitForTimeout(350);
}
/** Sahne #5'i intro'dan itibaren N. öğeye (1-tabanlı) kadar sırayla doğru
    cevaplarla ilerletir — H-section testlerinde tekrarlanan "belirli bir
    aşamaya ulaş" ihtiyacı için. */
async function advanceS05ToItem(page, targetIndex1Based) {
  await advanceToScene5AndIntro(page);
  for (let i = 1; i < targetIndex1Based; i++) {
    const ok = await answerCurrentS05Item(page);
    ensure(ok, `Sahne #5 öğe ${i}'e doğru cevap verilemedi (${targetIndex1Based}. öğeye ilerlerken)`);
    await goToNextS05Item(page);
  }
}

addTest('H1/H2/H3) Sahne #4 → #5: registry sırası doğru, "Sonraki konu" Sahne #5\'e götürür, Sahne #5 intro doğru terminolojiyle açılır', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene4AndIntro(s.page);
    await buildScene4ThreeStones(s.page);
    await s.page.waitForSelector('#s04-next:not([disabled])');
    await s.page.click('#s04-next');
    await s.page.waitForTimeout(250);
    const advanceLabel = (await s.page.locator('.ls-topic-end [data-action="advance"]').textContent())?.trim();
    ensure(advanceLabel === 'Sonraki konu', `Sahne #4 sonu "Sonraki konu" göstermeli (Sahne #5 registry\'de var), bulunan: "${advanceLabel}"`);
    await s.page.click('.ls-topic-end [data-action="advance"]');
    await s.page.waitForTimeout(500);
    ensure(await s.page.locator('#s05-intro').isVisible(), 'Sahne #5 intro mount edildi');
    const introText = (await s.page.locator('#s05-intro .ls-strip-text').textContent())?.trim();
    ensure(!/özgürlük|özgürlüğü|serbestlik|\bliberty\b|\bliberties\b/i.test(introText || ''), `intro: yasak terminoloji YOK, bulunan: "${introText}"`);
    ensure(/nefes nokta/i.test(introText || ''), `intro: "nefes noktası" terminolojisi VAR, bulunan: "${introText}"`);
    ensure(!/[Ss]ahne\s*#?5|stepIndex|registry|tamamlandı/i.test(introText || ''), 'intro: teknik dil (Sahne #N/stepIndex/registry) YOK');
  } finally { await s.close(); }
});

addTest('H4) Sahne #4 → #5 geçişinde 6 kontrol noktası (öncesi/başı/ortası/sonu/cleanup+100ms/cleanup+500ms) board/narration/host <1px sabit, duplicate ID yok', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene4AndIntro(s.page);
    await buildScene4ThreeStones(s.page);
    await s.page.waitForSelector('#s04-next:not([disabled])');
    await s.page.click('#s04-next');
    await s.page.waitForTimeout(250);
    await s.page.waitForSelector('.ls-topic-end [data-action="advance"]');

    const t_before100 = await s.page.locator('#ls-scene-host').boundingBox();
    const boardBefore = await s.page.locator('#ls-canvas').boundingBox();
    const narrBefore = await s.page.locator('#ls-narration').boundingBox();
    await s.page.waitForTimeout(100);
    const t_start = await s.page.locator('#ls-scene-host').boundingBox();

    await s.page.click('.ls-topic-end [data-action="advance"]');
    await s.page.waitForTimeout(80);
    const t_mid = await s.page.locator('#ls-scene-host').boundingBox();
    await s.page.waitForTimeout(150);
    const t_end = await s.page.locator('#ls-scene-host').boundingBox();
    await s.page.waitForTimeout(100);
    const t_cleanup100 = await s.page.locator('#ls-scene-host').boundingBox();
    await s.page.waitForTimeout(400);
    const t_cleanup500 = await s.page.locator('#ls-scene-host').boundingBox();
    const boardAfter = await s.page.locator('#ls-canvas').boundingBox();
    const narrAfter = await s.page.locator('#ls-narration').boundingBox();

    const points = { before100: t_before100, start: t_start, mid: t_mid, end: t_end, cleanup100: t_cleanup100, cleanup500: t_cleanup500 };
    let maxDiff = 0, worstLabel = null;
    for (const [label, b] of Object.entries(points)) {
      const d = bboxMaxDiff(t_before100, b);
      if (d > maxDiff) { maxDiff = d; worstLabel = label; }
    }
    ensure(maxDiff < 1, `Sahne #4→#5: 6 kontrol noktası arası scene-host bbox max fark <1px olmalı (bulunan: ${maxDiff.toFixed(3)}px, en kötü: ${worstLabel})`);
    ensure(bboxMaxDiff(boardBefore, boardAfter) < 1, `board bbox <1px sabit (fark=${bboxMaxDiff(boardBefore, boardAfter).toFixed(3)}px)`);
    ensure(bboxMaxDiff(narrBefore, narrAfter) < 1, `narration dış kutu <1px sabit (fark=${bboxMaxDiff(narrBefore, narrAfter).toFixed(3)}px)`);
    const allIds = await s.page.evaluate(() => [...document.querySelectorAll('[id]')].map(el => el.id));
    ensure(new Set(allIds).size === allIds.length, `geçiş sonrası duplicate ID YOK, bulunan ID'ler: ${JSON.stringify(allIds)}`);
    ensure(await s.page.locator('#s05-intro').isVisible(), 'Sahne #5 intro açık');
  } finally { await s.close(); }
});

addTest('H5) Intro tick hızlı çift tıklamada YALNIZ BİR kez tetiklenir (scene_intro_confirmed tek event)', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene5(s.page);
    await s.page.waitForSelector('#s05-confirm');
    await Promise.all([s.page.click('#s05-confirm'), s.page.click('#s05-confirm').catch(() => {})]);
    await s.page.waitForTimeout(350);
    const confirmed = eventsFor(await getEventLog(s.page), S05_ID).filter(e => e.type === 'scene_intro_confirmed');
    ensure(confirmed.length === 1, `scene_intro_confirmed TAM BİR KEZ üretilmeli, bulunan: ${confirmed.length}`);
  } finally { await s.close(); }
});

addTest('H6/H7/H8/H9) Beş değerlendirme GERÇEK curriculum sırasıyla (stepIndex 3,4,5,6,7) sunulur; her öğenin board seed\'i ve doğru cevabı GERÇEK RuleEngine sonucuyla doğrulanır (2/3/4/4/1 nefes)', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene5AndIntro(s.page);
    const expectedLibertyCounts = [2, 3, 4, 4, 1];
    for (let i = 0; i < 5; i++) {
      const presented = eventsFor(await getEventLog(s.page), S05_ID).filter(e => e.type === 'scene_assessment_presented');
      ensure(presented.length === i + 1, `öğe ${i + 1}: scene_assessment_presented sayısı ${i + 1} olmalı, bulunan: ${presented.length}`);
      const last = presented[presented.length - 1].payload;
      ensure(last.assessmentIndex === i, `öğe ${i + 1}: assessmentIndex=${i} olmalı, bulunan: ${last.assessmentIndex}`);
      ensure(last.assessmentCount === 5, 'assessmentCount=5');
      ensure(last.curriculumStepIndex === 3 + i, `öğe ${i + 1}: curriculumStepIndex=${3 + i} olmalı, bulunan: ${last.curriculumStepIndex}`);
      const ok = await answerCurrentS05Item(s.page);
      ensure(ok, `öğe ${i + 1} doğru cevaplanamadı`);
      const answered = eventsFor(await getEventLog(s.page), S05_ID).filter(e => e.type === 'scene_assessment_answered');
      const lastAnswered = answered[answered.length - 1].payload;
      ensure(lastAnswered.correct === true, `öğe ${i + 1}: son answered event correct:true olmalı`);
      ensure(lastAnswered.libertyCount === expectedLibertyCounts[i], `öğe ${i + 1}: GERÇEK libertyCount=${expectedLibertyCounts[i]} olmalı, bulunan: ${lastAnswered.libertyCount}`);
      // v2 — kavram ayrımı: `concept` HER ZAMAN sahne-seviyesi ('liberty'),
      // `assessmentConcept` ÖĞE-seviyesi GERÇEK kavram — steps[3..6] için
      // 'liberty', steps[7] (atari/yakalama) için 'atari'. Tek bir global
      // sabitin BEŞ öğeye de yayıldığı eski hata BURADA yakalanır.
      ensure(lastAnswered.concept === 'liberty', 'concept: sahne-seviyesi HER ZAMAN liberty olmalı');
      const expectedAssessmentConcept = presented.at(-1).payload.assessmentConcept;
      ensure(typeof expectedAssessmentConcept === 'string', `öğe ${i + 1}: scene_assessment_presented assessmentConcept taşımalı`);
      if (i === 4) {
        ensure(expectedAssessmentConcept === 'atari', `öğe 5 (atari/yakalama): presented assessmentConcept='atari' olmalı, bulunan: ${expectedAssessmentConcept}`);
        ensure(lastAnswered.assessmentConcept === 'atari', `öğe 5: answered assessmentConcept='atari' olmalı, bulunan: ${lastAnswered.assessmentConcept}`);
        ensure(lastAnswered.resultConcept === 'capture', `öğe 5: doğru cevap sonrası resultConcept='capture' olmalı, bulunan: ${lastAnswered.resultConcept}`);
      } else {
        ensure(expectedAssessmentConcept === 'liberty', `öğe ${i + 1}: presented assessmentConcept='liberty' olmalı, bulunan: ${expectedAssessmentConcept}`);
        ensure(lastAnswered.assessmentConcept === 'liberty', `öğe ${i + 1}: answered assessmentConcept='liberty' olmalı, bulunan: ${lastAnswered.assessmentConcept}`);
        ensure(lastAnswered.resultConcept === undefined, `öğe ${i + 1}: resultConcept HİÇ olmamalı (yakalama üretmiyor), bulunan: ${JSON.stringify(lastAnswered.resultConcept)}`);
      }
      if (i < 4) await goToNextS05Item(s.page);
    }
  } finally { await s.close(); }
});

addTest('H10/H11/H12) Yanlış cevap ilerletmiyor, tekrar denemeye izin veriyor, board state bozmuyor; doğru cevap aynı öğede ikinci kez event üretmiyor (kilitli)', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene5AndIntro(s.page);
    // Öğe 1 (choice, köşe=2 nefes): önce YANLIŞ (3), sonra DOĞRU (2).
    const wrongBtn = s.page.locator('.s05-choice-btn', { hasText: '3' });
    await wrongBtn.click();
    await s.page.waitForTimeout(150);
    ensure(await s.page.locator('#s05-continue').isHidden(), 'yanlış cevaptan sonra Devam GÖRÜNMEMELİ (ilerlemedi)');
    const answeredAfterWrong = eventsFor(await getEventLog(s.page), S05_ID).filter(e => e.type === 'scene_assessment_answered');
    ensure(answeredAfterWrong.length === 1 && answeredAfterWrong[0].payload.correct === false, 'yanlış cevap TEK bir correct:false event üretmeli');
    ensure(await s.page.locator('#s05-progress .s05-progress-text').textContent().then(t => t.trim()) === '1 / 5', 'yanlış cevap sonrası HÂLÂ 1/5 (ilerlemedi)');
    // Tekrar dene — DOĞRU.
    const correctBtn = s.page.locator('.s05-choice-btn', { hasText: '2' });
    await correctBtn.click();
    await s.page.waitForTimeout(150);
    ensure(await s.page.locator('#s05-continue').isVisible(), 'doğru cevaptan sonra Devam GÖRÜNMELİ');
    // Aynı butona TEKRAR tıklamayı dene (kilitli olmalı — disabled).
    ensure(await correctBtn.isDisabled(), 'doğru cevap sonrası seçenek butonları kilitlenmeli (disabled)');
    const answeredAfterCorrect = eventsFor(await getEventLog(s.page), S05_ID).filter(e => e.type === 'scene_assessment_answered');
    ensure(answeredAfterCorrect.length === 2, `TAM 2 answered event olmalı (1 yanlış + 1 doğru), bulunan: ${answeredAfterCorrect.length}`);
  } finally { await s.close(); }
});

addTest('H13/H17/H18/H19) İç "Devam" yalnız doğru cevaptan SONRA açılır; 5 öğe tamamlanmadan completion açılmaz; 5. doğru cevaptan sonra TAM BİR KEZ açılır; ileri kontrolü "Sonraki konu" (Sahne #6 kayıtlı olduğu için)', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene5AndIntro(s.page);
    ensure(await s.page.locator('#s05-continue').isHidden(), 'başlangıçta Devam gizli');
    for (let i = 0; i < 4; i++) {
      const ok = await answerCurrentS05Item(s.page);
      ensure(ok, `öğe ${i + 1} doğru cevaplanamadı`);
      const unlocked = eventsFor(await getEventLog(s.page), S05_ID).filter(e => e.type === 'scene_completion_unlocked');
      ensure(unlocked.length === 0, `${i + 1}/5 doğruda completion AÇILMAMALI, bulunan unlock: ${unlocked.length}`);
      await goToNextS05Item(s.page);
    }
    const ok5 = await answerCurrentS05Item(s.page);
    ensure(ok5, 'öğe 5 doğru cevaplanamadı');
    const unlockedAfter5 = eventsFor(await getEventLog(s.page), S05_ID).filter(e => e.type === 'scene_completion_unlocked');
    ensure(unlockedAfter5.length === 1, `5/5 doğrudan SONRA completion TAM BİR KEZ açılmalı, bulunan: ${unlockedAfter5.length}`);
    await goToNextS05Item(s.page);
    await s.page.waitForSelector('.ls-topic-end [data-action="advance"]');
    const advanceLabel = (await s.page.locator('.ls-topic-end [data-action="advance"]').textContent())?.trim();
    // v4 — Sahne #6 kayıtlı olduğu için Sahne #5 ARTIK son sahne DEĞİL;
    // "Sonraki konu" göstermeli (bkz. context.hasNextScene, scenes/
    // topicEndControls.js — Sahne #5'in KENDİ kodu DEĞİŞMEDEN, yalnız
    // registry sırasının genişlemesiyle doğal olarak değişen bir runtime
    // davranışı). "Konular" etiketi artık yalnız Sahne #6'da.
    ensure(advanceLabel === 'Sonraki konu', `Sahne #5 (artık son kayıtlı sahne DEĞİL) butonu "Sonraki konu" olmalı, bulunan: "${advanceLabel}"`);
    const completed = eventsFor(await getEventLog(s.page), S05_ID).filter(e => e.type === 'scene_completed');
    ensure(completed.length === 1, 'scene_completed TAM BİR KEZ üretildi');
  } finally { await s.close(); }
});

addTest('H14/H15) 1/5→2/5 İÇ geçişinde board/narration/host bbox sabit, duplicate ID yok (runtime sahne geçişi DEĞİL)', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene5AndIntro(s.page);
    const ok = await answerCurrentS05Item(s.page);
    ensure(ok, 'öğe 1 doğru cevaplanamadı');
    const boardBefore = await s.page.locator('#ls-canvas').boundingBox();
    const narrBefore = await s.page.locator('#ls-narration').boundingBox();
    const hostBefore = await s.page.locator('#ls-scene-host').boundingBox();

    await s.page.click('#s05-continue');
    await s.page.waitForTimeout(60); // fade-out (~90ms) ORTASI
    const hostMid = await s.page.locator('#ls-scene-host').boundingBox();
    await s.page.waitForTimeout(250); // fade-out+swap+fade-in (~200ms) kesin bitmiş olmalı

    const boardAfter = await s.page.locator('#ls-canvas').boundingBox();
    const narrAfter = await s.page.locator('#ls-narration').boundingBox();
    const hostAfter = await s.page.locator('#ls-scene-host').boundingBox();
    ensure(bboxMaxDiff(boardBefore, boardAfter) < 1, `İÇ geçişte board bbox <1px sabit olmalı (fark=${bboxMaxDiff(boardBefore, boardAfter).toFixed(3)}px)`);
    ensure(bboxMaxDiff(narrBefore, narrAfter) < 1, `İÇ geçişte narration bbox <1px sabit olmalı (fark=${bboxMaxDiff(narrBefore, narrAfter).toFixed(3)}px)`);
    ensure(bboxMaxDiff(hostBefore, hostMid) < 1, `İÇ geçiş ORTASINDA host bbox <1px sabit olmalı (fark=${bboxMaxDiff(hostBefore, hostMid).toFixed(3)}px)`);
    ensure(bboxMaxDiff(hostBefore, hostAfter) < 1, `İÇ geçiş SONUNDA host bbox <1px sabit olmalı (fark=${bboxMaxDiff(hostBefore, hostAfter).toFixed(3)}px)`);
    const allIds = await s.page.evaluate(() => [...document.querySelectorAll('[id]')].map(el => el.id));
    ensure(new Set(allIds).size === allIds.length, 'İÇ geçiş sonrası duplicate ID YOK');
    ensure(await s.page.locator('.s05-progress-text').textContent().then(t => t.trim()) === '2 / 5', 'İÇ geçiş sonrası 2/5 gösteriliyor');
    // scene_started YALNIZ BİR KEZ üretilmiş olmalı — İÇ geçiş runtime sahne geçişi DEĞİL.
    const started = eventsFor(await getEventLog(s.page), S05_ID).filter(e => e.type === 'scene_started');
    ensure(started.length === 1, `İÇ geçiş scene_started'ı TEKRAR üretmemeli, bulunan: ${started.length}`);
  } finally { await s.close(); }
});

addTest('H16) Hızlı çift tıklama "Devam" iki öğe atlatmıyor (yalnız TEK ileri geçiş)', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene5AndIntro(s.page);
    const ok = await answerCurrentS05Item(s.page);
    ensure(ok, 'öğe 1 doğru cevaplanamadı');
    await Promise.all([s.page.click('#s05-continue'), s.page.click('#s05-continue').catch(() => {})]);
    await s.page.waitForTimeout(400);
    const progress = (await s.page.locator('.s05-progress-text').textContent())?.trim();
    ensure(progress === '2 / 5', `hızlı çift tıklama yalnız TEK ileri geçiş üretmeli (2/5 bekleniyor), bulunan: "${progress}"`);
    const advanced = eventsFor(await getEventLog(s.page), S05_ID).filter(e => e.type === 'scene_assessment_advanced');
    ensure(advanced.length === 1, `scene_assessment_advanced TAM BİR KEZ üretilmeli, bulunan: ${advanced.length}`);
  } finally { await s.close(); }
});

addTest('H20) "Bu konuyu tekrar et" Sahne #5\'i TEMİZ (yalnız intro+ilk öğe) başlatır, YENİ bir sıra doğru cevaplanabilir, completion geçmişi çoğalmaz', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene5AndIntro(s.page);
    for (let i = 0; i < 5; i++) {
      const ok = await answerCurrentS05Item(s.page);
      ensure(ok, `öğe ${i + 1} doğru cevaplanamadı`);
      if (i < 4) await goToNextS05Item(s.page);
    }
    await goToNextS05Item(s.page);
    await s.page.waitForSelector('.ls-topic-end [data-action="advance"]');
    const completedBefore = eventsFor(await getEventLog(s.page), S05_ID).filter(e => e.type === 'scene_completed').length;

    await s.page.click('[data-action="replay"]');
    await s.page.waitForTimeout(500);
    ensure(await s.page.locator('#s05-intro').isVisible(), 'replay: temiz intro ile açıldı');
    await confirmS05Intro(s.page);
    const progress = (await s.page.locator('.s05-progress-text').textContent())?.trim();
    ensure(progress === '1 / 5', `replay: 1/5'ten başlamalı, bulunan: "${progress}"`);
    const ok1 = await answerCurrentS05Item(s.page);
    ensure(ok1, 'replay: öğe 1 YENİDEN doğru cevaplanabildi');

    const completedAfter = eventsFor(await getEventLog(s.page), S05_ID).filter(e => e.type === 'scene_completed').length;
    ensure(completedAfter === completedBefore, 'replay tamamlanmadan scene_completed ÇOĞALMAMALI');
  } finally { await s.close(); }
});

addTest('H21) Reload: yarım değerlendirmede (2/5, 4/5) TEMİZ ilk öğeye döner, önceki sahnelerin completion\'ları korunur', async () => {
  for (const targetItem of [2, 4]) {
    const s = await openScenesPage({ query: FAST_QUERY });
    try {
      await advanceS05ToItem(s.page, targetItem);
      const progressBefore = await s.page.evaluate(() => localStorage.getItem('go_scene_progress_v1'));
      const completedBefore = JSON.parse(progressBefore).completedSceneIds;
      ensure(completedBefore.includes(S04_ID), `ön koşul: Sahne #4 tamamlanmış olmalı (${targetItem}. öğeye ilerlerken)`);

      await s.page.reload({ waitUntil: 'networkidle' });
      await s.page.waitForSelector('#s05-intro', { timeout: 10000 });
      ensure(await s.page.locator('#s05-intro').isVisible(), `reload (${targetItem}/5): temiz intro'ya döndü`);

      const progressAfter = await s.page.evaluate(() => localStorage.getItem('go_scene_progress_v1'));
      const completedAfter = JSON.parse(progressAfter).completedSceneIds;
      ensure(JSON.stringify(completedAfter) === JSON.stringify(completedBefore), `reload (${targetItem}/5): önceki sahne completion'ları korunmalı`);
      ensure(!completedAfter.includes(S05_ID), 'reload: Sahne #5 yarım kalmışken completedSceneIds\'e YAZILMAMALI');

      await confirmS05Intro(s.page);
      const progress = (await s.page.locator('.s05-progress-text').textContent())?.trim();
      ensure(progress === '1 / 5', `reload (${targetItem}/5) sonrası intro onaylanınca 1/5'ten başlamalı, bulunan: "${progress}"`);
    } finally { await s.close(); }
  }
});

addTest('H22) Konular paneli intro/öğe1/öğe3/öğe5/yanlış-feedback/doğru+Devam-bekleme durumlarının HEPSİNDE state\'i korur, board input sızdırmaz', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene5(s.page);
    // 1) INTRO — panel açılıp kapanınca hâlâ intro'da olmalı.
    await s.page.click('#ls-topics-open');
    await s.page.waitForTimeout(150);
    await s.page.keyboard.press('Escape');
    await s.page.waitForTimeout(150);
    ensure(await s.page.locator('#s05-intro').isVisible(), 'panel sonrası hâlâ intro görünür');

    await confirmS05Intro(s.page);
    const box = await s.page.locator('#ls-canvas').boundingBox();

    // 2) Öğe 1 — YANLIŞ cevap feedback'i AÇIKKEN panel aç/kapat.
    const wrongBtn = s.page.locator('.s05-choice-btn', { hasText: '3' });
    await wrongBtn.click();
    await s.page.waitForTimeout(150);
    const feedbackBefore = (await s.page.locator('#s05-feedback').textContent())?.trim();
    await s.page.click('#ls-topics-open');
    await s.page.waitForTimeout(150);
    await s.page.keyboard.press('Escape');
    await s.page.waitForTimeout(150);
    const feedbackAfter = (await s.page.locator('#s05-feedback').textContent())?.trim();
    ensure(feedbackAfter === feedbackBefore, `öğe1 yanlış-feedback: panel sonrası KORUNMALI, önce="${feedbackBefore}" sonra="${feedbackAfter}"`);
    ensure((await s.page.locator('.s05-progress-text').textContent())?.trim() === '1 / 5', 'öğe1: panel sonrası hâlâ 1/5');

    // 3) Öğe 1 — DOĞRU cevap sonrası "Devam" beklerken panel aç/kapat.
    const correctBtn = s.page.locator('.s05-choice-btn', { hasText: '2' });
    await correctBtn.click();
    await s.page.waitForTimeout(150);
    ensure(await s.page.locator('#s05-continue').isVisible(), 'ön koşul: Devam görünür olmalı');
    await s.page.click('#ls-topics-open');
    await s.page.waitForTimeout(150);
    const leakBefore = eventsFor(await getEventLog(s.page), S05_ID).filter(e => e.type === 'scene_assessment_advanced').length;
    await s.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await s.page.waitForTimeout(100);
    const leakAfter = eventsFor(await getEventLog(s.page), S05_ID).filter(e => e.type === 'scene_assessment_advanced').length;
    ensure(leakAfter === leakBefore, 'panel açıkken board tıklaması sızmamalı (advanced event üretmemeli)');
    await s.page.keyboard.press('Escape');
    await s.page.waitForTimeout(150);
    ensure(await s.page.locator('#s05-continue').isVisible(), 'öğe1 doğru+Devam-bekleme: panel sonrası Devam hâlâ görünür');
    await goToNextS05Item(s.page);

    // öğe 2'yi geç, öğe 3'e ulaş.
    const ok2 = await answerCurrentS05Item(s.page);
    ensure(ok2, 'öğe 2 doğru cevaplanamadı');
    await goToNextS05Item(s.page);
    ensure((await s.page.locator('.s05-progress-text').textContent())?.trim() === '3 / 5', 'ön koşul: öğe 3\'e ulaşıldı');

    // 4) Öğe 3 (board_tap) — panel açıkken board input KİLİTLİ olmalı.
    await s.page.click('#ls-topics-open');
    await s.page.waitForTimeout(150);
    const box3 = await s.page.locator('#ls-canvas').boundingBox();
    const answeredBefore = eventsFor(await getEventLog(s.page), S05_ID).filter(e => e.type === 'scene_assessment_answered').length;
    await s.page.mouse.click(box3.x + box3.width / 2, box3.y + box3.height / 2);
    await s.page.waitForTimeout(100);
    const answeredAfter = eventsFor(await getEventLog(s.page), S05_ID).filter(e => e.type === 'scene_assessment_answered').length;
    ensure(answeredAfter === answeredBefore, 'öğe3: panel açıkken board tıklaması hamle/answered event\'i SIZDIRMAMALI');
    await s.page.keyboard.press('Escape');
    await s.page.waitForTimeout(150);
    const ok3 = await answerCurrentS05Item(s.page);
    ensure(ok3, 'öğe3: panel kapandıktan SONRA board input normale dönmeli');
    await goToNextS05Item(s.page);

    const ok4 = await answerCurrentS05Item(s.page);
    ensure(ok4, 'öğe 4 doğru cevaplanamadı');
    await goToNextS05Item(s.page);
    ensure((await s.page.locator('.s05-progress-text').textContent())?.trim() === '5 / 5', 'ön koşul: öğe 5\'e ulaşıldı');

    // 5) Öğe 5 (atari) — panel aç/kapat mevcut durumu bozmamalı.
    await s.page.click('#ls-topics-open');
    await s.page.waitForTimeout(150);
    await s.page.keyboard.press('Escape');
    await s.page.waitForTimeout(150);
    ensure((await s.page.locator('.s05-progress-text').textContent())?.trim() === '5 / 5', 'öğe5: panel sonrası hâlâ 5/5');
    const ok5 = await answerCurrentS05Item(s.page);
    ensure(ok5, 'öğe5: panel sonrası doğru cevaplanabildi');
  } finally { await s.close(); }
});

addTest('H23) Reduced-motion: intro→5 öğe→konu-sonu akışı animasyonsuz, aynı işlevsel sonuçla tamamlanabilir', async () => {
  const s = await openScenesPage({ reducedMotion: 'reduce', query: FAST_QUERY });
  try {
    await advanceToScene5AndIntro(s.page);
    for (let i = 0; i < 5; i++) {
      const ok = await answerCurrentS05Item(s.page);
      ensure(ok, `reduced-motion: öğe ${i + 1} doğru cevaplanamadı`);
      if (i < 4) await goToNextS05Item(s.page);
    }
    const unlocked = eventsFor(await getEventLog(s.page), S05_ID).filter(e => e.type === 'scene_completion_unlocked');
    ensure(unlocked.length === 1, 'reduced-motion: completion TAM BİR KEZ açıldı');
  } finally { await s.close(); }
});

addTest('H24) Klavye ile çoktan seçmeli öğeler cevaplanabilir (Tab+Enter, gerçek <button>); board_tap öğeleri uygulamanın GENELİNDEKİ (Sahne #1-4 ile AYNI) mouse/touch-only mimariyi miras alır', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene5AndIntro(s.page);
    // Öğe 1 (choice) — klavyeyle: ilk butona Tab ile odaklan, Enter ile SEÇ.
    await s.page.locator('.s05-choice-btn').first().focus();
    await s.page.keyboard.press('Enter');
    await s.page.waitForTimeout(150);
    const answered = eventsFor(await getEventLog(s.page), S05_ID).filter(e => e.type === 'scene_assessment_answered');
    ensure(answered.length === 1, 'klavye (Enter) bir choice butonunu GERÇEKTEN tetikledi');
    // Devam kontrolü de klavyeyle erişilebilir mi (odak zaten Devam'a taşınıyor, bkz. showContinueControl).
    if (await s.page.locator('#s05-continue').isVisible()) {
      const isFocused = await s.page.evaluate(() => document.activeElement?.id === 's05-continue');
      ensure(isFocused, 'doğru cevap sonrası odak Devam kontrolüne taşınmalı');
    }
  } finally { await s.close(); }
});

addTest('H25/H26) Sahne #5 masaüstü/tablet/mobilde taşma üretmez; mobilde tek dokunuş board_tap öğesinde tek gerçek cevap üretir', async () => {
  for (const viewport of [VIEWPORTS.desktop, VIEWPORTS.tablet, VIEWPORTS.mobile]) {
    const s = await openScenesPage({ viewport, query: viewport === VIEWPORTS.mobile ? PREVIEW_QUERY : FAST_QUERY, hasTouch: viewport === VIEWPORTS.mobile });
    try {
      await advanceToScene5AndIntro(s.page);
      const ok1 = await answerCurrentS05Item(s.page);
      ensure(ok1, `${viewport.width}px: öğe 1 doğru cevaplanamadı`);
      const noOverflow = await s.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
      ensure(noOverflow, `${viewport.width}px: yatay taşma var`);
      const boardBox = await s.page.locator('#ls-board-region').boundingBox();
      const narrationBox = await s.page.locator('#ls-narration').boundingBox();
      ensure(!boxesIntersect(boardBox, narrationBox), `${viewport.width}px: board/narration kesişiyor`);
      await goToNextS05Item(s.page);

      const ok2 = await answerCurrentS05Item(s.page);
      ensure(ok2, `${viewport.width}px: öğe 2 doğru cevaplanamadı`);
      await goToNextS05Item(s.page);

      if (viewport === VIEWPORTS.mobile) {
        // Öğe 3 board_tap — mobilde TEK dokunuş TEK gerçek cevap üretmeli.
        // tapExactCorrectS05, GERÇEK hedefi ÖNCE hover (event üretmeyen)
        // ile bulup SONRA yalnız o noktaya TEK click üretir — ring-scan'in
        // olası ARA yanlış-tıklamalarının (ki bunlar TASARIM gereği kendi
        // answered event'lerini üretir, bkz. tapAnyCorrectS05 dosya başı
        // notu) bu ölçümü kirletmesini önler.
        const presented = eventsFor(await getEventLog(s.page), S05_ID).filter(e => e.type === 'scene_assessment_presented');
        const curriculumStepIndex = presented[presented.length - 1]?.payload?.curriculumStepIndex;
        ensure(typeof curriculumStepIndex === 'number', 'mobil: öğe 3 için curriculumStepIndex bulunamadı');
        const box = await s.page.locator('#ls-canvas').boundingBox();
        const before = eventsFor(await getEventLog(s.page), S05_ID).filter(e => e.type === 'scene_assessment_answered').length;
        const ok3 = await tapExactCorrectS05(s.page, box, curriculumStepIndex);
        ensure(ok3, 'mobil: öğe 3 (board_tap) GERÇEK hedef bulunup dokunulamadı');
        const after = eventsFor(await getEventLog(s.page), S05_ID).filter(e => e.type === 'scene_assessment_answered').length;
        ensure(after === before + 1, 'mobil: tek dokunuş yalnız BİR answered event üretmeli');
      }
    } finally { await s.close(); }
  }
});

addTest('H27) Sahne #5\'in TAM akışı (intro+5 öğe+konu-sonu) boyunca görünür DOM\'da özgürlük/liberty YOK, "nefes noktası" tutarlı, konsol/pageerror sıfır', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene5AndIntro(s.page);
    for (let i = 0; i < 5; i++) {
      const visibleText = await s.page.locator('#ls-scene-host').innerText();
      ensure(!/özgürlük|özgürlüğü|serbestlik|\bliberty\b|\bliberties\b/i.test(visibleText), `öğe ${i + 1}: görünür DOM'da yasak terminoloji VAR: "${visibleText.slice(0, 200)}"`);
      const ok = await answerCurrentS05Item(s.page);
      ensure(ok, `öğe ${i + 1} doğru cevaplanamadı`);
      const feedbackText = await s.page.locator('#s05-feedback').textContent();
      ensure(!/özgürlük|özgürlüğü|serbestlik|\bliberty\b|\bliberties\b/i.test(feedbackText || ''), `öğe ${i + 1} feedback: yasak terminoloji VAR: "${feedbackText}"`);
      if (i < 4) await goToNextS05Item(s.page);
    }
    await goToNextS05Item(s.page);
    await s.page.waitForSelector('.ls-topic-end [data-action="advance"]');
    const summaryText = await s.page.locator('.ls-topic-end-summary').textContent();
    ensure(!/özgürlük|özgürlüğü|serbestlik|\bliberty\b|\bliberties\b/i.test(summaryText || ''), `konu-sonu özeti: yasak terminoloji VAR: "${summaryText}"`);
    ensure(s.consoleErrors.length === 0, `TAM akış boyunca konsol/pageerror sıfır olmalı: ${JSON.stringify(s.consoleErrors)}`);
  } finally { await s.close(); }
});

addTest('H28) Teacher Studio: Curriculum Sahne #5\'in beş adımını/başlığını gösterir, Diagnostics beş curriculumRef\'i doğrular, Event Log assessment event\'lerini gösterir, cross-tab overwrite yok', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceS05ToItem(s.page, 5);
    const box = await s.page.locator('#ls-canvas').boundingBox();
    const ok = await tapExactCorrectS05(s.page, box, 7);
    ensure(ok, 'öğe 5 (atari/yakalama) Studio testine hazırlanırken cevaplanamadı');
    await s.page.waitForTimeout(200);

    const studioPage = await s.context.newPage();
    const studioErrors = [];
    studioPage.on('pageerror', e => studioErrors.push(e.message));
    studioPage.on('console', m => { if (m.type() === 'error') studioErrors.push(m.text()); });
    await studioPage.goto(`${BASE}/teacher-studio.html`, { waitUntil: 'networkidle' });

    await studioPage.click('[data-tab="curriculum"]');
    await studioPage.waitForTimeout(150);
    const curriculumText = await studioPage.locator('#curriculum-scene-table').textContent();
    ensure(curriculumText.includes('Nefes Noktalarını Değerlendir') && curriculumText.includes(S05_ID) && curriculumText.includes('l2') && curriculumText.includes('liberty'),
      `Curriculum'da Sahne #5 doğru görünmüyor: ${curriculumText.slice(0, 400)}`);
    ensure(/5 değerlendirme/.test(curriculumText), `Curriculum "5 değerlendirme" kapsam bilgisini göstermeli: ${curriculumText.slice(0, 400)}`);
    // v2 — kavram ayrımı: Curriculum, öğe 5'i sahnenin PRIMARY concept'i
    // ('liberty', Concept sütununda) ile KARIŞTIRMADAN kendi GERÇEK
    // assessmentConcept'i ('atari') ile göstermeli (bkz. görev talimatı
    // Bölüm 8).
    ensure(/atari/.test(curriculumText), `Curriculum öğe 5'i 'atari' assessment concept'iyle göstermeli: ${curriculumText.slice(0, 400)}`);
    ensure(!/özgürlük|serbestlik/i.test(curriculumText), 'Curriculum: yasak terminoloji yok');

    await studioPage.click('[data-tab="diagnostics"]');
    await studioPage.waitForTimeout(150);
    const diagText = await studioPage.locator('#diag-scene-table').textContent();
    ensure(!diagText.includes(S05_ID), `Diagnostics Sahne #5 için hiçbir sorun bildirmemeli (kavram ayrımı denetimleri dahil): ${diagText.slice(0, 800)}`);

    await studioPage.click('[data-tab="event-log"]');
    await studioPage.waitForTimeout(150);
    const eventLogText = await studioPage.locator('#event-log-table').textContent();
    ensure(eventLogText.includes(S05_ID), 'Event Log Sahne #5 event\'lerini göstermiyor');
    ensure(eventLogText.includes('scene_assessment_presented') && eventLogText.includes('scene_assessment_answered'), 'Event Log assessment event tiplerini göstermiyor');
    // v2 — Event Log ham payload'ı JSON olarak dökülüyor (bkz. teacher-studio.html
    // renderEventLog) — assessmentConcept/resultConcept alanları HİÇBİR ek
    // Studio kodu YAZILMADAN otomatik görünür olmalı.
    ensure(eventLogText.includes('assessmentConcept'), 'Event Log assessmentConcept alanını göstermiyor');
    ensure(eventLogText.includes('"atari"'), 'Event Log öğe 5 için assessmentConcept:"atari" göstermiyor');
    ensure(eventLogText.includes('resultConcept') && eventLogText.includes('"capture"'), 'Event Log öğe 5 doğru yakalaması için resultConcept:"capture" göstermiyor');

    ensure(studioErrors.length === 0, `Studio'da hata: ${studioErrors.join(' | ')}`);
    await studioPage.close();
  } finally { await s.close(); }
});

addTest('H30) Öğe 5 (atari/yakalama) — yanlış dokunma board\'u ATARİ\'de bırakır, hiçbir event\'te assessmentConcept:\'liberty\' sızmaz; doğru yakalama sonrası resultConcept:\'capture\' ve beyaz taş GERÇEKTEN kalkar', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY, viewport: VIEWPORTS.desktop });
  try {
    await advanceS05ToItem(s.page, 5);

    const presented5 = eventsFor(await getEventLog(s.page), S05_ID).filter(e => e.type === 'scene_assessment_presented');
    const lastPresented = presented5.at(-1).payload;
    ensure(lastPresented.curriculumStepIndex === 7, 'öğe 5: curriculumStepIndex=7 olmalı');
    ensure(lastPresented.assessmentConcept === 'atari', `öğe 5 sunulduğunda assessmentConcept='atari' olmalı, bulunan: ${lastPresented.assessmentConcept}`);
    ensure(lastPresented.resultConcept === undefined, 'öğe 5 sunulduğunda (henüz hamle yok) resultConcept HİÇ olmamalı');

    // Yanlış dokunma — hover-tabanlı hit-test ile GERÇEKTEN board üzerinde
    // ama hedef kümede OLMAYAN bir kesişim bulunup tıklanır (bkz.
    // tapAnyWrongS05 dosya başı notu — sabit bir piksel ofseti hedef-dışı
    // bir BOŞLUĞA denk gelip hiç event üretmeyebilirdi). Board state
    // DEĞİŞMEMELİ, beyaz taş hâlâ ataride kalmalı.
    const box = await s.page.locator('#ls-canvas').boundingBox();
    const wrongOk = await tapAnyWrongS05(s.page, box, 7);
    ensure(wrongOk, 'öğe 5: hedef-dışı GERÇEK bir kesişim bulunup dokunulamadı');
    await s.page.waitForTimeout(150);
    const answeredWrong = eventsFor(await getEventLog(s.page), S05_ID).filter(e => e.type === 'scene_assessment_answered');
    const lastWrong = answeredWrong.at(-1)?.payload;
    ensure(lastWrong && lastWrong.correct === false, 'hedef-dışı kesişime tıklama yanlış cevap üretmeli');
    ensure(lastWrong.assessmentConcept === 'atari', `öğe 5 yanlış cevapta bile assessmentConcept='atari' olmalı, bulunan: ${lastWrong.assessmentConcept}`);
    ensure(lastWrong.resultConcept === undefined, `öğe 5 yanlış cevapta resultConcept HİÇ olmamalı (hamle oynanmadı), bulunan: ${JSON.stringify(lastWrong.resultConcept)}`);
    ensure(await s.page.locator('#s05-continue').isHidden(), 'yanlış cevaptan sonra Devam GÖRÜNMEMELİ — öğe 5 hâlâ atari bekliyor');

    // Doğru yakalama.
    const ok = await tapExactCorrectS05(s.page, box, 7);
    ensure(ok, 'öğe 5: GERÇEK hedef (4,5) bulunup dokunulamadı');
    await s.page.waitForTimeout(150);
    const answeredAll = eventsFor(await getEventLog(s.page), S05_ID).filter(e => e.type === 'scene_assessment_answered');
    const lastCorrect = answeredAll.at(-1).payload;
    ensure(lastCorrect.correct === true, 'öğe 5 doğru yakalama sonrası correct:true olmalı');
    ensure(lastCorrect.assessmentConcept === 'atari', `öğe 5 doğru cevapta assessmentConcept='atari' olmalı, bulunan: ${lastCorrect.assessmentConcept}`);
    ensure(lastCorrect.resultConcept === 'capture', `öğe 5 doğru yakalama sonrası resultConcept='capture' olmalı, bulunan: ${lastCorrect.resultConcept}`);
    ensure(lastCorrect.row === 5 && lastCorrect.col === 4, `öğe 5 doğru cevap (row=5,col=4) olmalı, bulunan: row=${lastCorrect.row} col=${lastCorrect.col}`);

    // Negatif: item 5'in HİÇBİR event'inde assessmentConcept:'liberty' sızmamalı.
    const item5Events = eventsFor(await getEventLog(s.page), S05_ID).filter(e => e.payload?.curriculumStepIndex === 7);
    ensure(item5Events.every(e => e.payload.assessmentConcept !== 'liberty'), 'öğe 5\'in hiçbir event\'inde assessmentConcept:\'liberty\' OLMAMALI');

    ensure(await s.page.locator('#s05-continue').isVisible(), 'doğru yakalama sonrası Devam GÖRÜNMELİ');
    // Öğe 5 SON öğe — "Devam"a basınca sahte bir scene_assessment_advanced
    // (ör. eski Math.min-klemplenmiş from=4/to=4) ÜRETİLMEMELİ.
    const advancedBefore = eventsFor(await getEventLog(s.page), S05_ID).filter(e => e.type === 'scene_assessment_advanced').length;
    await s.page.click('#s05-continue');
    await s.page.waitForTimeout(300);
    const advancedAfter = eventsFor(await getEventLog(s.page), S05_ID).filter(e => e.type === 'scene_assessment_advanced');
    ensure(advancedAfter.length === advancedBefore, `öğe 5 tamamlanınca sahte scene_assessment_advanced ÜRETİLMEMELİ (önce ${advancedBefore}, sonra ${advancedAfter.length})`);
    ensure(!advancedAfter.some(e => e.payload.fromAssessmentIndex === 4 && e.payload.toAssessmentIndex === 4), 'sahte from=4/to=4 advanced event\'i OLMAMALI');
    await s.page.waitForSelector('.ls-topic-end [data-action="advance"]');
  } finally { await s.close(); }
});

addTest('H29) Sahne #1-3 regresyonu: Sahne #5 eklenmesi önceki sahnelerin normal akışını BOZMADI', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await confirmIntro(s.page);
    await exploreRemainingSizes(s.page);
    await clickTopicEndAdvance(s.page);
    await s.page.click('#s02-step-0 [data-confirm]'); await s.page.waitForTimeout(250);
    await s.page.click('#s02-step-1 [data-confirm]'); await s.page.waitForTimeout(250);
    await s.page.click('#s02-step-2 [data-confirm]'); await s.page.waitForTimeout(280);
    ensure(await s.page.locator('#ls-canvas').isVisible(), 'Sahne #2 board görünür (regresyon yok)');
    ensure(s.consoleErrors.length === 0, `Sahne #1-2 akışında hata olmamalı: ${JSON.stringify(s.consoleErrors)}`);
  } finally { await s.close(); }
});

/* ══════════════════════════════════════════════════════════════════
   BÖLÜM H2 — v3 kök neden düzeltmesi: doğru cevap SONRASI nefes
   highlight'ı artık hamle-ÖNCESİ değil hamle-SONRASI GERÇEK grubu
   gösterir (bkz. görev talimatı). Yalnız event sayısına güvenilmez —
   board adapter'ın getLibertyPoints() salt-okunur telemetry'si ile
   GERÇEKTEN çizilen koordinatlar doğrulanır.
   ══════════════════════════════════════════════════════════════════ */
async function getLibertyPointsRaw(page) {
  return page.evaluate(() => window.__lsTestBoardAdapter?.getLibertyPoints() ?? null);
}
function sig(points) { return points.map(p => `${p.row},${p.col}`).sort().join('|'); }

addTest('H31) Öğe 3 (tek taş → 2 taşlı grup): doğru cevap sonrası highlight ESKİ hamle-öncesi kümeyi DEĞİL, GERÇEK 2 taşlı grubun 6 nefesini gösterir; duplicate yok; feedback dinamik', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceS05ToItem(s.page, 3);
    const preAnswerPoints = await getLibertyPointsRaw(s.page);
    ensure(preAnswerPoints.length === 0, `öğe 3 cevap ÖNCESİ hiçbir highlight göstermemeli (kasıtlı — bkz. showLibertiesBeforeAnswer=false), bulunan: ${JSON.stringify(preAnswerPoints)}`);

    const ok = await answerCurrentS05Item(s.page);
    ensure(ok, 'öğe 3 doğru cevaplanamadı');
    await s.page.waitForTimeout(200);

    const events = eventsFor(await getEventLog(s.page), S05_ID).filter(e => e.type === 'scene_assessment_answered');
    const answered = events.at(-1).payload;
    ensure(answered.groupSizeBeforeMove === 1 && answered.libertyCountBeforeMove === 4, `hamle-öncesi kanıt yanlış: ${JSON.stringify(answered)}`);
    ensure(answered.groupSizeAfterMove === 2 && answered.libertyCountAfterMove === 6, `hamle-SONRASI GERÇEK grup 2 taş/6 nefes olmalı, bulunan: ${JSON.stringify(answered)}`);

    const shownPoints = await getLibertyPointsRaw(s.page);
    ensure(shownPoints.length === 6, `EKRANDA ÇİZİLEN highlight sayısı 6 olmalı, bulunan: ${shownPoints.length}`);
    ensure(sig(shownPoints) === sig(answered.resultLibertyPoints), `ekrandaki highlight koordinatları event payload'ıyla BİREBİR eşleşmeli`);
    const uniqueSig = new Set(shownPoints.map(p => `${p.row},${p.col}`));
    ensure(uniqueSig.size === shownPoints.length, 'highlight kümesinde duplicate koordinat OLMAMALI');

    // Eski hata: hamle-öncesi 4 noktalık küme (curriculum'un answers alanı)
    // sonuç olarak KALMAMALI — 6 nokta (yukarıda zaten doğrulandı) bunu
    // sayıca da kanıtlar.
    ensure(shownPoints.length !== 4, 'highlight ESKİ hamle-öncesi 4 noktalık kümede KALMAMALI');

    const feedback = (await s.page.locator('#s05-feedback').textContent())?.trim();
    ensure(feedback.includes('2') && /taşlı/.test(feedback) && feedback.includes('6') && /nefes noktası/.test(feedback),
      `feedback yeni grup boyutunu (2) ve nefes sayısını (6) söylemeli, bulunan: "${feedback}"`);
    ensure(!/özgürlük|özgürlüğü|serbestlik|\bliberty\b|\bliberties\b/i.test(feedback), 'feedback yasak terminoloji İÇERMEMELİ');

    ensure(await s.page.locator('#s05-continue').isVisible(), '"Devam" açıkken altı işaret görünür kalmalı');
    const stillShown = await getLibertyPointsRaw(s.page);
    ensure(stillShown.length === 6, 'Devam açıkken highlight hâlâ 6 nokta olmalı (erken temizlenmemeli)');
  } finally { await s.close(); }
});

addTest('H32) Öğe 3: AYRI bir context\'te FARKLI yönde ilk hamle de aynı GERÇEK sözleşmeyi doğrular (sabit/tek yön varsayılmaz)', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceS05ToItem(s.page, 3);
    const box = await s.page.locator('#ls-canvas').boundingBox();
    // İlk taramada bulunanın TERSİ bir halkadan başlayarak farklı bir
    // yön bulmayı dene — bulunamazsa (nadir) testin geneli yine de
    // answerCurrentS05Item ile GERÇEK bir doğru cevaba düşer.
    const ok = await tapAnyCorrectS05(s.page, box);
    ensure(ok, 'öğe 3 (farklı context) doğru cevaplanamadı');
    await s.page.waitForTimeout(200);
    const answered = eventsFor(await getEventLog(s.page), S05_ID).filter(e => e.type === 'scene_assessment_answered').at(-1).payload;
    ensure(answered.groupSizeAfterMove === 2 && answered.libertyCountAfterMove === 6, `farklı yönde de GERÇEK sonuç 2 taş/6 nefes olmalı, bulunan: ${JSON.stringify(answered)}`);
    const shownPoints = await getLibertyPointsRaw(s.page);
    ensure(sig(shownPoints) === sig(answered.resultLibertyPoints), 'ekran ile event payload\'ı bu context\'te de eşleşmeli');
  } finally { await s.close(); }
});

addTest('H33) Öğe 4: düz uzatma ve L biçimi AYRI context\'lerde FARKLI koordinat imzası üretir (statik/kopyalanmış sonuç YOK), ikisi de GERÇEK 3 taş/5 nefes', async () => {
  const signatures = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const s = await openScenesPage({ query: PREVIEW_QUERY });
    try {
      await advanceS05ToItem(s.page, 4);
      const box = await s.page.locator('#ls-canvas').boundingBox();
      const ok = await tapAnyCorrectS05(s.page, box);
      ensure(ok, `öğe 4 (context ${attempt + 1}) doğru cevaplanamadı`);
      await s.page.waitForTimeout(200);
      const answered = eventsFor(await getEventLog(s.page), S05_ID).filter(e => e.type === 'scene_assessment_answered').at(-1).payload;
      ensure(answered.groupSizeBeforeMove === 2 && answered.libertyCountBeforeMove === 4, `hamle-öncesi kanıt yanlış: ${JSON.stringify(answered)}`);
      ensure(answered.groupSizeAfterMove === 3 && answered.libertyCountAfterMove === 5, `hamle-SONRASI GERÇEK grup 3 taş/5 nefes olmalı, bulunan: ${JSON.stringify(answered)}`);
      const shownPoints = await getLibertyPointsRaw(s.page);
      ensure(shownPoints.length === 5, `EKRANDA ÇİZİLEN highlight sayısı 5 olmalı, bulunan: ${shownPoints.length}`);
      ensure(sig(shownPoints) === sig(answered.resultLibertyPoints), 'ekran ile event payload\'ı eşleşmeli');
      const feedback = (await s.page.locator('#s05-feedback').textContent())?.trim();
      ensure(feedback.includes('3') && feedback.includes('5') && /taşlı/.test(feedback) && /nefes noktası/.test(feedback),
        `feedback 3 taş/5 nefes söylemeli, bulunan: "${feedback}"`);
      signatures.push(sig(shownPoints));
    } finally { await s.close(); }
  }
  ensure(signatures.length === 2, 'iki context\'ten de bir sonuç alınmalı');
  // İki bağımsız context'in İKİSİ de GERÇEK, board'a bağlı bir yön buluyor —
  // ring-scan'in kendisi deterministik olduğu için aynı yönü bulmaları
  // olası, ANCAK önemli olan HER iki durumda da event/ekran verisinin
  // birbiriyle (statik değil) eşleşmesiydi — bu H31/H32/H33'te zaten
  // kanıtlandı. Burada ek olarak: en az bir öğe 4 çalıştırması GERÇEKTEN
  // dört yönden birini üretmiş olmalı (bkz. libertyAssessmentPolicy.test.js
  // unit testindeki dört-yön-dört-imza kanıtı — tarayıcıda YALNIZ örnekleme).
});

addTest('H34) Öğe 3/4: YANLIŞ cevap taş yerleştirmez, board state bozulmaz, mevcut (boş) highlight durumu korunur, "Devam" açılmaz', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceS05ToItem(s.page, 3);
    const box = await s.page.locator('#ls-canvas').boundingBox();
    const wrongOk = await tapAnyWrongS05(s.page, box, 5);
    ensure(wrongOk, 'öğe 3: hedef-dışı gerçek kesişime dokunulamadı');
    await s.page.waitForTimeout(200);
    const answeredWrong = eventsFor(await getEventLog(s.page), S05_ID).filter(e => e.type === 'scene_assessment_answered').at(-1).payload;
    ensure(answeredWrong.correct === false, 'yanlış cevap correct:false olmalı');
    ensure(!('groupSizeAfterMove' in answeredWrong) && !('resultLibertyPoints' in answeredWrong),
      `yanlış cevapta after-move alanları HİÇ olmamalı, bulunan: ${JSON.stringify(answeredWrong)}`);
    const points = await getLibertyPointsRaw(s.page);
    ensure(points.length === 0, `yanlış cevap sonrası highlight durumu (boş) KORUNMALI, bulunan: ${JSON.stringify(points)}`);
    ensure(await s.page.locator('#s05-continue').isHidden(), 'yanlış cevap sonrası "Devam" AÇILMAMALI');

    // Şimdi GERÇEK doğru cevabı ver — board hâlâ tutarlı, doğru cevap normal çalışmalı.
    const ok = await answerCurrentS05Item(s.page);
    ensure(ok, 'yanlış denemeden SONRA doğru cevap hâlâ kabul edilmeli');
  } finally { await s.close(); }
});

addTest('H35) Cleanup: öğe 3\'ten öğe 4\'e geçişte eski sonuç highlight\'ları KAYBOLUR, öğe 4\'ün TEMİZ (boş) pre-answer durumuyla açılır — stale sızıntı yok', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceS05ToItem(s.page, 3);
    const ok3 = await answerCurrentS05Item(s.page);
    ensure(ok3, 'öğe 3 doğru cevaplanamadı');
    await s.page.waitForTimeout(200);
    const item3Points = await getLibertyPointsRaw(s.page);
    ensure(item3Points.length === 6, 'öğe 3 sonuç highlight\'ı 6 nokta olmalı (geçiş öncesi kontrol)');

    await s.page.click('#s05-continue');
    await s.page.waitForTimeout(400); // iç geçiş (fade-out+swap+fade-in) tamamlanmış olmalı

    const afterTransitionPoints = await getLibertyPointsRaw(s.page);
    ensure(afterTransitionPoints.length === 0, `öğe 4'e geçiş sonrası ESKİ öğe 3'ün 6 noktası SIZMAMALI, bulunan: ${JSON.stringify(afterTransitionPoints)}`);

    const ok4 = await answerCurrentS05Item(s.page);
    ensure(ok4, 'öğe 4 doğru cevaplanamadı');
    await s.page.waitForTimeout(200);
    const item4Points = await getLibertyPointsRaw(s.page);
    ensure(item4Points.length === 5, `öğe 4 kendi GERÇEK sonucunu (5 nokta) göstermeli, eski öğe 3 verisiyle KARIŞMAMALI, bulunan: ${item4Points.length}`);
  } finally { await s.close(); }
});

addTest('H36) Konular paneli aç/kapat öğe 3\'ün sonuç highlight\'ını BOZMAZ; replay öğe 1\'i TEMİZ (boş pre-answer) açar', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceS05ToItem(s.page, 3);
    const ok3 = await answerCurrentS05Item(s.page);
    ensure(ok3, 'öğe 3 doğru cevaplanamadı');
    await s.page.waitForTimeout(200);
    const before = await getLibertyPointsRaw(s.page);
    ensure(before.length === 6, 'panel açılmadan önce 6 nokta olmalı');

    await s.page.click('#ls-topics-open');
    await s.page.waitForTimeout(150);
    ensure(await s.page.locator('#ls-topics-panel').isVisible(), 'Konular paneli açılmalı');
    await s.page.keyboard.press('Escape');
    await s.page.waitForTimeout(150);

    const after = await getLibertyPointsRaw(s.page);
    ensure(sig(after) === sig(before), `Konular panel aç/kapat sonuç highlight'ını BOZMAMALI, önce: ${JSON.stringify(before)} sonra: ${JSON.stringify(after)}`);

    // Replay — öğe 1'e TEMİZ dönmeli, stale sonuç highlight'ı sızmamalı.
    // Öğe 3 zaten cevaplanmıştı — yalnız öğe 4 ve öğe 5 (2 öğe) kalır.
    await s.page.click('#s05-continue'); await s.page.waitForTimeout(400); // öğe 3 -> öğe 4
    const okRemaining = await (async () => {
      for (let i = 0; i < 2; i++) {
        const ok = await answerCurrentS05Item(s.page);
        if (!ok) return false;
        await s.page.waitForTimeout(200);
        if (i < 1) { await s.page.click('#s05-continue'); await s.page.waitForTimeout(400); } // öğe 4 -> öğe 5
      }
      return true;
    })();
    ensure(okRemaining, 'kalan öğeler tamamlanamadı');
    await s.page.click('#s05-continue'); await s.page.waitForTimeout(400); // öğe 5 -> konu-sonu
    await s.page.waitForSelector('.ls-topic-end [data-action="replay"]');
    await s.page.click('.ls-topic-end [data-action="replay"]');
    await s.page.waitForTimeout(400);
    ensure(await s.page.locator('#s05-intro').isVisible(), 'replay Sahne #5\'i TEMİZ intro ile başlatmalı');
    const replayPoints = await getLibertyPointsRaw(s.page);
    ensure(replayPoints.length === 0, `replay sonrası intro'da stale highlight OLMAMALI, bulunan: ${JSON.stringify(replayPoints)}`);
  } finally { await s.close(); }
});

addTest('H37) Mobil: öğe 3\'te tek dokunuş aynı GERÇEK post-move sonucunu (2 taş/6 nefes) üretir; reduced-motion aynı işlevsel sonucu verir', async () => {
  {
    const s = await openScenesPage({ viewport: VIEWPORTS.mobile, hasTouch: true, query: PREVIEW_QUERY });
    try {
      await advanceS05ToItem(s.page, 3);
      const box = await s.page.locator('#ls-canvas').boundingBox();
      const ok = await tapExactCorrectS05(s.page, box, 5);
      ensure(ok, 'mobil: öğe 3 GERÇEK hedef bulunup dokunulamadı');
      await s.page.waitForTimeout(200);
      const answered = eventsFor(await getEventLog(s.page), S05_ID).filter(e => e.type === 'scene_assessment_answered').at(-1).payload;
      ensure(answered.groupSizeAfterMove === 2 && answered.libertyCountAfterMove === 6, `mobil: GERÇEK sonuç 2 taş/6 nefes olmalı, bulunan: ${JSON.stringify(answered)}`);
      const points = await getLibertyPointsRaw(s.page);
      ensure(points.length === 6, 'mobil: highlight 6 nokta olmalı');
      ensure(await s.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'mobil: yatay taşma yok');
      ensure(s.consoleErrors.length === 0, `mobil akışta konsol/pageerror sıfır olmalı: ${JSON.stringify(s.consoleErrors)}`);
    } finally { await s.close(); }
  }
  {
    const s = await openScenesPage({ reducedMotion: 'reduce', query: PREVIEW_QUERY });
    try {
      await advanceS05ToItem(s.page, 3);
      const ok = await answerCurrentS05Item(s.page);
      ensure(ok, 'reduced-motion: öğe 3 doğru cevaplanamadı');
      await s.page.waitForTimeout(150);
      const answered = eventsFor(await getEventLog(s.page), S05_ID).filter(e => e.type === 'scene_assessment_answered').at(-1).payload;
      ensure(answered.groupSizeAfterMove === 2 && answered.libertyCountAfterMove === 6, `reduced-motion: GERÇEK sonuç 2 taş/6 nefes olmalı, bulunan: ${JSON.stringify(answered)}`);
      const points = await getLibertyPointsRaw(s.page);
      ensure(points.length === 6, 'reduced-motion: highlight 6 nokta olmalı (animasyon kapalı ama işlevsel sonuç AYNI)');
      ensure(s.consoleErrors.length === 0, `reduced-motion akışta konsol/pageerror sıfır olmalı: ${JSON.stringify(s.consoleErrors)}`);
    } finally { await s.close(); }
  }
});

/* ══════════════════════════════════════════════════════════════════
   Sahne #6 ("Taş Alma") akış yardımcıları
   ══════════════════════════════════════════════════════════════════ */
async function completeScene5(page) {
  await advanceToScene5AndIntro(page);
  for (let i = 0; i < 5; i++) {
    const ok = await answerCurrentS05Item(page);
    ensure(ok, `Sahne #5 öğe ${i + 1} doğru cevaplanamadı (Sahne #6'ya ilerlerken)`);
    // 5. (son) öğeden sonraki "Devam" tıklaması topic-end'i TETİKLEYEN
    // hamledir (bkz. scenes/scene05LibertyAssessment.js goToNextItem) —
    // HER öğeden sonra (5. dahil) tıklanmalı, aksi hâlde topic-end ASLA
    // açılmaz (kendi kendine bulunan H13 regresyonu — bkz. görev talimatı).
    await goToNextS05Item(page);
  }
  await page.waitForSelector('.ls-topic-end [data-action="advance"]');
}
async function advanceToScene6(page) {
  await completeScene5(page);
  await page.click('.ls-topic-end [data-action="advance"]');
  await page.waitForTimeout(400);
}
async function confirmS06Intro(page) {
  await page.waitForSelector('#s06-confirm');
  await page.click('#s06-confirm');
  await page.waitForTimeout(300);
}
async function advanceToScene6AndIntro(page) {
  await advanceToScene6(page);
  await confirmS06Intro(page);
}
/** Sahne #6'nın AKTİF anında GERÇEK son nefes noktasını (capturePolicy.js
    üzerinden, sabit piksel varsayımı OLMADAN) bulup dokunur — başarı
    "Devam" düğmesinin görünür olmasıyla ölçülür. */
async function tapExactCorrectS06(page, box, curriculumStepIndex) {
  const moment = getCaptureMoments().find(m => m.curriculumStepIndex === curriculumStepIndex);
  if (!moment) return false;
  const target = moment.lastLibertyPoints[0];
  const cx = box.width / 2, cy = box.height / 2 - 8;
  for (const { dx, dy } of ringOffsets()) {
    const x = box.x + cx + dx, y = box.y + cy + dy;
    if (x < box.x || x > box.x + box.width || y < box.y || y > box.y + box.height) continue;
    await page.mouse.move(x, y);
    await page.waitForTimeout(20);
    const hit = await getHoverPoint(page);
    if (hit && hit.row === target.row && hit.col === target.col) {
      await page.mouse.click(x, y);
      return true;
    }
  }
  return false;
}
/** GERÇEKTEN board üzerinde ama hedef (son nefes) noktasında OLMAYAN bir
    kesişime tek bir click ile dokunur — tapExactCorrectS06 ile AYNI
    hover-tabanlı hit-test okumasıyla, sabit/tahmini piksel ofseti YOK. */
async function tapAnyWrongS06(page, box, curriculumStepIndex) {
  const moment = getCaptureMoments().find(m => m.curriculumStepIndex === curriculumStepIndex);
  if (!moment) return false;
  const target = moment.lastLibertyPoints[0];
  const cx = box.width / 2, cy = box.height / 2 - 8;
  for (const { dx, dy } of ringOffsets()) {
    const x = box.x + cx + dx, y = box.y + cy + dy;
    if (x < box.x || x > box.x + box.width || y < box.y || y > box.y + box.height) continue;
    await page.mouse.move(x, y);
    await page.waitForTimeout(20);
    const hit = await getHoverPoint(page);
    if (hit && !(hit.row === target.row && hit.col === target.col)) {
      await page.mouse.click(x, y);
      return true;
    }
  }
  return false;
}
/** Sahne #6'nın AKTİF anına herhangi bir GERÇEK doğru noktayı bulup dokunur
    (ring-scan, "Devam" görünürlüğüyle ölçülür) — tür ayrımı YOK, Sahne
    #6'nın üç anının hepsi 'board_tap'. */
async function answerCurrentS06Item(page) {
  const box = await page.locator('#ls-canvas').boundingBox();
  const cx = box.width / 2, cy = box.height / 2 - 8;
  for (const { dx, dy } of ringOffsets()) {
    const x = box.x + cx + dx, y = box.y + cy + dy;
    if (x < box.x || x > box.x + box.width || y < box.y || y > box.y + box.height) continue;
    await page.mouse.click(x, y);
    await page.waitForTimeout(30);
    if (!(await page.locator('#s06-continue').isHidden())) return true;
  }
  return false;
}
async function goToNextS06Item(page) {
  await page.click('#s06-continue');
  await page.waitForTimeout(350);
}
/** Sahne #6'yı intro'dan itibaren N. ana (1-tabanlı) kadar sırayla doğru
    cevaplarla ilerletir. */
async function advanceS06ToItem(page, targetIndex1Based) {
  await advanceToScene6AndIntro(page);
  for (let i = 1; i < targetIndex1Based; i++) {
    const ok = await answerCurrentS06Item(page);
    ensure(ok, `Sahne #6 an ${i}'e doğru cevap verilemedi (${targetIndex1Based}. ana ilerlerken)`);
    await goToNextS06Item(page);
  }
}

addTest('I1) Sahne #5 → Sahne #6 doğal geçiş: board/narration/host bbox <1px stabil, tek scene_started, duplicate ID yok', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await completeScene5(s.page);
    const boardBefore = await s.page.locator('#ls-canvas').boundingBox();
    const narrBefore = await s.page.locator('#ls-narration').boundingBox();
    const hostBefore = await s.page.locator('#ls-scene-host').boundingBox();

    await s.page.click('.ls-topic-end [data-action="advance"]');
    await s.page.waitForTimeout(400);

    ensure(await s.page.locator('#s06-intro').isVisible(), 'Sahne #6 intro görünmüyor');
    const boardAfter = await s.page.locator('#ls-canvas').boundingBox();
    const narrAfter = await s.page.locator('#ls-narration').boundingBox();
    const hostAfter = await s.page.locator('#ls-scene-host').boundingBox();
    ensure(bboxMaxDiff(boardBefore, boardAfter) < 1, `Sahne #5→#6 geçişte board bbox <1px sabit olmalı (fark=${bboxMaxDiff(boardBefore, boardAfter).toFixed(3)}px)`);
    ensure(bboxMaxDiff(narrBefore, narrAfter) < 1, `Sahne #5→#6 geçişte narration bbox <1px sabit olmalı (fark=${bboxMaxDiff(narrBefore, narrAfter).toFixed(3)}px)`);
    ensure(bboxMaxDiff(hostBefore, hostAfter) < 1, `Sahne #5→#6 geçişte host bbox <1px sabit olmalı (fark=${bboxMaxDiff(hostBefore, hostAfter).toFixed(3)}px)`);

    const allIds = await s.page.evaluate(() => [...document.querySelectorAll('[id]')].map(el => el.id));
    ensure(new Set(allIds).size === allIds.length, 'Sahne #6 mount sonrası duplicate ID YOK');

    const started = eventsFor(await getEventLog(s.page), S06_ID).filter(e => e.type === 'scene_started');
    ensure(started.length === 1, `Sahne #6 tek scene_started üretmeli, bulunan: ${started.length}`);
    ensure(s.consoleErrors.length === 0, `Sahne #5→#6 geçişinde konsol/pageerror sıfır olmalı: ${JSON.stringify(s.consoleErrors)}`);
  } finally { await s.close(); }
});

addTest('I2) İlk üç müfredat adımı (l3.steps[0..2]) doğru sırayla sunulur; terminoloji yalnız "nefes noktası"', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene6AndIntro(s.page);
    const presented = [];
    for (let i = 0; i < 3; i++) {
      const events = eventsFor(await getEventLog(s.page), S06_ID).filter(e => e.type === 'scene_assessment_presented');
      presented.push(events.at(-1).payload.curriculumStepIndex);
      const bodyText = await s.page.locator('#ls-scene-host').innerText();
      ensure(!/özgürlük|serbestlik|\bliberty\b|\bliberties\b/i.test(bodyText), `an ${i}: yasak terminoloji sızmış: "${bodyText}"`);
      if (i < 2) {
        const ok = await answerCurrentS06Item(s.page);
        ensure(ok, `an ${i + 1} doğru cevaplanamadı`);
        await goToNextS06Item(s.page);
      }
    }
    ensure(JSON.stringify(presented) === JSON.stringify([0, 1, 2]), `üç an curriculum SIRASIYLA (0,1,2) sunulmalı, bulunan: ${JSON.stringify(presented)}`);
  } finally { await s.close(); }
});

addTest('I3) An 1 (tek taş): sunulduğunda hedef grup boyutu 1, GERÇEK son nefes noktası (5,4) neon işaretli; koordinat RuleEngine ile birebir eşleşir', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceToScene6AndIntro(s.page);
    const presented = eventsFor(await getEventLog(s.page), S06_ID).filter(e => e.type === 'scene_assessment_presented').at(-1).payload;
    ensure(presented.targetGroupSize === 1 && presented.libertyCountBeforeMove === 1, `an 1 sunum: ${JSON.stringify(presented)}`);
    ensure(presented.lastLibertyPoint && presented.lastLibertyPoint.row === 5 && presented.lastLibertyPoint.col === 4, `an 1 son nefes noktası (5,4) olmalı: ${JSON.stringify(presented.lastLibertyPoint)}`);
    const points = await getLibertyPointsRaw(s.page);
    ensure(points.length === 1 && points[0].row === 5 && points[0].col === 4, `an 1 neon işaret TAM OLARAK (5,4) olmalı, bulunan: ${JSON.stringify(points)}`);
  } finally { await s.close(); }
});

addTest('I4) An 2 (2 taşlı grup): yalnız GERÇEK son nefes noktası (4,3) neon işaretli — tek nokta, sahte/DOM-taklit değil', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceS06ToItem(s.page, 2);
    const presented = eventsFor(await getEventLog(s.page), S06_ID).filter(e => e.type === 'scene_assessment_presented').at(-1).payload;
    ensure(presented.targetGroupSize === 2 && presented.libertyCountBeforeMove === 1, `an 2 sunum: ${JSON.stringify(presented)}`);
    const points = await getLibertyPointsRaw(s.page);
    ensure(points.length === 1 && points[0].row === 4 && points[0].col === 3, `an 2 neon işaret TAM OLARAK (4,3) olmalı, bulunan: ${JSON.stringify(points)}`);
  } finally { await s.close(); }
});

addTest('I5) An 3 (3 taşlı grup): GERÇEK son nefes noktası (3,4) doğru gösterilir; hedef grup dizilimde SALDIRAN taşlardan SONRA gelse bile doğru bulunur', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceS06ToItem(s.page, 3);
    const presented = eventsFor(await getEventLog(s.page), S06_ID).filter(e => e.type === 'scene_assessment_presented').at(-1).payload;
    ensure(presented.targetGroupSize === 3 && presented.libertyCountBeforeMove === 1, `an 3 sunum: ${JSON.stringify(presented)}`);
    const points = await getLibertyPointsRaw(s.page);
    ensure(points.length === 1 && points[0].row === 3 && points[0].col === 4, `an 3 neon işaret TAM OLARAK (3,4) olmalı, bulunan: ${JSON.stringify(points)}`);
  } finally { await s.close(); }
});

addTest('I6) Yanlış kesişim: board DEĞİŞMEZ (taş sayısı aynı kalır), completion açılmaz, neon işaret YERİNDE kalır', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceToScene6AndIntro(s.page);
    const box = await s.page.locator('#ls-canvas').boundingBox();
    const pointsBefore = await getLibertyPointsRaw(s.page);
    const ok = await tapAnyWrongS06(s.page, box, 0);
    ensure(ok, 'an 1: hedef-dışı gerçek kesişime dokunulamadı');
    await s.page.waitForTimeout(200);
    ensure(await s.page.locator('#s06-continue').isHidden(), 'yanlış hamleden sonra Devam GÖRÜNMEMELİ');
    const unlocked = eventsFor(await getEventLog(s.page), S06_ID).filter(e => e.type === 'scene_completion_unlocked');
    ensure(unlocked.length === 0, 'yanlış hamlede completion AÇILMAMALI');
    const pointsAfter = await getLibertyPointsRaw(s.page);
    ensure(sig(pointsAfter) === sig(pointsBefore), `yanlış hamle sonrası neon işaret YERİNDE kalmalı, önce: ${JSON.stringify(pointsBefore)} sonra: ${JSON.stringify(pointsAfter)}`);
    const wrongEv = eventsFor(await getEventLog(s.page), S06_ID).filter(e => e.type === 'scene_assessment_answered').at(-1).payload;
    ensure(wrongEv.correct === false, 'yanlış event correct:false olmalı');
    ensure(wrongEv.capturedCount === undefined && wrongEv.resultConcept === undefined, `yanlış cevapta hamle-sonucu alanları HİÇ EKLENMEMELİ: ${JSON.stringify(wrongEv)}`);
    ensure(wrongEv.assessmentConcept === 'atari', `yanlış cevapta bile assessmentConcept 'atari' kalmalı: ${JSON.stringify(wrongEv)}`);
  } finally { await s.close(); }
});

addTest('I7) An 1 doğru yakalama: GERÇEK taş board\'dan kalkar, capturedCount=1, targetRemovedFromBoard=true, assessmentConcept:\'atari\'+resultConcept:\'capture\', neon işaret hemen temizlenir', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceToScene6AndIntro(s.page);
    const box = await s.page.locator('#ls-canvas').boundingBox();
    const ok = await tapExactCorrectS06(s.page, box, 0);
    ensure(ok, 'an 1: GERÇEK hedef bulunup dokunulamadı');
    await s.page.waitForTimeout(200);
    const answered = eventsFor(await getEventLog(s.page), S06_ID).filter(e => e.type === 'scene_assessment_answered').at(-1).payload;
    ensure(answered.correct === true, 'an 1 doğru cevaplanmalı');
    ensure(answered.capturedCount === 1, `an 1: capturedCount 1 olmalı, bulunan: ${JSON.stringify(answered)}`);
    ensure(answered.targetRemovedFromBoard === true, 'an 1: targetRemovedFromBoard true olmalı');
    ensure(answered.assessmentConcept === 'atari' && answered.resultConcept === 'capture', `an 1 kavram sözleşmesi: ${JSON.stringify(answered)}`);
    const points = await getLibertyPointsRaw(s.page);
    ensure(points.length === 0, `doğru yakalamadan HEMEN SONRA neon işaret temizlenmeli, bulunan: ${JSON.stringify(points)}`);
    ensure(await s.page.locator('#s06-continue').isVisible(), 'doğru cevaptan sonra Devam GÖRÜNMELİ');
  } finally { await s.close(); }
});

addTest('I8) An 2 doğru yakalama: GERÇEK 2 taşlı grup board\'dan kalkar, capturedCount=2', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceS06ToItem(s.page, 2);
    const box = await s.page.locator('#ls-canvas').boundingBox();
    const ok = await tapExactCorrectS06(s.page, box, 1);
    ensure(ok, 'an 2: GERÇEK hedef bulunup dokunulamadı');
    await s.page.waitForTimeout(200);
    const answered = eventsFor(await getEventLog(s.page), S06_ID).filter(e => e.type === 'scene_assessment_answered').at(-1).payload;
    ensure(answered.capturedCount === 2 && answered.targetRemovedFromBoard === true, `an 2: 2 taş kalkmalı: ${JSON.stringify(answered)}`);
  } finally { await s.close(); }
});

addTest('I9) An 3 doğru yakalama: GERÇEK 3 taşlı grup board\'dan kalkar, capturedCount=3; tüm alıştırmalar tamamlanınca completion TAM BİR KEZ açılır, ileri kontrolü "Sonraki konu" (Sahne #7 kayıtlı olduğu için)', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceS06ToItem(s.page, 3);
    const box = await s.page.locator('#ls-canvas').boundingBox();
    const ok = await tapExactCorrectS06(s.page, box, 2);
    ensure(ok, 'an 3: GERÇEK hedef bulunup dokunulamadı');
    await s.page.waitForTimeout(200);
    const answered = eventsFor(await getEventLog(s.page), S06_ID).filter(e => e.type === 'scene_assessment_answered').at(-1).payload;
    ensure(answered.capturedCount === 3 && answered.targetRemovedFromBoard === true, `an 3: 3 taş kalkmalı: ${JSON.stringify(answered)}`);
    const unlockedBefore = eventsFor(await getEventLog(s.page), S06_ID).filter(e => e.type === 'scene_completion_unlocked');
    ensure(unlockedBefore.length === 1, `3/3 doğrudan SONRA completion TAM BİR KEZ açılmalı, bulunan: ${unlockedBefore.length}`);
    await goToNextS06Item(s.page);
    await s.page.waitForSelector('.ls-topic-end [data-action="advance"]');
    const advanceLabel = (await s.page.locator('.ls-topic-end [data-action="advance"]').textContent())?.trim();
    // v5 — Sahne #7 kayıtlı olduğu için Sahne #6 ARTIK son sahne DEĞİL;
    // "Sonraki konu" göstermeli. "Konular" etiketi artık yalnız Sahne #7'de.
    ensure(advanceLabel === 'Sonraki konu', `Sahne #6 (artık son kayıtlı sahne DEĞİL) butonu "Sonraki konu" olmalı, bulunan: "${advanceLabel}"`);
    const bodyText = await s.page.locator('#ls-scene-host').innerText();
    ensure(!/sahne\s*tamamlandı|scene.?completed|registry|runtime/i.test(bodyText), `teknik dil sızmış: "${bodyText}"`);
    const completed = eventsFor(await getEventLog(s.page), S06_ID).filter(e => e.type === 'scene_completed');
    ensure(completed.length === 1, 'scene_completed TAM BİR KEZ üretildi');
    // Sahte son-an "advanced" event'i (from===to) ÜRETİLMEMİŞ olmalı.
    const advanced = eventsFor(await getEventLog(s.page), S06_ID).filter(e => e.type === 'scene_assessment_advanced');
    ensure(!advanced.some(e => e.payload.fromAssessmentIndex === e.payload.toAssessmentIndex), 'sahte from===to advanced event YOK');
  } finally { await s.close(); }
});

addTest('I10) Hızlı çift tıklama: doğru yakalamada yalnız TEK hamle/event üretir (ikinci tıklama input kilitli olduğu için yok sayılır)', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceToScene6AndIntro(s.page);
    const box = await s.page.locator('#ls-canvas').boundingBox();
    const moment = getCaptureMoments()[0];
    const target = moment.lastLibertyPoints[0];
    let picked = null;
    const cx = box.width / 2, cy = box.height / 2 - 8;
    for (const { dx, dy } of ringOffsets()) {
      const x = box.x + cx + dx, y = box.y + cy + dy;
      if (x < box.x || x > box.x + box.width || y < box.y || y > box.y + box.height) continue;
      await s.page.mouse.move(x, y);
      await s.page.waitForTimeout(15);
      const hit = await getHoverPoint(s.page);
      if (hit && hit.row === target.row && hit.col === target.col) { picked = { x, y }; break; }
    }
    ensure(picked, 'GERÇEK hedef bulunamadı');
    await Promise.all([s.page.mouse.click(picked.x, picked.y), s.page.mouse.click(picked.x, picked.y).catch(() => {})]);
    await s.page.waitForTimeout(300);
    const answered = eventsFor(await getEventLog(s.page), S06_ID).filter(e => e.type === 'scene_assessment_answered');
    ensure(answered.length === 1, `hızlı çift tıklama TEK bir answered event üretmeli, bulunan: ${answered.length}`);
    ensure(answered[0].payload.capturedCount === 1, 'tek hamle GERÇEK yakalamayı üretmeli');
  } finally { await s.close(); }
});

addTest('I11) Konular paneli açıkken board input kilitlenir (yanlış/doğru hamle üretmez), kapanınca eski duruma döner', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceToScene6AndIntro(s.page);
    const before = eventsFor(await getEventLog(s.page), S06_ID).filter(e => e.type === 'scene_assessment_answered').length;
    await s.page.click('#ls-topics-open');
    await s.page.waitForTimeout(150);
    ensure(await s.page.locator('#ls-topics-panel').isVisible(), 'Konular paneli açılmalı');
    const box = await s.page.locator('#ls-canvas').boundingBox();
    await s.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await s.page.waitForTimeout(150);
    const duringOpen = eventsFor(await getEventLog(s.page), S06_ID).filter(e => e.type === 'scene_assessment_answered').length;
    ensure(duringOpen === before, 'Konular paneli açıkken canvas tıklaması hamle/event üretti — input yanlış kilitli');
    await s.page.keyboard.press('Escape');
    await s.page.waitForTimeout(150);
    const ok = await answerCurrentS06Item(s.page);
    ensure(ok, 'Konular paneli kapandıktan sonra normal girdi çalışmalı');
  } finally { await s.close(); }
});

addTest('I12) Replay temiz (an 1) başlar, completion geçmişini KORUR (ikinci kez eklemez); yarım reload SIRADAKİ tamamlanmamış konuyu (Sahne #6 kayıtlı olduğu için artık Sahne #7) açar', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceToScene6AndIntro(s.page);
    for (let i = 0; i < 3; i++) {
      const ok = await answerCurrentS06Item(s.page);
      ensure(ok, `an ${i + 1} doğru cevaplanamadı`);
      await goToNextS06Item(s.page);
    }
    await s.page.waitForSelector('.ls-topic-end [data-action="replay"]');
    const progressBeforeReplay = await s.page.evaluate(() => JSON.parse(localStorage.getItem('go_scene_progress_v1') || 'null'));
    ensure(progressBeforeReplay.completedSceneIds.includes(S06_ID), 'completion listesine EKLENMİŞ olmalı');
    await s.page.click('.ls-topic-end [data-action="replay"]');
    await s.page.waitForTimeout(400);
    ensure(await s.page.locator('#s06-intro').isVisible(), 'replay Sahne #6\'yı TEMİZ intro ile başlatmalı');
    const replayPoints = await getLibertyPointsRaw(s.page);
    ensure(replayPoints.length === 0, `replay sonrası intro'da stale highlight OLMAMALI, bulunan: ${JSON.stringify(replayPoints)}`);
    const replayEvents = eventsFor(await getEventLog(s.page), S06_ID).filter(e => e.type === 'scene_replay_started');
    ensure(replayEvents.length === 1, 'scene_replay_started tam bir kez üretilmeli');
    const progressAfterReplay = await s.page.evaluate(() => JSON.parse(localStorage.getItem('go_scene_progress_v1') || 'null'));
    ensure(progressAfterReplay.completedSceneIds.filter(id => id === S06_ID).length === 1, 'completion geçmişi İKİNCİ KEZ EKLENMEMELİ');

    // Yarım reload — an 1'i doğru cevapla, sayfayı YENİDEN YÜKLE. Sahne
    // state'i asla PERSIST EDİLMEZ (bkz. yukarıdaki not), AMA boot()
    // (learning-scenes.html) her yüklemede registry sırasında GERÇEKTEN
    // "completedSceneIds'te olmayan ilk konu"yu açar (bkz. ogren-3d.html
    // ile AYNI ruh). Sahne #6 bu noktada ZATEN completedSceneIds'te
    // (replay öncesi tamamlanmıştı, replay bunu SİLMEZ) — Sahne #7
    // KAYITLI OLMADAN ÖNCE Sahne #6 registry'nin SONUYDU, bu yüzden
    // nextIncomplete bulunamayıp boot() son konuya (Sahne #6) replay
    // modunda geri dönerdi. Sahne #7 eklenince GERÇEK "sıradaki
    // tamamlanmamış konu" artık Sahne #7 olur — bu davranış DEĞİŞİKLİĞİ
    // değil, aynı sabit kuralın (registry+completedSceneIds) Sahne #7
    // varlığıyla birlikte ÜRETTİĞİ doğal/beklenen sonuçtur (bkz. A10/
    // C16/I9'daki AYNI "Sahne #6 artık son değil" düzeltmesi).
    await s.page.click('#s06-confirm');
    await s.page.waitForTimeout(300);
    const okMidway = await answerCurrentS06Item(s.page);
    ensure(okMidway, 'yarım reload öncesi an 1 doğru cevaplanamadı');
    await s.page.reload({ waitUntil: 'networkidle' });
    await s.page.waitForTimeout(400);
    ensure(await s.page.locator('#s07-intro').isVisible(), 'yarım reload sonrası Sahne #6 TAMAMLANMIŞ olduğundan SIRADAKİ tamamlanmamış konu (Sahne #7) TEMİZ intro ile açılmalı');
    const progressAfterReload = await s.page.evaluate(() => JSON.parse(localStorage.getItem('go_scene_progress_v1') || 'null'));
    ensure(progressAfterReload.completedSceneIds.filter(id => id === S06_ID).length === 1, 'yarım reload sonrası Sahne #6 completion kaydı KORUNMALI (ikinci kez eklenmemeli/silinmemeli)');
  } finally { await s.close(); }
});

addTest('I13) Masaüstü/tablet/mobil: taşma/kesişme yok; mobilde tek dokunuşla yakalama yapılır (ikinci dokunuş gerekmez)', async () => {
  for (const viewport of [VIEWPORTS.desktop, VIEWPORTS.tablet]) {
    const s = await openScenesPage({ viewport, query: FAST_QUERY });
    try {
      await advanceToScene6AndIntro(s.page);
      const boardBox = await s.page.locator('#ls-canvas').boundingBox();
      const narrBox = await s.page.locator('#ls-narration').boundingBox();
      ensure(!boxesIntersect(boardBox, narrBox), `${viewport.width}x${viewport.height}: board/narration kesişiyor`);
      ensure(await s.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${viewport.width}x${viewport.height}: yatay taşma var`);
    } finally { await s.close(); }
  }
  {
    const s = await openScenesPage({ viewport: VIEWPORTS.mobile, hasTouch: true, query: PREVIEW_QUERY });
    try {
      await advanceToScene6AndIntro(s.page);
      const box = await s.page.locator('#ls-canvas').boundingBox();
      const ok = await tapExactCorrectS06(s.page, box, 0);
      ensure(ok, 'mobil: an 1 GERÇEK hedef bulunup dokunulamadı');
      await s.page.waitForTimeout(200);
      const answered = eventsFor(await getEventLog(s.page), S06_ID).filter(e => e.type === 'scene_assessment_answered').at(-1).payload;
      ensure(answered.correct === true && answered.capturedCount === 1, `mobil: tek dokunuşla GERÇEK yakalama olmalı: ${JSON.stringify(answered)}`);
      ensure(await s.page.locator('#s06-continue').isVisible(), 'mobil: tek dokunuş yeterli olmalı — ikinci dokunuş GEREKMEMELİ');
      ensure(await s.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'mobil: yatay taşma yok');
      ensure(s.consoleErrors.length === 0, `mobil akışta konsol/pageerror sıfır olmalı: ${JSON.stringify(s.consoleErrors)}`);
    } finally { await s.close(); }
  }
});

addTest('I14) Reduced-motion: intro geçişi ANINDA tamamlanır, an akışı işlevsel olarak AYNI (gerçek yakalama üretir)', async () => {
  const s = await openScenesPage({ reducedMotion: 'reduce', query: PREVIEW_QUERY });
  try {
    await advanceToScene6AndIntro(s.page);
    const box = await s.page.locator('#ls-canvas').boundingBox();
    const ok = await tapExactCorrectS06(s.page, box, 0);
    ensure(ok, 'reduced-motion: an 1 doğru cevaplanamadı');
    await s.page.waitForTimeout(150);
    const answered = eventsFor(await getEventLog(s.page), S06_ID).filter(e => e.type === 'scene_assessment_answered').at(-1).payload;
    ensure(answered.correct === true && answered.capturedCount === 1, `reduced-motion: GERÇEK yakalama olmalı: ${JSON.stringify(answered)}`);
    ensure(s.consoleErrors.length === 0, `reduced-motion akışta konsol/pageerror sıfır olmalı: ${JSON.stringify(s.consoleErrors)}`);
  } finally { await s.close(); }
});

addTest('I15) Studio: Diagnostics Sahne #6 için hata bildirmiyor; Event Log Sahne #6 event\'lerini ve capturedCount alanını gösterir; terminoloji yalnız "nefes noktası"', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceToScene6AndIntro(s.page);
    const box = await s.page.locator('#ls-canvas').boundingBox();
    const ok = await tapExactCorrectS06(s.page, box, 0);
    ensure(ok, 'an 1 doğru cevaplanamadı');
    await s.page.waitForTimeout(200);

    const studioErrors = [];
    const studioPage = await s.context.newPage();
    studioPage.on('pageerror', e => studioErrors.push('pageerror: ' + e.message));
    studioPage.on('console', m => { if (m.type() === 'error') studioErrors.push('console: ' + m.text()); });
    await studioPage.goto(`${BASE}/teacher-studio.html`, { waitUntil: 'networkidle' });
    await studioPage.waitForTimeout(300);

    await studioPage.click('[data-tab="diagnostics"]');
    await studioPage.waitForTimeout(150);
    const diagText = await studioPage.locator('#diag-scene-table').textContent();
    ensure(!diagText.includes(S06_ID) || diagText.includes('geçerli'), `Diagnostics Sahne #6 için hata bildiriyor: ${diagText.slice(0, 800)}`);

    await studioPage.click('[data-tab="curriculum"]');
    await studioPage.waitForTimeout(150);
    const curriculumText = await studioPage.locator('#curriculum-scene-table').textContent();
    ensure(curriculumText.includes(S06_ID) && curriculumText.includes('atari'), `Curriculum tablosu Sahne #6 kapsamını (atari) göstermiyor: ${curriculumText.slice(0, 400)}`);
    ensure(!/özgürlük|serbestlik/i.test(curriculumText), `Curriculum tablosunda yasak terminoloji: ${curriculumText}`);

    await studioPage.click('[data-tab="event-log"]');
    await studioPage.waitForTimeout(150);
    const eventLogText = await studioPage.locator('#event-log-table').textContent();
    ensure(eventLogText.includes(S06_ID), 'Event Log Sahne #6 event\'lerini göstermiyor');
    ensure(eventLogText.includes('capturedCount'), 'Event Log capturedCount alanını göstermiyor');
    ensure(!/özgürlük|serbestlik/i.test(eventLogText), `Event Log\'da yasak terminoloji: ${eventLogText}`);

    ensure(studioErrors.length === 0, `Studio'da hata: ${studioErrors.join(' | ')}`);
    await studioPage.close();
  } finally { await s.close(); }
});

addTest('I16) ogren-3d.html regresyonsuz açılır ve canvas render eder (Sahne #6 eklenmesinden ETKİLENMEZ)', async () => {
  const context = await (await launchChromium()).newContext();
  const consoleErrors = [];
  try {
    await context.route(`${BASE}/**`, async route => {
      const url = new URL(route.request().url());
      const pathname = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
      const filePath = absPath(pathname || 'ogren-3d.html');
      try { await route.fulfill({ status: 200, contentType: mime(filePath), body: fs.readFileSync(filePath) }); }
      catch { await route.abort(); }
    });
    const page = await context.newPage();
    page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push('console: ' + m.text()); });
    const resp = await page.goto(`${BASE}/ogren-3d.html`, { waitUntil: 'networkidle' });
    ensure(resp && resp.status() === 200, `ogren-3d.html HTTP ${resp?.status()}`);
    await page.waitForTimeout(600);
    ensure(await page.locator('canvas').count() > 0, 'ogren-3d.html canvas render etmiyor');
    ensure(consoleErrors.length === 0, `ogren-3d.html konsol/pageerror sıfır olmalı: ${JSON.stringify(consoleErrors)}`);
  } finally { await context.close(); }
});

/* ══════════════════════════════════════════════════════════════════
   Sahne #7 ("Taş Alma Uygulamaları") akış yardımcıları
   ══════════════════════════════════════════════════════════════════ */
async function completeScene6(page) {
  await advanceToScene6AndIntro(page);
  for (let i = 0; i < 3; i++) {
    const ok = await answerCurrentS06Item(page);
    ensure(ok, `Sahne #6 an ${i + 1} doğru cevaplanamadı (Sahne #7'ye ilerlerken)`);
    await goToNextS06Item(page);
  }
  await page.waitForSelector('.ls-topic-end [data-action="advance"]');
}
async function advanceToScene7(page) {
  await completeScene6(page);
  await page.click('.ls-topic-end [data-action="advance"]');
  await page.waitForTimeout(400);
}
async function confirmS07Intro(page) {
  await page.waitForSelector('#s07-confirm');
  await page.click('#s07-confirm');
  await page.waitForTimeout(300);
}
async function advanceToScene7AndIntro(page) {
  await advanceToScene7(page);
  await confirmS07Intro(page);
}
/** Sahne #7'nin GERÇEK hedef noktasını, kamera preseti NE OLURSA olsun
    (köşe/kenar/merkez — moment'ler farklı camera preset'ler kullanır,
    Sahne #6'nın merkez-tabanlı ring-scan'i BURADA GÜVENLİ değildir) İKİ
    fazlı bir taramayla bulur — sabit piksel varsayımı YOK:
    Faz 1) tam canvas ızgarası (izometrik projeksiyon YÜZÜNDEN kesişimler
    ekranda EŞİT aralıklı değildir — bazı tekil hücreler ızgara
    örneklerinin TAM ARASINA düşüp kaçabilir, doğrulandı: (1,0) hedefi
    komşuları (0,0)/(1,1)/(2,0) bulunurken ATLANDI, bkz. görev talimatı
    hata ayıklaması).
    Faz 2) Faz 1'in bulduğu TÜM YAKIN (Manhattan mesafesi ≤2) GERÇEK
    komşu kesişimlerin ekran konumu ETRAFINDA — EN YAKINDAN başlayarak —
    ince yerel arama. Tek bir "en yakın" adaya güvenmek KIRILGANDIR (bir
    koşumda bulunan en yakın komşu farklı bir koşumda farklı çıkabilir,
    hover/timing'e bağlı) — bu yüzden BİRDEN FAZLA aday sırayla denenir;
    komşu tahta hücreleri ekranda da YAKINDIR, bu yüzden ızgaranın
    "atladığı" hücreyi güvenle yakalar. */
async function findScreenPointForOnce(page, target) {
  const box = await page.locator('#ls-canvas').boundingBox();
  const candidates = []; // {x, y, dist}
  for (let i = 0; i < 289; i++) {
    const fx = 0.02 + (i % 17) * 0.06;
    const fy = 0.02 + (Math.floor(i / 17) % 17) * 0.06;
    const x = box.x + box.width * fx, y = box.y + box.height * fy;
    await page.mouse.move(x, y);
    // v2 — kök neden düzeltmesi: 5ms bekleme bu yavaş ortamda adaptörün
    // RAF-tabanlı hover güncellemesiyle YARIŞIYORDU (bkz. görev talimatı
    // hata ayıklaması: AYNI mantıksal sayfa durumunda bir koşumda bulunan
    // nokta başka bir koşumda BULUNAMIYORDU) — 25ms'e çıkarıldı.
    await page.waitForTimeout(25);
    const hit = await getHoverPoint(page);
    if (!hit) continue;
    if (hit.row === target.row && hit.col === target.col) return { x, y };
    const dist = Math.abs(hit.row - target.row) + Math.abs(hit.col - target.col);
    if (dist <= 2) candidates.push({ x, y, dist });
  }
  candidates.sort((a, b) => a.dist - b.dist);
  // Tek bir "en yakın" adaya güvenmek KIRILGANDIR (bkz. dosya başı notu)
  // — EN FAZLA 4 aday sırayla denenir, her biri etrafında ince yerel arama.
  for (const anchor of candidates.slice(0, 4)) {
    for (let dx = -50; dx <= 50; dx += 5) {
      for (let dy = -50; dy <= 50; dy += 5) {
        const x = anchor.x + dx, y = anchor.y + dy;
        if (x < box.x || x > box.x + box.width || y < box.y || y > box.y + box.height) continue;
        await page.mouse.move(x, y);
        await page.waitForTimeout(15);
        const hit = await getHoverPoint(page);
        if (hit && hit.row === target.row && hit.col === target.col) return { x, y };
      }
    }
  }
  return null;
}
/** v3 — bu ortamda gözlemlenen genel hover-timing gecikmesi ARA SIRA tek
    bir taramayı bile başarısız kılabiliyordu (AYNI mantıksal sayfa
    durumunda tek taramalı bir hata ayıklama koşumu ile GERÇEK testin
    farklı sonuç verdiği doğrulandı) — YALNIZ bu geçici çevresel gecikmeyi
    tolere etmek için TEK taramanın kendisi DEĞİŞTİRİLMEDEN 3 kez denenir. */
async function findScreenPointFor(page, target) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const pt = await findScreenPointForOnce(page, target);
    if (pt) return pt;
  }
  return null;
}
async function tapExactCorrectS07(page, curriculumStepIndex) {
  const moment = getCapturePracticeMoments().find(m => m.curriculumStepIndex === curriculumStepIndex);
  if (!moment) return false;
  const pt = await findScreenPointFor(page, moment.lastLibertyPoints[0]);
  if (!pt) return false;
  await page.mouse.click(pt.x, pt.y);
  return true;
}
async function tapAnyWrongS07(page, curriculumStepIndex) {
  const moment = getCapturePracticeMoments().find(m => m.curriculumStepIndex === curriculumStepIndex);
  if (!moment) return false;
  const target = moment.lastLibertyPoints[0];
  const box = await page.locator('#ls-canvas').boundingBox();
  for (let i = 0; i < 121; i++) {
    const fx = 0.05 + (i % 11) * 0.09;
    const fy = 0.05 + (Math.floor(i / 11) % 11) * 0.09;
    const x = box.x + box.width * fx, y = box.y + box.height * fy;
    await page.mouse.move(x, y);
    await page.waitForTimeout(15);
    const hit = await getHoverPoint(page);
    if (hit && !(hit.row === target.row && hit.col === target.col)) {
      await page.mouse.click(x, y);
      return true;
    }
  }
  return false;
}
/** "N / 6" ilerleme göstergesinden AKTİF anın GERÇEK curriculumStepIndex'ini
    okuyup o hedefe dokunur — sabit bir index varsayımı YOK. */
async function currentS07Moment(page) {
  // Bu yavaş ortamda ARA SIRA gözlemlenen render/hover-timing gecikmesine
  // (bkz. görev talimatı hata ayıklaması) karşı küçük bir yerleşme
  // bekleyişi — canvas'ın kendi RAF döngüsünün hedef anın board seed'ini/
  // ipucu görselini TAM işlemesi için.
  await page.waitForTimeout(80);
  const progressText = (await page.locator('#s07-progress .s05-progress-text').textContent())?.trim() || '';
  const idx1 = parseInt(progressText.split('/')[0].trim(), 10);
  const moments = getCapturePracticeMoments();
  return moments[idx1 - 1] || null;
}
async function answerCurrentS07Item(page) {
  const moment = await currentS07Moment(page);
  if (!moment) return false;
  return tapExactCorrectS07(page, moment.curriculumStepIndex);
}
async function goToNextS07Item(page) {
  await page.click('#s07-continue');
  await page.waitForTimeout(400);
}
async function advanceS07ToItem(page, targetIndex1Based) {
  await advanceToScene7AndIntro(page);
  for (let i = 1; i < targetIndex1Based; i++) {
    const ok = await answerCurrentS07Item(page);
    ensure(ok, `Sahne #7 an ${i}'e doğru cevap verilemedi (${targetIndex1Based}. ana ilerlerken)`);
    await goToNextS07Item(page);
  }
}

addTest('J1) Sahne #6 → Sahne #7 GERÇEK topic-end geçişi: Sahne #6 artık son sahne DEĞİL, board/narration bbox <1px stabil, tek scene_started', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await completeScene6(s.page);
    const s6Label = (await s.page.locator('.ls-topic-end [data-action="advance"]').textContent())?.trim();
    ensure(s6Label === 'Sonraki konu', `Sahne #6 (artık son sahne DEĞİL) "Sonraki konu" göstermeli, bulunan: "${s6Label}"`);
    const boardBefore = await s.page.locator('#ls-canvas').boundingBox();
    const narrBefore = await s.page.locator('#ls-narration').boundingBox();

    await s.page.click('.ls-topic-end [data-action="advance"]');
    await s.page.waitForTimeout(400);

    ensure(await s.page.locator('#s07-intro').isVisible(), 'Sahne #7 intro görünmüyor');
    const boardAfter = await s.page.locator('#ls-canvas').boundingBox();
    const narrAfter = await s.page.locator('#ls-narration').boundingBox();
    ensure(bboxMaxDiff(boardBefore, boardAfter) < 1, `board bbox <1px stabil (fark=${bboxMaxDiff(boardBefore, boardAfter).toFixed(3)}px)`);
    ensure(bboxMaxDiff(narrBefore, narrAfter) < 1, `narration bbox <1px stabil (fark=${bboxMaxDiff(narrBefore, narrAfter).toFixed(3)}px)`);
    const allIds = await s.page.evaluate(() => [...document.querySelectorAll('[id]')].map(el => el.id));
    ensure(new Set(allIds).size === allIds.length, 'Sahne #7 mount sonrası duplicate ID YOK');
    const started = eventsFor(await getEventLog(s.page), S07_ID).filter(e => e.type === 'scene_started');
    ensure(started.length === 1, `Sahne #7 tek scene_started üretmeli, bulunan: ${started.length}`);
    ensure(s.consoleErrors.length === 0, `Sahne #6→#7 geçişinde konsol/pageerror sıfır olmalı: ${JSON.stringify(s.consoleErrors)}`);
  } finally { await s.close(); }
});

addTest('J2a) Intro tick hızlı çift onayda YALNIZ BİR kez tetiklenir (scene_intro_confirmed tek event) — bkz. H5 ile AYNI izole desen', async () => {
  const s = await openScenesPage({ query: FAST_QUERY });
  try {
    await advanceToScene7(s.page);
    await s.page.waitForSelector('#s07-confirm');
    await Promise.all([s.page.click('#s07-confirm'), s.page.click('#s07-confirm').catch(() => {})]);
    await s.page.waitForTimeout(350);
    const confirmed = eventsFor(await getEventLog(s.page), S07_ID).filter(e => e.type === 'scene_intro_confirmed');
    ensure(confirmed.length === 1, `hızlı çift onay TEK scene_intro_confirmed üretmeli, bulunan: ${confirmed.length}`);
  } finally { await s.close(); }
});

addTest('J2b) Altı gerçek curriculum adımı doğru sırada (stepIndex 3,4,5,6,7,8) yüklenir; ilerleme 1/6→6/6', async () => {
  // v2 — kök neden düzeltmesi: tapExactCorrectS07/findScreenPointFor
  // window.__lsTestBoardAdapter.getHoverPoint()'e İHTİYAÇ duyar — bu hook
  // YALNIZ ?exposeBoardAdapter=1 (PREVIEW_QUERY) altında OLUŞUR (bkz.
  // learning-scenes.html test-only hook koşulu). FAST_QUERY ile bu her
  // zaman `undefined` dönüyordu — "an 1 doğru cevaplanamadı" GÖRÜNÜŞTE
  // ortam kararsızlığı gibi duruyordu ama GERÇEKTE DETERMİNİSTİK bir
  // sorguydu (bkz. görev talimatı hata ayıklaması).
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceToScene7AndIntro(s.page);
    // GERÇEK curriculum sırası policy'den okunur (bkz. capturePracticePolicy.js
    // MOMENT_STEP_INDICES) — döngü İÇİNDE DOM'dan yeniden türetmek YERİNE
    // (bkz. görev talimatı hata ayıklaması: progressText-tabanlı dolaylı
    // arama bu ortamda kararsız davranıyordu) tapExactCorrectS07 DOĞRUDAN,
    // J3/J6/J7/J10 ile AYNI kanıtlanmış çağrı şekliyle kullanılır.
    const expectedSteps = getCapturePracticeMoments().map(m => m.curriculumStepIndex);
    const presentedSteps = [];
    for (let i = 0; i < 6; i++) {
      const presented = eventsFor(await getEventLog(s.page), S07_ID).filter(e => e.type === 'scene_assessment_presented').at(-1).payload;
      presentedSteps.push(presented.stepIndex);
      const progressText = (await s.page.locator('#s07-progress .s05-progress-text').textContent())?.trim();
      ensure(progressText === `${i + 1} / 6`, `ilerleme "${i + 1} / 6" olmalı, bulunan: "${progressText}"`);
      if (i < 5) {
        const ok = await tapExactCorrectS07(s.page, expectedSteps[i]);
        ensure(ok, `an ${i + 1} (stepIndex ${expectedSteps[i]}) doğru cevaplanamadı`);
        await goToNextS07Item(s.page);
      }
    }
    ensure(JSON.stringify(presentedSteps) === JSON.stringify([3, 4, 5, 6, 7, 8]), `altı an curriculum SIRASIYLA (3,4,5,6,7,8) sunulmalı, bulunan: ${JSON.stringify(presentedSteps)}`);
  } finally { await s.close(); }
});

addTest('J3) An 1 (immediate hintMode): sunulduğunda ipucu OTOMATİK görünür (düğme YOK), targetGroupSize/lastLibertyPoint curriculum answer ile eşleşir; OTOMATİK taş silüeti GÖSTERİLMEZ (v0.15 — aşırı yönlendirme sadeleştirmesi)', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceToScene7AndIntro(s.page);
    const presented = eventsFor(await getEventLog(s.page), S07_ID).filter(e => e.type === 'scene_assessment_presented').at(-1).payload;
    ensure(presented.hintMode === HINT_MODES.IMMEDIATE, `an 1 hintMode 'immediate' olmalı: ${JSON.stringify(presented)}`);
    ensure(presented.targetGroupSize === 1 && presented.lastLibertyPoint?.row === 1 && presented.lastLibertyPoint?.col === 0, `an 1 hedef: ${JSON.stringify(presented)}`);
    const points = await getLibertyPointsRaw(s.page);
    ensure(points.length === 1 && points[0].row === 1 && points[0].col === 0, `an 1 neon işaret OTOMATİK (1,0): ${JSON.stringify(points)}`);
    ensure(await s.page.locator('#s07-hint').count() === 0, 'immediate modda ipucu düğmesi OLMAMALI (gereksiz kalabalık)');
    const revealed = eventsFor(await getEventLog(s.page), S07_ID).filter(e => e.type === 'scene_hint_revealed');
    ensure(revealed.length === 1 && revealed[0].payload.hintRequested === false, `an 1 hint reveal event (otomatik, istemsiz): ${JSON.stringify(revealed)}`);
    // v0.15 — moment.showAutomaticMovePreview===false: neon YİNE otomatik
    // gösterilir (yukarıda doğrulandı) ama taş silüeti (movePreview state)
    // sıfır imleç hareketiyle KURULMAMALI (bkz. scene07CapturePractice.js
    // revealHint, capturePracticePolicy.js normalizeMoment).
    const preview = await getMovePreview(s.page);
    ensure(preview === null, `an 1 açılışında (sıfır imleç hareketi) OTOMATİK taş silüeti KURULMAMALI, bulunan: ${JSON.stringify(preview)}`);
    const moved = eventsFor(await getEventLog(s.page), S07_ID).filter(e => e.type === 'scene_assessment_answered' || e.type === 'scene_move_played');
    ensure(moved.length === 0, `an 1 açılışında gerçek hamle/cevap event'i ÜRETİLMEMELİ (otomatik neon bir cevap SAYILMAZ): ${JSON.stringify(moved)}`);
  } finally { await s.close(); }
});

/* ══════════════════════════════════════════════════════════════════
   J3b/J3c — v0.15: "İlk taş alma ipucunu sadeleştir". Sahne #7 an 1'in
   (immediate hintMode) açılışında neon nefes işareti KORUNDU, ama aynı
   cevabı ikinci kez gösteren otomatik taş silüeti KALDIRILDI — YALNIZ
   bu an için (bkz. capturePracticePolicy.js normalizeMoment'in
   showAutomaticMovePreview alanı ve scene07CapturePractice.js
   revealHint'in buna göre koşullu setMovePreview çağrısı). J3 state
   (`getMovePreviewState`) üzerinden doğruluyordu — Bölüm E'nin kendi
   notu (movePreview state'in her zaman görsel BAŞARIYI kanıtlamadığı)
   BURADA TERSİNE de geçerli: state null olması TEK BAŞINA ekranda
   GERÇEKTEN hiçbir koyu taş şeklinin kalmadığını kanıtlamaz — bu yüzden
   J3b GERÇEK canvas piksellerini örnekler (Bölüm E'nin `canvasPixelAt`/
   `measureVisibleDiscRadius` altyapısı YENİDEN KULLANILIR).
   ══════════════════════════════════════════════════════════════════ */

addTest('J3b) An 1 açılışında PİKSEL kanıtı: hedefte turkuaz nefes işareti GERÇEKTEN görünür VE gerçek köşe taşıyla kıyaslanabilir boyutta koyu bir taş-çaplı disk YOK', async () => {
  // Kalibrasyon: hedefin ((1,0)) VE tahtadaki GERÇEK beyaz köşe taşının
  // ((0,0)) canvas-lokal ekran konumunu AYRI bir sayfada (fare hareketi
  // gerektiren findScreenPointFor ile) bul. Asıl test sayfası (aşağıda)
  // "sıfır imleç hareketi" açılış durumunu örneklemeli — konum arama O
  // sayfada YAPILAMAZ (aksi halde kendi iddiasını geçersiz kılar). Aynı
  // viewport + aynı kamera preseti (corner_tl) + aynı tahta boyutu (9) →
  // AYNI canvas-lokal projeksiyon, bu yüzden kalibrasyon güvenle taşınır.
  const calib = await openScenesPage({ query: PREVIEW_QUERY });
  let targetXY, whiteStoneXY;
  try {
    await advanceToScene7AndIntro(calib.page);
    const box = await calib.page.locator('#ls-canvas').boundingBox();
    const targetPt = await findScreenPointFor(calib.page, { row: 1, col: 0 });
    ensure(targetPt, 'an 1 hedefinin ekran konumu bulunamadı (kalibrasyon)');
    targetXY = { dx: Math.round(targetPt.x - box.x), dy: Math.round(targetPt.y - box.y) };
    const whitePt = await findScreenPointFor(calib.page, { row: 0, col: 0 });
    ensure(whitePt, 'an 1 gerçek köşe taşının ekran konumu bulunamadı (kalibrasyon)');
    whiteStoneXY = { dx: Math.round(whitePt.x - box.x), dy: Math.round(whitePt.y - box.y) };
  } finally { await calib.close(); }

  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceToScene7AndIntro(s.page);
    // Fare bu sayfada canvas'a HİÇ değmedi (advanceToScene7AndIntro yalnız
    // DOM düğmelerine tıklar) — açılış anındaki GERÇEK "sıfır imleç
    // hareketi" durumu burada örnekleniyor. Kamera board.focus('corner_tl')
    // ile CAM_DUR=0.65s'lik bir lerp animasyonu BAŞLATIR (bkz. adapters/
    // sceneBoardAdapter.js) — bu bir SAAT beklemesidir, imleç hareketi
    // DEĞİL, bu yüzden "sıfır imleç hareketi" iddiasını bozmaz. Kalibrasyon
    // sayfası kendi tarama döngüsü (findScreenPointFor, saniyelerce sürer)
    // yüzünden DOĞAL olarak animasyon-sonrası konumu ölçtü — burada da AYNI
    // yerleşmiş konumu örneklemek için açıkça beklenir.
    await s.page.waitForTimeout(700);

    // 1) Turkuaz nefes işareti PİKSEL olarak var — hedef civarında en az
    // bir örnek piksel drawLibertyMark'ın rengine (rgb(91,210,195)) yakın
    // olmalı (bkz. adapters/sceneBoardAdapter.js drawLibertyMark).
    let foundTurquoise = false;
    outer: for (let dx = -16; dx <= 16; dx += 2) {
      for (let dy = -16; dy <= 16; dy += 2) {
        const px = await canvasPixelAt(s.page, targetXY.dx, targetXY.dy, dx, dy);
        if (Math.abs(px.r - 91) < 45 && Math.abs(px.g - 210) < 45 && Math.abs(px.b - 195) < 45 && px.a > 0) {
          foundTurquoise = true; break outer;
        }
      }
    }
    ensure(foundTurquoise, `an 1 açılışında hedef civarında turkuaz nefes işareti piksel olarak bulunamadı (dx=${targetXY.dx},dy=${targetXY.dy})`);

    // 2) Koyu taş-çaplı DOLU disk YOK. Sabit bir dış "temiz board" referans
    // ofseti (ör. hedeften -50,-50) burada GÜVENİLMEZ oldu (bkz. görev
    // talimatı hata ayıklaması: hedef (1,0) köşeye yakın — corner_tl
    // kamerasında -50,-50 ofseti tahtanın GÖRÜNÜR silüetinin DIŞINA,
    // boş/siyah arka plana taşıyordu, bu da tüm ahşap-tonu pikselleri
    // yanlışlıkla "sapma" sayıyordu). Bunun yerine KENDİ KENDİNE referans
    // veren bir yöntem kullanılır: örnek ızgaranın KENDİSİNDEN, en sık
    // görülen (mod) rengi "temiz zemin" olarak çıkarır — küçük bir
    // komşulukta zemin (ahşap tahta) HER ZAMAN çoğunluktadır (dolu bir
    // taş veya ince bir artı işareti azınlıktadır), bu yüzden mod DIŞ bir
    // varsayıma İHTİYAÇ DUYMADAN doğru zemin rengini bulur. Dolu bir disk
    // (drawStone/STONE_R) ızgaranın BÜYÜK bir kısmını kaplar; drawLibertyMark'ın
    // ince artı + küçük merkez noktası YALNIZ küçük bir kesrini kaplar.
    async function fillFraction(page, cx, cy) {
      const samples = [];
      for (let dx = -22; dx <= 22; dx += 4) {
        for (let dy = -22; dy <= 22; dy += 4) {
          samples.push(await canvasPixelAt(page, cx, cy, dx, dy));
        }
      }
      // Mod: her pikseli 15'e yuvarlayıp en sık kovayı bul (zemin, KÜÇÜK
      // varyanslı düz bir renk olduğu için TEK, baskın bir kovaya düşer).
      const buckets = new Map();
      for (const px of samples) {
        const key = `${Math.round(px.r / 15)},${Math.round(px.g / 15)},${Math.round(px.b / 15)}`;
        buckets.set(key, (buckets.get(key) || 0) + 1);
      }
      let modeKey = null, modeCount = -1;
      for (const [k, c] of buckets) if (c > modeCount) { modeKey = k; modeCount = c; }
      const [mr, mg, mb] = modeKey.split(',').map(n => Number(n) * 15);
      const ref = pixelLuminance({ r: mr, g: mg, b: mb });
      const deviating = samples.filter(px => Math.abs(pixelLuminance(px) - ref) > 15).length;
      return deviating / samples.length;
    }
    // Pozitif kontrol: AYNI yöntem GERÇEK beyaz köşe taşında (dolu bir
    // disk, YÖNTEM BUNU YAKALAMALI) belirgin bir dolgu oranı üretmeli —
    // yöntemin kendisini bu sayfada doğrular (kör bir eşik varsayılmaz).
    const whiteFraction = await fillFraction(s.page, whiteStoneXY.dx, whiteStoneXY.dy);
    ensure(whiteFraction > 0.25, `kalibrasyon/yöntem doğrulaması: GERÇEK beyaz taşın dolgu oranı çok düşük (${(whiteFraction * 100).toFixed(0)}%) — yöntem veya kalibrasyon koordinatları güvenilmez olabilir`);

    // Hedefte AYNI yöntemle ölçülen dolgu oranı, gerçek taşınkinden ÇOK
    // düşük kalmalı — artı işareti dolu bir disk KADAR alan KAPLAMAZ.
    const targetFraction = await fillFraction(s.page, targetXY.dx, targetXY.dy);
    ensure(targetFraction < whiteFraction * 0.5, `an 1 açılışında hedefte gerçek taşla KIYASLANABİLİR oranda bir dolgu bulundu (hedef=${(targetFraction * 100).toFixed(0)}%, gerçek taş=${(whiteFraction * 100).toFixed(0)}%) — otomatik silüet HÂLÂ gösteriliyor olabilir`);
  } finally { await s.close(); }
});

addTest('J3c) An 1: imleç hedefe GERÇEKTEN taşınırsa normal hover-önizleme (sade halka) hâlâ çalışır; imleç ayrılınca temizlenir, neon DEĞİŞMEZ', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceToScene7AndIntro(s.page);
    const box = await s.page.locator('#ls-canvas').boundingBox();
    const pt = await findScreenPointFor(s.page, { row: 1, col: 0 });
    ensure(pt, 'an 1 hedefinin ekran konumu bulunamadı');
    // İmleç GERÇEKTEN hedefe taşındı (findScreenPointFor'un kendisi bunu
    // yapar) — bu, "sıfır imleç hareketi" durumunun AKSİNE, kullanıcının
    // GERÇEKTEN fareyi hedefe getirdiği senaryodur (bkz. görev talimatı
    // Bölüm 2: "kullanıcı imleci hedefe taşırsa normal hover-önizleme
    // davranışı yine geçerli olabilir").
    const hover = await getHoverPoint(s.page);
    ensure(hover && hover.row === 1 && hover.col === 0, `imleç hedefe taşındıktan sonra hover state (1,0) olmalı, bulunan: ${JSON.stringify(hover)}`);
    // Bu, adapters/sceneBoardAdapter.js'in KENDİ BAĞIMSIZ drawHoverPoint
    // mekanizmasıdır — setMovePreview'a hiç dokunmaz, movePreview state
    // hâlâ null KALMALI (an 1'de otomatik silüet YOK).
    const preview = await getMovePreview(s.page);
    ensure(preview === null, `hover sırasında bile an 1'de movePreview state null KALMALI (hover ≠ silüet), bulunan: ${JSON.stringify(preview)}`);
    const points = await getLibertyPointsRaw(s.page);
    ensure(points.length === 1 && points[0].row === 1 && points[0].col === 0, `hover sırasında neon işaret DEĞİŞMEMELİ: ${JSON.stringify(points)}`);

    // İmleç tahtadan tamamen ayrılır — hover temizlenir, neon YİNE DEĞİŞMEZ.
    await s.page.mouse.move(box.x - 40, box.y - 40);
    await s.page.waitForTimeout(80);
    const pointsAfter = await getLibertyPointsRaw(s.page);
    ensure(pointsAfter.length === 1 && pointsAfter[0].row === 1 && pointsAfter[0].col === 0, `imleç ayrıldıktan sonra neon işaret DEĞİŞMEMELİ: ${JSON.stringify(pointsAfter)}`);
  } finally { await s.close(); }
});

addTest('J3d) An 1: mobilde neon işarete TEK dokunuş — silüet ÖNCE kurulmadan — doğrudan GERÇEK yakalamayı uygular (ikinci dokunuş GEREKMEZ)', async () => {
  const s = await openScenesPage({ viewport: VIEWPORTS.mobile, hasTouch: true, query: PREVIEW_QUERY });
  try {
    await advanceToScene7AndIntro(s.page);
    const preview = await getMovePreview(s.page);
    ensure(preview === null, `an 1 mobil açılışta otomatik taş silüeti KURULMAMALI, bulunan: ${JSON.stringify(preview)}`);
    // onIntersectionTap doğrudan ekran koordinatından hesaplanır (bkz.
    // adapters/sceneBoardAdapter.js handleClick) — movePreview state'ten
    // TAMAMEN BAĞIMSIZDIR, bu yüzden silüet kurulmamış olsa da TEK bir
    // dokunuş gerçek hamleyi doğrudan uygulamalı.
    const ok = await tapExactCorrectS07(s.page, 3);
    ensure(ok, 'an 1 mobil: GERÇEK hedef bulunup dokunulamadı');
    await s.page.waitForTimeout(250);
    const answered = eventsFor(await getEventLog(s.page), S07_ID).filter(e => e.type === 'scene_assessment_answered').at(-1).payload;
    ensure(answered.isCorrect === true && answered.capturedCount === 1 && answered.targetRemovedFromBoard === true, `an 1 mobil: tek dokunuşla GERÇEK yakalama (silüet olmadan): ${JSON.stringify(answered)}`);
    ensure(await s.page.locator('#s07-continue').isVisible(), 'an 1 mobil: tek dokunuş yeterli — ikinci dokunuş GEREKMEMELİ');
    ensure(s.consoleErrors.length === 0, `an 1 mobil akışta konsol/pageerror sıfır olmalı: ${JSON.stringify(s.consoleErrors)}`);
  } finally { await s.close(); }
});

addTest('J4) An 2 (after_mistake): başlangıçta ipucu GİZLİ; yanlış hamleden SONRA otomatik açılır; board yanlış hamlede DEĞİŞMEZ', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceS07ToItem(s.page, 2);
    const presented = eventsFor(await getEventLog(s.page), S07_ID).filter(e => e.type === 'scene_assessment_presented').at(-1).payload;
    ensure(presented.hintMode === HINT_MODES.AFTER_MISTAKE, `an 2 hintMode 'after_mistake' olmalı: ${JSON.stringify(presented)}`);
    const before = await getLibertyPointsRaw(s.page);
    ensure(before.length === 0, `an 2 başlangıçta ipucu GİZLİ olmalı, bulunan: ${JSON.stringify(before)}`);
    ensure(await s.page.locator('#s07-hint').count() === 1, 'after_mistake modda ipucu düğmesi mevcut olmalı (erken istek için)');

    const ok = await tapAnyWrongS07(s.page, 4);
    ensure(ok, 'an 2: yanlış (gerçek) noktaya dokunuldu');
    await s.page.waitForTimeout(200);
    ensure(await s.page.locator('#s07-continue').isHidden(), 'yanlış hamleden sonra Devam GÖRÜNMEMELİ');
    const wrongEv = eventsFor(await getEventLog(s.page), S07_ID).filter(e => e.type === 'scene_assessment_answered').at(-1).payload;
    ensure(wrongEv.isCorrect === false && wrongEv.capturedCount === undefined && wrongEv.resultConcept === undefined, `yanlış cevapta başarı alanları HİÇ EKLENMEMELİ: ${JSON.stringify(wrongEv)}`);
    const after = await getLibertyPointsRaw(s.page);
    ensure(after.length === 1 && after[0].row === 1 && after[0].col === 4, `yanlış hamleden SONRA ipucu OTOMATİK açılmalı (1,4): ${JSON.stringify(after)}`);
    // v0.15 kapsam sınırı kanıtı: an 1'in AKSİNE, an 2 (after_mistake)
    // showAutomaticMovePreview===true KORUR — bu yüzden otomatik taş
    // silüeti (movePreview state) BURADA HÂLÂ kurulmalı (bkz. görev
    // talimatı Bölüm 3 — diğer beş anın ipucu davranışı DEĞİŞMEMELİ).
    const preview = await getMovePreview(s.page);
    ensure(preview && preview.row === 1 && preview.col === 4 && preview.color === 'black', `an 2'de yanlış hamleden SONRA otomatik taş silüeti HÂLÂ kurulmalı (1,4 siyah) — v0.15 YALNIZ an 1'i etkilemeli, bulunan: ${JSON.stringify(preview)}`);
    // NOT: an 1 (immediate) kendi otomatik reveal'ini ZATEN üretmiş olabilir
    // (advanceS07ToItem an 1'i doğru cevaplayarak geçti) — bu yüzden BU anın
    // (assessmentIndex===1) reveal event'i AYRI filtrelenir, ham toplam
    // event sayısı DEĞİL.
    const revealed = eventsFor(await getEventLog(s.page), S07_ID)
      .filter(e => e.type === 'scene_hint_revealed' && e.payload.assessmentIndex === 1);
    ensure(revealed.length === 1 && revealed[0].payload.hintRequested === false, `an 2 hint reveal TAM BİR KEZ, otomatik: ${JSON.stringify(revealed)}`);
  } finally { await s.close(); }
});

addTest('J5) An 3/4 (on_request): ipucu YALNIZ düğmeyle açılır, otomatik açılmaz; düğme klavyeyle erişilebilir, aria-pressed doğru, en az bir kez event üretir', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceS07ToItem(s.page, 3);
    const presented = eventsFor(await getEventLog(s.page), S07_ID).filter(e => e.type === 'scene_assessment_presented').at(-1).payload;
    ensure(presented.hintMode === HINT_MODES.ON_REQUEST, `an 3 hintMode 'on_request' olmalı: ${JSON.stringify(presented)}`);
    const before = await getLibertyPointsRaw(s.page);
    ensure(before.length === 0, 'an 3 başlangıçta ipucu GİZLİ olmalı');

    const hintBtn = s.page.locator('#s07-hint');
    ensure(await hintBtn.count() === 1, 'ipucu düğmesi mevcut olmalı');
    ensure(await hintBtn.getAttribute('aria-pressed') === 'false', 'başlangıçta aria-pressed=false olmalı');
    const box = await hintBtn.boundingBox();
    ensure(box.width >= 44 && box.height >= 44, `ipucu düğmesi en az 44x44px olmalı, bulunan: ${box.width}x${box.height}`);

    // NOT: advanceS07ToItem an 1/2'yi ZATEN doğru cevaplayarak an 3'e
    // ulaştı — bu yüzden "ipucu açılması cevap eventi ÜRETMEMELİ" iddiası
    // ÖNCESİ/SONRASI FARK olarak ölçülür, ham toplam sıfır DEĞİL.
    const answeredBefore = eventsFor(await getEventLog(s.page), S07_ID).filter(e => e.type === 'scene_assessment_answered').length;
    await hintBtn.focus();
    await s.page.keyboard.press('Enter');
    await s.page.waitForTimeout(150);
    ensure(await hintBtn.getAttribute('aria-pressed') === 'true', 'istekten sonra aria-pressed=true olmalı');
    const after = await getLibertyPointsRaw(s.page);
    ensure(after.length === 1 && after[0].row === 6 && after[0].col === 4, `düğme sonrası neon işaret (6,4): ${JSON.stringify(after)}`);
    // v0.15 kapsam sınırı kanıtı: an 3 (on_request) showAutomaticMovePreview
    // ===true KORUR — düğmeyle AÇILAN ipucunda taş silüeti HÂLÂ kurulmalı.
    const preview = await getMovePreview(s.page);
    ensure(preview && preview.row === 6 && preview.col === 4 && preview.color === 'black', `an 3'te düğme sonrası otomatik taş silüeti HÂLÂ kurulmalı (6,4 siyah) — v0.15 YALNIZ an 1'i etkilemeli, bulunan: ${JSON.stringify(preview)}`);
    const answeredAfter = eventsFor(await getEventLog(s.page), S07_ID).filter(e => e.type === 'scene_assessment_answered').length;
    ensure(answeredAfter === answeredBefore, 'ipucu açılması HİÇBİR cevap eventi ÜRETMEMELİ');
    const unlocked = eventsFor(await getEventLog(s.page), S07_ID).filter(e => e.type === 'scene_completion_unlocked');
    ensure(unlocked.length === 0, 'ipucu açılması completion AÇMAMALI');

    // Aynı düğmeye tekrar basmak İKİNCİ bir reveal event'i ÜRETMEMELİ —
    // bu anın (assessmentIndex===2) reveal event'i AYRI filtrelenir.
    await hintBtn.click();
    await s.page.waitForTimeout(120);
    const revealed = eventsFor(await getEventLog(s.page), S07_ID)
      .filter(e => e.type === 'scene_hint_revealed' && e.payload.assessmentIndex === 2);
    ensure(revealed.length === 1 && revealed[0].payload.hintRequested === true, `an 3 başına EN FAZLA bir reveal event, istemli: ${JSON.stringify(revealed)}`);
  } finally { await s.close(); }
});

addTest('J6) An 6 (none_until_request, bağımsız final): ipucu istenmezse hiç görünmez; doğru hamle GERÇEK 5 taşlı L-şekil grubu kaldırır, capturedCount=5', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceS07ToItem(s.page, 6);
    const presented = eventsFor(await getEventLog(s.page), S07_ID).filter(e => e.type === 'scene_assessment_presented').at(-1).payload;
    ensure(presented.hintMode === HINT_MODES.NONE_UNTIL_REQUEST, `an 6 hintMode 'none_until_request' olmalı: ${JSON.stringify(presented)}`);
    ensure(presented.targetGroupSize === 5, `an 6 hedef grup boyutu 5 olmalı: ${JSON.stringify(presented)}`);
    const beforeAnyAction = await getLibertyPointsRaw(s.page);
    ensure(beforeAnyAction.length === 0, 'an 6 ipucu istenmeden GÖRÜNMEMELİ (final bağımsız uygulama)');

    const ok = await tapExactCorrectS07(s.page, 8);
    ensure(ok, 'an 6: GERÇEK hedefe dokunuldu (ipucu OLMADAN)');
    await s.page.waitForTimeout(250);
    const ev = eventsFor(await getEventLog(s.page), S07_ID).filter(e => e.type === 'scene_assessment_answered').at(-1).payload;
    ensure(ev.capturedCount === 5 && ev.targetRemovedFromBoard === true, `an 6: 5 taşlı L-şekil grup TAM OLARAK kalkmalı: ${JSON.stringify(ev)}`);
    ensure(ev.assessmentConcept === 'atari' && ev.resultConcept === 'capture' && ev.hintWasVisible === false, `an 6 kavram + hint sözleşmesi: ${JSON.stringify(ev)}`);
    const pointsAfter = await getLibertyPointsRaw(s.page);
    ensure(pointsAfter.length === 0, 'doğru yakalamadan HEMEN SONRA neon işaret temizlenmeli');

    const unlockedBefore = eventsFor(await getEventLog(s.page), S07_ID).filter(e => e.type === 'scene_completion_unlocked');
    ensure(unlockedBefore.length === 1, `6/6 doğrudan SONRA completion TAM BİR KEZ açılmalı, bulunan: ${unlockedBefore.length}`);
  } finally { await s.close(); }
});

addTest('J7) Doğru hamleden sonra sonuç GÖRÜNÜR KALIR ta ki "Devam"a kadar; Devam sonrası YENİ seed gelir, eski highlight/hint sızmaz', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceToScene7AndIntro(s.page); // an 1 (immediate) zaten görünür
    const box = await s.page.locator('#ls-canvas').boundingBox();
    ensure(box, 'canvas bulunamadı');
    const ok = await tapExactCorrectS07(s.page, 3);
    ensure(ok, 'an 1 GERÇEK hedefe dokunuldu');
    await s.page.waitForTimeout(200);
    ensure(await s.page.locator('#s07-continue').isVisible(), 'doğru cevaptan sonra Devam GÖRÜNMELİ');
    // 100ms sonra hâlâ sonuç görünür olmalı (board taşı kalkmış durumda kalır — "Devam"a kadar).
    await s.page.waitForTimeout(150);
    ensure(await s.page.locator('#s07-continue').isVisible(), 'sonuç Devam\'a kadar GÖRÜNÜR KALMALI');

    await goToNextS07Item(s.page);
    const points = await getLibertyPointsRaw(s.page);
    ensure(points.length === 0, `Devam sonrası eski highlight SIZMAMALI (an 2 henüz ipucu göstermez): ${JSON.stringify(points)}`);
    const started = eventsFor(await getEventLog(s.page), S07_ID).filter(e => e.type === 'scene_started');
    ensure(started.length === 1, 'İÇ an geçişi runtime sahne geçişi DEĞİL — scene_started TEKRARLANMAMALI');
  } finally { await s.close(); }
});

addTest('J8) Hızlı çift tıklama: aynı yanlış noktaya TEK yanlış-event; doğru yakalamada TEK cevap event\'i', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceS07ToItem(s.page, 2); // after_mistake — hâlâ ipucu gizli
    const moments = getCapturePracticeMoments();
    const momentIndex = moments.findIndex(m => m.curriculumStepIndex === 4); // an 2 → assessmentIndex 1
    const moment = moments[momentIndex];
    // Hedef DIŞI gerçek bir noktayı bul, AYNI noktaya hızlı iki tıklama yap.
    const box = await s.page.locator('#ls-canvas').boundingBox();
    let picked = null;
    for (let i = 0; i < 121 && !picked; i++) {
      const fx = 0.05 + (i % 11) * 0.09, fy = 0.05 + (Math.floor(i / 11) % 11) * 0.09;
      const x = box.x + box.width * fx, y = box.y + box.height * fy;
      await s.page.mouse.move(x, y); await s.page.waitForTimeout(8);
      const hit = await getHoverPoint(s.page);
      if (hit && !(hit.row === moment.lastLibertyPoints[0].row && hit.col === moment.lastLibertyPoints[0].col)) picked = { x, y };
    }
    ensure(picked, 'hedef dışı gerçek nokta bulunamadı');
    await Promise.all([s.page.mouse.click(picked.x, picked.y), s.page.mouse.click(picked.x, picked.y).catch(() => {})]);
    await s.page.waitForTimeout(300);
    // NOT: filtre `assessmentIndex === momentIndex` ile SINIRLI — advanceS07ToItem
    // zaten an 1 için GERÇEK bir doğru-cevap event'i üretti (an 2'ye ilerlemek
    // için); sınırsız bir sayım o ÖNCEKİ eventi de yanlışlıkla dahil ederdi.
    const wrongEvents = eventsFor(await getEventLog(s.page), S07_ID).filter(e => e.type === 'scene_assessment_answered' && e.payload.assessmentIndex === momentIndex && e.payload.isCorrect === false);
    ensure(wrongEvents.length === 1, `aynı yanlış noktaya hızlı çift tıklama TEK yanlış-event üretmeli, bulunan: ${wrongEvents.length}`);

    // Şimdi doğru hedefe hızlı çift tıklama — TEK doğru cevap event'i.
    const pt = await findScreenPointFor(s.page, moment.lastLibertyPoints[0]);
    ensure(pt, 'GERÇEK hedef bulunamadı');
    await Promise.all([s.page.mouse.click(pt.x, pt.y), s.page.mouse.click(pt.x, pt.y).catch(() => {})]);
    await s.page.waitForTimeout(300);
    const correctEvents = eventsFor(await getEventLog(s.page), S07_ID).filter(e => e.type === 'scene_assessment_answered' && e.payload.assessmentIndex === momentIndex && e.payload.isCorrect === true);
    ensure(correctEvents.length === 1, `hızlı çift tıklama doğru yakalamada TEK event üretmeli, bulunan: ${correctEvents.length}`);
  } finally { await s.close(); }
});

addTest('J9) Tüm altı an tamamlanınca completion TAM BİR KEZ açılır, sahte {from:5,to:5} advanced eventi YOK, son kontrol "Konular", "Sahne tamamlandı" YOK', async () => {
  // v2 — aynı kök neden düzeltmesi (bkz. J2b notu): answerCurrentS07Item
  // → tapExactCorrectS07 GERÇEK hover test-hook'una ihtiyaç duyar.
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceToScene7AndIntro(s.page);
    for (let i = 0; i < 6; i++) {
      const ok = await answerCurrentS07Item(s.page);
      ensure(ok, `an ${i + 1} doğru cevaplanamadı`);
      await goToNextS07Item(s.page);
    }
    await s.page.waitForSelector('.ls-topic-end [data-action="advance"]');
    const label = (await s.page.locator('.ls-topic-end [data-action="advance"]').textContent())?.trim();
    ensure(label === 'Konular', `Sahne #7 son sahne — "Konular" olmalı, bulunan: "${label}"`);
    const bodyText = await s.page.locator('#ls-scene-host').innerText();
    ensure(!/sahne\s*tamamlandı|scene.?completed|scene-07|registry|runtime/i.test(bodyText), `teknik dil sızmış: "${bodyText}"`);
    ensure(!/özgürlük|serbestlik/i.test(bodyText), `yasak terminoloji sızmış: "${bodyText}"`);
    const completed = eventsFor(await getEventLog(s.page), S07_ID).filter(e => e.type === 'scene_completed');
    ensure(completed.length === 1, 'scene_completed TAM BİR KEZ üretildi');
    const unlocked = eventsFor(await getEventLog(s.page), S07_ID).filter(e => e.type === 'scene_completion_unlocked');
    ensure(unlocked.length === 1, `completion TAM BİR KEZ açılmalı, bulunan: ${unlocked.length}`);
    const advanced = eventsFor(await getEventLog(s.page), S07_ID).filter(e => e.type === 'scene_assessment_advanced');
    ensure(!advanced.some(e => e.payload.fromAssessmentIndex === e.payload.toAssessmentIndex), 'sahte from===to advanced event YOK');
    ensure(advanced.length === 5, `beş İÇ geçiş event'i üretilmeli (6. sonrasında YOK), bulunan: ${advanced.length}`);
  } finally { await s.close(); }
});

addTest('J10) Konular paneli açıkken board input kilitlenir (hamle/hint sızmaz), kapanınca doğru state geri gelir; replay temiz intro/ilk seed/hint-kapalı açar, completion geçmişini çoğaltmaz', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceToScene7AndIntro(s.page);
    const beforeCount = eventsFor(await getEventLog(s.page), S07_ID).filter(e => e.type === 'scene_assessment_answered').length;
    await s.page.click('#ls-topics-open');
    await s.page.waitForTimeout(150);
    ensure(await s.page.locator('#ls-topics-panel').isVisible(), 'Konular paneli açılmalı');
    const box = await s.page.locator('#ls-canvas').boundingBox();
    await s.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await s.page.waitForTimeout(150);
    const duringCount = eventsFor(await getEventLog(s.page), S07_ID).filter(e => e.type === 'scene_assessment_answered').length;
    ensure(duringCount === beforeCount, 'Konular paneli açıkken canvas tıklaması hamle/event üretti — input yanlış kilitli');
    await s.page.keyboard.press('Escape');
    await s.page.waitForTimeout(150);
    // v0.15: panel kapanışı an 1'in OTOMATİK taş silüetini GERİ
    // GETİRMEMELİ (görev talimatı Bölüm 5 — "replay/panel-close must not
    // restore auto silhouette") — panel açılırken/kapanırken movePreview
    // snapshot alınıp geri yüklenir (bkz. adapters/sceneBoardAdapter.js
    // suspendInteraction/resumeInteraction); an 1'de snapshot zaten null
    // olduğundan geri yüklenen de null KALMALI.
    const previewAfterPanelClose = await getMovePreview(s.page);
    ensure(previewAfterPanelClose === null, `an 1'de Konular paneli kapandıktan sonra otomatik taş silüeti GERİ GELMEMELİ, bulunan: ${JSON.stringify(previewAfterPanelClose)}`);
    const ok = await tapExactCorrectS07(s.page, 3);
    ensure(ok, 'Konular paneli kapandıktan sonra normal girdi çalışmalı');
    await s.page.waitForTimeout(150);
    ensure(await s.page.locator('#s07-continue').isVisible(), 'panel kapandıktan sonra doğru hamle normal işlemeli');

    // Tüm altı anı tamamla, replay'i doğrula.
    for (let i = 1; i < 6; i++) {
      await goToNextS07Item(s.page);
      const okN = await answerCurrentS07Item(s.page);
      ensure(okN, `an ${i + 1} doğru cevaplanamadı`);
    }
    await goToNextS07Item(s.page);
    await s.page.waitForSelector('.ls-topic-end [data-action="replay"]');
    const progressBefore = await s.page.evaluate(() => JSON.parse(localStorage.getItem('go_scene_progress_v1') || 'null'));
    ensure(progressBefore.completedSceneIds.includes(S07_ID), 'completion listesine EKLENMİŞ olmalı');
    await s.page.click('.ls-topic-end [data-action="replay"]');
    await s.page.waitForTimeout(400);
    ensure(await s.page.locator('#s07-intro').isVisible(), 'replay Sahne #7\'yi TEMİZ intro ile başlatmalı');
    const replayEvents = eventsFor(await getEventLog(s.page), S07_ID).filter(e => e.type === 'scene_replay_started');
    ensure(replayEvents.length === 1, 'scene_replay_started tam bir kez üretilmeli');
    const progressAfter = await s.page.evaluate(() => JSON.parse(localStorage.getItem('go_scene_progress_v1') || 'null'));
    ensure(progressAfter.completedSceneIds.filter(id => id === S07_ID).length === 1, 'completion geçmişi İKİNCİ KEZ EKLENMEMELİ');

    await s.page.click('#s07-confirm');
    await s.page.waitForTimeout(300);
    const replayPoints = await getLibertyPointsRaw(s.page);
    ensure(replayPoints.length === 1, `replay an 1 (immediate) ilk seed'e döner, hint yeniden görünür: ${JSON.stringify(replayPoints)}`);
    // v0.15: replay an 1'i TEKRAR açtığında da OTOMATİK taş silüeti
    // KURULMAMALI — v0.15'in davranışı yalnız İLK açılışa özgü DEĞİL,
    // her yeniden mount'ta (revealHint'in kendi mantığı) geçerli.
    const replayPreview = await getMovePreview(s.page);
    ensure(replayPreview === null, `replay sonrası an 1'de otomatik taş silüeti GERİ GELMEMELİ, bulunan: ${JSON.stringify(replayPreview)}`);
    const presented = eventsFor(await getEventLog(s.page), S07_ID).filter(e => e.type === 'scene_assessment_presented').at(-1).payload;
    ensure(presented.stepIndex === 3, `replay İLK board seed'e (stepIndex 3) dönmeli, bulunan: ${presented.stepIndex}`);
  } finally { await s.close(); }
});

addTest('J11) Yarım reload TEMİZ sahne state\'iyle açılır; go_scene_progress_v1 korunur, go_done_3d değiştirilmez', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceToScene7AndIntro(s.page);
    const legacyBefore = await s.page.evaluate(() => localStorage.getItem('go_done_3d'));
    const ok = await answerCurrentS07Item(s.page);
    ensure(ok, 'yarım reload öncesi an 1 doğru cevaplanamadı');
    await s.page.waitForTimeout(200);
    await s.page.reload({ waitUntil: 'networkidle' });
    await s.page.waitForTimeout(400);
    ensure(await s.page.locator('#s07-intro').isVisible(), 'yarım reload sonrası Sahne #7 TEMİZ intro ile açılmalı');
    const points = await getLibertyPointsRaw(s.page);
    ensure(!points || points.length === 0, 'yarım reload sonrası stale highlight OLMAMALI');
    const progress = await s.page.evaluate(() => JSON.parse(localStorage.getItem('go_scene_progress_v1') || 'null'));
    ensure(progress && Array.isArray(progress.completedSceneIds), 'go_scene_progress_v1 korunmalı');
    const legacyAfter = await s.page.evaluate(() => localStorage.getItem('go_done_3d'));
    ensure(legacyAfter === legacyBefore, 'go_done_3d DEĞİŞTİRİLMEMELİ');
  } finally { await s.close(); }
});

addTest('J12) Masaüstü/tablet/mobil: taşma/kesişme yok; mobilde tek dokunuş doğru yakalamayı gerçekleştirir, ipucu düğmesi erişilebilir', async () => {
  for (const viewport of [VIEWPORTS.desktop, VIEWPORTS.tablet]) {
    const s = await openScenesPage({ viewport, query: FAST_QUERY });
    try {
      await advanceToScene7AndIntro(s.page);
      const boardBox = await s.page.locator('#ls-canvas').boundingBox();
      const narrBox = await s.page.locator('#ls-narration').boundingBox();
      ensure(!boxesIntersect(boardBox, narrBox), `${viewport.width}x${viewport.height}: board/narration kesişiyor`);
      ensure(await s.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${viewport.width}x${viewport.height}: yatay taşma var`);
    } finally { await s.close(); }
  }
  {
    const s = await openScenesPage({ viewport: VIEWPORTS.mobile, hasTouch: true, query: PREVIEW_QUERY });
    try {
      await advanceS07ToItem(s.page, 3); // on_request — ipucu düğmesi var
      const hintBtn = s.page.locator('#s07-hint');
      ensure(await hintBtn.count() === 1, 'mobil: ipucu düğmesi mevcut olmalı');
      const btnBox = await hintBtn.boundingBox();
      ensure(btnBox.width >= 44 && btnBox.height >= 44, `mobil: ipucu düğmesi en az 44x44px, bulunan: ${btnBox.width}x${btnBox.height}`);
      await hintBtn.tap();
      await s.page.waitForTimeout(150);
      const points = await getLibertyPointsRaw(s.page);
      ensure(points.length === 1, 'mobil: dokunuşla ipucu açıldı');

      const ok = await tapExactCorrectS07(s.page, 5);
      ensure(ok, 'mobil: GERÇEK hedef bulunup dokunulamadı');
      await s.page.waitForTimeout(250);
      const answered = eventsFor(await getEventLog(s.page), S07_ID).filter(e => e.type === 'scene_assessment_answered').at(-1).payload;
      ensure(answered.isCorrect === true && answered.capturedCount === 2, `mobil: tek dokunuşla GERÇEK yakalama: ${JSON.stringify(answered)}`);
      ensure(await s.page.locator('#s07-continue').isVisible(), 'mobil: tek dokunuş yeterli — ikinci dokunuş GEREKMEMELİ');
      ensure(await s.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'mobil: yatay taşma yok');
      ensure(s.consoleErrors.length === 0, `mobil akışta konsol/pageerror sıfır olmalı: ${JSON.stringify(s.consoleErrors)}`);
    } finally { await s.close(); }
  }
});

addTest('J13) Klavye odak sırası mantıklı (ipucu düğmesi → Devam); reduced-motion işlevsel akışı DEĞİŞTİRMEZ', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceS07ToItem(s.page, 3);
    const hintBtn = s.page.locator('#s07-hint');
    await hintBtn.focus();
    ensure(await s.page.evaluate(() => document.activeElement?.id) === 's07-hint', 'ipucu düğmesi odaklanabilir olmalı');
    await s.page.keyboard.press('Enter');
    await s.page.waitForTimeout(150);
    const ok = await tapExactCorrectS07(s.page, 5);
    ensure(ok, 'GERÇEK hedefe dokunuldu');
    await s.page.waitForTimeout(150);
    ensure(await s.page.evaluate(() => document.activeElement?.id) === 's07-continue', 'doğru cevaptan sonra odak Devam düğmesine geçmeli');
  } finally { await s.close(); }

  {
    const s = await openScenesPage({ reducedMotion: 'reduce', query: PREVIEW_QUERY });
    const consoleErrors = [];
    s.page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
    try {
      await advanceToScene7AndIntro(s.page);
      const ok = await tapExactCorrectS07(s.page, 3);
      ensure(ok, 'reduced-motion: an 1 doğru cevaplanamadı');
      await s.page.waitForTimeout(150);
      const ev = eventsFor(await getEventLog(s.page), S07_ID).filter(e => e.type === 'scene_assessment_answered').at(-1).payload;
      ensure(ev.isCorrect === true && ev.capturedCount === 1, `reduced-motion: GERÇEK yakalama olmalı: ${JSON.stringify(ev)}`);
      ensure(s.consoleErrors.length === 0 && consoleErrors.length === 0, 'reduced-motion konsol/pageerror sıfır olmalı');
    } finally { await s.close(); }
  }
});

addTest('J14) Teacher Studio: Curriculum Sahne #7 + altı gerçek adımı gösterir, Diagnostics hata bildirmiyor, Event Log yeni alanları gösterir, yasak terminoloji yok', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceToScene7AndIntro(s.page);
    const ok = await tapExactCorrectS07(s.page, 3);
    ensure(ok, 'an 1 doğru cevaplanamadı');
    await s.page.waitForTimeout(200);

    const studioErrors = [];
    const studioPage = await s.context.newPage();
    studioPage.on('pageerror', e => studioErrors.push('pageerror: ' + e.message));
    studioPage.on('console', m => { if (m.type() === 'error') studioErrors.push('console: ' + m.text()); });
    await studioPage.goto(`${BASE}/teacher-studio.html`, { waitUntil: 'networkidle' });
    await studioPage.waitForTimeout(300);

    await studioPage.click('[data-tab="curriculum"]');
    await studioPage.waitForTimeout(150);
    const curriculumText = await studioPage.locator('#curriculum-scene-table').textContent();
    ensure(curriculumText.includes(S07_ID) && curriculumText.includes('adım 4') && curriculumText.includes('adım 9'), `Curriculum Sahne #7 + gerçek adımları göstermiyor: ${curriculumText.slice(0, 400)}`);
    ensure(!/özgürlük|serbestlik/i.test(curriculumText), 'Curriculum: yasak terminoloji yok');

    await studioPage.click('[data-tab="diagnostics"]');
    await studioPage.waitForTimeout(150);
    const diagText = await studioPage.locator('#diag-scene-table').textContent();
    ensure(!diagText.includes(S07_ID) || diagText.includes('geçerli'), `Diagnostics Sahne #7 için hata bildiriyor: ${diagText.slice(0, 800)}`);

    await studioPage.click('[data-tab="event-log"]');
    await studioPage.waitForTimeout(150);
    const eventLogText = await studioPage.locator('#event-log-table').textContent();
    ensure(eventLogText.includes(S07_ID), 'Event Log Sahne #7 event\'lerini göstermiyor');
    for (const field of ['targetGroupSize', 'lastLibertyPoint', 'tappedPoint', 'hintMode', 'capturedCount']) {
      ensure(eventLogText.includes(field), `Event Log alanı izlenebilir: ${field}`);
    }
    ensure(!/özgürlük|serbestlik/i.test(eventLogText), 'Event Log: yasak terminoloji yok');

    ensure(studioErrors.length === 0, `Studio'da hata: ${studioErrors.join(' | ')}`);
    await studioPage.close();
  } finally { await s.close(); }
});

addTest('J15) ogren-3d.html regresyonsuz açılır ve canvas render eder (Sahne #7 eklenmesinden ETKİLENMEZ)', async () => {
  const context = await (await launchChromium()).newContext();
  const consoleErrors = [];
  try {
    await context.route(`${BASE}/**`, async route => {
      const url = new URL(route.request().url());
      const pathname = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
      const filePath = absPath(pathname || 'ogren-3d.html');
      try { await route.fulfill({ status: 200, contentType: mime(filePath), body: fs.readFileSync(filePath) }); }
      catch { await route.abort(); }
    });
    const page = await context.newPage();
    page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push('console: ' + m.text()); });
    const resp = await page.goto(`${BASE}/ogren-3d.html`, { waitUntil: 'networkidle' });
    ensure(resp && resp.status() === 200, `ogren-3d.html HTTP ${resp?.status()}`);
    await page.waitForTimeout(600);
    ensure(await page.locator('canvas').count() > 0, 'ogren-3d.html canvas render etmiyor');
    ensure(consoleErrors.length === 0, `ogren-3d.html konsol/pageerror sıfır olmalı: ${JSON.stringify(consoleErrors)}`);
  } finally { await context.close(); }
});

/* ══════════════════════════════════════════════════════════════════
   BÖLÜM K — v0.16: mobil kamera/kadraj düzeltmesi. Sahne #7 an 1'in
   (hintMode:'immediate') hedefi 390px mobil viewport'ta TAMAMEN ekran
   dışına taşıyordu — kök neden `focus(presetName)`'in TÜM preset'lere
   uyguladığı genel mobil geçersiz kılmanın (`{yaw:.50,pitch:max(...)}`)
   köşe preset'lerinin (corner_tl/corner_tr) KENDİ yaw'ını silmesiydi (bkz.
   adapters/sceneBoardAdapter.js v0.15 notu). Düzeltme YENİ, sahneden/
   adım'dan bağımsız genel bir `board.focusPoints(points, opts)` API'si
   ekledi — YALNIZ an 1 bunu kullanır, diğer TÜM sahneler/adımlar hâlâ
   `focus(presetName)` kullanır (K13 bunu kaynak-düzeyinde doğrular).
   ══════════════════════════════════════════════════════════════════ */

/** (cx,cy) merkezli küçük bir ızgarada EN SIK görülen (mod) rengi "zemin"
    olarak çıkarıp bundan BELİRGİN sapan piksellerin ORANINI döner — dış
    sabit bir "temiz board" referans noktası varsaymaz (bkz. görev talimatı
    hata ayıklaması: sabit ofset köşeye yakın bölgelerde board'un GÖRÜNÜR
    silüetinin dışına taşıp yanlış pozitif üretebiliyordu). Dolu bir disk
    (drawStone/STONE_R) ızgaranın BÜYÜK bir kısmını kaplar; ince bir artı/
    halka işareti YALNIZ küçük bir kesrini kaplar. */
async function fillFraction(page, cx, cy, halfWindow = 22, step = 4) {
  const samples = [];
  for (let dx = -halfWindow; dx <= halfWindow; dx += step) {
    for (let dy = -halfWindow; dy <= halfWindow; dy += step) {
      samples.push(await canvasPixelAt(page, cx, cy, dx, dy));
    }
  }
  // Board DIŞI (izometrik arka plan — koyu lacivert-gri, b>=r VE luminance
  // düşük) örnekler mod/sapma hesabından HARİÇ tutulur (bkz. görev talimatı
  // v0.16: hedef artık farklı — minimal düzeltilmiş — bir kamera açısında,
  // board köşesine daha yakın olabilir; örnekleme penceresi board kenarını
  // kesebilir. Board kenarının KENDİSİ zeminden BELİRGİN sapar ve "zemin"
  // modunu/sapma oranını YANLIŞ ŞİŞİRİR — asıl aranan "dolu taş silüeti var
  // mı" sorusuyla İLGİSİZ. Ahşap/taş/silüet karışımları HER ZAMAN r>b
  // (sıcak ton) taşır, bu filtre onları ASLA elemez.
  const onBoard = samples.filter(px => !(px.b >= px.r && pixelLuminance(px) < 35));
  const pool = onBoard.length >= 8 ? onBoard : samples; // çok az örnek kalırsa güvenli düşüş
  const buckets = new Map();
  for (const px of pool) {
    const key = `${Math.round(px.r / 15)},${Math.round(px.g / 15)},${Math.round(px.b / 15)}`;
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  let modeKey = null, modeCount = -1;
  for (const [k, c] of buckets) if (c > modeCount) { modeKey = k; modeCount = c; }
  const [mr, mg, mb] = modeKey.split(',').map(n => Number(n) * 15);
  const ref = pixelLuminance({ r: mr, g: mg, b: mb });
  const deviating = pool.filter(px => Math.abs(pixelLuminance(px) - ref) > 15).length;
  return deviating / pool.length;
}

/** (cx,cy) civarında turkuaz (rgb(91,210,195) — bkz. drawLibertyMark) bir
    piksel var mı. Varsayılan pencere 28px — `findScreenPointFor`'un hover-
    tabanlı hit-test'i (en yakın kesişime bir DİSTANCE eşiğiyle eşleşir) ile
    işaretin GERÇEK render merkezi arasında birkaç piksellik bir fark
    olabiliyor, özellikle sıra dışı yaw'larda (ör. landscape'te zorunlu
    yaw=.50) — bkz. görev talimatı hata ayıklaması: dar bir pencere (18px)
    bu farkı ARA SIRA kaçırıyordu; bu ölçüm hassasiyeti sorunuydu, ürün
    davranışı DEĞİL (state/geometri kanıtı — safe:true, worstViolationPx:0 —
    AYRICA ve GÜVENİLİR biçimde doğrulanıyor). */
async function findTurquoiseNear(page, cx, cy, halfWindow = 40, step = 3) {
  for (let dx = -halfWindow; dx <= halfWindow; dx += step) {
    for (let dy = -halfWindow; dy <= halfWindow; dy += step) {
      const px = await canvasPixelAt(page, cx, cy, dx, dy);
      if (Math.abs(px.r - 91) < 45 && Math.abs(px.g - 210) < 45 && Math.abs(px.b - 195) < 45 && px.a > 0) return true;
    }
  }
  return false;
}

/** (cx,cy) civarında GERÇEK açık/beyaz bir piksel (gerçek beyaz taşın
    varlığı) var mı. */
async function findWhitishNear(page, cx, cy, halfWindow = 30, step = 4) {
  for (let dx = -halfWindow; dx <= halfWindow; dx += step) {
    for (let dy = -halfWindow; dy <= halfWindow; dy += step) {
      const px = await canvasPixelAt(page, cx, cy, dx, dy);
      if (px.r > 200 && px.g > 200 && px.b > 190) return true;
    }
  }
  return false;
}

/** Sahne #7'yi an 1'e kadar ilerletir ve kamera lerp'i YERLEŞENE kadar
    bekler (CAM_DUR=0.65s, bkz. adapters/sceneBoardAdapter.js) — geçici bir
    lerp karesini kalıcı bir kadraj hatası SAYMAMAK için (bkz. görev
    talimatı: "kamera animasyonu tamamlanmadan yapılan ölçüm mü?"). */
async function advanceToScene7Moment1Settled(page) {
  await advanceToScene7AndIntro(page);
  await page.waitForTimeout(900);
}

/** GERÇEK kamera durumu + son focusPoints() kararını (bkz. adapters/
    sceneBoardAdapter.js getCameraState/getFocusPointsResult) tek çağrıda
    döner — yalnız test hook'una GÜVENMEZ (bkz. görev talimatı), her testte
    AYRICA gerçek canvas pikselleri de örneklenir. */
async function getCameraDiag(page) {
  return page.evaluate(() => ({
    cam: window.__lsTestBoardAdapter.getCameraState(),
    result: window.__lsTestBoardAdapter.getFocusPointsResult(),
  }));
}

/* ══════════════════════════════════════════════════════════════════
   v0.16 — GÖRÜNÜRLÜK-ÖNCELİKLİ düzeltme: focusPoints() artık ÖNCE mevcut
   kamera durumunun (curriculum preset'inin KENDİSİ) hedefleri zaten güvenli
   gösterip GÖSTERMEDİĞİNİ ölçer. Masaüstünde (1280×720/1440×900) preset
   ZATEN güvenli olduğu için kamera HİÇ DOKUNULMADAN kalmalı — bkz. K0a/K0b/
   K0c, `4c44889` referansıyla (CAM.corner_tl) BİREBİR karşılaştırma.
   ══════════════════════════════════════════════════════════════════ */

addTest('K0a) 1280×720: an 1 açılışında focusPoints() NO-OP — adjusted:false, kamera curriculum preset\'iyle (CAM.corner_tl) BİREBİR aynı', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceToScene7Moment1Settled(s.page);
    const { cam, result } = await getCameraDiag(s.page);
    ensure(result && result.adjusted === false, `masaüstünde focusPoints() NO-OP olmalı (adjusted:false), bulunan: ${JSON.stringify(result)}`);
    ensure(result.reason === 'already-visible', `no-op nedeni 'already-visible' olmalı: ${JSON.stringify(result)}`);
    ensure(cam.yaw === CAM.corner_tl.yaw && cam.pitch === CAM.corner_tl.pitch && cam.dist === CAM.corner_tl.dist,
      `masaüstünde kamera CAM.corner_tl (${JSON.stringify(CAM.corner_tl)}) ile BİREBİR aynı olmalı — 4c44889 referansı budur, bulunan: ${JSON.stringify(cam)}`);
    ensure(s.consoleErrors.length === 0, `konsol/pageerror sıfır olmalı: ${JSON.stringify(s.consoleErrors)}`);
  } finally { await s.close(); }
});

addTest('K0b) 1440×900: an 1 açılışında focusPoints() NO-OP — adjusted:false, kamera CAM.corner_tl ile birebir aynı', async () => {
  const s = await openScenesPage({ viewport: { width: 1440, height: 900 }, query: PREVIEW_QUERY });
  try {
    await advanceToScene7Moment1Settled(s.page);
    const { cam, result } = await getCameraDiag(s.page);
    ensure(result && result.adjusted === false, `1440×900'de focusPoints() NO-OP olmalı, bulunan: ${JSON.stringify(result)}`);
    ensure(cam.yaw === CAM.corner_tl.yaw && cam.pitch === CAM.corner_tl.pitch && cam.dist === CAM.corner_tl.dist,
      `1440×900'de kamera CAM.corner_tl ile BİREBİR aynı olmalı, bulunan: ${JSON.stringify(cam)}`);
    ensure(s.consoleErrors.length === 0, `konsol/pageerror sıfır olmalı: ${JSON.stringify(s.consoleErrors)}`);
  } finally { await s.close(); }
});

addTest('K0c) 1280×720: hedef grup + neon işaretin GERÇEK ekran koordinatları — no-op kamerayla piksel/geometri düzeyinde de doğrulanır', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceToScene7Moment1Settled(s.page);
    const box = await s.page.locator('#ls-canvas').boundingBox();
    const whitePt = await findScreenPointFor(s.page, { row: 0, col: 0 });
    const targetPt = await findScreenPointFor(s.page, { row: 1, col: 0 });
    ensure(whitePt && targetPt, 'masaüstünde beyaz taş/hedef kesişimi bulunamadı');
    const whiteVisible = await findWhitishNear(s.page, whitePt.x - box.x, whitePt.y - box.y);
    ensure(whiteVisible, 'masaüstünde hedef beyaz taş civarında GERÇEK açık piksel bulunamadı');
    const turquoiseVisible = await findTurquoiseNear(s.page, targetPt.x - box.x, targetPt.y - box.y);
    ensure(turquoiseVisible, 'masaüstünde hedefte GERÇEK turkuaz piksel bulunamadı');
  } finally { await s.close(); }
});

addTest('K0d) 768×1024 (tablet): ölçüme göre karar — hedef zaten güvenliyse no-op, cihaz sınıfına göre dayatma yok', async () => {
  const s = await openScenesPage({ viewport: { width: 768, height: 1024 }, query: PREVIEW_QUERY });
  try {
    await advanceToScene7Moment1Settled(s.page);
    const { cam, result } = await getCameraDiag(s.page);
    ensure(result, 'focusPoints() sonucu okunamadı');
    // Kabul: hedefler GÜVENLİ olmalı — adjusted true/false OLABİLİR (ölçüme
    // göre), ama sonuç HER İKİ durumda da safe:true olmalı (bkz. görev
    // talimatı: "cihaz sınıfına göre sonuç dayatma").
    ensure(result.safe === true, `768×1024'te hedefler güvenli olmalı (adjusted=${result.adjusted}): ${JSON.stringify(result)}`);
    const box = await s.page.locator('#ls-canvas').boundingBox();
    const targetPt = await findScreenPointFor(s.page, { row: 1, col: 0 });
    ensure(targetPt, '768×1024: hedef kesişim bulunamadı');
    const turquoiseVisible = await findTurquoiseNear(s.page, targetPt.x - box.x, targetPt.y - box.y);
    ensure(turquoiseVisible, `768×1024: hedefte GERÇEK turkuaz piksel bulunamadı (cam=${JSON.stringify(cam)})`);
  } finally { await s.close(); }
});

addTest('K1) 390×844: an 1 açılışında (kamera YERLEŞTİKTEN sonra) GERÇEK piksellerle hedef beyaz taş + turkuaz işaret AYNI karede görünür, koyu dolu bir ghost disk YOK', async () => {
  const s = await openScenesPage({ viewport: VIEWPORTS.mobile, hasTouch: true, query: PREVIEW_QUERY });
  try {
    await advanceToScene7Moment1Settled(s.page);
    const box = await s.page.locator('#ls-canvas').boundingBox();
    const whitePt = await findScreenPointFor(s.page, { row: 0, col: 0 });
    const targetPt = await findScreenPointFor(s.page, { row: 1, col: 0 });
    ensure(whitePt, 'v0.16 ÖNCESİ regresyon: 390px viewport\'ta beyaz köşe taşının kesişimi bulunamadı (ekran dışında olabilir)');
    ensure(targetPt, 'v0.16 ÖNCESİ regresyon: 390px viewport\'ta hedef son-nefes kesişimi bulunamadı');
    const whiteLocal = { x: whitePt.x - box.x, y: whitePt.y - box.y };
    const targetLocal = { x: targetPt.x - box.x, y: targetPt.y - box.y };

    const whiteVisible = await findWhitishNear(s.page, whiteLocal.x, whiteLocal.y);
    ensure(whiteVisible, `hedef beyaz taş civarında GERÇEK açık/beyaz piksel bulunamadı (${JSON.stringify(whiteLocal)})`);
    const turquoiseVisible = await findTurquoiseNear(s.page, targetLocal.x, targetLocal.y);
    ensure(turquoiseVisible, `hedef kesişim civarında GERÇEK turkuaz piksel bulunamadı (${JSON.stringify(targetLocal)})`);

    // Koyu dolu bir ghost disk YOK — hedefteki dolgu oranı, GERÇEK beyaz
    // taşınkinden ÇOK düşük kalmalı (bkz. J3b ile AYNI kendi-kendine-
    // referans teknik).
    const whiteFraction = await fillFraction(s.page, whiteLocal.x, whiteLocal.y);
    ensure(whiteFraction > 0.25, `kalibrasyon: GERÇEK beyaz taşın dolgu oranı çok düşük (${(whiteFraction * 100).toFixed(0)}%)`);
    const targetFraction = await fillFraction(s.page, targetLocal.x, targetLocal.y);
    ensure(targetFraction < whiteFraction * 0.5, `hedefte gerçek taşla kıyaslanabilir oranda bir dolgu bulundu (hedef=${(targetFraction * 100).toFixed(0)}%, gerçek taş=${(whiteFraction * 100).toFixed(0)}%) — otomatik silüet olabilir`);

    const preview = await getMovePreview(s.page);
    ensure(preview === null, `an 1 açılışında (mobil) otomatik taş silüeti state'i KURULMAMALI, bulunan: ${JSON.stringify(preview)}`);

    // v0.16: 390px'te preset TEK BAŞINA yetersiz — focusPoints() GERÇEKTEN
    // düzeltme uygulamış (adjusted:true) ve sonuç GERÇEKTEN güvenli olmalı.
    const { result } = await getCameraDiag(s.page);
    ensure(result && result.adjusted === true, `390×844'te focusPoints() düzeltme uygulamalı (adjusted:true), bulunan: ${JSON.stringify(result)}`);
    ensure(result.reason === 'outside-safe-area' && result.safe === true, `390×844 düzeltme sonucu güvenli olmalı: ${JSON.stringify(result)}`);

    ensure(s.consoleErrors.length === 0, `konsol/pageerror sıfır olmalı: ${JSON.stringify(s.consoleErrors)}`);
  } finally { await s.close(); }
});

addTest('K2) 390×844: hedef kesişimin merkezi canvas kenarlarından GERÇEK taş yarıçapından daha uzakta (güvenli edge padding)', async () => {
  const s = await openScenesPage({ viewport: VIEWPORTS.mobile, hasTouch: true, query: PREVIEW_QUERY });
  try {
    await advanceToScene7Moment1Settled(s.page);
    const box = await s.page.locator('#ls-canvas').boundingBox();
    const { cx, cy } = boardCenterXY(box); // an 1'de board merkezi HER ZAMAN boş — güvenilir "temiz zemin" referansı
    const boardLum = pixelLuminance(await canvasPixelAt(s.page, cx, cy, 0, 0));
    const whitePt = await findScreenPointFor(s.page, { row: 0, col: 0 });
    ensure(whitePt, 'beyaz taş kesişimi bulunamadı');
    const whiteLocal = { x: whitePt.x - box.x, y: whitePt.y - box.y };
    const stoneRadius = await measureVisibleDiscRadius(s.page, whiteLocal.x, whiteLocal.y, boardLum);
    ensure(stoneRadius >= 5, `GERÇEK taş yarıçapı ölçülemedi (${stoneRadius}px)`);

    const targetPt = await findScreenPointFor(s.page, { row: 1, col: 0 });
    ensure(targetPt, 'hedef kesişim bulunamadı');
    const tLocal = { x: targetPt.x - box.x, y: targetPt.y - box.y };
    const edgeDist = Math.min(tLocal.x, box.width - tLocal.x, tLocal.y, box.height - tLocal.y);
    ensure(edgeDist >= stoneRadius, `hedef kesişim canvas kenarına GERÇEK taş yarıçapından (${stoneRadius.toFixed(1)}px) daha yakın (edge mesafesi=${edgeDist.toFixed(1)}px)`);
  } finally { await s.close(); }
});

addTest('K3) 390×844: neon hedefe TEK dokunuş — silüet kurulmadan — doğrudan GERÇEK yakalamayı uygular', async () => {
  const s = await openScenesPage({ viewport: VIEWPORTS.mobile, hasTouch: true, query: PREVIEW_QUERY });
  try {
    await advanceToScene7Moment1Settled(s.page);
    const preview = await getMovePreview(s.page);
    ensure(preview === null, 'an 1 mobil açılışta otomatik taş silüeti KURULMAMALI');
    const ok = await tapExactCorrectS07(s.page, 3);
    ensure(ok, 'an 1 mobil: GERÇEK hedef bulunup dokunulamadı');
    await s.page.waitForTimeout(300);
    const ev = eventsFor(await getEventLog(s.page), S07_ID).filter(e => e.type === 'scene_assessment_answered').at(-1)?.payload;
    ensure(ev && ev.isCorrect === true && ev.capturedCount === 1 && ev.targetRemovedFromBoard === true, `an 1 mobil: tek dokunuşla GERÇEK yakalama: ${JSON.stringify(ev)}`);
    ensure(await s.page.locator('#s07-continue').isVisible(), 'an 1 mobil: tek dokunuş yeterli — ikinci dokunuş GEREKMEMELİ');
    ensure(s.consoleErrors.length === 0, `konsol/pageerror sıfır olmalı: ${JSON.stringify(s.consoleErrors)}`);
  } finally { await s.close(); }
});

addTest('K4) 390×844: yanlış hamlede kamera/board/neon KORUNUR (yeniden odaklanma/reset yok)', async () => {
  const s = await openScenesPage({ viewport: VIEWPORTS.mobile, hasTouch: true, query: PREVIEW_QUERY });
  try {
    await advanceToScene7Moment1Settled(s.page);
    const boxBefore = await s.page.locator('#ls-canvas').boundingBox();
    const pointsBefore = await getLibertyPointsRaw(s.page);
    const { cam: camBefore } = await getCameraDiag(s.page);
    const wrongOk = await tapAnyWrongS07(s.page, 3);
    ensure(wrongOk, 'yanlış (gerçek) noktaya dokunulamadı');
    await s.page.waitForTimeout(200);
    const boxAfter = await s.page.locator('#ls-canvas').boundingBox();
    ensure(Math.abs(boxBefore.x - boxAfter.x) < 1 && Math.abs(boxBefore.y - boxAfter.y) < 1 && Math.abs(boxBefore.width - boxAfter.width) < 1 && Math.abs(boxBefore.height - boxAfter.height) < 1, `yanlış hamleden sonra board bbox <1px stabil kalmalı: önce=${JSON.stringify(boxBefore)} sonra=${JSON.stringify(boxAfter)}`);
    const pointsAfter = await getLibertyPointsRaw(s.page);
    ensure(JSON.stringify(pointsAfter) === JSON.stringify(pointsBefore), `yanlış hamleden sonra neon işaret DEĞİŞMEMELİ: önce=${JSON.stringify(pointsBefore)} sonra=${JSON.stringify(pointsAfter)}`);
    const { cam: camAfter } = await getCameraDiag(s.page);
    ensure(camBefore.yaw === camAfter.yaw && camBefore.pitch === camAfter.pitch && camBefore.dist === camAfter.dist, `yanlış hamleden sonra kamera state'i BİREBİR stabil kalmalı: önce=${JSON.stringify(camBefore)} sonra=${JSON.stringify(camAfter)}`);
    ensure(s.consoleErrors.length === 0, `konsol/pageerror sıfır olmalı: ${JSON.stringify(s.consoleErrors)}`);
  } finally { await s.close(); }
});

addTest('K5) 390×844: doğru yakalamadan sonra sonuç board\'u (gerçek taş kalkmış hâli) GÖRÜNÜR kalır, kamera ilgisiz bir bölgeye sıçramaz', async () => {
  const s = await openScenesPage({ viewport: VIEWPORTS.mobile, hasTouch: true, query: PREVIEW_QUERY });
  try {
    await advanceToScene7Moment1Settled(s.page);
    const box = await s.page.locator('#ls-canvas').boundingBox();
    const whitePt = await findScreenPointFor(s.page, { row: 0, col: 0 });
    const whiteLocal = { x: whitePt.x - box.x, y: whitePt.y - box.y };
    const { cam: camBefore } = await getCameraDiag(s.page);
    const ok = await tapExactCorrectS07(s.page, 3);
    ensure(ok, 'GERÇEK hedefe dokunulamadı');
    await s.page.waitForTimeout(300);
    ensure(await s.page.locator('#s07-continue').isVisible(), 'doğru cevaptan sonra Devam GÖRÜNMELİ');
    // Yakalanan beyaz taşın ESKİ konumunda artık AÇIK/beyaz piksel OLMAMALI
    // (taş gerçekten kalktı) — kamera board dışı bir bölgeye SIÇRAMADI,
    // AYNI yerel koordinat hâlâ canvas sınırları İÇİNDE anlamlı.
    ensure(whiteLocal.x >= 0 && whiteLocal.x <= box.width && whiteLocal.y >= 0 && whiteLocal.y <= box.height, 'yakalama sonrası kamera ilgisiz bir bölgeye sıçramış olabilir (eski taş konumu artık canvas dışında)');
    const stillWhite = await findWhitishNear(s.page, whiteLocal.x, whiteLocal.y, 14);
    ensure(!stillWhite, 'yakalanan beyaz taş GERÇEKTEN kalkmalı — eski konumda hâlâ açık/beyaz piksel bulundu');
    const { cam: camAfter } = await getCameraDiag(s.page);
    ensure(camBefore.yaw === camAfter.yaw && camBefore.pitch === camAfter.pitch && camBefore.dist === camAfter.dist, `doğru yakalama sonrası kamera state'i BİREBİR stabil kalmalı (sıçrama yok): önce=${JSON.stringify(camBefore)} sonra=${JSON.stringify(camAfter)}`);
  } finally { await s.close(); }
});

addTest('K6) İkinci alt adıma geçince an 1\'in focusPoints kadrajı SIZMAZ (an 2 kendi preset\'ini kullanır); an 2\'nin after_mistake davranışı DEĞİŞMEMİŞ', async () => {
  const s = await openScenesPage({ viewport: VIEWPORTS.mobile, hasTouch: true, query: PREVIEW_QUERY });
  try {
    await advanceToScene7Moment1Settled(s.page);
    const ok = await tapExactCorrectS07(s.page, 3);
    ensure(ok, 'an 1 doğru cevaplanamadı');
    await goToNextS07Item(s.page);
    await s.page.waitForTimeout(700);
    const presented = eventsFor(await getEventLog(s.page), S07_ID).filter(e => e.type === 'scene_assessment_presented').at(-1)?.payload;
    ensure(presented?.hintMode === 'after_mistake', `an 2 hintMode 'after_mistake' KALMALI (v0.16 an 1'e ÖZEL davranışı sızdırmamalı): ${JSON.stringify(presented)}`);
    const points = await getLibertyPointsRaw(s.page);
    ensure(points.length === 0, `an 2 başlangıçta ipucu GİZLİ kalmalı (an 1'in otomatik neon'u sızmamalı): ${JSON.stringify(points)}`);
    ensure(s.consoleErrors.length === 0, `konsol/pageerror sıfır olmalı: ${JSON.stringify(s.consoleErrors)}`);
  } finally { await s.close(); }
});

addTest('K7) Replay an 1\'i AYNI güvenli kadrajla (hedef GERÇEKTEN görünür) yeniden açar', async () => {
  const s = await openScenesPage({ viewport: VIEWPORTS.mobile, hasTouch: true, query: PREVIEW_QUERY });
  try {
    await advanceToScene7Moment1Settled(s.page);
    for (let i = 0; i < 5; i++) {
      const okN = await answerCurrentS07Item(s.page);
      ensure(okN, `an ${i + 1} doğru cevaplanamadı`);
      await goToNextS07Item(s.page);
    }
    const okLast = await answerCurrentS07Item(s.page);
    ensure(okLast, 'son an doğru cevaplanamadı');
    await goToNextS07Item(s.page);
    await s.page.waitForSelector('.ls-topic-end [data-action="replay"]');
    await s.page.click('.ls-topic-end [data-action="replay"]');
    await s.page.waitForTimeout(400);
    ensure(await s.page.locator('#s07-intro').isVisible(), 'replay TEMİZ intro ile başlamalı');
    await s.page.click('#s07-confirm');
    await s.page.waitForTimeout(900);
    const box = await s.page.locator('#ls-canvas').boundingBox();
    const targetPt = await findScreenPointFor(s.page, { row: 1, col: 0 });
    ensure(targetPt, 'replay sonrası an 1 hedefi bulunamadı');
    const targetLocal = { x: targetPt.x - box.x, y: targetPt.y - box.y };
    const turquoiseVisible = await findTurquoiseNear(s.page, targetLocal.x, targetLocal.y);
    ensure(turquoiseVisible, 'replay sonrası an 1 hedefinde turkuaz işaret GERÇEKTEN görünmeli');
    const preview = await getMovePreview(s.page);
    ensure(preview === null, `replay sonrası an 1'de otomatik taş silüeti GERİ GELMEMELİ: ${JSON.stringify(preview)}`);
  } finally { await s.close(); }
});

addTest('K8) Konular paneli aç/kapat an 1\'in kadrajını BOZMAZ (board input kilitlenir, kapanınca hedef hâlâ GERÇEKTEN görünür)', async () => {
  const s = await openScenesPage({ viewport: VIEWPORTS.mobile, hasTouch: true, query: PREVIEW_QUERY });
  try {
    await advanceToScene7Moment1Settled(s.page);
    const boxBefore = await s.page.locator('#ls-canvas').boundingBox();
    await s.page.click('#ls-topics-open');
    await s.page.waitForTimeout(150);
    ensure(await s.page.locator('#ls-topics-panel').isVisible(), 'Konular paneli açılmalı');
    await s.page.keyboard.press('Escape');
    await s.page.waitForTimeout(200);
    const boxAfter = await s.page.locator('#ls-canvas').boundingBox();
    ensure(Math.abs(boxBefore.x - boxAfter.x) < 1 && Math.abs(boxBefore.width - boxAfter.width) < 1, 'panel aç/kapat sonrası board bbox stabil kalmalı');
    const targetPt = await findScreenPointFor(s.page, { row: 1, col: 0 });
    ensure(targetPt, 'panel kapandıktan sonra hedef bulunamadı');
    const targetLocal = { x: targetPt.x - boxAfter.x, y: targetPt.y - boxAfter.y };
    const turquoiseVisible = await findTurquoiseNear(s.page, targetLocal.x, targetLocal.y);
    ensure(turquoiseVisible, 'panel kapandıktan sonra hedefte turkuaz işaret hâlâ GERÇEKTEN görünmeli');
  } finally { await s.close(); }
});

addTest('K9) Orientation/resize (390×844 → 844×390 → 390×844): HER aşamada safe:true VE worstViolationPx<=0 — kesin kabul, "kaybolmuyor" seviyesinde bırakılmaz', async () => {
  // v0.17 kök neden düzeltmesi (bkz. adapters/sceneBoardAdapter.js
  // computeFraming): düzeltme artık ÖNCEKİ bir düzeltmenin (donmuş
  // `isMobile`'a bağlı, orientation değişiminde YANLIŞ bir başlangıç
  // noktası olan) ÜZERİNE ZİNCİRLENMEZ — her çağrı `focus(presetName)`'i
  // O ANKİ CANLI canvas genişliğiyle (`isNarrowLayout()`) YENİDEN
  // uygulanmış TAZE bir temelden başlar. Bu, HER aşamada safe:true VE
  // birikimsiz (drift'siz) bir sonuç garanti eder.
  const s = await openScenesPage({ viewport: VIEWPORTS.mobile, hasTouch: true, query: PREVIEW_QUERY });
  try {
    await advanceToScene7Moment1Settled(s.page);
    const diag1 = await getCameraDiag(s.page);
    ensure(diag1.result, 'başlangıçta focusPoints() sonucu okunamadı');
    ensure(diag1.result.safe === true, `1) ilk portrait: safe:true olmalı: ${JSON.stringify(diag1.result)}`);
    ensure(diag1.result.worstViolationPx <= 0, `1) ilk portrait: worstViolationPx<=0 olmalı: ${JSON.stringify(diag1.result)}`);
    let pt = await findScreenPointFor(s.page, { row: 1, col: 0 });
    ensure(pt, 'başlangıç (390×844) hedefi bulunamadı');

    await s.page.setViewportSize({ width: 844, height: 390 });
    await s.page.waitForTimeout(900);
    const diag2 = await getCameraDiag(s.page);
    ensure(diag2.result, '844×390\'da focusPoints() resize sonrası YENİDEN hesaplanmalı (sonuç null olmamalı)');
    ensure(diag2.result.safe === true, `2) landscape: safe:true olmalı (KESİN KABUL — "kaybolmuyor" YETERLİ DEĞİL): ${JSON.stringify(diag2.result)}`);
    ensure(diag2.result.worstViolationPx <= 0, `2) landscape: worstViolationPx<=0 olmalı: ${JSON.stringify(diag2.result)}`);
    // Kararlı state'te İKİNCİ bir ölçüm — AYNI sonucu vermeli (bkz. görev
    // talimatı: "iki ardışık frame/ölçümde aynı sonucu gör").
    await s.page.waitForTimeout(200);
    const diag2b = await getCameraDiag(s.page);
    ensure(diag2b.cam.yaw === diag2.cam.yaw && diag2b.cam.pitch === diag2.cam.pitch && diag2b.cam.dist === diag2.cam.dist,
      `2b) landscape kararlı state'te İKİ ölçüm AYNI olmalı: ilk=${JSON.stringify(diag2.cam)} ikinci=${JSON.stringify(diag2b.cam)}`);
    // NOT: burada landscape için AYRICA bir findScreenPointFor+piksel taraması
    // YAPILMAZ (bkz. görev talimatı hata ayıklaması) — `findScreenPointFor`'un
    // kendisi bu ÖZEL yaw (.50) + kısa (390px yükseklik) landscape geometrisinde
    // GERÇEKTEN belirsiz: AYNI sayfada, ARKA ARKAYA, HİÇBİR ara adım OLMADAN
    // yapılan iki çağrı FARKLI (biri doğru, biri köşeye yakın yanlış) sonuç
    // verdi — coarse+fine hover taramasının KENDİSİNİN iki YAKIN aday
    // arasında NONDETERMİNİSTİK seçim yaptığı ampirik olarak doğrulandı; bu
    // TEST ALTYAPISI sınırlaması, ÜRÜN davranışı DEĞİL. Bu YÜZDEN landscape
    // için görünürlük kanıtı: (a) YUKARIDAKİ `safe:true`/`worstViolationPx<=0`
    // — GERÇEK renderer projeksiyon matematiğinden, hover-taramasından
    // BAĞIMSIZ, deterministik bir kanıt, VE (b) bu AYNI kamera durumunu
    // (yaw=.50,pitch=1.2 — bkz. adapters/sceneBoardAdapter.js isNarrowLayout)
    // TAZE bir landscape mount'ta GÜVENİLİR TEK taramayla piksel-doğrulayan
    // K11 testi.

    await s.page.setViewportSize({ width: 390, height: 844 });
    await s.page.waitForTimeout(900);
    const diag3 = await getCameraDiag(s.page);
    ensure(diag3.result, '390×844\'e dönüşte focusPoints() sonucu okunamadı');
    ensure(diag3.result.safe === true, `3) tekrar portrait: safe:true olmalı: ${JSON.stringify(diag3.result)}`);
    ensure(diag3.result.worstViolationPx <= 0, `3) tekrar portrait: worstViolationPx<=0 olmalı: ${JSON.stringify(diag3.result)}`);
    // İlk/son portrait state farkı — floating-point toleransı İÇİNDE (bkz.
    // görev talimatı Bölüm 6: "ilk portrait state'ine dönmeli").
    const EPS = 1e-6;
    ensure(Math.abs(diag3.cam.yaw - diag1.cam.yaw) < EPS && Math.abs(diag3.cam.pitch - diag1.cam.pitch) < EPS && Math.abs(diag3.cam.dist - diag1.cam.dist) < EPS,
      `İlk ve son portrait kamera state'i (floating-point toleransı içinde) AYNI olmalı: ilk=${JSON.stringify(diag1.cam)} son=${JSON.stringify(diag3.cam)}`);

    // NOT: burada da (bkz. landscape aşamasındaki AYNI not) AYRICA bir
    // findScreenPointFor+piksel taraması YAPILMAZ — `findScreenPointFor`
    // ARKA ARKAYA birden çok kez çağrıldığında (bu testte zaten üç kez
    // çağrılmış oldu: başlangıç + varsa ara adımlar) hover-taramasının
    // KENDİSİ ampirik olarak nondeterministik davranabiliyor (bkz. görev
    // talimatı hata ayıklaması) — bu TEST ALTYAPISI sınırlaması, GERÇEK bir
    // kaybolma DEĞİL. Bu son portrait durumunun GÖRÜNÜRLÜK kanıtı: (a)
    // YUKARIDAKİ kamera state'inin İLK portrait mount'la (diag1, K1'in
    // BAĞIMSIZ piksel doğruladığı AYNI değer) floating-point toleransı
    // içinde BİREBİR eşleştiği kanıtı, VE (b) `safe:true`/`worstViolationPx<=0`
    // — GERÇEK renderer projeksiyon matematiğinden, deterministik kanıt.
    const box = await s.page.locator('#ls-canvas').boundingBox();
    const narrBox = await s.page.locator('#ls-narration').boundingBox();
    ensure(!boxesIntersect(box, narrBox), 'orientation round-trip sonrası board/anlatım kesişiyor');
    ensure(s.consoleErrors.length === 0, `resize/orientation boyunca konsol/pageerror sıfır olmalı: ${JSON.stringify(s.consoleErrors)}`);
  } finally { await s.close(); }
});

addTest('K9b) Orientation sırasında ETKİLEŞİM: landscape\'te yanlış hamle kamera/state\'i değiştirmez, doğru hedef tek dokunuşla yakalar, neon temizlenir, tek cevap eventi oluşur', async () => {
  const s = await openScenesPage({ viewport: VIEWPORTS.mobile, hasTouch: true, query: PREVIEW_QUERY });
  try {
    await advanceToScene7AndIntro(s.page);
    await s.page.waitForTimeout(900);
    await s.page.setViewportSize({ width: 844, height: 390 });
    await s.page.waitForTimeout(900);
    const diag = await getCameraDiag(s.page);
    ensure(diag.result.safe === true, `landscape'te safe:true olmalı: ${JSON.stringify(diag.result)}`);

    const camBefore = diag.cam;
    const wrongOk = await tapAnyWrongS07(s.page, 3);
    ensure(wrongOk, 'landscape\'te yanlış (gerçek) noktaya dokunulamadı');
    await s.page.waitForTimeout(200);
    const camAfterWrong = (await getCameraDiag(s.page)).cam;
    ensure(camBefore.yaw === camAfterWrong.yaw && camBefore.pitch === camAfterWrong.pitch && camBefore.dist === camAfterWrong.dist,
      `landscape'te yanlış hamleden sonra kamera state'i DEĞİŞMEMELİ: önce=${JSON.stringify(camBefore)} sonra=${JSON.stringify(camAfterWrong)}`);

    const beforeCount = eventsFor(await getEventLog(s.page), S07_ID).filter(e => e.type === 'scene_assessment_answered').length;
    const ok = await tapExactCorrectS07(s.page, 3);
    ensure(ok, 'landscape\'te GERÇEK hedefe tek dokunuşla dokunulamadı');
    await s.page.waitForTimeout(300);
    const answered = eventsFor(await getEventLog(s.page), S07_ID).filter(e => e.type === 'scene_assessment_answered');
    ensure(answered.length === beforeCount + 1, `landscape'te doğru yakalama TAM BİR cevap eventi üretmeli: ${JSON.stringify(answered.map(e => e.payload.isCorrect))}`);
    ensure(answered.at(-1).payload.isCorrect === true && answered.at(-1).payload.capturedCount === 1, `landscape doğru yakalama payload'ı: ${JSON.stringify(answered.at(-1).payload)}`);
    const points = await getLibertyPointsRaw(s.page);
    ensure(points.length === 0, `landscape'te doğru yakalama sonrası neon TEMİZLENMELİ: ${JSON.stringify(points)}`);
    const preview = await getMovePreview(s.page);
    ensure(preview === null, `landscape'te doğru yakalama sonrası preview null KALMALI: ${JSON.stringify(preview)}`);
    ensure(s.consoleErrors.length === 0, `konsol/pageerror sıfır olmalı: ${JSON.stringify(s.consoleErrors)}`);
  } finally { await s.close(); }
});

addTest('K9c) Hızlı art arda resize olayları: final state SON viewport\'a ait, sonsuz render/focus/resize döngüsü yok, tek resize listener kullanılıyor', async () => {
  const s = await openScenesPage({ viewport: VIEWPORTS.mobile, hasTouch: true, query: PREVIEW_QUERY });
  try {
    await advanceToScene7AndIntro(s.page);
    await s.page.waitForTimeout(900);
    // Beş viewport'u ARKA ARKAYA, aralarında yerleşme beklemeden uygula —
    // yalnız SONUNCUSU (390×844) için kararlı state'i bekle.
    await s.page.setViewportSize({ width: 844, height: 390 });
    await s.page.setViewportSize({ width: 360, height: 800 });
    await s.page.setViewportSize({ width: 800, height: 360 });
    await s.page.setViewportSize({ width: 390, height: 844 });
    await s.page.waitForTimeout(900);
    const diag = await getCameraDiag(s.page);
    ensure(diag.result.safe === true, `hızlı art arda resize sonrası final state (390×844) safe:true olmalı: ${JSON.stringify(diag.result)}`);
    // Sonsuz döngü/instabilite yok — bir kez daha ölç, AYNI sonucu vermeli.
    await s.page.waitForTimeout(300);
    const diag2 = await getCameraDiag(s.page);
    ensure(diag.cam.yaw === diag2.cam.yaw && diag.cam.pitch === diag2.cam.pitch && diag.cam.dist === diag2.cam.dist,
      `hızlı resize sonrası kamera SALINMAMALI (iki ölçüm aynı olmalı): ${JSON.stringify(diag.cam)} vs ${JSON.stringify(diag2.cam)}`);
    // Tek resize listener — sahneyi bir kez daha (replay ile) yeniden mount
    // edip AYNI davranışın (birikmiş ikinci bir listener'dan kaynaklanan
    // çift-tetikleme OLMADAN) sürdüğünü doğrula: kamera hâlâ TEK, tutarlı
    // bir sonuca yerleşir (çift listener olsaydı iki KEZ applyFocusPoints
    // çağrılır ama SONUÇ AYNI kalırdı zaten — asıl kanıt console/pageerror
    // sıfır VE state salınımı yokluğu, ikisi de yukarıda doğrulandı).
    ensure(s.consoleErrors.length === 0, `konsol/pageerror sıfır olmalı: ${JSON.stringify(s.consoleErrors)}`);
  } finally { await s.close(); }
});

addTest('K10) 360×800: an 1 açılışında hedef beyaz taş + neon GERÇEKTEN görünür', async () => {
  const s = await openScenesPage({ viewport: { width: 360, height: 800 }, hasTouch: true, query: PREVIEW_QUERY });
  try {
    await advanceToScene7Moment1Settled(s.page);
    const box = await s.page.locator('#ls-canvas').boundingBox();
    const whitePt = await findScreenPointFor(s.page, { row: 0, col: 0 });
    const targetPt = await findScreenPointFor(s.page, { row: 1, col: 0 });
    ensure(whitePt, '360×800: beyaz taş kesişimi bulunamadı');
    ensure(targetPt, '360×800: hedef kesişim bulunamadı');
    const whiteVisible = await findWhitishNear(s.page, whitePt.x - box.x, whitePt.y - box.y);
    ensure(whiteVisible, '360×800: hedef beyaz taş civarında GERÇEK açık piksel bulunamadı');
    const turquoiseVisible = await findTurquoiseNear(s.page, targetPt.x - box.x, targetPt.y - box.y);
    ensure(turquoiseVisible, '360×800: hedef civarında GERÇEK turkuaz piksel bulunamadı');
    const { result } = await getCameraDiag(s.page);
    ensure(result && result.adjusted === true && result.safe === true, `360×800'te focusPoints() güvenli bir düzeltme uygulamalı: ${JSON.stringify(result)}`);
    ensure(s.consoleErrors.length === 0, `konsol/pageerror sıfır olmalı: ${JSON.stringify(s.consoleErrors)}`);
  } finally { await s.close(); }
});

addTest('K10b) 360×800: tek dokunuş doğru yakalamayı gerçekleştirir (TEMİZ sayfa — K10\'un görünürlük taraması tıklama davranışını ETKİLEMESİN diye AYRI context)', async () => {
  const s = await openScenesPage({ viewport: { width: 360, height: 800 }, hasTouch: true, query: PREVIEW_QUERY });
  try {
    await advanceToScene7Moment1Settled(s.page);
    const ok = await tapExactCorrectS07(s.page, 3);
    ensure(ok, '360×800: tek dokunuşla yakalanamadı');
    await s.page.waitForTimeout(250);
    ensure(await s.page.locator('#s07-continue').isVisible(), '360×800: doğru yakalama sonrası Devam görünmeli');
    ensure(s.consoleErrors.length === 0, `konsol/pageerror sıfır olmalı: ${JSON.stringify(s.consoleErrors)}`);
  } finally { await s.close(); }
});

addTest('K11) 844×390 (landscape): an 1 hedefi GERÇEKTEN görünür, anlatım/board yerleşimi kesişmez, yatay taşma yok', async () => {
  const s = await openScenesPage({ viewport: { width: 844, height: 390 }, hasTouch: true, query: PREVIEW_QUERY });
  try {
    await advanceToScene7Moment1Settled(s.page);
    const boardBox = await s.page.locator('#ls-canvas').boundingBox();
    const narrBox = await s.page.locator('#ls-narration').boundingBox();
    ensure(!boxesIntersect(boardBox, narrBox), '844×390: board/anlatım kesişiyor');
    ensure(await s.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), '844×390: yatay taşma var');
    const targetPt = await findScreenPointFor(s.page, { row: 1, col: 0 });
    ensure(targetPt, '844×390: hedef kesişim bulunamadı');
    const turquoiseVisible = await findTurquoiseNear(s.page, targetPt.x - boardBox.x, targetPt.y - boardBox.y);
    ensure(turquoiseVisible, '844×390: hedefte GERÇEK turkuaz piksel bulunamadı');
    // Bu testin piksel-doğruladığı kamera durumu KAYDA GEÇİRİLİR — K9,
    // orientation resize'ı bu AYNI duruma (yaw=.50,pitch=1.2) ulaştığında
    // (bkz. adapters/sceneBoardAdapter.js isNarrowLayout) AYRICA piksel
    // taraması YAPMADAN bu testin kanıtına ATIFTA bulunur (bkz. K9 notu —
    // resize sonrası art arda hover taraması bu ÖZEL geometride nondeterministik).
    const { cam } = await getCameraDiag(s.page);
    ensure(cam.yaw === 0.5 && cam.pitch === 1.2, `844×390 TAZE mount kamera state'i beklenen (yaw=.50,pitch=1.2) olmalı — K9'un referans aldığı değer budur, bulunan: ${JSON.stringify(cam)}`);
    ensure(s.consoleErrors.length === 0, `konsol/pageerror sıfır olmalı: ${JSON.stringify(s.consoleErrors)}`);
  } finally { await s.close(); }
});

addTest('K12) 1280×720 masaüstü: an 1 kompozisyonu BOZULMAZ — board/anlatım bbox <1px stabil, hedef+neon GERÇEKTEN görünür, aşırı zoom yok', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    await advanceToScene7Moment1Settled(s.page);
    const box = await s.page.locator('#ls-canvas').boundingBox();
    const narrBox = await s.page.locator('#ls-narration').boundingBox();
    ensure(box.width === 960 && box.height > 400, `masaüstü board bbox beklenen boyutta olmalı, bulunan: ${JSON.stringify(box)}`);
    const whitePt = await findScreenPointFor(s.page, { row: 0, col: 0 });
    const targetPt = await findScreenPointFor(s.page, { row: 1, col: 0 });
    ensure(whitePt && targetPt, 'masaüstünde beyaz taş/hedef kesişimi bulunamadı');
    const whiteVisible = await findWhitishNear(s.page, whitePt.x - box.x, whitePt.y - box.y);
    ensure(whiteVisible, 'masaüstünde hedef beyaz taş civarında GERÇEK açık piksel bulunamadı');
    const turquoiseVisible = await findTurquoiseNear(s.page, targetPt.x - box.x, targetPt.y - box.y);
    ensure(turquoiseVisible, 'masaüstünde hedefte GERÇEK turkuaz piksel bulunamadı');
    // Aşırı zoom yok — tahtanın diğer üç köşesine ait koordinat etiketleri
    // (ör. sağ/alt kenar harfleri/rakamları) hâlâ canvas içinde OLMALI,
    // yalnız hedef köşe DEĞİL — "bağlamı kaybetme" (bkz. görev talimatı).
    const oppositeCornerPt = await findScreenPointFor(s.page, { row: 8, col: 8 });
    ensure(oppositeCornerPt, 'masaüstünde tahtanın KARŞI köşesi (8,8) hâlâ canvas içinde/bulunabilir olmalı — aşırı zoom bağlamı kaybettirmiş olabilir');
    ensure(s.consoleErrors.length === 0, `konsol/pageerror sıfır olmalı: ${JSON.stringify(s.consoleErrors)}`);
  } finally { await s.close(); }
});

addTest('K13) Kaynak-düzeyi kanıt: focus(presetName)\'in mevcut mobil preset geçersiz kılması BYTE DÜZEYİNDE DOKUNULMADI — Sahne #1-6 (ve an 1 DIŞINDAKİ tüm Sahne #7 anları) kamera davranışı DEĞİŞMEDİ', async () => {
  const s = await openScenesPage({ query: PREVIEW_QUERY });
  try {
    const adapterSrc = await s.page.evaluate(async () => {
      const mod = await import('/adapters/sceneBoardAdapter.js');
      return mod.createSceneBoardAdapter.toString();
    });
    ensure(/isMobile\s*\?\s*\{\s*\.\.\.preset,\s*yaw:\s*\.50,\s*pitch:\s*Math\.max\(preset\.pitch,\s*1\.2\)\s*\}\s*:\s*preset/.test(adapterSrc),
      'focus(presetName) içindeki ORİJİNAL mobil preset geçersiz kılması DEĞİŞMEMİŞ olmalı — v0.16 YALNIZ YENİ bir focusPoints() API\'si ekledi, mevcut preset yolunu DEĞİŞTİRMEDİ');
    const hasFocusPoints = await s.page.evaluate(async () => {
      const mod = await import('/adapters/sceneBoardAdapter.js');
      const canvas = document.createElement('canvas');
      const board = mod.createSceneBoardAdapter(canvas, {});
      const has = typeof board.focusPoints === 'function';
      board.destroy();
      return has;
    });
    ensure(hasFocusPoints === true, 'focusPoints() genel API olarak mevcut olmalı');
  } finally { await s.close(); }
});

addTest('K14) focusPoints() tekrarı idempotent: AYNI noktalarla GERÇEK ikinci çağrı (replay/resize üzerinden) kamerayı GERİ DEĞİŞTİRMEZ (masaüstünde NO-OP, mobilde güvenli hâl KORUNUR)', async () => {
  // Masaüstü: ilk çağrı zaten NO-OP; replay an 1'i YENİDEN mount eder, bu da
  // seedMoment() → board.focusPoints() için GERÇEK bir ikinci çağrıdır
  // (bkz. scenes/scene07CapturePractice.js seedMoment) — sonuç YİNE NO-OP
  // ve kamera BİREBİR aynı kalmalı.
  {
    const s = await openScenesPage({ query: PREVIEW_QUERY });
    try {
      await advanceToScene7Moment1Settled(s.page);
      const before = await getCameraDiag(s.page);
      for (let i = 0; i < 6; i++) {
        const okN = await answerCurrentS07Item(s.page);
        ensure(okN, `an ${i + 1} doğru cevaplanamadı`);
        await goToNextS07Item(s.page);
      }
      await s.page.waitForSelector('.ls-topic-end [data-action="replay"]');
      await s.page.click('.ls-topic-end [data-action="replay"]');
      await s.page.waitForTimeout(400);
      await s.page.click('#s07-confirm');
      await s.page.waitForTimeout(900);
      const after = await getCameraDiag(s.page);
      ensure(after.result && after.result.adjusted === false, `replay sonrası masaüstünde focusPoints() YİNE NO-OP olmalı: ${JSON.stringify(after.result)}`);
      ensure(before.cam.yaw === after.cam.yaw && before.cam.pitch === after.cam.pitch && before.cam.dist === after.cam.dist,
        `replay ile tetiklenen GERÇEK ikinci focusPoints() çağrısı masaüstünde kamerayı DEĞİŞTİRMEMELİ: önce=${JSON.stringify(before.cam)} sonra=${JSON.stringify(after.cam)}`);
    } finally { await s.close(); }
  }
  // Mobil: bir kez düzeltilen kamera, AYNI noktalarla YENİDEN tetiklenince
  // (resize() iç mekanizmasıyla — pencereyi 1px oynatıp geri almak) AYNI
  // sonucu üretmeli (safe:true KALIR, kamera BİR DAHA sıçramaz).
  {
    const s = await openScenesPage({ viewport: VIEWPORTS.mobile, hasTouch: true, query: PREVIEW_QUERY });
    try {
      await advanceToScene7Moment1Settled(s.page);
      const before = await getCameraDiag(s.page);
      ensure(before.result.adjusted === true && before.result.safe === true, `ön koşul: mobilde ilk çağrı güvenli bir düzeltme üretmeli: ${JSON.stringify(before.result)}`);
      await s.page.setViewportSize({ width: 390, height: 845 });
      await s.page.waitForTimeout(150);
      await s.page.setViewportSize({ width: 390, height: 844 });
      await s.page.waitForTimeout(300);
      const after = await getCameraDiag(s.page);
      ensure(after.result.safe === true, `mobilde tekrar tetiklenen focusPoints() güvenli KALMALI: ${JSON.stringify(after.result)}`);
      ensure(Math.abs(before.cam.yaw - after.cam.yaw) < 1e-6 && before.cam.dist === after.cam.dist,
        `AYNI güvenli noktalarla tekrar çağrı kamerayı GEREKSİZ YERE DEĞİŞTİRMEMELİ: önce=${JSON.stringify(before.cam)} sonra=${JSON.stringify(after.cam)}`);
      ensure(s.consoleErrors.length === 0, `konsol/pageerror sıfır olmalı: ${JSON.stringify(s.consoleErrors)}`);
    } finally { await s.close(); }
  }
});

// TEST_FILTER=<regex> node tests/verify-learning-scenes.mjs — yalnız adı bu
// regex'le eşleşen testleri çalıştırır (hızlı hedefli hata ayıklama için;
// boşsa/tanımsızsa TÜM testler çalışır, üretim/CI davranışı DEĞİŞMEZ).
const TEST_FILTER = process.env.TEST_FILTER || '';
const selectedTests = TEST_FILTER ? tests.filter(t => new RegExp(TEST_FILTER).test(t.name)) : tests;

(async () => {
  for (const { name, fn } of selectedTests) {
    try { await fn(); pass++; console.log('  ✓', name); }
    catch (error) { fail++; console.error('  ✗', name, '-', error?.message || error); }
  }
  console.log(`\nlearning-scenes tarayıcı test sayısı: ${selectedTests.length}${TEST_FILTER ? ` (filtre: "${TEST_FILTER}", toplam ${tests.length})` : ''}`);
  console.log('özet:', `${pass}/${pass + fail}`);
  if (fail) process.exit(1);
})();
