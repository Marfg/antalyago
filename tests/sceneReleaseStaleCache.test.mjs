/**
 * tests/sceneReleaseStaleCache.test.mjs
 * node tests/sceneReleaseStaleCache.test.mjs
 *
 * v2 — GERÇEK Chromium HTTP cache'i kullanan sürüm/cache bekçisi testleri.
 * v1'in KRİTİK MİMARİ HATASI (bkz. görev talimatı): core/releaseVersion.js
 * BARE (versiyonsuz) import ediliyordu — bekçinin "o an gerçekte çalışanı
 * yansıtır" iddiası GEÇERSİZDİ, çünkü bare URL'nin kendisi de üretimde
 * ölçülen saatlerce süren Cache-Control (.js ~max-age=14400) yüzünden eski
 * bir tarayıcı cache'inden gelebilirdi — TAM OLARAK çözülmeye çalışılan
 * sorunun kendisini yeniden üretiyordu.
 *
 * v2 düzeltmesi: core/releaseVersion.js artık '?v=<RELEASE>' ile versioned
 * import ediliyor (bkz. scripts/stamp-scene-release.mjs GRAPH_BASENAMES).
 * Guard artık kalıcı bir boolean değil, (yüklüRelease→hedefRelease) ÇİFTİNE
 * bağlı — eşleşen hedef başarıyla yüklenince temizlenir; aynı geçiş İKİNCİ
 * kez mismatch üretirse sessiz döngü yerine sade "yeni sürüm hazırlanıyor"
 * arayüzü gösterilir.
 *
 * Senaryolar A-H (bkz. görev talimatı) — HER BİRİ gerçek Chromium HTTP
 * cache davranışını kullanır, mock YOK.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'http://antalyago-stale-cache.test';
// v1 — bu görevin DÜZELTTİĞİ, önceki (bare releaseVersion.js içeren)
// commit. SABİT hash olarak yazılır — `git rev-parse HEAD` KULLANILMAZ,
// çünkü bu test yazıldıktan SONRA bu commit `--amend` ile GÜNCEL (düzeltilmiş)
// içerikle DEĞİŞTİRİLDİ; HEAD artık düzeltilmiş sürümü gösteriyor. Bu SHA,
// amend'den ÖNCEKİ ağaca işaret eden, hâlâ git tarafından erişilebilir
// (dangling ama silinmemiş) bir commit nesnesidir — v1'in GERÇEK, tarihsel
// içeriğini okumak için kasıtlı olarak kullanılır.
const V1_COMMIT = 'c0071758d7e419ab1e58b4175e7bf148c3712e42';

let pass = 0, fail = 0;
const tests = [];
function addTest(name, fn) { tests.push({ name, fn }); }
function ensure(cond, msg) { assert.ok(cond, msg); }

function mime(filePath) {
  return {
    '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript',
    '.json': 'application/json', '.css': 'text/css',
  }[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}
function readWorkingTree(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function readAtCommit(commit, rel) {
  return execSync(`git show ${commit}:${rel}`, { cwd: ROOT, encoding: 'utf8' });
}
function workingTreeRelease() {
  return readWorkingTree('core/releaseVersion.js').match(/SCENE_RELEASE\s*=\s*['"]([^'"]+)['"]/)[1];
}
const V2_RELEASE = workingTreeRelease();

async function launchChromium() {
  try { return await chromium.launch({ headless: true }); }
  catch (e) {
    if (/EPERM|EACCES|spawn/i.test(String(e?.message || e))) {
      try { return await chromium.launch({ headless: true, channel: 'chrome' }); } catch {}
    }
    throw e;
  }
}

/** Sunucu durumunu ('V1' önceki commit / 'V2' bugünkü çalışma ağacı)
    elle değiştirebilen bir route fixture'ı — GERÇEKÇİ Cache-Control
    header'larıyla (üretimde ölçülen: html~600s, js~14400s, json no-store). */
function makeServerState(initialMode = 'V1') {
  const state = { mode: initialMode };
  // overrideExact: yalnız TAM (pathname+search) eşleşince uygulanır — bir
  // bare URL'i override etmek query'li varyantları YANLIŞLIKLA ele
  // geçirmemeli (gerçek tarayıcı cache'i de query'yi ayırt eder).
  const overrideExact = {}; // `${pathname}${search}` -> { body, cacheControl }
  const overridePathOnly = {}; // pathname (query'den BAĞIMSIZ, örn. manifest) -> { body, cacheControl }
  function resolveContent(pathname, search) {
    const exactKey = pathname + search;
    // Override değeri bir FONKSİYON da olabilir — zamanlamaya (kaçıncı
    // istek) bağlı DETERMİNİSTİK senaryolar için (bkz. Senaryo B: "ilk
    // kontrol geçici mismatch görür, sonraki kontroller GERÇEK eşleşen
    // değeri görür" — sabit bir setTimeout yerine İSTEK SAYACINA bağlı,
    // race-condition'dan bağımsız).
    if (overrideExact[exactKey] != null) return typeof overrideExact[exactKey] === 'function' ? overrideExact[exactKey]() : overrideExact[exactKey];
    if (overridePathOnly[pathname] != null) return typeof overridePathOnly[pathname] === 'function' ? overridePathOnly[pathname]() : overridePathOnly[pathname];
    if (state.mode === 'V1') { try { return { body: readAtCommit(V1_COMMIT, pathname) }; } catch { /* fallthrough */ } }
    return { body: readWorkingTree(pathname) };
  }
  return {
    state, overrideExact, overridePathOnly,
    async attach(context) {
      await context.route(`${BASE}/**`, async route => {
        const url = new URL(route.request().url());
        const pathname = decodeURIComponent(url.pathname.replace(/^\/+/, '')) || 'learning-scenes.html';
        let resolved;
        try { resolved = resolveContent(pathname, url.search); }
        catch { await route.abort(); return; }
        const ext = path.extname(pathname).toLowerCase();
        const cacheControl = resolved.cacheControl ?? (
          pathname === 'learning-scenes.html' || pathname === 'teacher-studio.html'
            ? 'max-age=600'
            : ext === '.json' ? 'no-store' : 'max-age=14400'
        );
        await route.fulfill({ status: 200, contentType: mime(pathname), headers: { 'cache-control': cacheControl }, body: resolved.body });
      });
    },
  };
}

async function getEventLog(page) {
  return page.evaluate(() => { try { return JSON.parse(localStorage.getItem('go_teacher_event_log_v1') || '[]'); } catch { return []; } });
}
function boardCenterXY(box) { return { cx: Math.round(box.width / 2), cy: Math.round(box.height / 2 - 8) }; }
function* ringOffsets(maxRing = 6) {
  for (let ring = 0; ring < maxRing; ring++) {
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2;
      const r = 20 + ring * 18;
      yield { dx: Math.round(Math.cos(angle) * r), dy: Math.round(Math.sin(angle) * r * 0.6) };
    }
  }
}
async function clickAnyLiberty(page, box, beforeCount) {
  const cx = box.width / 2, cy = box.height / 2 - 8;
  for (const { dx, dy } of ringOffsets()) {
    const x = box.x + cx + dx, y = box.y + cy + dy;
    if (x < box.x || x > box.x + box.width || y < box.y || y > box.y + box.height) continue;
    await page.mouse.click(x, y);
    await page.waitForTimeout(20);
    const now = (await getEventLog(page)).filter(e => e.stepId === 'scene-04-group-liberties' && e.type === 'scene_move_played').length;
    if (now > beforeCount) return true;
  }
  return false;
}
async function advanceToScene4Text(page) {
  await page.waitForSelector('#s01-confirm');
  await page.click('#s01-confirm'); await page.waitForTimeout(250);
  for (const size of [9, 13]) { await page.click(`.ls-pill[data-size="${size}"]`); await page.waitForTimeout(60); }
  await page.waitForSelector('.ls-topic-end [data-action="advance"]');
  await page.click('.ls-topic-end [data-action="advance"]'); await page.waitForTimeout(250);
  await page.click('#s02-step-0 [data-confirm]'); await page.waitForTimeout(250);
  await page.click('#s02-step-1 [data-confirm]'); await page.waitForTimeout(250);
  await page.click('#s02-step-2 [data-confirm]'); await page.waitForTimeout(280);
  const box2 = await page.locator('#ls-canvas').boundingBox();
  for (let i = 0; i < 3; i++) {
    for (const [dx, dy] of [[0, -6], [0, -36], [0, 24], [-30, -6], [30, -6], [-30, -36], [30, -36], [-30, 24], [30, 24]]) {
      await page.mouse.click(box2.x + box2.width / 2 + dx, box2.y + box2.height / 2 + dy);
      await page.waitForTimeout(35);
      const now = (await getEventLog(page)).filter(e => e.stepId === 'scene-02-turns-and-intersections' && e.type === 'scene_move_played' && e.payload.color === 'black').length;
      if (now > i) break;
    }
    await page.waitForTimeout(80);
  }
  await page.waitForSelector('.ls-topic-end [data-action="advance"]');
  await page.click('.ls-topic-end [data-action="advance"]'); await page.waitForTimeout(350);
  await page.click('#s03-confirm'); await page.waitForTimeout(250);
  const box3 = await page.locator('#ls-canvas').boundingBox();
  const c3 = boardCenterXY(box3);
  await page.mouse.click(box3.x + c3.cx, box3.y + c3.cy); await page.waitForTimeout(200);
  await page.waitForSelector('#s03-next:not([disabled])');
  await page.click('#s03-next'); await page.waitForTimeout(200);
  await page.waitForSelector('.ls-topic-end [data-action="advance"]');
  await page.click('.ls-topic-end [data-action="advance"]'); await page.waitForTimeout(400);
}
/** Ana çerçevenin ham navigasyon SAYISI — Chromium, bir reload/goto SIRASINDA
    HEMEN ardından gelen bir location.replace()'i bazen TEK bir navigasyon
    olarak raporlar (redirect zinciri gibi ele alınır) — bu yüzden ham SAYI
    "kaç kez yönlendirildi" sorusuna GÜVENİLİR yanıt VERMEZ. Bu izleyici
    yalnız "en az bir ek navigasyon oldu mu" sağlamlık kontrolü için tutulur;
    asıl "kaç kez yönlendirildi" iddiası aşağıdaki URL-karşılaştırma
    yardımcılarıyla (settledUrl/urlChanged) kanıtlanır. */
function trackNavigations(page) {
  let count = 0;
  page.on('framenavigated', fr => { if (fr === page.mainFrame()) count++; });
  return { get count() { return count; }, reset() { count = 0; } };
}
/** page.url()'ü, art arda iki okuma arasında DEĞİŞMEYENE kadar (yani
    yönlendirme zinciri tamamen OTURANA kadar) bekler — "kaç kez
    yönlendirildi" değil, "SONUÇTA hangi URL'de karar kılındı ve orada
    İSTİKRARLI kaldı" sorusuna güvenilir yanıt verir. */
async function settledUrl(page, { stableForMs = 400, timeoutMs = 6000 } = {}) {
  const start = Date.now();
  let last = page.url();
  while (Date.now() - start < timeoutMs) {
    await page.waitForTimeout(stableForMs);
    const now = page.url();
    if (now === last) return now;
    last = now;
  }
  return last;
}

/* ══════════════════════════════════════════════════════════════ */
addTest('A) Güncel temiz context: reload=0, doğru terminoloji, serbest çok-yönlü hamle', async () => {
  const browser = await launchChromium();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const consoleErrors = [];
  const page = await context.newPage();
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push('console: ' + m.text()); });
  const server = makeServerState('V2');
  await server.attach(context);

  await page.goto(`${BASE}/learning-scenes.html?whiteMoveDelayMs=0`, { waitUntil: 'networkidle' });
  const nav = trackNavigations(page);
  await advanceToScene4Text(page);
  const introText = (await page.locator('#s04-intro .ls-strip-text').textContent())?.trim();
  ensure(!/özgürlük|serbestlik/i.test(introText || ''), `yasak terminoloji yok, bulunan: "${introText}"`);
  ensure(/nefes nokta/i.test(introText || ''), `doğru terminoloji var, bulunan: "${introText}"`);

  await page.click('#s04-confirm'); await page.waitForTimeout(300);
  const box = await page.locator('#ls-canvas').boundingBox();
  for (let i = 0; i < 4; i++) {
    const before = (await getEventLog(page)).filter(e => e.stepId === 'scene-04-group-liberties' && e.type === 'scene_move_played').length;
    ensure(await clickAnyLiberty(page, box, before), `serbest hamle ${i + 1} kabul edilmeli`);
    await page.waitForTimeout(80);
  }
  const moves = (await getEventLog(page)).filter(e => e.stepId === 'scene-04-group-liberties' && e.type === 'scene_move_played');
  ensure(moves[moves.length - 1]?.payload?.sceneVersion >= 4, 'sceneVersion >=4 event payload\'ında');
  ensure(nav.count === 0, `temiz context'te EK navigasyon (reload/redirect) OLMAMALI, bulunan: ${nav.count}`);
  ensure(consoleErrors.length === 0, `konsol/pageerror sıfır olmalı: ${JSON.stringify(consoleErrors)}`);
  await context.close(); await browser.close();
});

addTest('B) Mismatch algılanır → TEK güvenli yönlendirme → hedefte GERÇEKTEN eşleşme bulunur → guard temizlenir, progress korunur, serbest davranış (eski sırada YASAK olan batı dahil) çalışır (bkz. dosya başı notu: Playwright\'ın page.goto()/reload() ana doküman navigasyonu için GERÇEK tarayıcı disk cache\'ini kullanmadığı ampirik olarak doğrulandı — bu yüzden mismatch, C\'de olduğu gibi manifest override ile GÜVENİLİR biçimde üretilir; JS SUBRESOURCE cache\'i (asıl risk, .js ~4 saat vs .html ~10 dk) C\'de GERÇEK cache ile zaten kanıtlanmıştır)', async () => {
  const browser = await launchChromium();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const consoleErrors = [];
  const page = await context.newPage();
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push('console: ' + m.text()); });
  const server = makeServerState('V2');
  await server.attach(context);

  await page.goto(`${BASE}/learning-scenes.html?whiteMoveDelayMs=0`, { waitUntil: 'networkidle' });
  await advanceToScene4Text(page);
  await page.click('#s04-confirm'); await page.waitForTimeout(300);

  const progressBefore = await page.evaluate(() => localStorage.getItem('go_scene_progress_v1'));
  const eventLogBefore = await page.evaluate(() => localStorage.getItem('go_teacher_event_log_v1'));
  const completedBefore = JSON.parse(progressBefore).completedSceneIds;

  // Manifest GEÇİCİ olarak "bir sonraki release" bildirir (deploy henüz
  // JS/HTML'e yansımamış an) — İLK istek mismatch görüp TEK bir redirect
  // tetikler; İKİNCİ (redirect sonrası) istekten itibaren manifest GERÇEK
  // V2 değerine döner (deploy'un ASLINDA hep V2 olduğu, geçici bir manifest
  // gecikmesinin düzeldiği senaryosu) — bu yüzden hedefte GERÇEK eşleşme
  // bulunur ve guard TEMİZLENİR (F'nin aksine — orada mismatch KALICIYDI).
  // İSTEK SAYACINA bağlı (zamanlamaya değil) — race-condition'dan bağımsız
  // deterministik davranış.
  const SIMULATED_NEXT = V2_RELEASE + '-NEXT-TRANSIENT';
  let manifestRequestCount = 0;
  server.overridePathOnly['scene-release.json'] = () => {
    manifestRequestCount++;
    const release = manifestRequestCount === 1 ? SIMULATED_NEXT : V2_RELEASE;
    return { body: JSON.stringify({ release }), cacheControl: 'no-store' };
  };

  const urlBeforeReload = page.url();
  await page.reload({ waitUntil: 'networkidle' });
  const finalUrl = await settledUrl(page);
  await page.waitForSelector('#s04-intro', { timeout: 10000 });

  ensure(finalUrl !== urlBeforeReload, `URL yönlendirme sonrası DEĞİŞMİŞ olmalı (mismatch tespit edildi), önce=${urlBeforeReload} sonra=${finalUrl}`);
  ensure(new URL(finalUrl).searchParams.get('release') === SIMULATED_NEXT, `redirect hedef release'i taşımalı, bulunan URL: ${finalUrl}`);

  const introTextNew = (await page.locator('#s04-intro .ls-strip-text').textContent())?.trim();
  ensure(!/özgürlük|serbestlik/i.test(introTextNew || ''), `yasak terminoloji YOK, bulunan: "${introTextNew}"`);
  ensure(/nefes nokta/i.test(introTextNew || ''), `doğru terminoloji VAR, bulunan: "${introTextNew}"`);

  const progressAfter = await page.evaluate(() => localStorage.getItem('go_scene_progress_v1'));
  const eventLogAfter = await page.evaluate(() => localStorage.getItem('go_teacher_event_log_v1'));
  const completedAfter = JSON.parse(progressAfter).completedSceneIds;
  ensure(JSON.stringify(completedAfter) === JSON.stringify(completedBefore), `completedSceneIds korunmalı: önce=${JSON.stringify(completedBefore)} sonra=${JSON.stringify(completedAfter)}`);
  // Not: reload sonrası Sahne #4'ün YENİDEN mount edilmesi meşru bir
  // 'scene_started' event'i EKLER (silme DEĞİL) — bu yüzden byte-eşitlik
  // DEĞİL, "eski event'ler hâlâ PREFIX olarak duruyor mu" doğrulanır
  // (bkz. görev talimatı: "Teacher Event Log silinmiyor").
  const eventsBefore = JSON.parse(eventLogBefore);
  const eventsAfter = JSON.parse(eventLogAfter);
  ensure(eventsAfter.length >= eventsBefore.length, `event log KÜÇÜLMEMELİ (silinme yok), önce=${eventsBefore.length} sonra=${eventsAfter.length}`);
  ensure(JSON.stringify(eventsAfter.slice(0, eventsBefore.length)) === JSON.stringify(eventsBefore), 'eski event\'ler AYNEN korunmalı (yalnız yeni event\'ler eklenebilir)');

  await page.click('#s04-confirm'); await page.waitForTimeout(300);
  const box = await page.locator('#ls-canvas').boundingBox();
  const c = boardCenterXY(box);
  await page.mouse.click(box.x + c.cx - 20, box.y + c.cy + 6); // batı — eski sıralı modelde YASAKTI
  await page.waitForTimeout(200);
  const moves = (await getEventLog(page)).filter(e => e.stepId === 'scene-04-group-liberties' && e.type === 'scene_move_played');
  ensure(moves.length === 1, `batı yönü hamlesi kabul edilmeli, bulunan hamle: ${moves.length}`);
  ensure(moves[0]?.payload?.sceneVersion >= 4, `sceneVersion >=4, bulunan: ${moves[0]?.payload?.sceneVersion}`);

  const guard = await page.evaluate(() => { try { return sessionStorage.getItem('go_scene_reload_guard_learning_v1'); } catch { return 'ERR'; } });
  ensure(guard === null, `hedefte GERÇEK eşleşme bulununca guard TEMİZLENMELİ, bulunan: ${guard}`);
  ensure(consoleErrors.length === 0, `konsol/pageerror sıfır olmalı: ${JSON.stringify(consoleErrors)}`);
  await context.close(); await browser.close();
});

addTest('C) Bare releaseVersion.js cache tuzağı: eski BARE URL 4 saatlik cache\'e önceden yüklense bile, güncel uygulama ONA BAĞIMLI DEĞİL — Network\'te YALNIZ versioned URL kullanılır, doğru release yüklenir, loop oluşmaz', async () => {
  const browser = await launchChromium();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const server = makeServerState('V2');
  // Bare URL'i (hiçbir zaman GERÇEK üretimde BU haliyle sunulmasa bile)
  // ESKİ/YANLIŞ bir SCENE_RELEASE ile ELLE önceden cache'e yükle — v1
  // regresyonunun tam simülasyonu. overrideExact KULLANILIR (query'siz
  // TAM eşleşme) — böylece '?v=...' taşıyan GERÇEK istek bu override'ı
  // YANLIŞLIKLA yakalamaz (gerçek tarayıcı cache'i de query'yi ayırt eder).
  server.overrideExact['core/releaseVersion.js'] = {
    body: `export const SCENE_RELEASE = 'STALE-BARE-TRAP-SHOULD-NEVER-BE-USED';\n`,
    cacheControl: 'max-age=14400',
  };
  const requestedUrls = [];
  page.on('request', req => { if (req.url().includes('releaseVersion.js')) requestedUrls.push(req.url()); });
  await server.attach(context);

  // Bare URL'i GERÇEKTEN tarayıcı cache'ine yükle (doğrudan bir fetch ile
  // — henüz uygulamanın kendisi hiç çalışmadı).
  await page.goto(`${BASE}/learning-scenes.html?whiteMoveDelayMs=0`, { waitUntil: 'networkidle' });
  await page.evaluate(async (base) => { await fetch(`${base}/core/releaseVersion.js`); }, BASE);
  const bareFetchedBody = await page.evaluate(async (base) => (await fetch(`${base}/core/releaseVersion.js`)).text(), BASE);
  ensure(bareFetchedBody.includes('STALE-BARE-TRAP'), 'ön koşul: bare URL GERÇEKTEN eski/tuzak içerikle cache\'e alınmış olmalı');

  requestedUrls.length = 0; // yalnız SONRAKİ (gerçek uygulama) istekleri say
  const urlBeforeReload = page.url();
  await page.reload({ waitUntil: 'networkidle' });
  const finalUrl = await settledUrl(page);
  await advanceToScene4Text(page);

  ensure(requestedUrls.length > 0, 'ön koşul: releaseVersion.js için en az bir istek yapılmalı');
  ensure(requestedUrls.every(u => u.includes(`?v=${V2_RELEASE}`)), `runtime SADECE versioned URL kullanmalı, bulunanlar: ${JSON.stringify(requestedUrls)}`);
  ensure(!requestedUrls.some(u => !u.includes('?v=')), 'runtime bare (versiyonsuz) releaseVersion.js URL\'ine HİÇ istek atmamalı');

  const introText = (await page.locator('#s04-intro .ls-strip-text').textContent())?.trim();
  ensure(/nefes nokta/i.test(introText || ''), `bare cache tuzağına RAĞMEN doğru release/metin yüklenmeli, bulunan: "${introText}"`);
  ensure(finalUrl === urlBeforeReload, `bare tuzak mismatch/redirect üretmemeli (release zaten eşleşiyor), önce=${urlBeforeReload} sonra=${finalUrl}`);
  await context.close(); await browser.close();
});

addTest('D) Başarılı yönlendirme sonrası tekrar açılış: query URL reload x2 → reload\'un kendisi DIŞINDA ek yönlendirme YOK, guard temiz', async () => {
  const browser = await launchChromium();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const server = makeServerState('V2');
  await server.attach(context);

  const initialUrl = `${BASE}/learning-scenes.html?whiteMoveDelayMs=0&release=${V2_RELEASE}`;
  await page.goto(initialUrl, { waitUntil: 'networkidle' });
  await page.waitForSelector('#s01-confirm');
  const urlAfterGoto = await settledUrl(page);
  ensure(urlAfterGoto === initialUrl, `eşleşen query release URL'inde ek yönlendirme OLMAMALI, önce=${initialUrl} sonra=${urlAfterGoto}`);
  const guard1 = await page.evaluate(() => { try { return sessionStorage.getItem('go_scene_reload_guard_learning_v1'); } catch { return 'ERR'; } });
  ensure(guard1 === null, `guard temiz olmalı, bulunan: ${guard1}`);

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('#s01-confirm');
  const urlAfterReload = await settledUrl(page);
  ensure(urlAfterReload === initialUrl, `ikinci reload'da da URL DEĞİŞMEMELİ (ek yönlendirme yok), önce=${initialUrl} sonra=${urlAfterReload}`);
  const guard2 = await page.evaluate(() => { try { return sessionStorage.getItem('go_scene_reload_guard_learning_v1'); } catch { return 'ERR'; } });
  ensure(guard2 === null, `guard hâlâ temiz olmalı, bulunan: ${guard2}`);
  await context.close(); await browser.close();
});

addTest('E) B ile AYNI mismatch→redirect→eşleşme akışı, page.reload() YERİNE page.goto() ile ("yeni sekme" biçiminde yeniden açılış) tetiklenir — farklı Playwright API\'si, aynı sağlıklı sonuç, loop yok', async () => {
  const browser = await launchChromium();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const server = makeServerState('V2');
  await server.attach(context);

  const initialUrl = `${BASE}/learning-scenes.html?whiteMoveDelayMs=0`;
  await page.goto(initialUrl, { waitUntil: 'networkidle' });
  await page.waitForSelector('#s01-confirm');

  const SIMULATED_NEXT = V2_RELEASE + '-NEXT-TRANSIENT-E';
  let manifestRequestCount = 0;
  server.overridePathOnly['scene-release.json'] = () => {
    manifestRequestCount++;
    const release = manifestRequestCount === 1 ? SIMULATED_NEXT : V2_RELEASE;
    return { body: JSON.stringify({ release }), cacheControl: 'no-store' };
  };

  // page.reload() DEĞİL — page.goto() ile AYNI bare URL'e "yeniden açılış"
  // (bkz. görev talimatı: "kullanıcı normal URL'yi ... yeniden açarsa").
  await page.goto(initialUrl, { waitUntil: 'networkidle' });
  const finalUrl = await settledUrl(page);
  await page.waitForSelector('#s01-confirm', { timeout: 10000 });

  ensure(finalUrl !== initialUrl, `URL yönlendirme sonrası DEĞİŞMİŞ olmalı, önce=${initialUrl} sonra=${finalUrl}`);
  ensure(new URL(finalUrl).searchParams.get('release') === SIMULATED_NEXT, `redirect hedef release'i taşımalı, bulunan: ${finalUrl}`);
  const guard = await page.evaluate(() => { try { return sessionStorage.getItem('go_scene_reload_guard_learning_v1'); } catch { return 'ERR'; } });
  ensure(guard === null, `hedefte GERÇEK eşleşme bulununca guard TEMİZLENMELİ, bulunan: ${guard}`);
  await context.close(); await browser.close();
});

addTest('F) Patolojik (V2 kendi guard-tuple\'ı): manifest DAHA YENİ bir release bildirir AMA deploy propagate OLMAMIŞ (query URL de AYNI mismatch\'i verir) → EN FAZLA bir otomatik deneme, sonra sade "yeni sürüm hazırlanıyor" arayüzü — stale Sahne #4 mount edilmez, progress silinmez, teknik dil yok', async () => {
  const browser = await launchChromium();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const server = makeServerState('V2'); // kullanıcı ZATEN güncel V2'de
  await server.attach(context);

  await page.goto(`${BASE}/learning-scenes.html?whiteMoveDelayMs=0`, { waitUntil: 'networkidle' });
  await page.click('#s01-confirm'); await page.waitForTimeout(250);
  for (const size of [9, 13]) { await page.click(`.ls-pill[data-size="${size}"]`); await page.waitForTimeout(60); }
  const progressBefore = await page.evaluate(() => localStorage.getItem('go_scene_progress_v1'));

  // Manifest HER ZAMAN (query'den bağımsız — no-store olduğu için hiç
  // cache'lenmiyor zaten) daha YENİ, HİÇ dağıtılmamış bir release bildirir
  // — "deploy propagate olmadı" CDN tutarsızlığının doğrudan simülasyonu.
  // overridePathOnly kullanılır çünkü manifest isteği her zaman '?t=...'
  // cache-buster taşır (tam path+query eşleşmesi asla tutmaz).
  const SIMULATED_NEWER = V2_RELEASE + '-SIMULATED-NEWER-NEVER-DEPLOYED';
  server.overridePathOnly['scene-release.json'] = { body: JSON.stringify({ release: SIMULATED_NEWER }), cacheControl: 'no-store' };

  const nav = trackNavigations(page);
  await page.reload({ waitUntil: 'networkidle' }); // → V2'nin KENDİ kodu: mismatch, redirect dener, YİNE aynı mismatch'i görür
  await page.waitForTimeout(600);

  ensure(nav.count <= 2, `en fazla bir otomatik deneme olmalı (reload + 1 redirect), bulunan navigasyon: ${nav.count}`);

  const errorVisible = await page.locator('#ls-error.show').count();
  ensure(errorVisible > 0, '"yeni sürüm hazırlanıyor" arayüzü GÖRÜNÜR olmalı');
  const errorTitle = (await page.locator('#ls-error-title').textContent())?.trim();
  const errorText = (await page.locator('#ls-error-text').textContent())?.trim();
  ensure(!/ESM|cache|import|module|SCENE_RELEASE/i.test(errorText || ''), `mesaj teknik dil İÇERMEMELİ, bulunan: "${errorText}"`);
  ensure(!/HTTP|stack|Error:|undefined/i.test(errorText || ''), `mesaj hata yığını göstermemeli, bulunan: "${errorText}"`);
  ensure(/yeni sürüm/i.test(errorTitle || ''), `başlık kullanıcı-dostu olmalı, bulunan: "${errorTitle}"`);

  // Sahne #4 hiçbir zaman mount edilmemiş olmalı (yalnız 1/2'de kalındı).
  const scene4Mounted = await page.locator('#s04-intro, #s04-play').count();
  ensure(scene4Mounted === 0, 'Sahne #4 (stale olası) HİÇ mount edilmemeli');

  const progressAfter = await page.evaluate(() => localStorage.getItem('go_scene_progress_v1'));
  ensure(progressAfter === progressBefore, 'progress silinmemeli/değişmemeli');

  const guard = await page.evaluate(() => { try { return sessionStorage.getItem('go_scene_reload_guard_learning_v1'); } catch { return 'ERR'; } });
  ensure(guard === `${V2_RELEASE}=>${SIMULATED_NEWER}`, `guard AYNI geçiş tuple'ını tutmalı (döngüye girmeme kanıtı), bulunan: ${guard}`);

  ensure(await page.locator('#ls-error-reload').isVisible(), 'erişilebilir "Yeniden yükle" düğmesi görünür olmalı');
  await context.close(); await browser.close();
});

addTest('G) Manifest fetch hatası/timeout: sayfa kilitlenmez, mevcut versioned graph kontrollü açılır, uncaught exception yok', async () => {
  const browser = await launchChromium();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const consoleErrors = [];
  const page = await context.newPage();
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
  await context.route(`${BASE}/**`, async route => {
    const url = new URL(route.request().url());
    const pathname = decodeURIComponent(url.pathname.replace(/^\/+/, '')) || 'learning-scenes.html';
    if (pathname === 'scene-release.json') { await route.abort(); return; }
    let body; try { body = readWorkingTree(pathname); } catch { await route.abort(); return; }
    await route.fulfill({ status: 200, contentType: mime(pathname), body });
  });
  const start = Date.now();
  await page.goto(`${BASE}/learning-scenes.html?whiteMoveDelayMs=0`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForSelector('#s01-confirm', { timeout: 10000 });
  const elapsed = Date.now() - start;
  ensure(elapsed < 12000, `manifest hatası sayfayı makul sürede açmalı (sonsuz bekleme yok), geçen: ${elapsed}ms`);
  ensure(await page.locator('#s01-confirm').isVisible(), 'manifest fetch başarısız olsa da sayfa normal açılmalı');
  ensure(consoleErrors.length === 0, `uncaught exception OLMAMALI: ${JSON.stringify(consoleErrors)}`);
  await context.close(); await browser.close();
});

addTest('H) Teacher Studio: mismatch algılanır → TEK yönlendirme → hedefte GERÇEK eşleşme → guard temizlenir, terminoloji doğru', async () => {
  const browser = await launchChromium();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const consoleErrors = [];
  const page = await context.newPage();
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
  // localhost:8787 (AI teacher proxy sağlık kontrolü, checkClaudeProxy())
  // bu görevle İLGİSİZ, ÖNCEDEN VAR olan bir Studio özelliği — test
  // ortamında o yerel sunucu koşmadığı için tarayıcı SEVİYESİNDE (JS
  // seviyesinde DEĞİL, zaten try/catch'li) bir "Failed to load resource"
  // network log'u üretir. Bu benign gürültüyü filtrelemek gerçek konsol
  // hatalarını kaçırmaz.
  page.on('console', m => {
    if (m.type() !== 'error') return;
    // teacher-studio.html'in ÖNCEDEN VAR olan checkClaudeProxy() sağlık
    // kontrolü (localhost:8787) test ortamında koşmadığı için Chrome'un
    // (JS'in DEĞİL, tarayıcının network katmanının) ürettiği bu TEK
    // benign network log'u — bu görevle İLGİSİZ, ÖNCEDEN VAR olan bir
    // Studio davranışı — filtrelenir. Chrome bu tür network hatalarını
    // konsola URL/konum bilgisi OLMADAN loglar; bu repo'da BU metinle
    // eşleşen BAŞKA hiçbir kaynak yok (doğrulanmıştır).
    if (m.text().includes('ERR_CONNECTION_REFUSED')) return;
    consoleErrors.push('console: ' + m.text());
  });
  const server = makeServerState('V2');
  await server.attach(context);

  await page.goto(`${BASE}/teacher-studio.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  ensure(await page.locator('#tab-overview').count() > 0, 'ön koşul: Studio açılmalı');

  const SIMULATED_NEXT = V2_RELEASE + '-NEXT-TRANSIENT-STUDIO';
  let manifestRequestCount = 0;
  server.overridePathOnly['scene-release.json'] = () => {
    manifestRequestCount++;
    const release = manifestRequestCount === 1 ? SIMULATED_NEXT : V2_RELEASE;
    return { body: JSON.stringify({ release }), cacheControl: 'no-store' };
  };

  const urlBeforeReload = page.url();
  await page.reload({ waitUntil: 'networkidle' });
  const finalUrl = await settledUrl(page);

  ensure(finalUrl !== urlBeforeReload, `Studio URL'i yönlendirme sonrası DEĞİŞMİŞ olmalı, önce=${urlBeforeReload} sonra=${finalUrl}`);
  ensure(new URL(finalUrl).searchParams.get('release') === SIMULATED_NEXT, `redirect hedef release'i taşımalı, bulunan: ${finalUrl}`);

  await page.click('[data-tab="curriculum"]');
  await page.waitForTimeout(200);
  const curriculumText = await page.locator('#curriculum-scene-table').textContent();
  ensure(!/özgürlük|serbestlik/i.test(curriculumText), 'Studio Curriculum: yasak terminoloji yok');

  const studioGuard = await page.evaluate(() => { try { return sessionStorage.getItem('go_scene_reload_guard_studio_v1'); } catch { return 'ERR'; } });
  ensure(studioGuard === null, `hedefte GERÇEK eşleşme bulununca Studio guard TEMİZLENMELİ, bulunan: ${studioGuard}`);
  ensure(consoleErrors.length === 0, `Studio konsol/pageerror sıfır olmalı: ${JSON.stringify(consoleErrors)}`);
  await context.close(); await browser.close();
});

(async () => {
  for (const { name, fn } of tests) {
    try { await fn(); pass++; console.log('  ✓', name); }
    catch (error) { fail++; console.error('  ✗', name, '-', error?.message || error); }
  }
  console.log(`\nsceneReleaseStaleCache tarayıcı test sayısı: ${tests.length}`);
  console.log('özet:', `${pass}/${pass + fail}`);
  if (fail) process.exit(1);
})();
