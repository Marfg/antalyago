/**
 * tests/verify-learning-scenes.mjs
 * node tests/verify-learning-scenes.mjs
 *
 * learning-scenes.html + Sahne #1 için gerçek tarayıcı doğrulaması.
 * tests/verify-learning-ui.mjs'in AYNI (context.route ile yerel dosya
 * sunma, gerçek ağ sunucusu gerektirmeyen) deseniyle.
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
  mobile: { width: 390, height: 844 },
};

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

async function openScenesPage({ viewport = VIEWPORTS.desktop, reducedMotion = 'no-preference' } = {}) {
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
  await page.goto(`${BASE}/${PAGE}`, { waitUntil: 'networkidle' });
  return {
    browser, context, page, consoleErrors,
    async close() { await context.close().catch(() => {}); await browser.close().catch(() => {}); },
  };
}

async function confirmIntro(page) {
  await page.waitForSelector('#s01-confirm');
  await page.click('#s01-confirm');
  await page.waitForTimeout(280);
}
async function exploreAllSizes(page) {
  for (const size of [9, 13, 19]) {
    await page.click(`.s01-card[data-size="${size}"]`);
    await page.waitForTimeout(80);
  }
}

addTest('1) sayfa açılıyor, Sahne #1 otomatik başlıyor', async () => {
  const s = await openScenesPage();
  try {
    ensure(await s.page.locator('#s01-intro').isVisible(), 'onboarding kartı görünmüyor');
    ensure((await s.page.locator('#s01-intro-text').textContent())?.includes('19'), 'bilgi kartı metni yanlış');
  } finally { await s.close(); }
});

addTest('"Anladım" görünür metni artık yok, erişilebilir tick button doğru adla mevcut', async () => {
  const s = await openScenesPage();
  try {
    const bodyText = await s.page.locator('#ls-info-region').textContent();
    ensure(!bodyText.includes('Anladım'), '"Anladım" metni hâlâ görünüyor');
    const tick = s.page.locator('#s01-confirm');
    ensure(await tick.evaluate(el => el.tagName === 'BUTTON'), 'tick gerçek bir <button> değil');
    ensure(await tick.evaluate(el => el.classList.contains('s01-tick')), 'tick sınıfı eksik');
    ensure((await tick.getAttribute('aria-label')) === 'Bilgiyi onayla', 'aria-label yanlış');
    ensure((await tick.textContent())?.trim() === '', 'tick görünür metin İÇERMEMELİ (yalnız ikon+aria-label)');
    ensure(await s.page.locator('#s01-confirm .s01-tick-icon').count() === 1, 'görünür ✓ ikonu yok');
  } finally { await s.close(); }
});

addTest('tick mouse ile çalışıyor', async () => {
  const s = await openScenesPage();
  try {
    await s.page.click('#s01-confirm');
    await s.page.waitForTimeout(280);
    ensure(await s.page.locator('#s01-intro').isHidden(), 'mouse tıklaması kartı kapatmadı');
    ensure(await s.page.locator('#s01-explore').isVisible(), 'mouse tıklaması sonrası keşif paneli açılmadı');
  } finally { await s.close(); }
});

addTest('tick klavyeyle çalışıyor (Tab + Enter/Space)', async () => {
  const s = await openScenesPage();
  try {
    await s.page.locator('#s01-confirm').focus();
    ensure(await s.page.evaluate(() => document.activeElement?.id) === 's01-confirm', 'tick focus alamadı');
    await s.page.keyboard.press('Enter');
    await s.page.waitForTimeout(280);
    ensure(await s.page.locator('#s01-intro').isHidden(), 'Enter ile tick tetiklenmedi');
  } finally { await s.close(); }
});

addTest('scene_intro_confirmed hızlı/tekrarlı tetiklemede bile YALNIZ BİR KEZ üretiliyor', async () => {
  const s = await openScenesPage();
  try {
    // Kapanış animasyonu sürerken tekrar tekrar tıkla — kilit bunu engellemeli.
    await s.page.click('#s01-confirm');
    await s.page.click('#s01-confirm').catch(() => {});
    await s.page.keyboard.press('Enter').catch(() => {});
    await s.page.waitForTimeout(300);
    const types = await s.page.evaluate(() => {
      try { return JSON.parse(localStorage.getItem('go_teacher_event_log_v1') || '[]').map(e => e.type); }
      catch { return []; }
    });
    ensure(types.filter(t => t === 'scene_intro_confirmed').length === 1, 'scene_intro_confirmed birden fazla üretildi');
  } finally { await s.close(); }
});

addTest('animasyon sonunda kart erişilebilir ağaçtan doğru biçimde kaldırılıyor (hidden attribute)', async () => {
  const s = await openScenesPage();
  try {
    await confirmIntro(s.page);
    const introHiddenAttr = await s.page.locator('#s01-intro').evaluate(el => el.hidden);
    ensure(introHiddenAttr === true, 'kart hidden özniteliğiyle kaldırılmadı (yalnız CSS ile gizlenmiş olabilir)');
  } finally { await s.close(); }
});

addTest('2) yalnız gerekli UI görünüyor — eski ogren-3d.html elemanları/globalleri YOK', async () => {
  const s = await openScenesPage();
  try {
    const oldGlobals = await s.page.evaluate(() => ({
      nextStep: typeof window.nextStep,
      CUR_STEP_DATA: typeof window.CUR_STEP_DATA,
      setBoardSize: typeof window.setBoardSize,
    }));
    ensure(oldGlobals.nextStep === 'undefined', 'eski window.nextStep sızmış');
    ensure(oldGlobals.CUR_STEP_DATA === 'undefined', 'eski window.CUR_STEP_DATA sızmış');
    ensure(oldGlobals.setBoardSize === 'undefined', 'eski window.setBoardSize sızmış');
    const hasOldChrome = await s.page.locator('#nav-bar, #sidebar, #tp-tab, #hint, #board-picker').count();
    ensure(hasOldChrome === 0, 'ogren-3d.html\'e özgü DOM elemanları yeni sayfada bulundu');
  } finally { await s.close(); }
});

addTest('3) bilgi kartı onay sonrası geçişli kapanıyor, odak taşınıyor', async () => {
  const s = await openScenesPage();
  try {
    await confirmIntro(s.page);
    ensure(await s.page.locator('#s01-intro').isHidden(), 'kart kapanmadı');
    ensure(await s.page.locator('#s01-explore').isVisible(), 'keşif paneli açılmadı');
    const focusedClass = await s.page.evaluate(() => document.activeElement?.className || '');
    ensure(focusedClass.includes('s01-card'), 'odak keşif kartına taşınmadı');
  } finally { await s.close(); }
});

addTest('4) 19×19 başlangıçta gerçek board size, onay sonrası yalnız BİR KEZ görülmüş sayılıyor', async () => {
  const s = await openScenesPage();
  try {
    await confirmIntro(s.page);
    ensure(await s.page.locator('.s01-card[data-size="19"]').getAttribute('aria-pressed') === 'true', '19 varsayılan seçili değil');
    ensure(await s.page.locator('.s01-card[data-size="19"]').evaluate(el => el.classList.contains('seen')), '19 otomatik görülmüş sayılmadı');
    ensure((await s.page.locator('#s01-progress-text').textContent())?.trim() === '1/3 tahta keşfedildi', 'başlangıç ilerlemesi yanlış');
    // Aynı karta tekrar basmak ilerlemeyi ikinci kez artırmamalı.
    await s.page.click('.s01-card[data-size="19"]');
    await s.page.waitForTimeout(100);
    ensure((await s.page.locator('#s01-progress-text').textContent())?.trim() === '1/3 tahta keşfedildi', '19\'a tekrar basmak ilerlemeyi artırdı');
  } finally { await s.close(); }
});

addTest('5-7) 9×9/13×13 seçimi gerçek tahtayı değiştirir, açıklama günceller', async () => {
  const s = await openScenesPage();
  try {
    await confirmIntro(s.page);
    await s.page.click('.s01-card[data-size="9"]');
    await s.page.waitForTimeout(100);
    ensure(await s.page.locator('.s01-card[data-size="9"]').getAttribute('aria-pressed') === 'true', '9 seçilmedi');
    ensure((await s.page.locator('#s01-desc').textContent())?.includes('kesişim'), '9×9 açıklaması yanlış');
    await s.page.click('.s01-card[data-size="13"]');
    await s.page.waitForTimeout(100);
    ensure((await s.page.locator('#s01-desc').textContent())?.includes('genişler'), '13×13 açıklaması yanlış');
    await s.page.click('.s01-card[data-size="19"]');
    await s.page.waitForTimeout(100);
    ensure((await s.page.locator('#s01-desc').textContent())?.includes('Profesyonel'), '19×19\'a dönüş çalışmadı');
  } finally { await s.close(); }
});

addTest('10-13) üç boyut görülmeden devam edilemiyor, neden erişilebilir, üçünde completion açılıyor', async () => {
  const s = await openScenesPage();
  try {
    await confirmIntro(s.page);
    const continueBtn = s.page.locator('#s01-continue');
    ensure(await continueBtn.isDisabled(), 'başlangıçta Devam et aktif olmamalı');
    const describedBy = await continueBtn.getAttribute('aria-describedby');
    ensure(!!describedBy, 'aria-describedby yok');
    ensure(((await s.page.locator(`#${describedBy}`).textContent()) || '').trim().length > 0, 'devre dışı nedeni boş');
    await s.page.click('.s01-card[data-size="9"]');
    await s.page.waitForTimeout(80);
    ensure(await continueBtn.isDisabled(), 'iki boyutta hâlâ devre dışı olmalı');
    await s.page.click('.s01-card[data-size="13"]');
    await s.page.waitForTimeout(80);
    ensure(!(await continueBtn.isDisabled()), 'üç boyut sonrası Devam et açılmadı');
    ensure((await s.page.locator('#s01-continue-reason').textContent())?.includes('tanıdın'), 'başarı metni görünmüyor');
  } finally { await s.close(); }
});

addTest('9,14) klavye ile tahta seçimi çalışıyor, aria-pressed doğru', async () => {
  const s = await openScenesPage();
  try {
    await confirmIntro(s.page);
    await s.page.locator('.s01-card[data-size="9"]').focus();
    await s.page.keyboard.press('Enter');
    await s.page.waitForTimeout(100);
    ensure(await s.page.locator('.s01-card[data-size="9"]').getAttribute('aria-pressed') === 'true', 'Enter ile seçim çalışmadı');
  } finally { await s.close(); }
});

addTest('completion: scene runtime üzerinden tamamlanıyor, eski sayfaya OTOMATİK geçiş yok, güvenli final durum gösteriliyor', async () => {
  const s = await openScenesPage();
  try {
    await confirmIntro(s.page);
    await exploreAllSizes(s.page);
    await s.page.click('#s01-continue');
    await s.page.waitForTimeout(300);
    ensure(await s.page.locator('#ls-final').evaluate(el => el.classList.contains('show')), 'final durum gösterilmedi');
    ensure(s.page.url().includes('learning-scenes.html'), 'sayfa otomatik olarak başka bir URL\'ye yönlendi');
    ensure(await s.page.locator('#s01-intro, #s01-explore').count() === 0, 'sahne unmount edilmemiş (DOM hâlâ duruyor)');
  } finally { await s.close(); }
});

addTest('completion event\'i YALNIZ BİR KEZ üretiliyor, scene progress doğru anahtara yazılıyor, eski go_done_3d değişmiyor', async () => {
  const s = await openScenesPage();
  try {
    await s.page.evaluate(() => { try { localStorage.setItem('go_done_3d', JSON.stringify(['l5'])); } catch {} });
    await confirmIntro(s.page);
    await exploreAllSizes(s.page);
    await s.page.click('#s01-continue');
    await s.page.waitForTimeout(300);
    const info = await s.page.evaluate(() => {
      const events = JSON.parse(localStorage.getItem('go_teacher_event_log_v1') || '[]');
      return {
        types: events.map(e => e.type),
        sceneProgress: JSON.parse(localStorage.getItem('go_scene_progress_v1') || 'null'),
        legacyDone: JSON.parse(localStorage.getItem('go_done_3d') || 'null'),
      };
    });
    ensure(info.types.includes('scene_started'), 'scene_started yok');
    ensure(info.types.includes('scene_intro_confirmed'), 'scene_intro_confirmed yok');
    ensure(info.types.includes('scene_board_size_viewed'), 'scene_board_size_viewed yok');
    ensure(info.types.includes('scene_completion_unlocked'), 'scene_completion_unlocked yok');
    ensure(info.types.includes('scene_completed'), 'scene_completed yok');
    ensure(info.types.filter(t => t === 'scene_completed').length === 1, 'scene_completed birden fazla üretildi');
    ensure(info.sceneProgress?.completedSceneIds?.includes('scene-01-board-intro'), 'yeni scene progress anahtarına yazılmadı');
    ensure(JSON.stringify(info.legacyDone) === JSON.stringify(['l5']), 'eski go_done_3d anahtarı DEĞİŞMİŞ olmamalı');
  } finally { await s.close(); }
});

addTest('reload: sahne tamamlanmışsa ve sonraki sahne yoksa tekrar oynatılmıyor, doğrudan final durum gösteriliyor', async () => {
  const s = await openScenesPage();
  try {
    await confirmIntro(s.page);
    await exploreAllSizes(s.page);
    await s.page.click('#s01-continue');
    await s.page.waitForTimeout(300);
    await s.page.reload({ waitUntil: 'networkidle' });
    await s.page.waitForTimeout(300);
    ensure(await s.page.locator('#ls-final').evaluate(el => el.classList.contains('show')), 'reload sonrası final durum gösterilmedi');
    ensure(await s.page.locator('#s01-intro').count() === 0, 'reload sonrası onboarding kartı tekrar oluşturuldu');
  } finally { await s.close(); }
});

addTest('reduced-motion: kart geçişi transition kaldırıyor', async () => {
  const s = await openScenesPage({ reducedMotion: 'reduce' });
  try {
    const transition = await s.page.locator('.s01-intro-card').evaluate(el => getComputedStyle(el).transitionDuration);
    ensure(transition === '0s' || transition.startsWith('0s'), `reduced-motion'da transition kalkmamış: ${transition}`);
    await confirmIntro(s.page);
    ensure(await s.page.locator('#s01-explore').isVisible(), 'reduced-motion\'da onay sonrası keşif paneli görünmüyor');
  } finally { await s.close(); }
});

addTest('mobil: yatay taşma yok, kontroller dokunulabilir boyutta, tahta viewport dışına çıkmıyor', async () => {
  const s = await openScenesPage({ viewport: VIEWPORTS.mobile });
  try {
    ensure((await s.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)), 'mobilde yatay taşma var');
    const canvasBox = await s.page.locator('#ls-canvas').boundingBox();
    ensure(canvasBox && canvasBox.width <= VIEWPORTS.mobile.width + 1, 'tahta viewport dışına taşıyor');
    await confirmIntro(s.page);
    const exploreBox = await s.page.locator('#s01-explore').boundingBox();
    ensure(exploreBox && exploreBox.width <= VIEWPORTS.mobile.width + 1, 'keşif paneli mobilde taşıyor');
    await exploreAllSizes(s.page);
    const continueBox = await s.page.locator('#s01-continue').boundingBox();
    ensure(continueBox && continueBox.height >= 40, 'Devam et düğmesi dokunma hedefi için çok küçük');
  } finally { await s.close(); }
});

function boxesIntersect(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

addTest('masaüstü: board ve bilgi alanı bounding box\'ları KESİŞMİYOR, board yan tarafta daha geniş', async () => {
  const s = await openScenesPage({ viewport: VIEWPORTS.desktop });
  try {
    const boardBox = await s.page.locator('#ls-board-region').boundingBox();
    const infoBox = await s.page.locator('#ls-info-region').boundingBox();
    ensure(boardBox && infoBox, 'bbox eksik');
    ensure(!boxesIntersect(boardBox, infoBox), 'masaüstünde board ve bilgi alanı KESİŞİYOR');
    ensure(boardBox.width > infoBox.width, 'board bilgi alanından daha geniş olmalı (ana görsel odak)');
    await confirmIntro(s.page);
    const boardBoxAfter = await s.page.locator('#ls-board-region').boundingBox();
    ensure(Math.abs(boardBoxAfter.width - boardBox.width) < 1 && Math.abs(boardBoxAfter.height - boardBox.height) < 1,
      'kart onaylanınca board bölgesi boyut değiştirdi (layout shift)');
    const exploreBox = await s.page.locator('#s01-explore').boundingBox();
    ensure(!boxesIntersect(boardBox, exploreBox), 'keşif paneli açıldıktan sonra board ile kesişiyor');
  } finally { await s.close(); }
});

addTest('mobil: bilgi alanı board\'un ALTINA geçiyor, bbox\'lar kesişmiyor', async () => {
  const s = await openScenesPage({ viewport: VIEWPORTS.mobile });
  try {
    const boardBox = await s.page.locator('#ls-board-region').boundingBox();
    const infoBox = await s.page.locator('#ls-info-region').boundingBox();
    ensure(boardBox && infoBox, 'bbox eksik');
    ensure(!boxesIntersect(boardBox, infoBox), 'mobilde board ve bilgi alanı KESİŞİYOR');
    ensure(infoBox.y >= boardBox.y + boardBox.height - 1, 'bilgi alanı board\'un altında değil');
    const boardHeightBefore = boardBox.height;
    await confirmIntro(s.page);
    const boardBoxAfter = await s.page.locator('#ls-board-region').boundingBox();
    ensure(Math.abs(boardBoxAfter.height - boardHeightBefore) < 1, 'mobilde kart onaylanınca board zıpladı (yükseklik değişti)');
    const exploreBox = await s.page.locator('#s01-explore').boundingBox();
    ensure(!boxesIntersect(boardBoxAfter, exploreBox), 'mobilde keşif paneli board ile kesişiyor');
  } finally { await s.close(); }
});

addTest('uzun açıklama metninde de board ile bilgi alanı KESİŞMİYOR (masaüstü + mobil)', async () => {
  const longText = 'Bu, sınır durumlarını test etmek için bilerek uzatılmış çok satırlı bir açıklama metnidir. '.repeat(6);
  for (const viewport of [VIEWPORTS.desktop, VIEWPORTS.mobile]) {
    const s = await openScenesPage({ viewport });
    try {
      await confirmIntro(s.page);
      const boardBoxBefore = await s.page.locator('#ls-board-region').boundingBox();
      await s.page.evaluate((text) => {
        document.getElementById('s01-desc').textContent = text;
      }, longText);
      await s.page.waitForTimeout(80);
      const boardBox = await s.page.locator('#ls-board-region').boundingBox();
      const infoBox = await s.page.locator('#ls-info-region').boundingBox();
      ensure(!boxesIntersect(boardBox, infoBox), `uzun metinde (${viewport.width}px) board/bilgi alanı kesişiyor`);
      ensure(Math.abs(boardBox.height - boardBoxBefore.height) < 1 && Math.abs(boardBox.width - boardBoxBefore.width) < 1,
        `uzun metin board boyutunu değiştirdi (${viewport.width}px)`);
      ensure((await s.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)), `uzun metinde (${viewport.width}px) yatay taşma var`);
    } finally { await s.close(); }
  }
});

addTest('konsolda/pageerror\'da hata yok (tam akış boyunca)', async () => {
  const s = await openScenesPage();
  try {
    await confirmIntro(s.page);
    await exploreAllSizes(s.page);
    await s.page.click('#s01-continue');
    await s.page.waitForTimeout(300);
    ensure(s.consoleErrors.length === 0, `hata bulundu: ${s.consoleErrors.join(' | ')}`);
  } finally { await s.close(); }
});

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
