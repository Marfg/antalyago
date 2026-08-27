/**
 * adapters/sceneBoardAdapter.js
 *
 * Sahne modüllerinin gerçek 3D Go tahtasını çizmek için kullandığı TEK
 * temas noktası. `core/` DIŞINDA (canvas/DOM bilir) — `adapters/
 * teacherContentOverrides.js` ile AYNI "saf core + browser adapter"
 * ayrımı deseni.
 *
 * BİLEREK yeniden yazılmadı: izometrik projeksiyon matematiği, ahşap
 * doku üretimi, kamera lerp'i ve taş çizimi `ogren-3d.html`'in kanıtlanmış
 * 3D renderer'ından adapte edildi (aynı `project()`/`drawBoard()`/
 * `drawGrid()`/`drawStone()`/`animateCamera()`/`screenToGrid()` mantığı,
 * yalnızca modül-seviyesi global değişkenler yerine bu factory'nin KAPALI
 * (closure) durumunu kullanacak şekilde). Sahne modülleri SIZE/CELL/HALF/
 * STONE_R gibi iç değişkenlere veya canvas koordinat dönüşümüne ASLA
 * doğrudan erişmez — yalnızca aşağıdaki sözleşmeyi kullanır:
 *
 *   const board = createSceneBoardAdapter(canvasEl);
 *   board.setSize(19);                 // gerçek tahta boyutunu değiştirir + yeniden çizer
 *   board.reset();                     // taşları/vurguları temizler, deterministik BoardState'i sıfırlar
 *   board.focus('board19');            // adlandırılmış bir kamera preset'ine geçer
 *   board.getSize();                   // 9 | 13 | 19
 *   board.isLegalMove({row,col,color});// core/ruleEngine.js ÜZERİNDEN gerçek yasallık
 *   board.playMove({row,col,color});   // yasalsa gerçek BoardState + görsel taşı günceller
 *   board.replaceExampleStone({row,col,color}); // tahtayı temiz TEK-TAŞLI bir örneğe döndürüp yeni taşı yerleştirir
 *   board.getLibertiesAt({row,col});   // [{row,col}] — core/ruleEngine.js ÜZERİNDEN gerçek nefes noktaları
 *   board.showLiberties(points);       // turkuaz "nefes ışığı" işaretlerini çizer (bkz. drawLibertyMark)
 *   board.clearLiberties();
 *   board.setMovePreview({row,col,color}); // yasal boş kesişimde yarı saydam taş silueti + ince turkuaz halka
 *   board.clearMovePreview();
 *   board.getMovePreviewState();       // {row,col,color}|null — salt-okunur, YALNIZ test/gözlem amaçlı
 *   board.setInputEnabled(bool);       // false iken onIntersectionTap/onIntersectionHover ASLA tetiklenmez; preview'ı da temizler.
 *                                      // true'ya DIŞARIDAN (aynı oturumda daha önce zaten açıkken değil) geçildiğinde
 *                                      // abone olan onIntersectionHover handler'larına `null` bildirilir (bkz. Konular
 *                                      // paneli kapanışı) — hangi görselin gösterileceğine adaptör KARAR VERMEZ,
 *                                      // yalnız "girdi az önce açıldı, henüz güvenilir bir hover konumu yok" bilgisini iletir.
 *   const snap = board.suspendInteraction();     // girdiyi/preview'ı KİLİTLER, salt-okunur bir anlık görüntü döner (bkz. v0.14)
 *   board.resumeInteraction(snap);               // yalnız AYNI çağıranın snapshot'ı ile — girdi/preview'ı OLDUĞU gibi geri yükler
 *   const off = board.onIntersectionTap(({row,col}) => {...});   // off() ile abone iptali
 *   const offH = board.onIntersectionHover(hitOrNull => {...});  // pointer hareket/dokunuşunda; board dışında/kilitliyken null
 *   board.focusPoints(points, opts);   // GENEL, GÖRÜNÜRLÜK-ÖNCELİKLİ kadraj (bkz. v0.16) — zaten güvenliyse NO-OP, sahne/adım BİLMEZ
 *   board.getCameraState();            // {yaw,pitch,dist} — salt-okunur, YALNIZ test/gözlem amaçlı
 *   board.getFocusPointsResult();      // son focusPoints() kararı — salt-okunur, YALNIZ test/gözlem amaçlı
 *   board.destroy();                   // RAF/resize/click listener'ı + tüm durumu temizler
 *
 * v0.15 — kök neden düzeltmesi: `focus(presetName)` altında mobil için TÜM
 * preset'lere körü körüne uygulanan `{yaw:.50, pitch:max(pitch,1.2)}`
 * geçersiz kılması, köşeye özel preset'lerin (`corner_tl`/`corner_tr`) KENDİ
 * yaw'ını — köşeyi merkeze getiren asıl mekanizmayı — SİLİYORDU; Sahne #7 an
 * 1'de bu, 390px mobil viewport'ta hedef beyaz taşın ve neon işaretinin
 * TAMAMEN ekran dışına taşmasına yol açıyordu (piksel kanıtı: bkz. görev
 * talimatı, hem parent commit `d20357c` hem `4c44889` üzerinde AYNI şekilde
 * yeniden üretildi — ilk-ipucu sadeleştirmesinin bir regresyonu DEĞİL, ondan
 * BAĞIMSIZ önceden var olan bir kadraj sorunu). Düzeltme bu blanket mobil
 * geçersiz kılmayı DEĞİŞTİRMEDİ (diğer TÜM `focus()` çağrıları/preset'ler
 * byte/davranış düzeyinde AYNI kaldı) — bunun yerine YENİ, sahneden/adımdan
 * BAĞIMSIZ genel bir `focusPoints()` eklendi: verilen noktaların GERÇEK
 * izdüşüm geometrisinden yaw'ı anlık türetir, dist'i (zoom) noktaların gerçek
 * görsel ayak izini (STONE_R + nefes işareti kolu) canvas'ın güvenli alanına
 * sığdıracak şekilde çözer (bkz. applyFocusPoints). Yalnız Sahne #7'nin an
 * 1'i bu API'yi kullanır (bkz. scenes/scene07CapturePractice.js) — diğer
 * TÜM sahneler/adımlar hâlâ `focus(presetName)` kullanır, DOKUNULMADI.
 *
 * v0.16 — GÖRÜNÜRLÜK-ÖNCELİKLİ düzeltme (bkz. görev talimatı): v0.15'in
 * `focusPoints()`'i her zaman hedef merkezine SIFIRDAN bir yaw/dist üretiyordu
 * — masaüstünde preset ZATEN hedefleri güvenli gösterse bile kamerayı
 * gereksiz yere değiştiriyordu (kanıt: `4c44889` referansına karşı yaw/dist
 * farkı ölçüldü). `computeFraming()` artık ÖNCE mevcut kamera durumunu
 * (preset'in kendisi VEYA önceki bir düzeltme — bkz. `base`) hedeflerin GERÇEK
 * güvenli-alan sınamasıyla değerlendirir: zaten güvenliyse `{adjusted:false}`
 * döner ve camYaw/camPitch/camDist/camStart/camTarget'a HİÇ DOKUNULMAZ (no-op
 * sözleşmesi). Güvenli DEĞİLSE artık "tam merkeze sıfırdan sıçrama" YERİNE
 * mevcut pitch KORUNARAK, mevcut yaw'dan hedefleri güvenli kılan EN KÜÇÜK
 * açısal sapma ikili aramayla bulunur; yaw tek başına yetmezse dist tam-
 * merkezleme yawında güvenli sınırlara sığdırılır. Küçük bir histerezis payı
 * (bkz. FOCUS_HYSTERESIS_PX) sınırda ölçüm gürültüsüyle salınımı önler. Test/
 * gözlem için salt-okunur `getCameraState()`/`getFocusPointsResult()` eklendi.
 * `focus(presetName)`'in kendisi (mobil preset geçersiz kılması DAHİL) BYTE
 * düzeyinde DEĞİŞMEDİ.
 *
 * v0.9 — kesişim "rehber" (neon nokta) sistemi BİLEREK KALDIRILDI: kullanıcı
 * kesişimleri doğal tahta çizgileri, pointer hover/ghost geri bildirimi ve
 * taşın gerçek yerleşme davranışıyla öğrenir.
 *
 * v0.11 — nefes vurgusu eski `ogren-3d.html`'in `drawPedagogyHighlights3D()`
 * ("firuze artı") görsel diline getirildi (bkz. drawLibertyMark) — kehribar
 * halka KALDIRILDI. Hamle öncesi taş silueti (ghost preview) eklendi;
 * geometri/teknik eski `ogren-3d.html`'in `drawStone(...,alpha,...)` (yarı
 * saydam taş) ve ghost-ring çizim tekniklerinden ADAPTE edildi (bkz. görev
 * talimatı, Bölüm A/B — tam kaynak referansları dosya içinde ilgili
 * fonksiyonların üstünde belirtilmiştir). Renk/pulse'suz statik sunum bu
 * projenin kendi tercihidir; eski dosyadaki sürekli pulse BİLEREK alınmadı.
 *
 * v0.12 — kök neden düzeltmesi: `setInputEnabled(true)` daha önce mevcut
 * `movePreview`'a HİÇ dokunmuyordu — bir sahne yalnız gerçek bir
 * pointermove/pointerdown geldiğinde (onIntersectionHover üzerinden)
 * önizleme kuruyorsa, girdi yeni açıldığı anda (ör. Sahne #3'ün intro
 * onayından hemen sonra VEYA Konular paneli kapanışında) kullanıcı fareyi
 * henüz oynatmamışsa board GEÇİCİ olarak silueti boş görünüyordu. Adaptör
 * artık girdi false→true geçişinde abone olan onIntersectionHover
 * handler'larına `null` bildirir (mevcut `hoverPoint` GÜVENİLMEZ olabilir —
 * girdi kapalıyken güncellenmez, ör. Konular paneli açıkken imleç panel
 * öğeleri üzerinde hareket etmiş olabilir). Bu, "hangi noktada varsayılan
 * bir silüet gösterilsin" kararını ASLA adaptöre TAŞIMAZ (bu tamamen
 * sahneye özgü, bkz. scenes/scene03LibertiesByPosition.js handleHover) —
 * yalnız "girdi az önce açıldı" sinyalini iletir. Ayrıca salt-okunur
 * `getMovePreviewState()` eklendi — YALNIZ tarayıcı testlerinin canvas-only
 * ghost durumunu DOM/event log'a yansımadan doğrulayabilmesi için (bkz.
 * learning-scenes.html `?exposeBoardAdapter=1` test-only hook'u, üretim
 * davranışını DEĞİŞTİRMEZ).
 *
 * v0.13 — canlı kullanıcı testi "state var ama görünmüyor" sorununu ortaya
 * çıkardı: `drawMovePreview()`'in yarıçapı ÖLÇÜLDÜĞÜNDE gerçek taşla
 * neredeyse birebirdi (~%103) — asıl sorun DÜŞÜK KONTRASTTI (alpha=0.30,
 * bu tahtanın sıcak/açık ahşap zeminine karşı piksel örneklemesiyle
 * ölçülen sapma gerçek taşınkinin yalnız ~%30'u). Alpha 0.42'ye yükseltildi
 * (bkz. drawMovePreview üstündeki not, tam ölçüm kanıtı orada). Ayrıca
 * silüetin YALNIZ hangi sahne durumunda gösterileceği kararı hâlâ sahneye
 * özgüdür (bkz. scenes/scene03LibertiesByPosition.js v0.13 notu) — bu
 * dosya yalnız ÇİZİM kalitesini iyileştirdi, YAŞAM DÖNGÜSÜ kararı taşımadı.
 *
 * v0.14 — kök neden düzeltmesi: Konular paneli INTRO aşamasında açılıp
 * kapanınca başlangıç silueti geri GELMİYORDU. Neden: `setInputEnabled(false)`
 * girdi ZATEN kapalıyken (INTRO'da input hiç açılmamıştır) bile TEKRAR
 * çağrıldığında `movePreview`'ı KOŞULSUZ temizliyordu; panel kapanınca da
 * (INTRO'da hâlâ true'ya geçilmediği için) `notifyHover` yeniden-bildirimi
 * TETİKLENMİYORDU — çünkü sahnenin `handleHover`'ı henüz ABONE bile
 * OLMAMIŞTI (abonelik yalnız intro tick onayından SONRA kurulur). Genel
 * `setInputEnabled` semantiği (reset/destroy/sahne geçişlerinde preview'i
 * KESİN temizleme) BİLEREK değiştirilmedi — onun yerine Konular paneli için
 * AYRI, açık bir `suspendInteraction()`/`resumeInteraction(snapshot)` çifti
 * eklendi (bkz. altta): panel açılırken GÜNCEL `{inputEnabled, movePreview}`
 * salt-okunur olarak SNAPSHOT'lanır ve girdi/preview KİLİTLENİR; panel
 * kapanınca çağıran (learning-scenes.html) BU snapshot'ı — yalnız panel
 * açıldığından beri AYNI sahne hâlâ aktifse — OLDUĞU GİBİ geri yükler.
 * Bu, sahnenin İÇ state machine'ini (INTRO/AWAITING_FIRST_MOVE/
 * SHOWING_EXAMPLE) hiç BİLMEDEN üç durumu da doğru ele alır: INTRO'da
 * movePreview zaten (4,4)'tü → snapshot AYNI (4,4)'ü geri getirir; ilk
 * hamleden ÖNCE hover ile başka bir noktadaysa → o nokta geri gelir; ilk
 * hamleden SONRA movePreview zaten null'dı (gerçek taş yerleşince
 * temizlenmişti) → snapshot da null'dır, ZORLA merkez ghost SENTEZLENMEZ.
 */

import { CAM } from '../core/curriculum.js?v=2026-08-26.2';
import { BoardState } from '../core/boardState.js?v=2026-08-26.2';
import { isValidMove, applyMove, getGroup, getLiberties } from '../core/ruleEngine.js?v=2026-08-26.2';

const CAM_PRESETS = { ...CAM };

function makeWoodPattern(ctx) {
  const woodCv = document.createElement('canvas');
  woodCv.width = woodCv.height = 512;
  const wc = woodCv.getContext('2d');
  const g = wc.createLinearGradient(0, 0, 512, 0);
  g.addColorStop(0, '#c8a84a'); g.addColorStop(.15, '#d4b050');
  g.addColorStop(.38, '#c2a040'); g.addColorStop(.6, '#caa848');
  g.addColorStop(.82, '#be9c3a'); g.addColorStop(1, '#c8a444');
  wc.fillStyle = g; wc.fillRect(0, 0, 512, 512);
  wc.globalAlpha = 0.055;
  for (let i = 0; i < 120; i++) {
    const y = Math.random() * 512, dk = i % 7 === 0;
    wc.strokeStyle = dk ? '#5a2e00' : '#e8d060';
    wc.lineWidth = dk ? Math.random() * 1.2 + .4 : Math.random() * .8 + .2;
    wc.beginPath(); wc.moveTo(0, y + (Math.random() - .5) * 4);
    wc.bezierCurveTo(128, y + (Math.random() - .5) * 3, 384, y + (Math.random() - .5) * 3, 512, y + (Math.random() - .5) * 4);
    wc.stroke();
  }
  wc.globalAlpha = .10;
  const vig = wc.createLinearGradient(0, 0, 512, 512);
  vig.addColorStop(0, '#3a1c00'); vig.addColorStop(.5, 'transparent'); vig.addColorStop(1, '#3a1c00');
  wc.fillStyle = vig; wc.fillRect(0, 0, 512, 512);
  wc.globalAlpha = 1;
  return ctx.createPattern(woodCv, 'repeat');
}

function easeInOutCubic(t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
function lerp(a, b, t) { return a + (b - a) * t; }
function sizeToCell(n) { return n === 9 ? 48 : n === 13 ? 32 : 22; }

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{isMobile?: boolean, initialSize?: 9|13|19}} [options]
 * @returns {object} bkz. dosya başı sözleşme listesi
 */
export function createSceneBoardAdapter(canvas, { isMobile = false, initialSize = 19 } = {}) {
  const ctx = canvas.getContext('2d');
  const woodPat = makeWoodPattern(ctx);

  // Dokunma yeteneği — DONMUŞ `isMobile`'ın (yalnız CONSTRUCTION anındaki
  // window.innerWidth'ten türetilen) AKSİNE, bu GERÇEK bir donanım
  // özelliğidir (resize/orientation ile DEĞİŞMEZ) — bu yüzden anlık olarak
  // yeniden okunması GEREKMEZ, ama STABİL biçimde bir kez saklanır.
  // `isNarrowLayout()` (bkz. altta) bunu learning-scenes.html'in KENDİ
  // `isMobile` FORMÜLÜYLE (`W<=640 || (touch && W<=1024)`) AYNI ŞEKİLDE,
  // yalnız DONMUŞ window.innerWidth yerine O ANKİ CANLI canvas genişliğini
  // (`W`) kullanarak yeniden hesaplar — computeFraming'in orientation
  // değişiminde GÜNCEL bir preset temeli türetebilmesi için (bkz.
  // computeFraming notu). `focus(presetName)`'in KENDİSİ hâlâ yalnız
  // CONSTRUCTION-zamanlı `isMobile`'ı kullanır — BURADA DEĞİŞTİRİLMEDİ.
  const touchCapable = typeof window !== 'undefined'
    && (('ontouchstart' in window) || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0));
  function isNarrowLayout() { return W <= 640 || (touchCapable && W <= 1024); }

  let W = 0, H = 0, projCY = 0;
  let SIZE = initialSize, CELL = sizeToCell(initialSize), HALF = (SIZE - 1) * CELL / 2;
  const BOARD_H = 14;
  const ASPECT_3D = 0.36;
  let STONE_R = CELL * (20 / 48);

  // Deterministik hamle/yasallık için GERÇEK BoardState — Sahne #2'nin
  // "playMove/isLegalMove" ihtiyacı BURADA, core/ruleEngine.js üzerinden
  // karşılanır. Sahne modülü bu nesneye asla doğrudan erişmez.
  let boardSt = new BoardState(SIZE);
  // Görsel taş listesi — [{gx,gz,color,t,removing:false}] (basit giriş
  // animasyonu için `t` 0→1 ilerler; ogren-3d.html'deki particle/ghost
  // sistemleri BİLEREK taşınmadı, yalnız sade bir ölçek-içi geçiş var).
  let visualStones = [];
  // Pedagojik nefes-noktası vurgusu — [{gx,gz,t}], `t` 0→1 sakin bir
  // fade-in için ilerler (bkz. drawLibertyMark). Oynanabilir bir hedef
  // rehberi DEĞİLDİR, yalnız seçili taşın gerçek komşu boş noktalarını
  // gösterir (bkz. getLibertiesAt/showLiberties/clearLiberties).
  let libertyPoints = [];
  // Hamle öncesi taş silueti — {gx,gz,color}|null. Board State'e ASLA
  // yazılmaz, yalnız görsel bir önizlemedir (bkz. setMovePreview/
  // clearMovePreview/drawMovePreview).
  let movePreview = null;
  let inputEnabled = false;
  const tapHandlers = new Set();
  const hoverHandlers = new Set();
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

  let camYaw = .50, camPitch = isMobile ? 1.25 : .88, camDist = 500;
  let camStart = null, camTarget = null, camLerpT = 1;
  const CAM_DUR = 0.65;
  // Son focusPoints() çağrısı — YALNIZ resize/orientation'da AYNI noktaları
  // yeni canvas ölçüleriyle yeniden hesaplamak için saklanır (bkz. altta
  // resize() ve focusPoints()). Adapter bu noktaların hangi sahne/moment'e
  // ait olduğunu BİLMEZ — yalnız "en son hangi ham point listesi/seçenek
  // verildi" bilgisini tutar.
  let activeFocusPoints = null;
  // Son focusPoints() SONUCU — { adjusted, reason, safe, yaw, pitch, dist } | null
  // — YALNIZ test/gözlem amaçlı (bkz. getFocusPointsResult), getMovePreviewState()
  // ile AYNI desen.
  let lastFocusResult = null;

  function updateProjCenter() { projCY = H * 0.5; }
  function resize() {
    W = canvas.width = canvas.clientWidth || canvas.parentElement?.clientWidth || innerWidth;
    H = canvas.height = canvas.clientHeight || canvas.parentElement?.clientHeight || innerHeight;
    updateProjCenter();
    // Aktif bir focusPoints() varsa YENİ canvas ölçüleriyle SESSİZCE (animasyonsuz,
    // "sürekli zıplama" olmadan) yeniden hesaplanır — bkz. görev talimatı
    // "mobil resize/orientation değişiminde güvenli biçimde yeniden hesaplanabilmeli".
    if (activeFocusPoints) applyFocusPoints(activeFocusPoints.points, activeFocusPoints.opts, false);
  }
  resize();
  window.addEventListener('resize', resize);

  function projectAt(x, y, z, yaw, pitch, dist) {
    const rx = x * Math.cos(yaw) + z * Math.sin(yaw);
    const rz = -x * Math.sin(yaw) + z * Math.cos(yaw);
    const ry2 = y * Math.cos(pitch) - rz * Math.sin(pitch);
    const rz2 = y * Math.sin(pitch) + rz * Math.cos(pitch);
    const fov = 700, sc = fov / Math.max(fov + rz2, 1) * (dist / 500);
    return { sx: W / 2 + rx * sc, sy: projCY + ry2 * sc, scale: sc, z: rz2 };
  }
  function project(x, y, z) { return projectAt(x, y, z, camYaw, camPitch, camDist); }

  function lerpAngle(a, b, t) { return a + (b - a) * t; }

  /** `auxPts` (padding'li kenar noktaları), verilen (yaw,pitch,dist) kamera
      durumunda `safe` dikdörtgenin NE KADAR (px) dışına taşıyor — en kötü
      (en büyük) taşma değeri döner; <=0 ⟺ TÜMÜ güvenli alan içinde.
      `shrink` küçük bir histerezis payıdır (bkz. computeFraming notu). */
  function worstViolationAt(auxPts, safe, yaw, pitch, dist, shrink) {
    const Y = stoneSurfaceY();
    let worst = -Infinity;
    for (const ap of auxPts) {
      const p = projectAt(ap.wx, Y, ap.wz, yaw, pitch, dist);
      worst = Math.max(worst,
        (safe.left + shrink) - p.sx, p.sx - (safe.right - shrink),
        (safe.top + shrink) - p.sy, p.sy - (safe.bottom - shrink));
    }
    return worst;
  }

  /** `auxPts`'i sabit (yaw,pitch)'te `safe` dikdörtgene sığdıran EN BÜYÜK
      (en az yakınlaştırılmış — bağlamı en çok koruyan) dist'i, [minZoom,
      maxZoom] içinde, projeksiyonun dist'e göre LİNEER ölçeklenmesinden
      (bkz. projectAt: sc ∝ dist, sabit yaw/pitch/nokta için) kapalı biçimde
      çözer. */
  function solveDistForFit(auxPts, safe, yaw, pitch, minZoom, maxZoom) {
    const Y = stoneSurfaceY();
    const REF_DIST = 500;
    let lo = minZoom, hi = maxZoom;
    for (const ap of auxPts) {
      const proj = projectAt(ap.wx, Y, ap.wz, yaw, pitch, REF_DIST);
      const dx = proj.sx - W / 2, dy = proj.sy - projCY;
      if (dx !== 0) {
        const b1 = (safe.left - W / 2) * REF_DIST / dx, b2 = (safe.right - W / 2) * REF_DIST / dx;
        lo = Math.max(lo, Math.min(b1, b2)); hi = Math.min(hi, Math.max(b1, b2));
      }
      if (dy !== 0) {
        const b1 = (safe.top - projCY) * REF_DIST / dy, b2 = (safe.bottom - projCY) * REF_DIST / dy;
        lo = Math.max(lo, Math.min(b1, b2)); hi = Math.min(hi, Math.max(b1, b2));
      }
    }
    // hi<lo ⟹ noktalar minZoom'da bile TAM sığmıyor (aşırı yayılmış) — en
    // iyi çaba olarak en geniş açıyı (minZoom) kullan; kör bir throw/crash
    // YERİNE sessizce en makul değere düşer (bkz. adapter genelindeki
    // savunmacı üslup, ör. setSize) — GERÇEK sonuç `safe` alanında ayrıca
    // raporlanır (bkz. computeFraming).
    return Math.max(minZoom, Math.min(maxZoom, hi >= lo ? hi : minZoom));
  }

  const FOCUS_HYSTERESIS_PX = 3;

  /**
   * GÖRÜNÜRLÜK-ÖNCELİKLİ karar: hedefler (satır/sütun noktaları — her biri
   * GERÇEK görsel ayak izi, STONE_R + nefes işareti kolu, dahil) MEVCUT
   * (GERÇEKTEN o an render EDİLEN/edilecek — bkz. `liveState` altında)
   * kamera durumunda zaten güvenli alandaysa kameraya HİÇ dokunulmaz —
   * `{adjusted:false}` döner. DEĞİLSE düzeltme, `focus(presetName)`'in
   * GÜNCEL (canlı) canvas geometrisiyle YENİDEN uygulanmış hâlinden (bkz.
   * `freshBase` altında) başlar — ÖNCEKİ bir düzeltmenin üzerine
   * ZİNCİRLEME YAPILMAZ (bkz. görev talimatı KÖK NEDEN: orientation
   * değişiminde önceki düzeltmenin — donmuş `isMobile`'a bağlı — pitch'i
   * YANLIŞ bir başlangıç noktası oluyordu). Bu, "portrait→landscape→
   * portrait sonunda kamera AYNI ilk state'e döner" ve "birikimli drift
   * OLMAZ" garantisini SAĞLAR — her çağrı, PRESET'İN KENDİSİNDEN + O ANKİ
   * GERÇEK canvas ölçüsünden bağımsız/deterministik olarak yeniden türetir.
   *
   * Cihaz/user-agent/"mobil" bayrağı/sabit breakpoint/assessment-index'e
   * HİÇ bakmaz — yalnız GERÇEK canvas ölçüleri + world→screen izdüşümü.
   * `freshBase`'in pitch'i `focus(presetName)`'in KENDİ mobil-clamp
   * FORMÜLÜYLE (`Math.max(preset.pitch,1.2)`) AYNI ŞEKİLDE hesaplanır —
   * yalnız DONMUŞ `isMobile` yerine O ANKİ CANLI canvas genişliği (`W`)
   * kullanılır; `focus()`'un KENDİSİ veya paylaşılan `isMobile` DEĞİŞMEDİ.
   *
   * @param {Array<{row:number,col:number}>} points
   * @param {{padding?:number, minZoom?:number, maxZoom?:number, motion?:boolean, hysteresisPx?:number, presetName?:string}} [opts]
   * @returns {{adjusted:boolean, reason:'already-visible'|'outside-safe-area'|'clamped-unresolved', safe:boolean, yaw:number, pitch:number, dist:number, worstViolationPx:number}}
   */
  function computeFraming(points, opts) {
    const {
      // Varsayılan: gerçek taş yarıçapı + nefes işaretinin kol uzunluğu
      // (bkz. drawLibertyMark `arm = CELL*0.22`) + küçük görsel boşluk —
      // "cihaza göre değil gerçek renderer geometrisine göre" (bkz. görev
      // talimatı Bölüm 4/8).
      padding = STONE_R + CELL * 0.22 + CELL * 0.18,
      minZoom = 320,
      // Mevcut preset'lerin dist aralığıyla (420-520) tutarlı üst sınır —
      // bağlamı kaybettirecek kadar agresif YAKINLAŞTIRMAZ.
      maxZoom = 480,
      hysteresisPx = FOCUS_HYSTERESIS_PX,
      presetName = 'overview',
    } = opts || {};

    const worldPts = points.map(p => ({ wx: -HALF + p.col * CELL, wz: -HALF + p.row * CELL }));
    const wx0 = worldPts.reduce((s, p) => s + p.wx, 0) / worldPts.length;
    const wz0 = worldPts.reduce((s, p) => s + p.wz, 0) / worldPts.length;
    // Her gerçek noktanın etrafına, GERÇEK görsel ayak izini (padding)
    // kapsayan eksen-hizalı 4 "kenar" noktası eklenir — dairesel bir ayak
    // izinin dünya-uzayı sınır kutusu TAM OLARAK merkez±padding'tir, bu
    // yüzden köşegen nokta GEREKMEZ.
    const auxPts = [];
    for (const p of worldPts) {
      auxPts.push({ wx: p.wx + padding, wz: p.wz }, { wx: p.wx - padding, wz: p.wz },
        { wx: p.wx, wz: p.wz + padding }, { wx: p.wx, wz: p.wz - padding });
    }
    // Kenar boşluğu, canvas'ın küçük kenarıyla ORANTILI (cihaza özel sabit
    // DEĞİL) — üstte, learning-scenes.html'in canvas üzerine bindirdiği
    // "← Ana"/"Konular" düğmeleri için ek bir pay bırakılır.
    const edgeMargin = Math.max(24, Math.min(W, H) * 0.05);
    const topMargin = Math.max(edgeMargin, 56);
    const safe = { left: edgeMargin, right: W - edgeMargin, top: topMargin, bottom: H - edgeMargin };

    // 1) GÜVENLİK KONTROLÜ — GERÇEKTEN o an render EDİLEN/edilecek duruma
    // (`camTarget`, `focus(presetName)` az önce çağrıldıysa O preset'in
    // GERÇEK hedef değerlerini — animasyon henüz İLERLEMEMİŞ olsa bile —
    // taşır) karşı. Bu "canlı ama animasyon henüz tık atmadı" ara durumunu
    // DEĞİL, kullanıcının GÖRECEĞİ nihai durumu doğru yansıtır (masaüstü
    // no-op'un timing-güvenli kalması İÇİN gerekli).
    const liveState = camTarget || { yaw: camYaw, pitch: camPitch, dist: camDist };
    const liveWorst = worstViolationAt(auxPts, safe, liveState.yaw, liveState.pitch, liveState.dist, hysteresisPx);
    if (liveWorst <= 0) {
      return { adjusted: false, reason: 'already-visible', safe: true, yaw: liveState.yaw, pitch: liveState.pitch, dist: liveState.dist, worstViolationPx: 0 };
    }

    // 2) DÜZELTME GEREKLİ. Başlangıç noktası — ÖNCEKİ bir düzeltmenin
    // (`liveState`) DEĞİL — `focus(presetName)`'in O ANKİ CANLI canvas
    // genişliğiyle YENİDEN uygulanmış hâlidir (bkz. fonksiyon başı notu).
    const rawPreset = CAM_PRESETS[presetName] || CAM_PRESETS.overview;
    // freshBase, `focus(presetName)`'in KENDİ dar-layout FORMÜLÜYLE
    // (`{...preset, yaw:.50, pitch:Math.max(preset.pitch,1.2)}`) BİREBİR
    // AYNI şekilde — yalnız donmuş `isMobile` yerine `isNarrowLayout()`
    // (canlı `W`) ile — yeniden türetilir; böylece "taze bir mount bu
    // preset'i BU geometride nasıl uygulardı" sorusunun cevabıyla TUTARLI
    // kalır (bkz. fonksiyon başı notu).
    const freshBase = isNarrowLayout()
      ? { yaw: .50, pitch: Math.max(rawPreset.pitch, 1.2), dist: rawPreset.dist }
      : { yaw: rawPreset.yaw, pitch: rawPreset.pitch, dist: rawPreset.dist };

    // Tam-merkezleme yawını (rx=0 ⟺ (cos,sin) ⊥ (wx0,wz0)) kapalı biçimde
    // çöz — YALNIZ bir ÜST SINIR/hedef olarak; asıl kullanılan sapma
    // aşağıda ikili aramayla EN KÜÇÜK olacak şekilde bulunur.
    let idealYaw = (wx0 === 0 && wz0 === 0) ? freshBase.yaw : Math.atan2(-wx0, wz0);
    const rzCheck = -wx0 * Math.sin(idealYaw) + wz0 * Math.cos(idealYaw);
    if (rzCheck < 0) idealYaw += Math.PI;
    // freshBase.yaw'a EN YAKIN eşdeğer açıyı seç (en kısa açısal fark) —
    // normalize edilmezse tam tur (2π) uzaklıktaki eşdeğer bir hedef
    // GEREKSİZ YERE tam tur döndürürdü.
    while (idealYaw - freshBase.yaw > Math.PI) idealYaw -= 2 * Math.PI;
    while (idealYaw - freshBase.yaw < -Math.PI) idealYaw += 2 * Math.PI;

    let chosenYaw = freshBase.yaw, chosenDist = freshBase.dist;
    if (worstViolationAt(auxPts, safe, freshBase.yaw, freshBase.pitch, freshBase.dist, 0) <= 0) {
      // freshBase'İN KENDİSİ (t=0, HİÇBİR sapma) ZATEN güvenli — bkz. görev
      // talimatı KÖK NEDEN: `idealYaw`nın (tam merkezleme) her zaman freshBase
      // kadar (hatta ondan DAHA AZ) güvenli olacağı VARSAYILAMAZ — özellikle
      // KISA/geniş (landscape) bir canvas'ta tam merkezleme dikey sınırı
      // İHLAL edebilirken, preset'in KENDİSİ (freshBase) zaten güvenli
      // kalabilir. Bu durumda EK hiçbir sapma/zoom GEREKMEZ — doğrudan
      // preset'e (yeniden) dönülür.
      chosenYaw = freshBase.yaw; chosenDist = freshBase.dist;
    } else if (worstViolationAt(auxPts, safe, idealYaw, freshBase.pitch, freshBase.dist, 0) <= 0) {
      // freshBase'in KENDİSİ yetersiz ama tam merkezleme (freshBase dist'inde)
      // yeterli — freshBase.yaw'dan idealYaw'a giden yolda, güvenliği sağlayan
      // EN KÜÇÜK t∈(0,1] payını ikili arama ile bul (yalnız GEREKEN kadar dön).
      let lo = 0, hi = 1;
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2;
        const y = lerpAngle(freshBase.yaw, idealYaw, mid);
        if (worstViolationAt(auxPts, safe, y, freshBase.pitch, freshBase.dist, 0) <= 0) hi = mid; else lo = mid;
      }
      chosenYaw = lerpAngle(freshBase.yaw, idealYaw, hi);
      chosenDist = freshBase.dist;
    } else {
      // Yaw TEK BAŞINA (freshBase dist'inde, ne t=0 ne tam merkezleme)
      // yetersiz — bağlamı korumak için tam-merkezleme yawında dist'i
      // (zoom) GEREKEN kadar (gereksiz yakınlaşma/uzaklaşma OLMADAN)
      // güvenli sınırlara sığdır.
      chosenYaw = idealYaw;
      chosenDist = solveDistForFit(auxPts, safe, idealYaw, freshBase.pitch, minZoom, maxZoom);
    }

    const finalWorst = worstViolationAt(auxPts, safe, chosenYaw, freshBase.pitch, chosenDist, 0);
    const isSafe = finalWorst <= 0.5;
    return { adjusted: true, reason: isSafe ? 'outside-safe-area' : 'clamped-unresolved', safe: isSafe, yaw: chosenYaw, pitch: freshBase.pitch, dist: chosenDist, worstViolationPx: Math.max(0, finalWorst) };
  }

  /**
   * `computeFraming`'in sonucunu GERÇEKTEN uygular. Sonuç `adjusted:false`
   * ise camYaw/camPitch/camDist/camStart/camTarget'a HİÇ DOKUNMAZ (bkz. görev
   * talimatı Bölüm 5: "no-op sözleşmesi") — mevcut preset'in (veya önceki
   * odaklanmanın) animasyonu/durağan hâli KESİNTİSİZ devam eder.
   * @param {Array<{row:number,col:number}>} points
   * @param {object} [opts]
   * @param {boolean} animate — false ise ANINDA (lerp'siz) uygulanır (resize/orientation)
   * @returns {ReturnType<typeof computeFraming>|null}
   */
  function applyFocusPoints(points, opts, animate) {
    if (!Array.isArray(points) || points.length === 0) { activeFocusPoints = null; lastFocusResult = null; return null; }
    const { motion = true } = opts || {};
    const result = computeFraming(points, opts);
    activeFocusPoints = { points, opts };
    lastFocusResult = result;
    if (!result.adjusted) return result;

    if (!animate) {
      camYaw = result.yaw; camPitch = result.pitch; camDist = result.dist;
      camStart = camTarget = null; camLerpT = 1;
      return result;
    }
    camStart = { yaw: camYaw, pitch: camPitch, dist: camDist };
    camTarget = { yaw: result.yaw, pitch: result.pitch, dist: result.dist };
    camLerpT = motion && !reduceMotion ? 0 : 1;
    if (camLerpT === 1) { camYaw = result.yaw; camPitch = result.pitch; camDist = result.dist; }
    return result;
  }

  function drawFace(corners, fill, stroke) {
    const pts = corners.map(([x, y, z]) => project(x, y, z));
    ctx.beginPath(); pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.sx, p.sy) : ctx.lineTo(p.sx, p.sy));
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
    ctx.strokeStyle = stroke || fill; ctx.lineWidth = 1; ctx.stroke();
  }

  function drawBoard() {
    const bh = BOARD_H / 2, bw = HALF + CELL * .82;
    drawFace([[-bw, -bh, -bw], [-bw, -bh, bw], [-bw, bh, bw], [-bw, bh, -bw]], '#7a4e0e', '#5e3a08');
    drawFace([[-bw, -bh, bw], [bw, -bh, bw], [bw, bh, bw], [-bw, bh, bw]], '#8a5a12', '#6a4408');
    drawFace([[bw, -bh, -bw], [bw, -bh, bw], [bw, bh, bw], [bw, bh, -bw]], '#966014', '#724808');
    const top = [[-bw, -bh, -bw], [bw, -bh, -bw], [bw, -bh, bw], [-bw, -bh, bw]];
    const tpts = top.map(([x, y, z]) => project(x, y, z));
    ctx.save(); ctx.beginPath();
    tpts.forEach((p, i) => i === 0 ? ctx.moveTo(p.sx, p.sy) : ctx.lineTo(p.sx, p.sy));
    ctx.closePath(); ctx.clip();
    ctx.fillStyle = woodPat; ctx.globalAlpha = .96; ctx.fill();
    ctx.globalAlpha = .06; ctx.fillStyle = '#2a1200'; ctx.fill();
    ctx.globalAlpha = 1; ctx.strokeStyle = '#6a4008'; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.restore();
  }

  function drawGrid() {
    const Y = -BOARD_H / 2 - .4;
    const corners = [[-HALF, Y, -HALF], [HALF, Y, -HALF], [HALF, Y, HALF], [-HALF, Y, HALF]];
    ctx.strokeStyle = 'rgba(55,24,0,.92)'; ctx.lineWidth = 1.9;
    for (let i = 0; i < 4; i++) {
      const a = project(...corners[i]), b = project(...corners[(i + 1) % 4]);
      ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(55,24,0,.68)'; ctx.lineWidth = .8;
    for (let i = 1; i < SIZE - 1; i++) {
      const p = -HALF + i * CELL;
      const a = project(p, Y, -HALF), b = project(p, Y, HALF);
      ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
      const c = project(-HALF, Y, p), d = project(HALF, Y, p);
      ctx.beginPath(); ctx.moveTo(c.sx, c.sy); ctx.lineTo(d.sx, d.sy); ctx.stroke();
    }
    const HOSHI = SIZE === 19
      ? [[3, 3], [9, 3], [15, 3], [3, 9], [9, 9], [15, 9], [3, 15], [9, 15], [15, 15]]
      : SIZE === 13
        ? [[3, 3], [9, 3], [6, 6], [3, 9], [9, 9]]
        : [[2, 2], [6, 2], [4, 4], [2, 6], [6, 6]];
    const hoshiR = SIZE === 9 ? 3.8 : SIZE === 13 ? 2.6 : 2.0;
    HOSHI.forEach(([sx, sz]) => {
      const p = project(-HALF + sx * CELL, Y, -HALF + sz * CELL);
      ctx.beginPath(); ctx.arc(p.sx, p.sy, hoshiR * p.scale, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(48,20,0,.88)'; ctx.fill();
    });
    const LTRS_ALL = 'ABCDEFGHJKLMNOPQRST';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i < SIZE; i++) {
      const pos = -HALF + i * CELL;
      const lb = project(pos, Y, HALF + CELL * .72), nl = project(-HALF - CELL * .72, Y, pos);
      const fs = Math.round(9 * lb.scale); if (fs < 6) continue;
      ctx.font = `bold ${fs}px monospace`; ctx.fillStyle = 'rgba(75,36,6,.78)';
      ctx.fillText(LTRS_ALL[i], lb.sx, lb.sy); ctx.fillText(String(SIZE - i), nl.sx, nl.sy);
    }
  }

  function stoneRadii(p, mul) {
    mul = mul || 1;
    const rx = STONE_R * p.scale * mul;
    const sp = Math.sin(camPitch), cp = Math.cos(camPitch);
    return { rx, ry: rx * Math.sqrt(sp * sp + ASPECT_3D * ASPECT_3D * cp * cp) };
  }

  /** Taş yüzeyinin oturduğu dünya-Y (board üstü) — ogren-3d.html'deki AYNI sabit. */
  function stoneSurfaceY() { return -(BOARD_H / 2) - STONE_R * ASPECT_3D - 1; }

  // Sade, boyut-agnostik taş çizimi — ogren-3d.html'in tam particle/highlight
  // detayları BİLEREK taşınmadı, ama gradient/gölge YAPISI aynı. `alpha`
  // parametresi ogren-3d.html'in `drawStone(wx,wy,wz,color,alpha,mul)`
  // tekniğiyle AYNI — ghost/preview taşı (bkz. drawMovePreview) GERÇEK taş
  // koduyla PAYLAŞIR, ikinci bir "siluet çizici" YAZILMADI.
  function drawStone(gx, gz, color, scale, alpha) {
    const wx = -HALF + gx * CELL, wz = -HALF + gz * CELL;
    const p = project(wx, stoneSurfaceY(), wz);
    const { rx, ry } = stoneRadii(p, scale ?? 1);
    if (rx < 2) return;
    const isB = color === 'black';
    ctx.save();
    if (alpha !== undefined) ctx.globalAlpha = alpha;
    const ps = project(wx, -BOARD_H / 2 - .5, wz);
    const sg = ctx.createRadialGradient(ps.sx + rx * .1, ps.sy + ry * .12, 0, ps.sx + rx * .1, ps.sy + ry * .12, rx);
    sg.addColorStop(0, 'rgba(0,0,0,.38)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath(); ctx.ellipse(ps.sx + rx * .1, ps.sy + ry * .12, rx, ry * .48, 0, 0, Math.PI * 2);
    ctx.fillStyle = sg; ctx.fill();

    ctx.beginPath(); ctx.ellipse(p.sx, p.sy, rx, ry, 0, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(p.sx - rx * .2, p.sy - ry * .25, rx * .03, p.sx, p.sy, rx * 1.05);
    if (isB) {
      g.addColorStop(0, '#4e5c70'); g.addColorStop(.4, '#171b28'); g.addColorStop(1, '#050508');
    } else {
      g.addColorStop(0, '#fbf8f2'); g.addColorStop(.6, '#efe8da'); g.addColorStop(1, '#d8d0c2');
    }
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = isB ? '#181c28' : 'rgba(90,72,45,.5)';
    ctx.lineWidth = rx * .045; ctx.stroke();
    ctx.restore();
  }

  /**
   * Pedagojik nefes-noktası işareti — eski `ogren-3d.html`'in
   * `drawPedagogyHighlights3D()` ("firuze artı") fonksiyonundan ADAPTE
   * edildi: kısa turkuaz/cyan ışık kolları (yatay+dikey) + küçük merkez
   * noktası. Kol uzunluğu DÜNYA uzayında sabit (`CELL*0.22`) tutulup HER
   * kol ucu ayrı ayrı `project()`lenir — bu, eski koddaki AYNI perspektif-
   * doğru teknik (yalnız ekran-uzayında ölçeklemek yerine). Büyük bir `+`
   * karakteri DEĞİL: kısa, ince ışık parçaları. Eski koddaki SÜREKLİ
   * sinüs pulse'u BİLİNÇLİ olarak alınmadı (bkz. görev talimatı) — `t`
   * yalnız İLK gösterimde 0→1 ilerleyen, tek seferlik sakin bir fade-in;
   * tam görünür olduktan sonra STATİK kalır.
   */
  function drawLibertyMark(gx, gz, t) {
    const wx = -HALF + gx * CELL, wz = -HALF + gz * CELL;
    const Y = -BOARD_H / 2 - .3;
    const p = project(wx, Y, wz);
    if (p.scale < 0.12) return;
    const e = reduceMotion ? 1 : easeInOutCubic(Math.min(1, t));
    const arm = CELL * 0.22; // dünya-uzayında sabit kol uzunluğu (ogren-3d.html ile AYNI oran)
    const alpha = 0.78 * e;
    ctx.save();
    ctx.strokeStyle = `rgba(91,210,195,${alpha.toFixed(2)})`;
    ctx.lineWidth = Math.max(1.3, 2.1 * p.scale);
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(91,210,195,.55)';
    ctx.shadowBlur = 2.5 * p.scale; // hafif glow — büyük bloom DEĞİL
    const pL = project(wx - arm, Y, wz), pR = project(wx + arm, Y, wz);
    ctx.beginPath(); ctx.moveTo(pL.sx, pL.sy); ctx.lineTo(pR.sx, pR.sy); ctx.stroke();
    const pU = project(wx, Y, wz - arm), pD = project(wx, Y, wz + arm);
    ctx.beginPath(); ctx.moveTo(pU.sx, pU.sy); ctx.lineTo(pD.sx, pD.sy); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.arc(p.sx, p.sy, Math.max(1.1, 1.8 * p.scale), 0, Math.PI * 2);
    ctx.fillStyle = `rgba(91,210,195,${Math.min(1, alpha + .12).toFixed(2)})`;
    ctx.fill();
    ctx.restore();
  }

  /**
   * Hamle öncesi taş silueti (ghost preview) — GERÇEK taş çizimini
   * (drawStone, yarı saydam alpha ile — ogren-3d.html'in düşük-alpha
   * `drawStone(...,.22,...)` ghost tekniği) ince turkuaz/cyan bir çevre
   * halkasıyla birleştirir (halka geometrisi ogren-3d.html'in ghost-ring
   * çizim TEKNİĞİNden adapte edildi, renk turkuaza çevrildi, pulse
   * KALDIRILDI — bkz. görev talimatı). Büyük glow/pulse YOK.
   *
   * v0.13 — alpha 0.30→0.42: canlı kullanıcı testinde PİKSEL ÖRNEKLEMESİYLE
   * ölçüldü — bu tahtanın sıcak/açık ahşap zeminine karşı 0.30 alpha'da
   * ghost'un board'a göre RENK SAPMASI, aynı noktadaki gerçek taşın board'a
   * göre sapmasının yalnız ~%29-30'u kadardı (geometrik yarıçap zaten
   * DOĞRUYDU — ~%103, gerçek taşla neredeyse birebir — sorun BOYUT değil
   * KONTRASTTI, bkz. görev talimatı test raporu). 0.30/0.38/0.42 üçü de
   * piksel örneklemesi + ekran görüntüsü karşılaştırmasıyla test edildi;
   * 0.42'de sapma oranı ~%39'a çıkıyor ve ghost artık ekran görüntüsünde
   * NET biçimde hacimli/küresel bir siluet olarak okunuyor, board dokusu
   * hâlâ hafifçe seçilebiliyor ve gerçek taştan (alpha=1, tam opak) AÇIKÇA
   * ayırt edilebilir kalıyor — görev talimatının izin verdiği 0.30–0.42
   * aralığının üst sınırı.
   */
  function drawMovePreview(gx, gz, color) {
    drawStone(gx, gz, color, 1, 0.42);
    const wx = -HALF + gx * CELL, wz = -HALF + gz * CELL;
    const p = project(wx, stoneSurfaceY(), wz);
    const { rx, ry } = stoneRadii(p, 1.1);
    if (rx < 2) return;
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = 'rgb(91,210,195)';
    ctx.lineWidth = Math.max(1, rx * 0.05);
    ctx.beginPath(); ctx.ellipse(p.sx, p.sy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  /** Tek noktalı, çok sade pointer hover geri bildirimi — kesişimlerin
      TÜMÜNÜ işaretlemez, yalnız imlecin en yakın olduğu kesişimi. */
  function drawHoverPoint(gx, gz) {
    const wx = -HALF + gx * CELL, wz = -HALF + gz * CELL;
    const Y = -BOARD_H / 2 - .3;
    const p = project(wx, Y, wz);
    const r = Math.max(2.2, CELL * 0.09) * p.scale;
    ctx.save();
    ctx.strokeStyle = 'rgba(232,228,222,.55)';
    ctx.lineWidth = Math.max(1, r * 0.22);
    ctx.beginPath(); ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  function render() {
    const bg = ctx.createRadialGradient(W * .5, H * .45, 0, W * .5, H * .5, Math.max(W, H) * .75);
    bg.addColorStop(0, '#141420'); bg.addColorStop(1, '#060608');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    drawBoard();
    drawGrid();
    // movePreview aktifken sade hover noktası GÖSTERİLMEZ — aynı kesişimde
    // iki farklı işaret üst üste binmesin diye (bkz. drawMovePreview).
    if (inputEnabled && hoverPoint && !movePreview) drawHoverPoint(hoverPoint.gx, hoverPoint.gz);
    for (const l of libertyPoints) drawLibertyMark(l.gx, l.gz, l.t);
    if (movePreview) drawMovePreview(movePreview.gx, movePreview.gz, movePreview.color);
    const sorted = [...visualStones].sort((a, b) => project(-HALF + a.gx * CELL, 0, -HALF + a.gz * CELL).z - project(-HALF + b.gx * CELL, 0, -HALF + b.gz * CELL).z);
    for (const s of sorted) {
      const scale = reduceMotion ? 1 : easeInOutCubic(Math.min(1, s.t));
      drawStone(s.gx, s.gz, s.color, scale);
    }
  }

  let rafId = null;
  let lastFrameMs = 0;
  const STONE_ANIM_DUR = 0.16;
  const LIBERTY_FADE_DUR = 0.25;
  function loop(nowMs) {
    const dt = lastFrameMs ? Math.min(0.05, (nowMs - lastFrameMs) / 1000) : 1 / 60;
    lastFrameMs = nowMs;
    if (camLerpT < 1 && camTarget) {
      camLerpT = Math.min(1, camLerpT + (1 / 60) / CAM_DUR);
      const t = easeInOutCubic(camLerpT);
      camYaw = lerp(camStart.yaw, camTarget.yaw, t);
      camPitch = lerp(camStart.pitch, camTarget.pitch, t);
      camDist = lerp(camStart.dist, camTarget.dist, t);
    }
    if (!reduceMotion) {
      for (const s of visualStones) if (s.t < 1) s.t = Math.min(1, s.t + dt / STONE_ANIM_DUR);
      for (const l of libertyPoints) if (l.t < 1) l.t = Math.min(1, l.t + dt / LIBERTY_FADE_DUR);
    }
    render();
    rafId = requestAnimationFrame(loop);
  }
  rafId = requestAnimationFrame(loop);

  // ── Kesişim tıklaması → hit-test → abone edilen handler'lara ilet ────
  // Sahne modülleri canvas/koordinat matematiğine HİÇ dokunmaz; yalnız
  // onIntersectionTap(handler) ile abone olur.
  function screenToGrid(mx, my) {
    const BY = -BOARD_H / 2;
    let best = null, bestD = Infinity, bestSc = 1;
    for (let gz = 0; gz < SIZE; gz++) {
      for (let gx = 0; gx < SIZE; gx++) {
        const p = project(-HALF + gx * CELL, BY, -HALF + gz * CELL);
        const d = Math.hypot(mx - p.sx, my - p.sy);
        if (d < bestD) { bestD = d; best = { gx, gz }; bestSc = p.scale; }
      }
    }
    const hitMult = isMobile ? 0.72 : 0.55;
    return bestD < CELL * hitMult * bestSc ? best : null;
  }
  // Sade tek-nokta pointer hover — yalnız girdi AÇIKKEN, yalnız imlecin
  // en yakın olduğu TEK kesişim (bkz. drawHoverPoint). "Rehber" listesi
  // YOK — kullanıcı her kesişime doğal olarak hover edebilir. Aynı hit
  // bilgisi onIntersectionHover() abonelerine de iletilir — sahne modülü
  // BUNUN üzerinden setMovePreview/clearMovePreview çağırır (adaptör
  // dışına canvas/hit-testing SIZDIRILMAZ, bkz. dosya başı sözleşme).
  let hoverPoint = null;
  function pointerXY(evt) {
    const rect = canvas.getBoundingClientRect();
    const clientX = evt.touches?.[0]?.clientX ?? evt.clientX;
    const clientY = evt.touches?.[0]?.clientY ?? evt.clientY;
    return { mx: clientX - rect.left, my: clientY - rect.top };
  }
  function notifyHover(hit) {
    const payload = hit ? { row: hit.gz, col: hit.gx } : null;
    for (const handler of hoverHandlers) handler(payload);
  }
  function handleMove(evt) {
    if (!inputEnabled) { hoverPoint = null; notifyHover(null); return; }
    const { mx, my } = pointerXY(evt);
    hoverPoint = screenToGrid(mx, my);
    notifyHover(hoverPoint);
  }
  function handleClick(evt) {
    if (!inputEnabled) return;
    const { mx, my } = pointerXY(evt);
    const hit = screenToGrid(mx, my);
    if (!hit) return; // tahta dışı/boş tıklama — hamle sayılmaz
    for (const handler of tapHandlers) handler({ row: hit.gz, col: hit.gx });
  }
  canvas.addEventListener('click', handleClick);
  canvas.addEventListener('pointermove', handleMove);
  // Touch cihazlarda kalıcı hover YOK — pointerdown, dokunuş anında BİR
  // KARELİK kısa bir önizleme üretir (ogren-3d.html'in touchstart→ghostGrid
  // deseniyle AYNI ruh); ardından gelen 'click' AYNI etkileşimde hamleyi
  // commit eder — ikinci bir dokunuş İSTENMEZ (bkz. görev talimatı Bölüm B).
  canvas.addEventListener('pointerdown', handleMove);

  return {
    setSize(n) {
      if (![9, 13, 19].includes(n)) return;
      SIZE = n; CELL = sizeToCell(n); HALF = (SIZE - 1) * CELL / 2; STONE_R = CELL * (20 / 48);
      boardSt = new BoardState(SIZE);
      visualStones = [];
      libertyPoints = [];
      movePreview = null;
      hoverPoint = null;
    },
    reset() {
      boardSt.reset(SIZE);
      visualStones = [];
      libertyPoints = [];
      movePreview = null;
      hoverPoint = null;
    },
    focus(presetName) {
      // bkz. focusPoints() — adlandırılmış preset'e dönüş eski focus-noktası
      // state'ini/tanı sonucunu GEÇERSİZ kılar.
      activeFocusPoints = null;
      lastFocusResult = null;
      const preset = CAM_PRESETS[presetName] || CAM_PRESETS.overview;
      const target = isMobile ? { ...preset, yaw: .50, pitch: Math.max(preset.pitch, 1.2) } : preset;
      camStart = { yaw: camYaw, pitch: camPitch, dist: camDist };
      camTarget = { ...target };
      camLerpT = 0;
    },

    /**
     * GÖRÜNÜRLÜK-ÖNCELİKLİ kamera kadrajı (bkz. computeFraming üstündeki tam
     * algoritma notu): verilen board noktaları (satır/sütun — her birinin
     * gerçek görsel ayak izi, taş yarıçapı + nefes işareti kolu, dahil)
     * MEVCUT (GERÇEKTEN o an render edilen/edilecek) kamera durumunda ZATEN
     * güvenli alandaysa kameraya HİÇ DOKUNMAZ — `focus(presetName)`'in
     * aksine SAHNEYE/adım'a ÖZEL bilgi TAŞIMAZ, cihaz/user-agent/"mobil"
     * bayrağı/breakpoint'e BAKMAZ, yalnız verilen noktaların GERÇEK izdüşüm
     * geometrisini kullanır. Güvenli DEĞİLSE düzeltme, `opts.presetName`'in
     * O ANKİ CANLI canvas genişliğiyle YENİDEN uygulanmış hâlinden başlar
     * (bkz. computeFraming — ÖNCEKİ bir düzeltmenin üzerine ZİNCİRLEME
     * YAPILMAZ, bu orientation değişiminde birikimli drift'i ÖNLER) ve
     * EN KÜÇÜK yaw/dist sapmasını uygular. Mobil resize/orientation
     * değişiminde OTOMATİK yeniden hesaplanır (bkz. resize()); `destroy()`
     * ÇAĞRILDIĞINDA ekstra bir temizlik GEREKMEZ — yalnız var olan `resize`
     * listener'ına (zaten destroy'da kaldırılıyor) iliştirilmiştir, yeni bir
     * listener/timer AÇILMAZ.
     * @param {Array<{row:number,col:number}>} points
     * @param {{padding?:number, minZoom?:number, maxZoom?:number, motion?:boolean, hysteresisPx?:number, presetName?:string}} [opts]
     *   `presetName` — düzeltme GEREKİRSE başlangıç preset'i (bkz. CAM_PRESETS);
     *   verilmezse 'overview' varsayılır.
     * @returns {{adjusted:boolean, reason:string, safe:boolean, yaw:number, pitch:number, dist:number, worstViolationPx:number}|null}
     */
    focusPoints(points, opts) {
      return applyFocusPoints(points, opts, true);
    },
    getSize() { return SIZE; },

    /**
     * @param {{row:number,col:number,color:'black'|'white'}} move
     * @returns {boolean}
     */
    isLegalMove({ row, col, color }) {
      return isValidMove(boardSt, col, row, color).valid;
    },

    /**
     * Yasalsa GERÇEK BoardState'i (core/ruleEngine.js applyMove) ve
     * görsel taş listesini günceller. Yasal DEĞİLSE hiçbir şeyi
     * değiştirmez — sahne modülü `.ok` alanına bakarak karar verir.
     * @param {{row:number,col:number,color:'black'|'white'}} move
     * @returns {{ok:boolean, reason?:string, captured?:Array<{row:number,col:number}>}}
     */
    playMove({ row, col, color }) {
      const check = isValidMove(boardSt, col, row, color);
      if (!check.valid) return { ok: false, reason: check.reason };
      const { newState, captured } = applyMove(boardSt, col, row, color);
      boardSt = newState;
      visualStones.push({ gx: col, gz: row, color, t: reduceMotion ? 1 : 0 });
      for (const c of captured) {
        visualStones = visualStones.filter(s => !(s.gx === c.x && s.gz === c.y));
      }
      return { ok: true, captured: captured.map(c => ({ row: c.y, col: c.x })) };
    },

    /**
     * Tahtayı temiz, TEK TAŞLI bir pedagojik "örnek" durumuna döndürür ve
     * yeni taşı yerleştirir — Sahne #3'ün "her seçim bağımsız bir örnektir,
     * önceki taş gerçek Go'da HAREKET ETTİRİLMİYOR" modeli için (bkz. görev
     * talimatı Bölüm C/D). Yasallık HER ZAMAN taze/boş bir tahtaya karşı
     * kontrol edilir (core/ruleEngine.js). Başarısızsa (pratikte yalnız
     * tahta-dışı savunma durumu) ÖNCEKİ geçerli örnek DOKUNULMADAN kalır —
     * hiçbir shared state yasallık kontrolünden ÖNCE mutate edilmez.
     * @param {{row:number,col:number,color:'black'|'white'}} move
     * @returns {{ok:boolean, reason?:string}}
     */
    replaceExampleStone({ row, col, color }) {
      const freshBoard = new BoardState(SIZE);
      const check = isValidMove(freshBoard, col, row, color);
      if (!check.valid) return { ok: false, reason: check.reason };
      const { newState } = applyMove(freshBoard, col, row, color);
      boardSt = newState;
      visualStones = [{ gx: col, gz: row, color, t: reduceMotion ? 1 : 0 }];
      libertyPoints = [];
      movePreview = null;
      return { ok: true };
    },

    /**
     * (row,col) noktasındaki taşın GERÇEK nefes noktalarını
     * core/ruleEngine.js (getGroup/getLiberties) üzerinden hesaplar.
     * Sahne modülleri bu hesabı ASLA kendi tekrarlamaz/sabit sayı
     * varsaymaz — her zaman bu API'den gerçek sonucu okur.
     * @param {{row:number,col:number}} point
     * @returns {Array<{row:number,col:number}>}
     */
    getLibertiesAt({ row, col }) {
      const group = getGroup(boardSt, col, row);
      if (!group.size) return [];
      const libs = getLiberties(boardSt, group);
      return [...libs].map(key => {
        const [x, y] = key.split(',').map(Number);
        return { row: y, col: x };
      });
    },

    /** @param {Array<{row:number,col:number}>} points — pedagojik nefes-noktası işaretlerini çizer. */
    showLiberties(points) {
      libertyPoints = (points || []).map(p => ({ gx: p.col, gz: p.row, t: reduceMotion ? 1 : 0 }));
    },
    clearLiberties() {
      libertyPoints = [];
    },

    /**
     * Salt-okunur GERÇEK ekranda çizilen nefes-noktası işaretleri —
     * YALNIZ gözlem/test amaçlı (bkz. getMovePreviewState/getHoverPoint ile
     * AYNI desen). Testlerin "gösterilen highlight'lar GERÇEKTEN hangi
     * koordinatlar" sorusunu event log'a veya varsayıma güvenmeden,
     * doğrudan adaptörün kendi çizim durumundan yanıtlamasını sağlar
     * (bkz. görev talimatı: "yalnız event sayısına güvenme").
     * @returns {Array<{row:number,col:number}>}
     */
    getLibertyPoints() {
      return libertyPoints.map(p => ({ row: p.gz, col: p.gx }));
    },

    /**
     * Hamle öncesi taş silueti (ghost preview) — BoardState'e ASLA
     * dokunmaz, yalnız görsel. Dolu/tahta-dışı bir noktada göstermek
     * ÇAĞIRANIN sorumluluğudur (sahne modülü isLegalMove ile önce
     * kontrol eder, bkz. scenes/scene03LibertiesByPosition.js).
     * @param {{row:number,col:number,color:'black'|'white'}} point
     */
    setMovePreview({ row, col, color }) {
      movePreview = { gx: col, gz: row, color };
    },
    clearMovePreview() {
      movePreview = null;
    },

    /**
     * Salt-okunur önizleme durumu — YALNIZ gözlem/test amaçlı, hiçbir
     * state DEĞİŞTİRMEZ (bkz. dosya başı v0.12 notu).
     * @returns {{row:number,col:number,color:string}|null}
     */
    getMovePreviewState() {
      return movePreview ? { row: movePreview.gz, col: movePreview.gx, color: movePreview.color } : null;
    },

    /**
     * Salt-okunur GERÇEK kamera durumu (yaw/pitch/dist) — YALNIZ gözlem/test
     * amaçlı, `getMovePreviewState()` ile AYNI desen. Üretim kodu tarafından
     * KULLANILMAZ.
     * @returns {{yaw:number, pitch:number, dist:number}}
     */
    getCameraState() {
      return { yaw: camYaw, pitch: camPitch, dist: camDist };
    },

    /**
     * Son `focusPoints()` çağrısının GERÇEK kararı — YALNIZ gözlem/test
     * amaçlı (bkz. computeFraming). `focus(presetName)` çağrılınca `null`'a
     * SIFIRLANIR (bkz. focus() notu).
     * @returns {{adjusted:boolean, reason:string, safe:boolean, yaw:number, pitch:number, dist:number}|null}
     */
    getFocusPointsResult() {
      return lastFocusResult;
    },

    /**
     * Salt-okunur GERÇEK hit-test sonucu — YALNIZ gözlem/test amaçlı
     * (bkz. getMovePreviewState ile AYNI desen). Sahne modülünün hover
     * aboneliği kurup KURMADIĞINDAN bağımsızdır (bkz. scenes/
     * scene05LibertyAssessment.js — board_tap öğeleri görsel bir hover
     * önizlemesi KURMAZ, ama adaptörün kendi hit-test'i yine de her
     * pointermove'da çalışır) — testlerin "hangi ekran ofseti hangi GERÇEK
     * (row,col)'a denk geliyor" sorusunu, üretim davranışını hiç
     * ETKİLEMEDEN, sabit piksel varsayımı OLMADAN yanıtlamasını sağlar.
     * @returns {{row:number,col:number}|null}
     */
    getHoverPoint() {
      return hoverPoint ? { row: hoverPoint.gz, col: hoverPoint.gx } : null;
    },

    /** false iken onIntersectionTap/onIntersectionHover abonelerine ASLA ulaşılmaz (girdi kilidi) — preview'ı da temizler.
        true'ya DIŞARIDAN (false'tan) geçişte abone olan hover handler'larına `null` bildirilir (bkz. dosya başı v0.12 notu). */
    setInputEnabled(enabled) {
      const wasEnabled = inputEnabled;
      inputEnabled = !!enabled;
      if (!inputEnabled) {
        movePreview = null;
      } else if (!wasEnabled) {
        // Devre dışıyken hoverPoint GÜNCELLENMEDİĞİ için güvenilmez
        // olabilir (ör. Konular paneli açıkken imleç panel öğeleri
        // üzerinde hareket etmiş olabilir, canvas hiç pointermove
        // almamıştır) — null bildirerek abone olan sahnenin KENDİ
        // varsayılan/temizleme mantığını çalıştırmasına izin verilir;
        // bir sonraki GERÇEK pointermove güncel konumu zaten düzeltir.
        hoverPoint = null;
        notifyHover(null);
      }
    },
    isInputEnabled() { return inputEnabled; },

    /**
     * Board etkileşimini GEÇİCİ olarak askıya alır (ör. Konular paneli
     * açılışı) ve salt-okunur bir anlık görüntü döner — YALNIZ çağıranın
     * SAKLAYIP `resumeInteraction()`'a geri vermesi için (bkz. dosya başı
     * v0.14 notu). `setInputEnabled(false)`'ten farkı: genel girdi-kilidi
     * semantiğine (reset/destroy/sahne geçişi davranışına) DOKUNMAZ, yalnız
     * bu ÇAĞRI ÇİFTİNE özgü ayrı bir askıya-alma/geri-yükleme sözleşmesidir.
     * @returns {{inputEnabled:boolean, movePreview:{row:number,col:number,color:string}|null}}
     */
    suspendInteraction() {
      const snapshot = {
        inputEnabled,
        movePreview: movePreview ? { row: movePreview.gz, col: movePreview.gx, color: movePreview.color } : null,
      };
      inputEnabled = false;
      movePreview = null;
      hoverPoint = null;
      return snapshot;
    },

    /**
     * `suspendInteraction()`'ın döndürdüğü snapshot'ı OLDUĞU GİBİ geri
     * yükler — girdi kapalıysa `movePreview` sentezlenmez (kapalı kalır);
     * snapshot'taki `movePreview` (varsa) — `inputEnabled`den BAĞIMSIZ
     * olarak — AYNEN geri gelir: INTRO'da girdi zaten KAPALIYKEN bile
     * merkez silüet meşru biçimde gösteriliyordu (bkz. scenes/
     * scene03LibertiesByPosition.js mount()), bu yüzden restore KARARI
     * `inputEnabled`e ŞARTLI OLAMAZ — snapshot NE YAKALANDIYSA O geri
     * gelir. movePreview snapshot'ta zaten null'sa (ör. ilk hamle
     * yapılmıştı) zorla bir şey OLUŞTURULMAZ. Snapshot geçersiz/eksikse
     * (ör. çağıran zaten sahne değiştiğini fark edip resumeInteraction'ı
     * hiç çağırmamalıydı) güvenle no-op'tur.
     * @param {{inputEnabled:boolean, movePreview:object|null}|null|undefined} snapshot
     */
    resumeInteraction(snapshot) {
      if (!snapshot) return;
      inputEnabled = !!snapshot.inputEnabled;
      movePreview = snapshot.movePreview
        ? { gx: snapshot.movePreview.col, gz: snapshot.movePreview.row, color: snapshot.movePreview.color }
        : null;
      // hoverPoint bilerek geri YÜKLENMEZ — panel açıkken imleç GERÇEKTEN
      // hareket etmiş olabilir; bir sonraki GERÇEK pointermove kendi
      // güncel konumunu zaten kurar (bkz. handleMove).
    },

    /**
     * @param {(hit:{row:number,col:number}) => void} handler
     * @returns {() => void} abonelikten çıkma fonksiyonu
     */
    onIntersectionTap(handler) {
      tapHandlers.add(handler);
      return () => tapHandlers.delete(handler);
    },

    /**
     * Pointer/dokunuş en yakın kesişime her yaklaştığında (girdi açıkken)
     * `{row,col}`, board dışına çıkınca veya girdi kilitliyken `null` ile
     * çağrılır. Sahne modülleri BUNU setMovePreview/clearMovePreview'a
     * bağlar — adaptör canvas/hit-testing'i SIZDIRMAZ.
     * @param {(hit:{row:number,col:number}|null) => void} handler
     * @returns {() => void} abonelikten çıkma fonksiyonu
     */
    onIntersectionHover(handler) {
      hoverHandlers.add(handler);
      return () => hoverHandlers.delete(handler);
    },

    destroy() {
      if (rafId != null) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('click', handleClick);
      canvas.removeEventListener('pointermove', handleMove);
      canvas.removeEventListener('pointerdown', handleMove);
      tapHandlers.clear();
      hoverHandlers.clear();
      libertyPoints = [];
      movePreview = null;
      visualStones = [];
    },
  };
}
