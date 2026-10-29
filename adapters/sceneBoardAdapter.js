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
 *   board.isOccupied({row,col});       // GERÇEK BoardState'ten — o kesişimde taş var mı (bkz. v0.18)
 *   board.showIllegalMoves(points);    // ÇOKLU kehribar-kırmızı halka/çarpı — TAM listeyi DEĞİŞTİRİR (bkz. v0.19)
 *   board.clearIllegalMoves();
 *   board.showIllegalHints(points);    // "ipucu" — ortogonal çapraz+merkez nokta+glow, kehribar-kırmızı (bkz. v0.20, drawIllegalHint)
 *   board.clearIllegalHints();
 *   board.getIllegalMoves();           // GÜNCEL bulunmuş-marker listesi — salt-okunur, YALNIZ test/gözlem amaçlı
 *   board.getIllegalHints();           // GÜNCEL ipucu-marker listesi — salt-okunur, YALNIZ test/gözlem amaçlı
 *   board.showKoFree(points);          // "ko noktası artık serbest" — YEŞİL "neon" halka+✓ (bkz. v0.20, drawKoFree)
 *   board.clearKoFree();
 *   board.getKoFree();                 // GÜNCEL serbest-ko marker listesi — salt-okunur, YALNIZ test/gözlem amaçlı
 *   board.showRegionMarks(points);     // {row,col,color} — RENK-AGNOSTİK bölge göstergesi, elmas halka+nokta (bkz. v0.21, drawRegionMark)
 *   board.clearRegionMarks();
 *   board.getRegionMarks();            // GÜNCEL bölge-marker listesi — salt-okunur, YALNIZ test/gözlem amaçlı
 *   board.destroy();                   // RAF/resize/click listener'ı + tüm durumu temizler
 *
 * v0.21 — Sahne #10'un ("Oyun Sonu ve Sayım") siyah/beyaz BÖLGE göstergesi
 * için YENİ, RENK-AGNOSTİK `showRegionMarks()`/`clearRegionMarks()`/
 * `getRegionMarks()` eklendi — `showKoFree()` (v0.20) İLE AYNI "adapter kaç
 * hedef/hangi sahne bilmez, yalnız güncel liste" deseninin BİR ADIM ÖTESİ:
 * bu kez adapter RENGİ DE bilmez, her noktanın `color`ı çağırandan gelir
 * (bkz. görev talimatı Bölüm 5: "sahneye özel siyah/beyaz hard-code'u
 * adapter içine gömme" — mevcut showKoFree/showIllegalHints gibi TEK sabit
 * renkli API'ler bu ihtiyacı temiz karşılamadığı için YENİ, genel bir bölge
 * API'si eklendi). TEK yeni çizim fonksiyonu `drawRegionMark(gx,gz,t,color)`
 * — mevcut HİÇBİR fonksiyon değiştirilmedi.
 *
 * v0.20 — Sahne #9'un ("Ko Kuralı") "artık serbest" göstergesi için YENİ,
 * izole `showKoFree()`/`clearKoFree()` eklendi — `showIllegalMoves()`/
 * `showIllegalHints()` (v0.19) İLE AYNI "adapter kaç hedef/hangi sahne
 * bilmez, yalnız güncel liste" deseni. Mevcut HİÇBİR fonksiyon
 * değiştirilmedi (bkz. drawKoFree, TEK yeni çizim fonksiyonu).
 *
 * v0.20 — kök neden düzeltmesi (bkz. görev talimatı: "görünmeyen ipucu"):
 * `drawIllegalHint`'in ESKİ tasarımı (kesikli, İNCE, alpha:0.38, glow YOK)
 * gerçek canvas piksel örneklemesiyle ÖLÇÜLDÜ — teknik olarak ÇİZİLİYORDU
 * (state/adapter kancası boş DEĞİLDİ) ama görsel AĞIRLIĞI, tahtanın kendi
 * sıcak ahşap dokusunun DOĞAL ton değişkenliğinin İÇİNDE kayboluyordu
 * (ölçülen amber-piksel sinyali: ipucu YOKKEN yerel ahşap-doku "gürültüsü"
 * ~167-168, ipucu AÇIKKEN yalnız ~185-199'a çıkıyordu — konfirme edilmiş
 * (bulunmuş) işaretin AYNI ölçümde ~247'ye çıkmasıyla TEZAT). Kök neden
 * "state yanlış" veya "projeksiyon yanlış" DEĞİL, saf GÖRSEL AĞIRLIK
 * yetersizliğiydi. Düzeltme: `drawIllegalHint` artık `drawLibertyMark`
 * İLE AYNI ÇİZİM TEKNİĞİNİ (ortogonal çapraz kol + dolu merkez nokta +
 * `shadowBlur` glow, bkz. görev talimatı: "turkuaz neon imlecin görsel
 * diline benzeyen... imleç") kullanır — YALNIZ RENK kehribar-kırmızı
 * (214,92,58) kalır, turkuaz (91,210,195) HİÇ kullanılmaz. Konfirme edilmiş
 * `drawIllegalMark` (halka+DİYAGONAL çarpı) ile ŞEKİLCE de ayrışır — ayrım
 * YALNIZ RENK veya YALNIZ opaklıkla DEĞİL (bkz. görev talimatı Bölüm 4):
 *   - confirmed (`illegalMarks`):  halka + diyagonal X, alpha 0.82, glow YOK
 *   - hint (`illegalHints`):       ortogonal çapraz + merkez nokta, alpha
 *                                  0.80, glow VAR (liberty tekniği)
 *   - liberty (`libertyPoints`):   ortogonal çapraz + merkez nokta, alpha
 *                                  0.78, glow VAR, RENK turkuaz
 * Ayrıca `showIllegalHints()`'in HER çağrıda TÜM noktaları `t:0`'a
 * sıfırlaması (bir tıklama AYNI hint listesini yeniden hesaplattığında
 * ZATEN tam görünür bir hint'i yeniden söndürüp söndürmeden yeniden
 * başlatıyordu — kısa ama gereksiz bir "titreme") düzeltildi: artık ÖNCEKİ
 * listede AYNI koordinatta olan noktaların `t`'si KORUNUR, yalnız GERÇEKTEN
 * yeni bir nokta `t:0`'dan başlar.
 * v0.19 — Sahne #8'in serbest-sıralı ÇOKLU hedef akışı (curriculum'un 4
 * GERÇEK öz-yakalama noktası, TEK hedef DEĞİL — bkz. görev talimatı: "kamera
 * veya test kolaylığı gerekçesiyle içeriği tek hedefe indirme") için
 * `showIllegalMove()`/`clearIllegalMove()` (v0.18, TEKİL) ÇOKLU
 * `showIllegalMoves()`/`clearIllegalMoves()`'e genişletildi — TEK tüketicisi
 * (scenes/scene08IllegalMoves.js) olduğu için TEKİL API kaldırıldı, geriye
 * dönük ikinci bir yol BIRAKILMADI. Ayrıca AYRI bir "ipucu" katmanı
 * (`showIllegalHints`/`clearIllegalHints`, bkz. drawIllegalHint) eklendi —
 * bulunmuş (`illegalMarks`, dolu halka+çarpı) ile ipucu (`illegalHints`,
 * kesikli/düşük-opaklık halka) GÖRSEL/ŞEKİL olarak ayrışır (renk AYNI kalır
 * — "renk tek başına ayrım aracı olmamalı" ilkesi renk SABİT tutulup ŞEKİL
 * DEĞİŞTİRİLEREK karşılanır). Adapter kaç hedef olduğunu/hangi sahneye ait
 * olduğunu HÂLÂ BİLMEZ — yalnız "şu an gösterilecek iki ayrı liste" alır.
 * v0.18 — `isOccupied()`: hover silüetinin YASAK bir hedef üzerinde de
 * (yalnız GERÇEKTEN boşsa) gösterilebilmesi için mevcut `isLegalMove()`
 * yetersizdi (o hem "dolu" hem "intihar" durumunda AYNI `false`'u döner,
 * ikisini AYIRT ETMEZ). Taşın "geri çekilmesi" YENİ bir animasyon durumu
 * EKLENMEDEN, sahne modülünün işaretle AYNI anda `clearMovePreview()`
 * çağırmasıyla elde edilir. Hamlenin KENDİSİNİN yasal/yasak olduğu kararı
 * BURADA ALINMAZ — mevcut `playMove()` zaten `{ok:false, reason}` döndürüp
 * board'u DEĞİŞTİRMEDEN bırakır (bkz. core/ruleEngine.js isValidMove);
 * ikinci bir paralel kural sistemi YAZILMADI.
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

import { CAM } from '../core/curriculum.js?v=2026-10-29.modlar';
import { BoardState } from '../core/boardState.js?v=2026-10-29.modlar';
import { isValidMove, applyMove, getGroup, getLiberties } from '../core/ruleEngine.js?v=2026-10-29.modlar';
import { createBoardSound } from './boardSound.js?v=2026-10-29.modlar';

const CAM_PRESETS = { ...CAM };

// Ahşap dokusu bir kez üretilir ve tahta yüzeyine TEK karo olarak
// gerilir (bkz. drawBoard: desen dönüşümü), bu yüzden damarlar tahtayla
// birlikte döner. Yüksek yoğunluklu ekranlarda bulanmasın diye karo büyük.
const WOOD_TILE = 1024;
function makeWoodPattern(ctx) {
  const S = WOOD_TILE;
  const woodCv = document.createElement('canvas');
  woodCv.width = woodCv.height = S;
  const wc = woodCv.getContext('2d');
  const g = wc.createLinearGradient(0, 0, 0, S);
  g.addColorStop(0, '#c8a84a'); g.addColorStop(.15, '#d4b050');
  g.addColorStop(.38, '#c2a040'); g.addColorStop(.6, '#caa848');
  g.addColorStop(.82, '#be9c3a'); g.addColorStop(1, '#c8a444');
  wc.fillStyle = g; wc.fillRect(0, 0, S, S);
  // Damarlar tahtanın bir ekseni boyunca uzanır; koyu damarlar biraz daha
  // belirgin, açık olanlar ince parıltı gibi.
  for (let i = 0; i < 220; i++) {
    const y = Math.random() * S, dk = i % 6 === 0;
    wc.globalAlpha = dk ? 0.09 : 0.06;
    wc.strokeStyle = dk ? '#5a2e00' : '#ecd468';
    wc.lineWidth = dk ? Math.random() * 2 + .6 : Math.random() * 1.2 + .3;
    wc.beginPath(); wc.moveTo(0, y + (Math.random() - .5) * 8);
    wc.bezierCurveTo(S * .25, y + (Math.random() - .5) * 6, S * .75, y + (Math.random() - .5) * 6, S, y + (Math.random() - .5) * 8);
    wc.stroke();
  }
  wc.globalAlpha = 1;
  return ctx.createPattern(woodCv, 'no-repeat');
}

function easeInOutCubic(t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
function lerp(a, b, t) { return a + (b - a) * t; }
function sizeToCell(n) { return n === 5 ? 80 : n === 9 ? 48 : n === 13 ? 32 : 22; }

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
  let intersectionMarkers = false;
  let markerTime = 0;
  // Hamle öncesi taş silueti — {gx,gz,color}|null. Board State'e ASLA
  // yazılmaz, yalnız görsel bir önizlemedir (bkz. setMovePreview/
  // clearMovePreview/drawMovePreview).
  let movePreview = null;
  // Reddedilen hamle denemelerinin GÖRSEL işaretleri — ÇOKLU liste
  // ({gx,gz,t}[]), `t` 0→1 sakin bir fade-in için ilerler (libertyPoints ile
  // AYNI desen). Board State'e ASLA yazılmaz, yalnız görsel. v0.19 — Sahne
  // #8'in serbest-sıralı çoklu-hedef akışı için TEKİL `illegalMark`'tan
  // ÇOKLU listeye genişletildi (bkz. showIllegalMoves/clearIllegalMoves) —
  // adapter kaç hedef olduğunu/hangi sahneye ait olduğunu BİLMEZ, yalnız
  // "şu an gösterilecek işaretli noktalar listesi budur" bilgisini tutar.
  let illegalMarks = [];
  // "Yasak noktaları göster" ipucunun GÖRSEL listesi — illegalMarks İLE AYNI
  // desen, ayrı ve GÖRSEL/erişilebilir olarak FARKLI çizilir (bkz.
  // drawIllegalHint). Board state'e dokunmaz, taş silüeti EKLEMEZ.
  let illegalHints = [];
  // v0.20 — Sahne #9'un ("Ko Kuralı") "ko noktası artık serbest" göstergesi
  // — illegalMarks/illegalHints İLE AYNI desen (ÇOKLU liste, `t` 0→1 fade),
  // ama TAMAMEN AYRI bir görsel katman: kehribar-kırmızı DEĞİL, YEŞİL "neon"
  // glow (bkz. drawKoFree — drawLibertyMark'ın turkuaz neon TEKNİĞİYLE aynı,
  // renk ve şekil (✓, çarpının TERSİ) FARKLI — "renk tek başına ayrım aracı
  // olmamalı" ilkesiyle tutarlı, kullanıcı isteğiyle "neon efekt"). Board
  // state'e dokunmaz, taş silüeti EKLEMEZ. Adapter kaç hedef olduğunu/hangi
  // sahneye ait olduğunu BİLMEZ — yalnız "şu an gösterilecek serbest-ko
  // noktaları listesi budur" bilgisini tutar (illegalMarks/illegalHints İLE
  // AYNI "kaç hedef bilmiyorum" ilkesi).
  let koFreeMarks = [];
  // v0.21 — Sahne #10'un ("Oyun Sonu ve Sayım") RENK-AGNOSTİK bölge
  // göstergesi — koFreeMarks/illegalMarks İLE AYNI desen (ÇOKLU liste, `t`
  // 0→1 fade), ama HER NOKTA kendi `color`ını taşır (bkz. showRegionMarks) —
  // adapter hangi sahnenin/renklerin "siyah bölge" mi "beyaz bölge" mi
  // olduğunu HİÇ BİLMEZ, yalnız "şu an gösterilecek {row,col,color} listesi
  // budur" bilgisini tutar (bkz. drawRegionMark — TEK çizim fonksiyonu, İKİ
  // renk varyantı, sahneye özel hard-code YOK).
  let regionMarks = [];
  // Son hamle işareti — {gx,gz}|null. Sahneler başlangıç dizilimini de
  // playMove() ile kurduğu için, reset()/setSize() ile AYNI senkron görevde
  // konan taşlar "kurulum" sayılır ve işaret ALMAZ; görev bitince (microtask)
  // bayrak düşer, sonraki her playMove gerçek bir hamledir. Sahne modülleri
  // bu işarete hiç dokunmaz.
  let lastMove = null;
  let seedingThisTask = false;
  function markSeedingTask() {
    if (seedingThisTask) return;
    seedingThisTask = true;
    queueMicrotask(() => { seedingThisTask = false; });
  }
  // Dokunsal his: gerçek hamleler (kurulum taşları DEĞİL) yukarıdan düşüp
  // küçük bir sekmeyle oturur (`dropT` 0→1); kullanıcının az önce dokunduğu
  // noktadaki yasak hamle kısa bir "hayır" sallanmasıyla söner (`rejectFx`).
  // Sesler varsayılan kapalıdır (bkz. boardSound.js, setSoundEnabled).
  const sound = createBoardSound();
  let rejectFx = null; // {gx,gz,color,age}|null
  let lastTap = null;  // {gx,gz,time}|null — yasak hamle efekti yalnız kullanıcı denemesine
  const DROP_DUR = 0.24;
  const REJECT_DUR = 0.38;
  let inputEnabled = false;
  const tapHandlers = new Set();
  const hoverHandlers = new Set();
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

  let camYaw = .50, camPitch = isMobile ? 1.25 : .88, camDist = 500;
  let camStart = null, camTarget = null, camLerpT = 1;
  const CAM_DUR = 0.65;
  // Geçiş süresi ve eğrisi: sahne kameraları hep CAM_DUR + easeInOutCubic
  // kullanır; yalnız frameBoard() (karşılama) daha uzun, yavaşlayarak
  // inen bir süzülme ister ve bir sonraki focus() bunları geri alır.
  let camDur = CAM_DUR, camEase = easeInOutCubic;
  // Karşılama salınımı: kamera dururken tahtanın çok hafifçe sağa-sola
  // dönmesi (±0,07 rad, ~9 sn). Kapatılınca sıfıra yumuşakça döner.
  let driftOn = false, driftYaw = 0, driftTime = 0;
  // Karşılamada tahta, alttaki yazıya yer açmak için ekranın ortasından
  // `projShift` px yukarıda çizilir; kamera geçişiyle birlikte kayar ve
  // her focus()/focusPoints() çağrısı onu sıfıra (sahne düzenine) döndürür.
  let projShift = 0, shiftStart = 0, shiftTarget = 0;
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
  // Sakin kamera: sahne preset'lerinin yan dönüşü (yaw) burada yumuşatılır —
  // core/curriculum.js'teki CAM eski 3D sayfayla ORTAK olduğu için orada
  // değiştirilmez. Dar ekranın sabit yaw'ı da aynı oranla yumuşar.
  const YAW_CALM = 0.45;
  const NARROW_YAW = 0.12; // dar ekranda genişlik sınır — daha az dönüş, daha büyük tahta
  // Son focus(presetName) — focusPoints() yokken resize/orientation'da
  // tahtayı yeni ölçüye yeniden sığdırmak için (bkz. presetView, resize).
  let activePreset = null;
  // Elle döndürme: sağ tuş ya da Shift+sürükleme ile sahne açısının ÜSTÜNE
  // eklenen geçici yaw sapması; bırakılınca sıfıra yaylanır. Sahnenin
  // kamera kararlarına (focus/focusPoints) karışmaz.
  let userYaw = 0, rotateDrag = null;
  const USER_YAW_MAX = 0.7;
  // Tek ışık kaynağı — dünya xz düzleminde ışığın GELDİĞİ yön. Tahtanın ışık
  // eğimi, taşların parlak noktası ve gölgesi aynı yönü kullanır; varsayılan
  // eski açıda (yaw .5) önceki sabit parlama konumunu birebir verir.
  const LIGHT_X = -0.897, LIGHT_Z = 0.442;
  let lightDir = { x: -0.62, y: -0.78 }; // ekran düzleminde, her karede güncellenir
  function updateLightDir() {
    const yaw = camYaw + userYaw + driftYaw, sp = Math.sin(camPitch);
    const rx = LIGHT_X * Math.cos(yaw) + LIGHT_Z * Math.sin(yaw);
    const rz = -LIGHT_X * Math.sin(yaw) + LIGHT_Z * Math.cos(yaw);
    const n = Math.hypot(rx, rz * sp) || 1;
    lightDir = { x: rx / n, y: -rz * sp / n };
  }
  // Hareket yokken çizim atlanır (pil): API çağrıları, girdi ve yeniden
  // boyutlanma `dirty` ile bir sonraki kareyi çizdirir; animasyon sürerken
  // her kare çizilir (bkz. loop/isAnimating).
  let dirty = true;

  function updateProjCenter() { projCY = H * 0.5 - projShift; }
  // Keskin çizim: `W`/`H` CSS pikseli olarak KALIR (projeksiyon, hit-test,
  // focusPoints ve overlay köprüleri hep CSS koordinatıyla çalışır); yalnız
  // canvas'ın arka tamponu ekranın gerçek piksel yoğunluğuyla büyütülür ve
  // ctx bir kez ölçeklenir. Üst sınır 3 — daha yoğun ekranlarda fark
  // görünmez, yalnız bellek/çizim maliyeti artar.
  function pixelRatio() {
    return Math.min(3, Math.max(1, (typeof window !== 'undefined' && window.devicePixelRatio) || 1));
  }
  // shadowBlur/shadowOffset ctx dönüşümünden ETKİLENMEZ (cihaz pikseli) —
  // gölge çizimlerinde bu oranla çarpılır.
  let curDpr = 1;
  function resize() {
    W = canvas.clientWidth || canvas.parentElement?.clientWidth || innerWidth;
    H = canvas.clientHeight || canvas.parentElement?.clientHeight || innerHeight;
    const dpr = pixelRatio();
    curDpr = dpr;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dirty = true; // arka tampon yeniden boyutlanınca temizlenir
    updateProjCenter();
    // Aktif bir focusPoints() varsa YENİ canvas ölçüleriyle SESSİZCE (animasyonsuz,
    // "sürekli zıplama" olmadan) yeniden hesaplanır — bkz. görev talimatı
    // "mobil resize/orientation değişiminde güvenli biçimde yeniden hesaplanabilmeli".
    if (activeFocusPoints) applyFocusPoints(activeFocusPoints.points, activeFocusPoints.opts, false);
    else if (activePreset && camTarget) {
      // Yalnız preset aktifken: tahtayı yeni ölçüye (ör. ekran döndürme) sığdır.
      camTarget = presetView(activePreset, isMobile);
      if (camLerpT >= 1) { camYaw = camTarget.yaw; camPitch = camTarget.pitch; camDist = camTarget.dist; }
    }
  }
  resize();
  window.addEventListener('resize', resize);
  // Lesson layout changes can resize the canvas without a window resize.
  const canvasResizeObserver = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(() => {
      if (canvas.clientWidth !== W || canvas.clientHeight !== H || canvas.width !== Math.round(W * pixelRatio())) resize();
    }) : null;
  canvasResizeObserver?.observe(canvas);

  function projectAt(x, y, z, yaw, pitch, dist) {
    const rx = x * Math.cos(yaw) + z * Math.sin(yaw);
    const rz = -x * Math.sin(yaw) + z * Math.cos(yaw);
    const ry2 = y * Math.cos(pitch) - rz * Math.sin(pitch);
    const rz2 = y * Math.sin(pitch) + rz * Math.cos(pitch);
    const fov = 700, sc = fov / Math.max(fov + rz2, 1) * (dist / 500);
    return { sx: W / 2 + rx * sc, sy: projCY + ry2 * sc, scale: sc, z: rz2 };
  }
  function project(x, y, z) { return projectAt(x, y, z, camYaw + userYaw + driftYaw, camPitch, camDist); }

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
  function solveDistForFit(auxPts, safe, yaw, pitch, minZoom, maxZoom, cy = projCY) {
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
        const b1 = (safe.top - cy) * REF_DIST / dy, b2 = (safe.bottom - cy) * REF_DIST / dy;
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

  /** Kenar boşluğu, canvas'ın küçük kenarıyla ORANTILI (cihaza özel sabit
      DEĞİL) — üstte, learning-scenes.html'in canvas üzerine bindirdiği
      düğmeler için ek bir pay bırakılır. */
  function safeRect() {
    const edgeMargin = Math.max(24, Math.min(W, H) * 0.05);
    const topMargin = Math.max(edgeMargin, 56);
    return { left: edgeMargin, right: W - edgeMargin, top: topMargin, bottom: H - edgeMargin };
  }

  /** Bir preset'in BU canvas geometrisindeki hedefi: yumuşatılmış yaw, dar
      ekranda pitch alt sınırı ve — tahtanın TAMAMI (koordinat etiketleri
      dahil) güvenli alana sığmıyorsa — sığacak kadar küçültülmüş dist.
      Sığıyorsa preset'in kendi dist'i AYNEN kalır (masaüstünde çoğunlukla). */
  function presetView(presetName, narrow) {
    const preset = CAM_PRESETS[presetName] || CAM_PRESETS.overview;
    const yaw = narrow ? NARROW_YAW : preset.yaw * YAW_CALM;
    const pitch = narrow ? Math.max(preset.pitch, 1.2) : preset.pitch;
    const bw = HALF + CELL * .82;
    const corners = [[-bw, -bw], [bw, -bw], [bw, bw], [-bw, bw]].map(([wx, wz]) => ({ wx, wz }));
    const dist = solveDistForFit(corners, safeRect(), yaw, pitch, 120, preset.dist);
    return { yaw, pitch, dist };
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
    const safe = safeRect();

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
    // freshBase, `focus(presetName)`'in KENDİ formülüyle (presetView) BİREBİR
    // AYNI şekilde — yalnız donmuş `isMobile` yerine `isNarrowLayout()`
    // (canlı `W`) ile — yeniden türetilir; böylece "taze bir mount bu
    // preset'i BU geometride nasıl uygulardı" sorusunun cevabıyla TUTARLI
    // kalır (bkz. fonksiyon başı notu).
    const freshBase = presetView(presetName, isNarrowLayout());

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
    // Karşılamadan kalan dikey kayma varsa kadraj, sahnenin gerçek
    // (kaymasız) merkezine göre değerlendirilir; kayma ayrıca sıfırlanır.
    const leftoverShift = projShift;
    if (leftoverShift) { projShift = 0; updateProjCenter(); }
    const result = computeFraming(points, opts);
    if (leftoverShift) { projShift = leftoverShift; updateProjCenter(); }
    activeFocusPoints = { points, opts };
    lastFocusResult = result;
    if (!result.adjusted) {
      if (leftoverShift) {
        camStart = { yaw: camYaw, pitch: camPitch, dist: camDist };
        camTarget = { ...camStart };
        camDur = CAM_DUR; camEase = easeInOutCubic;
        shiftStart = projShift; shiftTarget = 0;
        camLerpT = animate && motion && !reduceMotion ? 0 : 1;
        if (camLerpT === 1) { projShift = 0; updateProjCenter(); }
      }
      return result;
    }

    if (!animate) {
      camYaw = result.yaw; camPitch = result.pitch; camDist = result.dist;
      camStart = camTarget = null; camLerpT = 1;
      projShift = 0; updateProjCenter();
      return result;
    }
    camStart = { yaw: camYaw, pitch: camPitch, dist: camDist };
    camTarget = { yaw: result.yaw, pitch: result.pitch, dist: result.dist };
    camDur = CAM_DUR; camEase = easeInOutCubic;
    shiftStart = projShift; shiftTarget = 0;
    camLerpT = motion && !reduceMotion ? 0 : 1;
    if (camLerpT === 1) { camYaw = result.yaw; camPitch = result.pitch; camDist = result.dist; projShift = 0; updateProjCenter(); }
    return result;
  }

  function tracePoly(pts) {
    ctx.beginPath(); pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.sx, p.sy) : ctx.lineTo(p.sx, p.sy));
    ctx.closePath();
  }

  /** Yan yüz: üst kenarı (ilk iki köşe) açık, alt kenarı koyu — ahşap
      kalınlığına derinlik verir. */
  function drawFace(corners, light, dark, stroke) {
    const pts = corners.map(([x, y, z]) => project(x, y, z));
    const topMid = { x: (pts[0].sx + pts[1].sx) / 2, y: (pts[0].sy + pts[1].sy) / 2 };
    const botMid = { x: (pts[2].sx + pts[3].sx) / 2, y: (pts[2].sy + pts[3].sy) / 2 };
    const g = ctx.createLinearGradient(topMid.x, topMid.y, botMid.x, botMid.y);
    g.addColorStop(0, light); g.addColorStop(1, dark);
    tracePoly(pts); ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke();
  }

  /** Tahtanın altına düşen yumuşak gölge — tahta havada asılı durmasın. */
  function drawGroundShadow(bw, bh) {
    const pts = [[-bw, bh, -bw], [bw, bh, -bw], [bw, bh, bw], [-bw, bh, bw]].map(([x, y, z]) => project(x, y, z));
    const sc = pts.reduce((s, p) => s + p.scale, 0) / pts.length;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.6)';
    ctx.shadowBlur = Math.min(60, 34 * sc) * curDpr;
    ctx.shadowOffsetY = 16 * sc * curDpr;
    tracePoly(pts); ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fill();
    ctx.restore();
  }

  function drawBoard() {
    const bh = BOARD_H / 2, bw = HALF + CELL * .82;
    drawGroundShadow(bw, bh);
    drawFace([[-bw, -bh, -bw], [-bw, -bh, bw], [-bw, bh, bw], [-bw, bh, -bw]], '#8a5a14', '#4e3004', '#5e3a08');
    drawFace([[-bw, -bh, bw], [bw, -bh, bw], [bw, bh, bw], [-bw, bh, bw]], '#9c681a', '#5c3a08', '#6a4408');
    drawFace([[bw, -bh, -bw], [bw, -bh, bw], [bw, bh, bw], [bw, bh, -bw]], '#a8701e', '#663f0a', '#724808');
    const top = [[-bw, -bh, -bw], [bw, -bh, -bw], [bw, -bh, bw], [-bw, -bh, bw]];
    const tpts = top.map(([x, y, z]) => project(x, y, z));
    ctx.save(); tracePoly(tpts); ctx.clip();
    // Ahşap karosunu tahta yüzeyine ger (afin yaklaşım — perspektif hafif).
    if (woodPat?.setTransform && typeof DOMMatrix !== 'undefined') {
      const [p0, p1, , p3] = tpts, S = WOOD_TILE;
      woodPat.setTransform(new DOMMatrix([(p1.sx - p0.sx) / S, (p1.sy - p0.sy) / S, (p3.sx - p0.sx) / S, (p3.sy - p0.sy) / S, p0.sx, p0.sy]));
    }
    ctx.fillStyle = '#c6a446'; ctx.fill(); // desen yoksa (test ortamı) düz ahşap rengi
    ctx.fillStyle = woodPat; ctx.globalAlpha = .96; ctx.fill();
    // Işık eğimi: ışığın geldiği kenar hafif aydınlık, karşı kenar hafif gölgeli.
    const lit = project(LIGHT_X * bw, -bh, LIGHT_Z * bw), far = project(-LIGHT_X * bw, -bh, -LIGHT_Z * bw);
    const lg = ctx.createLinearGradient(lit.sx, lit.sy, far.sx, far.sy);
    lg.addColorStop(0, 'rgba(255,238,196,.20)'); lg.addColorStop(.5, 'rgba(255,238,196,0)'); lg.addColorStop(1, 'rgba(40,18,0,.16)');
    ctx.globalAlpha = 1; ctx.fillStyle = lg; ctx.fill();
    // Kenar: içte ince açık pah, dışta koyu çizgi (yarısı kırpılır).
    ctx.strokeStyle = 'rgba(255,232,170,.35)'; ctx.lineWidth = 3; ctx.stroke();
    ctx.strokeStyle = '#6a4008'; ctx.lineWidth = 1.2; ctx.stroke();
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
        : SIZE === 5 ? [[2, 2]] : [[2, 2], [6, 2], [4, 4], [2, 6], [6, 6]];
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
  // `lift`: taşın tahtadan yüksekliği (dünya birimi, düşme/kalkış için);
  // `dx`/`dz`: tahta düzleminde kayma (yakalanan taşın kenara süzülmesi).
  // Gölge tahtada kalır; taş yükseldikçe büyür ve açılır.
  function drawStone(gx, gz, color, scale, alpha, lift = 0, dx = 0, dz = 0) {
    const wx = -HALF + gx * CELL + dx, wz = -HALF + gz * CELL + dz;
    const p = project(wx, stoneSurfaceY() - lift, wz);
    const { rx, ry } = stoneRadii(p, scale ?? 1);
    if (rx < 2) return;
    const isB = color === 'black';
    ctx.save();
    if (alpha !== undefined) ctx.globalAlpha = alpha;
    const ps = project(wx, -BOARD_H / 2 - .5, wz);
    const rise = Math.min(1, lift / (STONE_R * 2.2));
    const srx = rx * (1 + rise * .35);
    // Gölge ışığın tersine, parlak nokta ışığa doğru (bkz. updateLightDir).
    const shx = ps.sx - lightDir.x * .16 * rx, shy = ps.sy - lightDir.y * .16 * ry;
    const sg = ctx.createRadialGradient(shx, shy, 0, shx, shy, srx);
    sg.addColorStop(0, `rgba(0,0,0,${(.38 * (1 - rise * .6)).toFixed(3)})`); sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath(); ctx.ellipse(shx, shy, srx, ry * .48 * (1 + rise * .35), 0, 0, Math.PI * 2);
    ctx.fillStyle = sg; ctx.fill();

    ctx.beginPath(); ctx.ellipse(p.sx, p.sy, rx, ry, 0, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(p.sx + lightDir.x * .32 * rx, p.sy + lightDir.y * .32 * ry, rx * .03, p.sx, p.sy, rx * 1.05);
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

  /**
   * Reddedilen bir hamle denemesinin GÖRSEL işareti — ince, statik bir
   * kehribar-kırmızı halka + çarpı (bkz. görev talimatı Bölüm 7: "turkuaz/
   * neon dili aynen kullanma", "renk tek başına bilgi taşımamalı"; ÇARPI
   * biçimi rengin yanında İKİNCİ, renk-bağımsız bir işaret sağlar). Geometri
   * `drawLibertyMark`'ın (halka kolu) VE `ogren-3d.html`'in eski
   * `drawForbidden2D`/3D X-çizgisi TEKNİĞİNDEN adapte edildi, renk KASITLI
   * olarak farklı (91,210,195 turkuaz DEĞİL, 214,92,58 kehribar-kırmızı —
   * ayrıca eski kehribar HALKA renderer'ının RGB değerleriyle (bkz.
   * teacher-studio.html LEGACY_AMBER_RING_RENDERER_STILL_PRESENT kontrolü —
   * o üçlü BİLEREK burada bile alıntılanmıyor, kontrolün kendisi kaynak
   * metninde ARADIĞI dizgeyle YANLIŞLIKLA eşleşmesin diye) de KARIŞTIRILMASIN
   * diye bilerek FARKLI bir RGB üçlüsü seçildi. Büyük glow/pulse/ekran flaşı
   * YOK (bkz. görev talimatı Bölüm 7: "sakin ve kısa").
   */
  function drawIllegalMark(gx, gz, t) {
    const wx = -HALF + gx * CELL, wz = -HALF + gz * CELL;
    const Y = -BOARD_H / 2 - .3;
    const p = project(wx, Y, wz);
    if (p.scale < 0.12) return;
    const e = reduceMotion ? 1 : easeInOutCubic(Math.min(1, t));
    const alpha = 0.82 * e;
    const color = `rgba(214,92,58,${alpha.toFixed(2)})`;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.4, 2.2 * p.scale);
    ctx.lineCap = 'round';
    // Halka — reddedilen kesişimi çevreler.
    const ringR = Math.max(3, CELL * 0.26) * p.scale;
    ctx.beginPath(); ctx.arc(p.sx, p.sy, ringR, 0, Math.PI * 2); ctx.stroke();
    // Çarpı — renk-bağımsız ikinci işaret (bkz. fonksiyon başı notu).
    const arm = CELL * 0.16;
    const pL = project(wx - arm, Y, wz - arm), pR = project(wx + arm, Y, wz + arm);
    const pU = project(wx + arm, Y, wz - arm), pD = project(wx - arm, Y, wz + arm);
    ctx.beginPath(); ctx.moveTo(pL.sx, pL.sy); ctx.lineTo(pR.sx, pR.sy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(pU.sx, pU.sy); ctx.lineTo(pD.sx, pD.sy); ctx.stroke();
    ctx.restore();
  }

  /**
   * "Yasak noktaları göster" ipucunun GÖRSEL işareti — bulunmamış curriculum
   * hedeflerini işaret eder (bkz. showIllegalHints). v0.20 kök neden
   * düzeltmesi (bkz. dosya başı v0.20 notu): `drawLibertyMark` İLE AYNI
   * ÇİZİM TEKNİĞİ (ortogonal çapraz kol + dolu merkez nokta + hafif glow) —
   * yalnız RENK kehribar-kırmızı (turkuaz DEĞİL). Bulunmuş `drawIllegalMark`
   * (halka+DİYAGONAL çarpı) ile ŞEKİLCE ayrışır — ayrım yalnız renk/opaklıkla
   * DEĞİL (bkz. görev talimatı Bölüm 4/6). Taş silüeti EKLEMEZ, board
   * state'e dokunmaz (bkz. showIllegalHints notu). Sürekli pulse YOK — TEK
   * seferlik `t` fade-in (drawLibertyMark ile AYNI disiplin), "statik".
   */
  function drawIllegalHint(gx, gz, t) {
    const wx = -HALF + gx * CELL, wz = -HALF + gz * CELL;
    const Y = -BOARD_H / 2 - .3;
    const p = project(wx, Y, wz);
    if (p.scale < 0.12) return;
    const e = reduceMotion ? 1 : easeInOutCubic(Math.min(1, t));
    const arm = CELL * 0.20; // drawLibertyMark'ın 0.22'sine YAKIN — AYNI görsel ağırlık sınıfı
    const alpha = 0.80 * e; // drawLibertyMark (0.78) ile KIYASLANABİLİR — "aşırı soluk olmamalı"
    ctx.save();
    ctx.strokeStyle = `rgba(214,92,58,${alpha.toFixed(2)})`;
    ctx.lineWidth = Math.max(1.3, 2.0 * p.scale);
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(214,92,58,.5)';
    ctx.shadowBlur = 2.2 * p.scale; // drawLibertyMark İLE AYNI TEKNİK, farklı renk — "turkuaz dile benzer"
    const pL = project(wx - arm, Y, wz), pR = project(wx + arm, Y, wz);
    ctx.beginPath(); ctx.moveTo(pL.sx, pL.sy); ctx.lineTo(pR.sx, pR.sy); ctx.stroke();
    const pU = project(wx, Y, wz - arm), pD = project(wx, Y, wz + arm);
    ctx.beginPath(); ctx.moveTo(pU.sx, pU.sy); ctx.lineTo(pD.sx, pD.sy); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.arc(p.sx, p.sy, Math.max(1.1, 1.7 * p.scale), 0, Math.PI * 2);
    ctx.fillStyle = `rgba(214,92,58,${Math.min(1, alpha + .12).toFixed(2)})`;
    ctx.fill();
    ctx.restore();
  }

  /**
   * v0.20 — "Ko noktası artık serbest" göstergesi (bkz. scenes/
   * scene09KoRule.js). `drawLibertyMark()`'ın turkuaz "neon nefes noktası"
   * TEKNİĞİYLE (glow: `shadowColor`+`shadowBlur`) AYNI, ama YEŞİL ve net
   * biçimde FARKLI bir şekil (halka + ✓ işareti — `drawIllegalMark()`'ın
   * çarpısının TERSİ) kullanır. `drawIllegalMark`'ın kehribar-kırmızısıyla
   * KARIŞTIRILMASIN diye BİLEREK farklı bir RGB üçlüsü (`--green` CSS
   * token'ıyla tutarlı, ~62,207,128) seçildi. Büyük bloom/pulse YOK — tek
   * seferlik sakin bir fade-in (`t` 0→1), tam görünür olduktan sonra
   * STATİK kalır (Sahne #7/#8'in nefes/yasak işaretleriyle AYNI disiplin).
   */
  function drawKoFree(gx, gz, t) {
    const wx = -HALF + gx * CELL, wz = -HALF + gz * CELL;
    const Y = -BOARD_H / 2 - .3;
    const p = project(wx, Y, wz);
    if (p.scale < 0.12) return;
    const e = reduceMotion ? 1 : easeInOutCubic(Math.min(1, t));
    const alpha = 0.82 * e;
    const color = `rgba(62,207,128,${alpha.toFixed(2)})`;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.4, 2.2 * p.scale);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(62,207,128,.6)';
    ctx.shadowBlur = 3 * p.scale; // "neon" glow — drawLibertyMark İLE AYNI teknik
    // Halka — serbest kesişimi çevreler (drawIllegalMark İLE AYNI yarıçap oranı).
    const ringR = Math.max(3, CELL * 0.26) * p.scale;
    ctx.beginPath(); ctx.arc(p.sx, p.sy, ringR, 0, Math.PI * 2); ctx.stroke();
    // ✓ işareti — renk-bağımsız ikinci işaret, drawIllegalMark'ın çarpısının TERSİ.
    ctx.shadowBlur = 1.6 * p.scale;
    const armS = CELL * 0.11, armL = CELL * 0.2;
    const pStart = project(wx - armS, Y, wz + armS * .2);
    const pMid = project(wx - armS * .15, Y, wz + armL * .55);
    const pEnd = project(wx + armL * .6, Y, wz - armL * .5);
    ctx.beginPath(); ctx.moveTo(pStart.sx, pStart.sy); ctx.lineTo(pMid.sx, pMid.sy); ctx.lineTo(pEnd.sx, pEnd.sy); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  /**
   * v0.21 — Sahne #10'un ("Oyun Sonu ve Sayım") siyah/beyaz BÖLGE göstergesi
   * — TEK geometrik dil (elmas/döndürülmüş kare halka + merkez nokta), İKİ
   * renk varyantı (bkz. görev talimatı Bölüm 5: "Aynı geometrik görsel
   * dilin renk varyantları olmalı"). Mevcut hiçbir markerla (turkuaz nefes
   * `drawLibertyMark`, kehribar-kırmızı `drawIllegalMark`/`drawIllegalHint`,
   * yeşil `drawKoFree`) renk VEYA şekil olarak KARIŞMAZ:
   *   - siyah bölge: KOYU lacivert-gri kalem (46,52,66) + AÇIK gümüş-gri
   *     dış parıltı (196,202,214) — görev talimatının önerdiği "koyu merkez
   *     + açık/gri dış parıltı" birebir.
   *   - beyaz bölge: AÇIK fildişi-beyaz kalem (244,247,250) + ince SOĞUK
   *     mavi-gri parıltı (150,180,210) — "yalnız düz beyaz dolgu" YASAĞINA
   *     uyar (bkz. görev talimatı): dolgu YOK, yalnız ince kontrastlı
   *     çevre/halka + glow, ahşap üzerinde net okunur.
   * Gerçek taş silüeti (drawStone) DEĞİLDİR — dolu bir daire değil, ince bir
   * elmas HALKA + küçük merkez noktası (drawMovePreview'ın yarı-saydam
   * taşıyla da KARIŞTIRILMAZ). Sürekli pulse YOK — `t` yalnız TEK seferlik
   * 0→1 sakin bir fade-in (libertyPoints/koFreeMarks İLE AYNI disiplin).
   * @param {number} gx @param {number} gz @param {number} t
   * @param {'black'|'white'} color
   */
  function drawRegionMark(gx, gz, t, color) {
    const wx = -HALF + gx * CELL, wz = -HALF + gz * CELL;
    const Y = -BOARD_H / 2 - .3;
    const p = project(wx, Y, wz);
    if (p.scale < 0.12) return;
    const e = reduceMotion ? 1 : easeInOutCubic(Math.min(1, t));
    const isBlackRegion = color === 'black';
    const strokeRGB = isBlackRegion ? '46,52,66' : '244,247,250';
    const glowRGB = isBlackRegion ? '196,202,214' : '150,180,210';
    const alpha = 0.80 * e;
    ctx.save();
    ctx.strokeStyle = `rgba(${strokeRGB},${alpha.toFixed(2)})`;
    ctx.lineWidth = Math.max(1.3, 2.0 * p.scale);
    ctx.lineJoin = 'round';
    ctx.shadowColor = `rgba(${glowRGB},.55)`;
    ctx.shadowBlur = 2.4 * p.scale;
    const half = CELL * 0.19; // elmasın yarı-köşegeni — liberty/hint kollarıyla KIYASLANABİLİR ağırlık sınıfı
    const pT = project(wx, Y, wz - half), pR = project(wx + half, Y, wz);
    const pB = project(wx, Y, wz + half), pL = project(wx - half, Y, wz);
    ctx.beginPath();
    ctx.moveTo(pT.sx, pT.sy); ctx.lineTo(pR.sx, pR.sy); ctx.lineTo(pB.sx, pB.sy); ctx.lineTo(pL.sx, pL.sy);
    ctx.closePath(); ctx.stroke();
    ctx.shadowBlur = 0;
    // Merkez nokta — "koyu merkez"/"beyaz taşla karışmayan açık ton"
    // gereksinimini kalemle AYNI renkte, küçük bir dolu daireyle taşır.
    ctx.beginPath(); ctx.arc(p.sx, p.sy, Math.max(1.0, 1.5 * p.scale), 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${strokeRGB},${Math.min(1, alpha + .12).toFixed(2)})`;
    ctx.fill();
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

  /** Parmak basılıyken seçili kesişimin çevresinde taştan büyük halka —
      parmağın kenarından görünür, önizleme taşıyla çakışmaz (onu çevreler). */
  function drawTouchRing(gx, gz) {
    const p = project(-HALF + gx * CELL, -BOARD_H / 2 - .3, -HALF + gz * CELL);
    const r = STONE_R * 1.35 * p.scale;
    ctx.save();
    ctx.strokeStyle = 'rgba(232,228,222,.8)';
    ctx.lineWidth = Math.max(1.5, r * 0.09);
    ctx.beginPath(); ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  function render() {
    updateLightDir();
    const bg = ctx.createRadialGradient(W * .5, H * .45, 0, W * .5, H * .5, Math.max(W, H) * .75);
    bg.addColorStop(0, '#141420'); bg.addColorStop(1, '#060608');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    drawBoard();
    drawGrid();
    if (intersectionMarkers) {
      ctx.save();
      // A gentle four-second brightness cycle; reduced motion stays still.
      ctx.globalAlpha = reduceMotion ? 0.42 : 0.22 + 0.40 * (0.5 - 0.5 * Math.cos(markerTime * Math.PI / 2));
      for (let row = 0; row < SIZE; row++)
        for (let col = 0; col < SIZE; col++) drawLibertyMark(col, row, 1);
      ctx.restore();
    }
    // movePreview aktifken sade hover noktası GÖSTERİLMEZ — aynı kesişimde
    // iki farklı işaret üst üste binmesin diye (bkz. drawMovePreview).
    if (inputEnabled && hoverPoint && touchPress) drawTouchRing(hoverPoint.gx, hoverPoint.gz);
    else if (inputEnabled && hoverPoint && !movePreview) drawHoverPoint(hoverPoint.gx, hoverPoint.gz);
    for (const l of libertyPoints) drawLibertyMark(l.gx, l.gz, l.t);
    if (movePreview) drawMovePreview(movePreview.gx, movePreview.gz, movePreview.color);
    // İpuçları ÖNCE (bulunmamış hedefler) — bulunmuş işaretler her zaman
    // ÜSTTE (bir nokta hem hint hem found OLAMAZ zaten, bkz. scene08
    // İllegalMoves.js hint listesi hesaplaması, ama katman sırası yine de
    // öngörülebilir kalsın).
    for (const h of illegalHints) drawIllegalHint(h.gx, h.gz, h.t);
    for (const m of illegalMarks) drawIllegalMark(m.gx, m.gz, m.t);
    for (const k of koFreeMarks) drawKoFree(k.gx, k.gz, k.t);
    for (const r of regionMarks) drawRegionMark(r.gx, r.gz, r.t, r.color);
    const sorted = [...visualStones].sort((a, b) => project(-HALF + a.gx * CELL, 0, -HALF + a.gz * CELL).z - project(-HALF + b.gx * CELL, 0, -HALF + b.gz * CELL).z);
    for (const s of sorted) {
      if (s.captureAge != null) { drawCapturedStone(s); continue; }
      if (s.dropT != null && s.dropT < 1) {
        drawStone(s.gx, s.gz, s.color, 1, Math.min(1, .35 + s.dropT / .25), dropHeight(s.dropT));
        continue;
      }
      const scale = reduceMotion ? 1 : easeInOutCubic(Math.min(1, s.t));
      drawStone(s.gx, s.gz, s.color, scale, undefined);
    }
    if (rejectFx) drawRejectFx(rejectFx);
    if (lastMove) {
      const s = visualStones.find(v => v.gx === lastMove.gx && v.gz === lastMove.gz && v.captureAge == null);
      if (s) drawLastMoveMark(s);
    }
  }

  /** Son oynanan taşın üstünde, taş rengine zıt ince halka. Taş giriş
      animasyonunu bitirirken belirir; sürekli yanıp sönmez. */
  function drawLastMoveMark(stone) {
    const p = project(-HALF + stone.gx * CELL, stoneSurfaceY(), -HALF + stone.gz * CELL);
    const { rx, ry } = stoneRadii(p, 0.42);
    if (rx < 1.5) return;
    ctx.save();
    // Düşen taşta işaret taş oturunca belirir; kurulum/eski taşta giriş ölçeğiyle.
    const landed = stone.dropT != null ? stone.dropT : stone.t;
    ctx.globalAlpha = reduceMotion ? 1 : Math.max(0, Math.min(1, (landed - 0.6) / 0.4));
    ctx.strokeStyle = stone.color === 'black' ? 'rgba(244,240,232,.92)' : 'rgba(24,26,36,.82)';
    ctx.lineWidth = Math.max(1.2, rx * 0.2);
    ctx.beginPath(); ctx.ellipse(p.sx, p.sy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  /** Düşme eğrisi: hızlanarak iner (%72), ardından küçük tek bir sekme. */
  function dropHeight(t) {
    const H0 = STONE_R * 1.8;
    if (t < 0.72) { const u = t / 0.72; return H0 * (1 - u * u); }
    return H0 * 0.1 * Math.sin(Math.PI * (t - 0.72) / 0.28);
  }

  /** Yakalanan taş (0–0,45 sn, mevcut süre korunur): önce çevresi kısa bir
      an parlar, sonra kalkıp tahtanın en yakın kenarına doğru süzülerek söner. */
  function drawCapturedStone(s) {
    const age = s.captureAge;
    if (age < 0.12) {
      const p = project(-HALF + s.gx * CELL, stoneSurfaceY(), -HALF + s.gz * CELL);
      const { rx, ry } = stoneRadii(p, 1.18);
      ctx.save();
      ctx.globalAlpha = Math.sin(Math.PI * age / 0.12) * 0.7;
      ctx.strokeStyle = 'rgb(255,236,190)';
      ctx.lineWidth = Math.max(1.2, rx * 0.1);
      ctx.shadowColor = 'rgba(255,220,150,.8)'; ctx.shadowBlur = rx * 0.5;
      ctx.beginPath(); ctx.ellipse(p.sx, p.sy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      drawStone(s.gx, s.gz, s.color, 1, undefined);
      return;
    }
    const u = Math.min(1, (age - 0.12) / 0.33), e = easeInOutCubic(u);
    // En yakın kenar yönü: merkezden uzaklığı büyük olan eksen boyunca dışarı.
    const ox = s.gx - (SIZE - 1) / 2, oz = s.gz - (SIZE - 1) / 2;
    const dirX = Math.abs(ox) >= Math.abs(oz) ? Math.sign(ox) || 1 : 0;
    const dirZ = dirX === 0 ? Math.sign(oz) || 1 : 0;
    const slide = CELL * 0.7 * e;
    drawStone(s.gx, s.gz, s.color, 1 - 0.15 * e, Math.max(0, 1 - Math.pow(u, 1.4)), STONE_R * 1.4 * e, dirX * slide, dirZ * slide);
  }

  /** Yasak hamle: dokunulan noktada yarı saydam taş sağa-sola kısa
      sallanıp söner (kırmızı işaretleri sahne ayrıca gösterir). */
  function drawRejectFx(fx) {
    const u = Math.min(1, fx.age / REJECT_DUR);
    const shake = Math.sin(u * Math.PI * 5) * (1 - u) * CELL * 0.14;
    drawStone(fx.gx, fx.gz, fx.color, 1, 0.42 * (1 - u * u), 0, shake, 0);
  }

  let rafId = null;
  let lastFrameMs = 0;
  const STONE_ANIM_DUR = 0.16;
  const LIBERTY_FADE_DUR = 0.25;
  const hasActiveFade = list => list.some(m => m.t < 1);
  function isAnimating() {
    return !!((camLerpT < 1 && camTarget) || userYaw !== 0 || rotateDrag || rejectFx
      || (driftOn && !reduceMotion) || driftYaw !== 0
      || (intersectionMarkers && !reduceMotion)
      || visualStones.some(s => s.t < 1 || (s.dropT != null && s.dropT < 1) || s.captureAge != null)
      || hasActiveFade(libertyPoints) || hasActiveFade(illegalMarks) || hasActiveFade(illegalHints)
      || hasActiveFade(koFreeMarks) || hasActiveFade(regionMarks));
  }
  function loop(nowMs) {
    const dt = lastFrameMs ? Math.min(0.05, (nowMs - lastFrameMs) / 1000) : 1 / 60;
    lastFrameMs = nowMs;
    // Pencere başka yoğunlukta bir ekrana taşınınca 'resize' gelmeyebilir.
    if (canvas.width !== Math.round(W * pixelRatio())) resize();
    // İlerletmeden ÖNCE bakılır: biten bir animasyonun son karesi de çizilsin.
    const animating = isAnimating();
    if (intersectionMarkers && !reduceMotion) markerTime += dt;
    // Elle döndürme bırakılınca sahne açısına yumuşakça geri döner.
    if (!rotateDrag && userYaw !== 0) {
      userYaw = reduceMotion ? 0 : userYaw * Math.exp(-dt * 7);
      if (Math.abs(userYaw) < 1e-3) userYaw = 0;
    }
    if (driftOn && !reduceMotion) {
      driftTime += dt;
      driftYaw = 0.07 * Math.sin(driftTime * Math.PI * 2 / 9);
    } else if (driftYaw !== 0) {
      driftYaw *= Math.exp(-dt * 4);
      if (Math.abs(driftYaw) < 1e-3) driftYaw = 0;
    }
    if (camLerpT < 1 && camTarget) {
      camLerpT = Math.min(1, camLerpT + (1 / 60) / camDur);
      const t = camEase(camLerpT);
      camYaw = lerp(camStart.yaw, camTarget.yaw, t);
      camPitch = lerp(camStart.pitch, camTarget.pitch, t);
      camDist = lerp(camStart.dist, camTarget.dist, t);
      if (shiftStart !== shiftTarget) { projShift = lerp(shiftStart, shiftTarget, t); updateProjCenter(); }
    }
    for (const s of visualStones) if (s.captureAge != null) s.captureAge += dt;
    visualStones = visualStones.filter(s => s.captureAge == null || s.captureAge < .45);
    if (rejectFx) { rejectFx.age += dt; if (rejectFx.age >= REJECT_DUR) rejectFx = null; }
    if (!reduceMotion) {
      for (const s of visualStones) if (s.t < 1) s.t = Math.min(1, s.t + dt / STONE_ANIM_DUR);
      for (const s of visualStones) if (s.dropT != null && s.dropT < 1) s.dropT = Math.min(1, s.dropT + dt / DROP_DUR);
      for (const l of libertyPoints) if (l.t < 1) l.t = Math.min(1, l.t + dt / LIBERTY_FADE_DUR);
      for (const m of illegalMarks) if (m.t < 1) m.t = Math.min(1, m.t + dt / LIBERTY_FADE_DUR);
      for (const h of illegalHints) if (h.t < 1) h.t = Math.min(1, h.t + dt / LIBERTY_FADE_DUR);
      for (const k of koFreeMarks) if (k.t < 1) k.t = Math.min(1, k.t + dt / LIBERTY_FADE_DUR);
      for (const r of regionMarks) if (r.t < 1) r.t = Math.min(1, r.t + dt / LIBERTY_FADE_DUR);
    }
    if (animating || dirty) { dirty = false; render(); }
    rafId = requestAnimationFrame(loop);
  }
  rafId = requestAnimationFrame(loop);

  // ── Kesişim tıklaması → hit-test → abone edilen handler'lara ilet ────
  // Sahne modülleri canvas/koordinat matematiğine HİÇ dokunmaz; yalnız
  // onIntersectionTap(handler) ile abone olur.
  function screenToGrid(mx, my) {
    const BY = -BOARD_H / 2 - .4;
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
    return {
      mx: (clientX - rect.left) * W / (rect.width || W),
      my: (clientY - rect.top) * H / (rect.height || H),
    };
  }
  function notifyHover(hit) {
    dirty = true; // imleç/önizleme değişti
    const payload = hit ? { row: hit.gz, col: hit.gx } : null;
    for (const handler of hoverHandlers) handler(payload);
  }
  // Dokunmatik güvenlik: parmak değdiğinde hamle OYNANMAZ, yalnız önizleme
  // gösterilir; parmak kayarken önizleme onu izler ve parmak KALKTIĞI
  // kesişimde hamle oynanır. Parmak tahta dışına kayarak kalkarsa hamle
  // iptal olur. Hâlâ TEK dokunuş yeter. Fare ve kalem davranışı değişmez
  // ('click'); dokunuşun ardından tarayıcının ürettiği 'click' yutulur.
  let touchPress = null; // {pointerId} | null
  let suppressClickUntil = 0;
  function handleMove(evt) {
    if (rotateDrag) {
      if (evt.pointerId !== rotateDrag.pointerId) return;
      const dx = evt.clientX - rotateDrag.x;
      userYaw = Math.max(-USER_YAW_MAX, Math.min(USER_YAW_MAX, rotateDrag.base + dx * 0.008));
      return;
    }
    if (touchPress && evt.pointerId !== touchPress.pointerId) return; // ikinci parmak
    if (!inputEnabled) { hoverPoint = null; notifyHover(null); return; }
    const { mx, my } = pointerXY(evt);
    hoverPoint = screenToGrid(mx, my);
    notifyHover(hoverPoint);
  }
  /** Yasak hamle efekti + sesi — YALNIZ kullanıcının son 1 sn içinde
      dokunduğu noktada ve o dokunuş başına bir kez (bilgisayarın yasal aday
      araması, ko gösterimi gibi otomatik işaretler sallanmaz). */
  function triggerReject(gx, gz, color) {
    if (seedingThisTask || !lastTap || lastTap.rejected) return;
    if (lastTap.gx !== gx || lastTap.gz !== gz || performance.now() - lastTap.time > 1000) return;
    lastTap.rejected = true;
    if (!reduceMotion) rejectFx = { gx, gz, color, age: 0 };
    sound.reject();
  }
  function dispatchTap(hit) {
    lastTap = { gx: hit.gx, gz: hit.gz, time: performance.now() };
    for (const handler of tapHandlers) handler({ row: hit.gz, col: hit.gx });
  }
  function handleDown(evt) {
    dirty = true;
    sound.unlock(); // kullanıcı hareketi — askıdaki sesi açmanın tek güvenli anı
    // Fare/kalem: sağ tuş ya da Shift+sol tuş sürüklemesi tahtayı döndürür,
    // hamle OYNAMAZ. (Dokunmatikte tek parmak hamle önizlemesine ayrılmış.)
    if (evt.pointerType !== 'touch' && !rotateDrag && (evt.button === 2 || (evt.button === 0 && evt.shiftKey))) {
      rotateDrag = { pointerId: evt.pointerId, x: evt.clientX, base: userYaw };
      try { canvas.setPointerCapture(evt.pointerId); } catch {}
      canvas.style.cursor = 'grabbing';
      if (hoverPoint) { hoverPoint = null; notifyHover(null); }
      return;
    }
    if (evt.pointerType === 'touch' && !touchPress) {
      touchPress = { pointerId: evt.pointerId };
      try { canvas.setPointerCapture(evt.pointerId); } catch {}
    }
    handleMove(evt);
  }
  function endRotate(evt) {
    dirty = true;
    if (!rotateDrag || evt.pointerId !== rotateDrag.pointerId) return false;
    rotateDrag = null;
    canvas.style.cursor = '';
    suppressClickUntil = performance.now() + 300; // Shift+tık hamle sayılmaz
    return true;
  }
  function handleUp(evt) {
    dirty = true;
    if (endRotate(evt)) return;
    if (!touchPress || evt.pointerId !== touchPress.pointerId) return;
    touchPress = null;
    suppressClickUntil = performance.now() + 700;
    if (!inputEnabled) { hoverPoint = null; return; }
    const { mx, my } = pointerXY(evt);
    const hit = screenToGrid(mx, my);
    hoverPoint = null;
    if (!hit) { notifyHover(null); return; } // tahta dışında bırakıldı — iptal
    dispatchTap(hit);
  }
  function handleCancel(evt) {
    dirty = true;
    if (endRotate(evt)) return;
    if (!touchPress || evt.pointerId !== touchPress.pointerId) return;
    touchPress = null;
    suppressClickUntil = performance.now() + 700;
    hoverPoint = null;
    notifyHover(null);
  }
  function handleClick(evt) {
    if (!inputEnabled) return;
    if (performance.now() < suppressClickUntil) return; // dokunuş pointerup'ta zaten işlendi
    const { mx, my } = pointerXY(evt);
    const hit = screenToGrid(mx, my);
    if (!hit) return; // tahta dışı/boş tıklama — hamle sayılmaz
    dispatchTap(hit);
  }
  canvas.addEventListener('click', handleClick);
  canvas.addEventListener('pointermove', handleMove);
  canvas.addEventListener('pointerdown', handleDown);
  canvas.addEventListener('pointerup', handleUp);
  canvas.addEventListener('pointercancel', handleCancel);
  function preventContextMenu(evt) { evt.preventDefault(); } // sağ tuş döndürme içindir
  canvas.addEventListener('contextmenu', preventContextMenu);

  const api = {
    setSize(n) {
      if (![5, 9, 13, 19].includes(n)) return;
      SIZE = n; CELL = sizeToCell(n); HALF = (SIZE - 1) * CELL / 2; STONE_R = CELL * (20 / 48);
      boardSt = new BoardState(SIZE);
      visualStones = [];
      intersectionMarkers = false;
      libertyPoints = [];
      movePreview = null;
      illegalMarks = [];
      illegalHints = [];
      koFreeMarks = [];
      regionMarks = [];
      hoverPoint = null;
      lastMove = null;
      rejectFx = null;
      markSeedingTask();
    },
    reset() {
      boardSt.reset(SIZE);
      visualStones = [];
      intersectionMarkers = false;
      libertyPoints = [];
      movePreview = null;
      illegalMarks = [];
      illegalHints = [];
      koFreeMarks = [];
      regionMarks = [];
      hoverPoint = null;
      lastMove = null;
      rejectFx = null;
      markSeedingTask();
    },
    /** Tahta sesleri (varsayılan kapalı). Açma çağrısı bir kullanıcı
        tıklamasının içinden yapılmalı — tarayıcılar sesi ancak öyle açar. */
    setSoundEnabled(on) { sound.setEnabled(on); },
    isSoundEnabled() { return sound.isEnabled(); },
    focus(presetName) {
      // bkz. focusPoints() — adlandırılmış preset'e dönüş eski focus-noktası
      // state'ini/tanı sonucunu GEÇERSİZ kılar.
      activeFocusPoints = null;
      lastFocusResult = null;
      activePreset = presetName;
      camStart = { yaw: camYaw, pitch: camPitch, dist: camDist };
      camTarget = presetView(presetName, isMobile);
      camDur = CAM_DUR; camEase = easeInOutCubic;
      shiftStart = projShift; shiftTarget = 0;
      camLerpT = 0;
    },

    /**
     * Karşılama kamerası: tahtanın TAMAMINI verilen açıdan, altta
     * `bottomInset` px'lik bir bölgeyi (üstüne binen yazı) boş bırakarak
     * kadraja alır. `from` verilirse kamera o pozdan (`distScale` hedef
     * uzaklığa oran) `duration` saniyede yavaşlayarak süzülür; verilmezse
     * bulunduğu yerden. Sahne preset'lerine dokunmaz — sonraki focus()/
     * focusPoints() normal sahne kamerasına döner. Yeniden boyutlanmada
     * çağıran tarafından `duration: 0` ile tekrar çağrılır.
     * @param {{yaw:number, pitch:number, bottomInset?:number, from?:{yaw?:number,pitch?:number,distScale?:number}|null, duration?:number}} view
     */
    frameBoard({ yaw, pitch, bottomInset = 0, from = null, duration = CAM_DUR }) {
      activeFocusPoints = null;
      lastFocusResult = null;
      activePreset = null;
      const bw = HALF + CELL * .82;
      const corners = [[-bw, -bw], [bw, -bw], [bw, bw], [-bw, bw]].map(([wx, wz]) => ({ wx, wz }));
      const safe = safeRect();
      safe.bottom = Math.max(safe.top + 40, safe.bottom - bottomInset);
      const cy = (safe.top + safe.bottom) / 2;
      const dist = solveDistForFit(corners, safe, yaw, pitch, 120, 900, cy);
      camTarget = { yaw, pitch, dist };
      shiftStart = from ? H * 0.5 - cy : projShift;
      shiftTarget = H * 0.5 - cy;
      camStart = from
        ? { yaw: from.yaw ?? yaw, pitch: from.pitch ?? pitch, dist: dist * (from.distScale ?? 1) }
        : { yaw: camYaw, pitch: camPitch, dist: camDist };
      camDur = Math.max(0.05, duration);
      camEase = t => 1 - Math.pow(1 - t, 3);
      camLerpT = reduceMotion || duration <= 0 ? 1 : 0;
      const pose = camLerpT === 1 ? camTarget : camStart;
      camYaw = pose.yaw; camPitch = pose.pitch; camDist = pose.dist;
      projShift = camLerpT === 1 ? shiftTarget : shiftStart;
      updateProjCenter();
    },
    /** Karşılama salınımını aç/kapat (hareket azaltma tercihinde etkisiz). */
    setDrift(on) {
      driftOn = !!on;
      if (driftOn) driftTime = 0;
    },
    /** Tahtadaki bütün taşları yakalama animasyonuyla kaldırır ve kuralsal
        durumu boşaltır (karşılamadan derse geçiş). Ses çalmaz. */
    sweepStones() {
      boardSt.reset(SIZE);
      lastMove = null;
      if (reduceMotion) { visualStones = []; return; }
      for (const s of visualStones) if (s.captureAge == null) s.captureAge = 0;
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
     * (row,col) noktasında GERÇEK bir taş var mı — `isLegalMove()`'un
     * AKSİNE "dolu" ile "boş ama intihar" durumunu AYIRT EDER (bkz. v0.18
     * notu, görev talimatı Bölüm 8: hover silüetinin yasak bir hedef
     * üzerinde de — yalnız GERÇEKTEN boşsa — gösterilebilmesi gerekir).
     * @param {{row:number,col:number}} point
     * @returns {boolean}
     */
    isOccupied({ row, col }) {
      return boardSt.isOccupied(col, row);
    },

    /**
     * Yasalsa GERÇEK BoardState'i (core/ruleEngine.js applyMove) ve
     * görsel taş listesini günceller. Yasal DEĞİLSE hiçbir şeyi
     * değiştirmez — sahne modülü `.ok` alanına bakarak karar verir.
     * @param {{row:number,col:number,color:'black'|'white'}} move
     * @returns {{ok:boolean, reason?:string, captured?:Array<{row:number,col:number}>}}
     */
    playMove({ row, col, color, animateCapture = false }) {
      const check = isValidMove(boardSt, col, row, color);
      if (!check.valid) {
        if (check.reason !== 'OCCUPIED' && check.reason !== 'OUT_OF_BOUNDS') triggerReject(col, row, color);
        return { ok: false, reason: check.reason };
      }
      const { newState, captured } = applyMove(boardSt, col, row, color);
      boardSt = newState;
      const realMove = !seedingThisTask;
      visualStones.push({ gx: col, gz: row, color, t: reduceMotion ? 1 : 0, ...(realMove && !reduceMotion ? { t: 1, dropT: 0 } : {}) });
      lastMove = realMove ? { gx: col, gz: row } : null;
      if (realMove) {
        sound.place();
        if (captured.length) sound.capture(captured.length);
      }
      if (rejectFx && rejectFx.gx === col && rejectFx.gz === row) rejectFx = null;
      for (const c of captured) {
        if (animateCapture && !reduceMotion) {
          const visual = visualStones.find(s => s.gx === c.x && s.gz === c.y);
          if (visual) visual.captureAge = 0;
        } else {
          visualStones = visualStones.filter(s => !(s.gx === c.x && s.gz === c.y));
        }
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
      lastMove = null; // tek taşlı örnek bir hamle dizisi değildir
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
    showIntersectionMarkers(visible) {
      if (visible && !intersectionMarkers) markerTime = 0;
      intersectionMarkers = Boolean(visible);
    },
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
     * Reddedilen hamle denemelerinin GÖRSEL işaretlerini (kehribar-kırmızı
     * halka + çarpı) gösterir — bkz. drawIllegalMark, v0.19 notu. Çağrı
     * mevcut listeyi TAMAMEN DEĞİŞTİRİR (birikimli EKLEME değil) — sahne
     * modülü hangi noktaların "bulunmuş" olduğuna dair KENDİ durumunu
     * (ör. bir Set) tutar ve her güncellemede GÜNCEL TAM listeyi verir;
     * adaptör kaç hedef olduğunu/hangi sahneye ait olduğunu BİLMEZ. Hamlenin
     * GERÇEKTEN yasak olup olmadığına adaptör KARAR VERMEZ — çağıran bunu
     * ÖNCE `playMove()`'un `{ok:false,reason}` sonucundan (veya kendi saf
     * policy'sinden) belirler. Board State'e dokunmaz, yalnız görsel.
     * @param {Array<{row:number,col:number}>} points
     */
    showIllegalMoves(points) {
      illegalMarks = (points || []).map(p => ({ gx: p.col, gz: p.row, t: reduceMotion ? 1 : 0 }));
      // Yasak Hamleler sahnesi hamleyi kendi tahtasında değerlendirip yalnız
      // işaret gönderir — dokunulan nokta listedeyse aynı "hayır" efekti.
      if (lastTap && illegalMarks.some(m => m.gx === lastTap.gx && m.gz === lastTap.gz)) {
        const color = movePreview && movePreview.gx === lastTap.gx && movePreview.gz === lastTap.gz ? movePreview.color : 'black';
        triggerReject(lastTap.gx, lastTap.gz, color);
      }
    },
    clearIllegalMoves() {
      illegalMarks = [];
    },

    /**
     * "Yasak noktaları göster" ipucunun GÖRSEL listesi — bkz. drawIllegalHint.
     * `showIllegalMoves()` İLE AYNI "tam listeyi değiştir" sözleşmesi, AYRI
     * bir görsel katmanda (renk AYNI ama ŞEKİL FARKLI — bkz. v0.20 notu:
     * "renk tek başına ayrım aracı olmamalı"). Taş silüeti EKLEMEZ, board
     * state'e dokunmaz.
     * v0.20 — kök neden düzeltmesi: ÖNCEKİ listede AYNI koordinatta olan bir
     * noktanın `t`'si (fade-in ilerlemesi) KORUNUR — her çağrıda TÜMÜNÜ
     * `t:0`'a sıfırlamak, zaten tam görünür bir hint'i (bir tıklama AYNI
     * listeyi yeniden hesaplattığında) gereksiz yere yeniden söndürüp
     * başlatıyordu (kısa bir "titreme"). Yalnız GERÇEKTEN yeni bir nokta
     * `t:0`'dan başlar.
     * @param {Array<{row:number,col:number}>} points
     */
    showIllegalHints(points) {
      const prevT = new Map(illegalHints.map(h => [`${h.gx},${h.gz}`, h.t]));
      illegalHints = (points || []).map(p => {
        const key = `${p.col},${p.row}`;
        const existing = prevT.get(key);
        return { gx: p.col, gz: p.row, t: existing !== undefined ? existing : (reduceMotion ? 1 : 0) };
      });
    },
    clearIllegalHints() {
      illegalHints = [];
    },

    /**
     * v0.20 — "Ko noktası artık serbest" YEŞİL "neon" göstergesi (bkz.
     * drawKoFree, scenes/scene09KoRule.js). `showIllegalMoves()` İLE AYNI
     * "tam listeyi değiştir" sözleşmesi (birikimli EKLEME değil), AYRI bir
     * görsel katmanda (renk VE şekil farklı — bkz. drawKoFree notu). Hamlenin
     * GERÇEKTEN serbest olup olmadığına adaptör KARAR VERMEZ — çağıran bunu
     * ÖNCE kendi policy'sinden (core/ruleEngine.js sonucundan) belirler.
     * Board State'e dokunmaz, yalnız görsel.
     * @param {Array<{row:number,col:number}>} points
     */
    showKoFree(points) {
      koFreeMarks = (points || []).map(p => ({ gx: p.col, gz: p.row, t: reduceMotion ? 1 : 0 }));
    },
    clearKoFree() {
      koFreeMarks = [];
    },
    /** getIllegalMoves() İLE AYNI disiplin — YALNIZ gözlem/test amaçlı. */
    getKoFree() {
      return koFreeMarks.map(k => ({ row: k.gz, col: k.gx }));
    },

    /**
     * v0.21 — Sahne #10'un ("Oyun Sonu ve Sayım") RENK-AGNOSTİK bölge
     * göstergesi (bkz. drawRegionMark). `showIllegalMoves()`/`showKoFree()`
     * İLE AYNI "tam listeyi değiştir" sözleşmesi — ama HER nokta kendi
     * `color`ını ('black'|'white') taşır (adapter hangi rengin "siyah
     * bölge" mi "beyaz bölge" mi olduğuna KARAR VERMEZ, yalnız çağıranın
     * verdiği rengi çizer). `showIllegalHints()` İLE AYNI "önceki listede
     * AYNI nokta+renk varsa `t`sini KORU" tekniği — bir güncelleme zaten
     * tam görünür bir marker'ı gereksiz yere yeniden söndürüp başlatmaz.
     * Board State'e dokunmaz, taş silüeti EKLEMEZ.
     * @param {Array<{row:number,col:number,color:'black'|'white'}>} points
     */
    showRegionMarks(points) {
      const prevT = new Map(regionMarks.map(r => [`${r.gx},${r.gz},${r.color}`, r.t]));
      regionMarks = (points || []).map(p => {
        const key = `${p.col},${p.row},${p.color}`;
        const existing = prevT.get(key);
        return { gx: p.col, gz: p.row, color: p.color, t: existing !== undefined ? existing : (reduceMotion ? 1 : 0) };
      });
    },
    clearRegionMarks() {
      regionMarks = [];
    },
    /** getIllegalMoves() İLE AYNI disiplin — YALNIZ gözlem/test amaçlı. */
    getRegionMarks() {
      return regionMarks.map(r => ({ row: r.gz, col: r.gx, color: r.color }));
    },

    /**
     * Salt-okunur GÖZLEM — YALNIZ test amaçlı (bkz. getFocusPointsResult
     * AYNI disiplin): o an EKRANDA GERÇEKTEN kaç/hangi bulunmuş-yasak
     * marker'ın aynı anda göründüğünü, iç state'i (`illegalMarks`) MUTATE
     * ETMEDEN {row,col} listesine çevirip döner. Üretim davranışını
     * ETKİLEMEZ.
     */
    getIllegalMoves() {
      return illegalMarks.map(m => ({ row: m.gz, col: m.gx }));
    },
    /** getIllegalMoves() İLE AYNI disiplin — ipucu katmanı için. */
    getIllegalHints() {
      return illegalHints.map(h => ({ row: h.gz, col: h.gx }));
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
      // Elle döndürme sapması dahil — hareket katmanları bununla hizalanır.
      return { yaw: camYaw + userYaw + driftYaw, pitch: camPitch, dist: camDist };
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

    /** Son hamle işaretinin konumu — YALNIZ test/gözlem amaçlı, salt-okunur. */
    getLastMove() {
      return lastMove ? { row: lastMove.gz, col: lastMove.gx } : null;
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
      canvasResizeObserver?.disconnect();
      canvas.removeEventListener('click', handleClick);
      canvas.removeEventListener('pointermove', handleMove);
      canvas.removeEventListener('pointerdown', handleDown);
      canvas.removeEventListener('pointerup', handleUp);
      canvas.removeEventListener('pointercancel', handleCancel);
      canvas.removeEventListener('contextmenu', preventContextMenu);
      tapHandlers.clear();
      hoverHandlers.clear();
      libertyPoints = [];
      movePreview = null;
      illegalMarks = [];
      illegalHints = [];
      koFreeMarks = [];
      regionMarks = [];
      visualStones = [];
      lastMove = null;
    },
  };
  // Durum değiştirebilecek her API çağrısı bir sonraki karede yeniden çizim
  // ister; salt-okunur get*/is* sorguları (ör. hareket katmanının her kare
  // okuduğu getCameraState) boşta çizimi tetiklemez.
  for (const [name, fn] of Object.entries(api)) {
    if (typeof fn !== 'function' || /^(get|is)[A-Z]/.test(name)) continue;
    api[name] = (...args) => { dirty = true; return fn(...args); };
  }
  return api;
}
