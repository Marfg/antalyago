/**
 * Playwright ile robot.html KataGo entegrasyon testi.
 * page.route() ile dosya sistemi sunucusu olarak çalışır.
 */
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'http://antalyago.test';

function mime(fp) {
  const ext = path.extname(fp).toLowerCase();
  return { '.html':'text/html', '.js':'application/javascript',
           '.json':'application/json', '.bin':'application/octet-stream',
           '.css':'text/css', '.png':'image/png', '.svg':'image/svg+xml' }[ext]
         ?? 'text/plain';
}

const logs     = [];
const errors   = [];
const consoleW = [];
let   moveReceived = false;
let   kataStatus   = 'pending'; // 'ready' | 'failed'

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx     = await browser.newContext();

  // Yerel dosyaları sun
  await ctx.route(`${BASE}/**`, async route => {
    const url  = new URL(route.request().url());
    const file = path.join(ROOT, url.pathname);
    try {
      const body = fs.readFileSync(file);
      await route.fulfill({ status: 200, contentType: mime(file), body });
    } catch {
      await route.continue(); // CDN vs. dışarıdan yüklenecek
    }
  });

  const page = await ctx.newPage();

  // Console yakalamak
  page.on('console', msg => {
    const txt = `[${msg.type()}] ${msg.text()}`;
    if (msg.type() === 'error') errors.push(txt);
    else if (msg.type() === 'warning') consoleW.push(txt);
    else logs.push(txt);
  });
  page.on('pageerror', err => errors.push(`[pageerror] ${err.message}`));

  console.log('▶  Sayfa yükleniyor...');
  await page.goto(`${BASE}/robot.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });

  // Feedback elementini izle
  const fbEl = page.locator('#feedback');

  // 1. "KataGo yükleniyor" görünüyor mu?
  await page.waitForSelector('#feedback.show', { timeout: 5000 }).catch(() => {});
  const fb1 = await fbEl.textContent().catch(() => '');
  console.log(`   feedback başlangıç: "${fb1}"`);

  // 2. KataGo hazır olana YA DA MCTS devreye girene kadar bekle (max 45s)
  let kataMsg = '';
  try {
    await page.waitForFunction(() => {
      const el = document.getElementById('feedback');
      if (!el) return false;
      const txt = el.textContent || '';
      return txt.includes('KataGo hazır') || txt.includes('MCTS') || txt.includes('yüklenemedi');
    }, { timeout: 45000 });
    kataMsg = await fbEl.textContent().catch(() => '');
    kataStatus = kataMsg.includes('hazır') ? 'ready' : 'failed';
  } catch {
    kataMsg = '(zaman aşımı — yükleme devam ediyor)';
    kataStatus = 'timeout';
  }
  console.log(`   KataGo durum: ${kataStatus} — "${kataMsg}"`);

  // iter-lbl kontrolü
  const iterLbl = await page.locator('#iter-lbl').textContent().catch(() => '?');
  console.log(`   #iter-lbl: "${iterLbl}"`);

  // 3. Bir hamle yap — tahtanın ortasına tıkla
  console.log('▶  Hamle yapılıyor (canvas tıklaması)...');
  const canvas = page.locator('#c');
  const box    = await canvas.boundingBox();
  if (box) {
    // Önce beyaz renk seç (AI siyah oynasın ki hemen yanıt versin)
    await page.click('#cp-b'); // siyah seç
    await page.waitForTimeout(300);
    // Tahtanın merkezine tıkla
    await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
    console.log(`   Canvas tıklandı (${(box.width/2).toFixed(0)}, ${(box.height/2).toFixed(0)})`);
  }

  // 4. Robot yanıtını bekle (max 15s)
  try {
    await page.waitForFunction(() => {
      const el = document.getElementById('last-move-tag');
      return el && el.textContent.includes('Robot:');
    }, { timeout: 15000 });
    const moveTag = await page.locator('#last-move-tag').textContent();
    console.log(`   ✅ Robot hamlesi: "${moveTag}"`);
    moveReceived = true;
  } catch {
    const moveTag = await page.locator('#last-move-tag').textContent().catch(() => '—');
    console.log(`   ❌ Robot hamlesi beklendi ama gelmedi. Son tag: "${moveTag}"`);
  }

  // 5. move-count artmış mı?
  const mc = await page.locator('#move-count').textContent().catch(() => '0');
  console.log(`   move-count: ${mc}`);

  // 6. Console hataları
  if (errors.length) {
    console.log('\n   Console HATALAR:');
    errors.slice(0, 10).forEach(e => console.log('   ', e));
  }
  if (consoleW.length) {
    console.log('\n   Console uyarılar:');
    consoleW.slice(0, 5).forEach(w => console.log('   ', w));
  }

  // Ekran görüntüsü
  const shot = path.join(ROOT, 'tests', 'robot-verify.png');
  await page.screenshot({ path: shot, fullPage: false });
  console.log(`\n   Ekran görüntüsü: ${shot}`);

  await browser.close();

  // Özet
  console.log('\n══ SONUÇ ═══════════════════════════════');
  console.log(`   KataGo durumu : ${kataStatus}`);
  console.log(`   Robot hamlesi : ${moveReceived ? '✅ ALINDI' : '❌ GELMEDİ'}`);
  console.log(`   iter-lbl      : ${iterLbl}`);
  console.log(`   Hata sayısı   : ${errors.length}`);
  console.log('═══════════════════════════════════════');

  process.exit(moveReceived ? 0 : 1);
})();
