/**
 * scenes/scene08IllegalMoves.js
 *
 * Konu #8 — "Yasak Hamleler". Müfredat kaynağı: core/curriculum.js, l4
 * "Yasak Hamleler" dersinin kullanıcıya görünen 1. ve 2. adımları (sıfır
 * tabanlı steps[0..1] — bkz. scenes/illegalMovePolicy.js, TEK doğruluk
 * kaynağı). Bu iki curriculum adımı iki ayrı sahne DEĞİL, TEK bir sahnenin
 * (bu dosya) kendi iç anlarıdır — scenes/scene06CaptureBasics.js/
 * scene07CapturePractice.js ile AYNI "tek mount, tek scene_started, çoklu
 * iç an" deseni.
 *
 * Mevcut Sahne #7 bu görev kapsamında DEĞİŞTİRİLMEDİ/genişletilmedi —
 * bu sahne registry'nin SONUNA bağımsız Sahne #8 olarak eklenir (bkz.
 * learning-scenes.html/teacher-studio.html scene registry listesi).
 *
 * PEDAGOJİK ÇEKİRDEK — İKİ FARKLI AN (bkz. scenes/illegalMovePolicy.js
 * dosya başı notu, GERÇEK RuleEngine sonucuyla doğrulandı):
 *   An 1 (`moment.kind === 'rejected'`): curriculum'un KENDİ metninin dediği
 *     GİBİ ("4 farklı yasak nokta var... fark et") DÖRT GERÇEK öz-yakalama
 *     noktasının TAMAMI interaktif hedeftir (bkz. v2 revizyonu — önceki
 *     revizyon kamera/mobil kadraj gerekçesiyle içeriği TEK hedefe indirmişti,
 *     bu YANLIŞ bir daralmaydı ve TERK EDİLDİ). Kullanıcı dördünü de
 *     SERBEST sırada bulup dener — `attemptedForbiddenPoints` bir
 *     `Set<pointKey>`'dir, sıra ÖNEMSİZDİR. Her GERÇEK curriculum hedefi
 *     RuleEngine tarafından reddedilir, taş yerleşmez, board DEĞİŞMEZ.
 *   An 2 (`moment.kind === 'legal_capture'`): curriculum'un `moves`
 *     dizisindeki HER GERÇEK formasyon örneği İNTİHAR GİBİ GÖRÜNÜR ama
 *     GERÇEKTE yasaldır (5 taş yakalar) — bu anın PEDAGOJİK BAŞARISI
 *     hamlenin GERÇEKTEN oynanıp taşın tahtaya yerleşmesi ve yakalamanın
 *     gerçekleşmesidir. v3 revizyonu (bkz. görev talimatı: "ikinci anı
 *     bütün curriculum örneklerine dönüştür") — ÖNCEKİ revizyon
 *     `moves.find(m=>m.color==='B')` ile YALNIZ İLK formasyonu (üst) alıp
 *     ikinciyi (alt) SESSİZCE atlıyordu; bu YANLIŞ bir daralmaydı ve TERK
 *     EDİLDİ. An 2 artık curriculum'un `legalCaptureExamples[]`'indeki HER
 *     örneği (şu an 2 — `illegalMovePolicy.js`'in KENDİSİ sayıyı SAYAR,
 *     burada hard-code EDİLMEZ) taze bir seed'le, sırayla, "Yakalama
 *     istisnası N/M" alt-ilerlemesiyle sunar (bkz. `currentExampleIndex`,
 *     `resolveCaptureExampleMoment`) — An 1'in çoklu-HEDEF (serbest sıra,
 *     TEK board) mekanizmasından FARKLI bir desendir: her örnek KENDİ taze
 *     board seed'iyle gelir (bkz. görev talimatı Bölüm 8: "ayrı-seed"
 *     modeli — iki formasyon GEOMETRİK/RuleEngine olarak TAM bağımsız
 *     olduğu için Model A [aynı board] da GÜVENLİ olurdu, ama Model B ayrı
 *     seed her zaman "hangi formasyon şu an aktif" belirsizliğini YAPISAL
 *     olarak imkânsız kılar — bkz. görev talimatı: "daha güvenli varsayılan
 *     yaklaşım"). Topic-end YALNIZ SON örnek başarıyla tamamlandıktan
 *     SONRA açılır (bkz. handleLegalCaptureTap `isLastExample`).
 * İki an FARKLI beklenen sonuç taşır (`moment.kind`) — TEK bir "hep
 * reddedilir" kalıbına zorlanmadı (bkz. görev talimatı: "iki durumu
 * ayırt et").
 *
 * TÜM tıklamalar (hedef VEYA hedef-dışı, yasal VEYA yasak) GERÇEK
 * `core/ruleEngine.js` sonucuyla değerlendirilir (bkz. illegalMovePolicy.js
 * evaluateAttempt) — hedef-dışı bir noktaya dokunmak (yasal olsa bile)
 * board'a KALICI taş KOYMAZ, yalnız kısa bir yönlendirme gösterir ve
 * seed'i korur (bkz. görev talimatı Bölüm 4/9).
 *
 * GÖRSEL DİL (bkz. görev talimatı Bölüm 5): reddedilen bir deneme Sahne
 * #7'nin turkuaz/neon "nefes noktası" diliyle KARIŞTIRILMAZ — AYRI, sakin
 * bir kehribar-kırmızı halka+çarpı kullanılır (bkz. adapters/
 * sceneBoardAdapter.js showIllegalMoves/drawIllegalMark, v0.19). An 1'de
 * BULUNMUŞ dört hedefin işaretleri AYNI ANDA görünebilir (kullanıcının
 * keşfettiği örüntüyü karşılaştırmasına yardım eder) — adaptöre HER
 * güncellemede GÜNCEL TAM liste verilir (`attemptedForbiddenPoints`'ten
 * türetilir), adaptör birikimli EKLEME yapmaz. Taşın "geri çekilmesi"
 * mevcut `clearMovePreview()` ile aynı anda elde edilir — yeni bir
 * animasyon durumu EKLENMEDİ.
 *
 * KONTROLLÜ İPUCU (bkz. görev talimatı Bölüm 6): "Yasak noktaları göster"
 * düğmesi (yalnız An 1'de, `hintRevealed` — an başına bir kez açılabilir)
 * HENÜZ BULUNMAMIŞ hedefleri AYRI bir görsel katmanla (`showIllegalHints`,
 * bkz. adapters/sceneBoardAdapter.js drawIllegalHint v0.20 — kök neden
 * düzeltmesi: ESKİ kesikli/düşük-alpha tasarım gerçek piksel örneklemesiyle
 * "teknik olarak çiziliyor ama görünmeyecek kadar zayıf" ÖLÇÜLDÜ, artık
 * `drawLibertyMark` İLE AYNI çapraz+nokta+glow TEKNİĞİ, farklı renk)
 * gösterir — taş silüeti eklemez, board state'i değiştirmez, ilerleme
 * eklemez, noktaları "bulundu" SAYMAZ, `scene_hint_revealed` DIŞINDA yeni
 * event üretmez (mevcut genel event yeniden kullanıldı — bkz.
 * scenes/scene07CapturePractice.js AYNI event).
 *
 * KAMERA/GÖRÜNÜRLÜK (bkz. görev talimatı Bölüm 7/11): her an (VE An 2'nin
 * HER örneği — `seedMoment` `currentResolvedMoment()`'in GERÇEK board/hedef
 * çiftini alır) ÖNCE curriculum kamera preset'ini uygular (`board.focus`),
 * SONRA Sahne #7 an 1'in AYNI genel, sahne/adım BİLMEYEN `board.focusPoints()`
 * katmanını (bkz. seedMoment) — hedefler zaten güvenliyse NO-OP, değilse
 * minimum düzeltme. An 1'de DÖRT hedefin TAMAMI + TÜM 14 bağlamsal taş
 * (curriculum'un GERÇEK board'u — dört formasyonun birleşimi zaten bu 14
 * taşın TAMAMI, bkz. illegalMovePolicy.js) framing listesine verilir. An
 * 2'nin HER örneğinde yalnız O ÖRNEĞİN 12 taşı (hedefin saldıran duvarı +
 * yakalanacak grup) + hedef verilir — diğer örneğe HİÇ dokunulmaz (bkz.
 * illegalMovePolicy.js deriveLegalCaptureExamples). `minZoom:160` (bkz.
 * seedMoment notu) ile 1280×720/768×1024/390×844/360×800/844×390
 * viewport'larının HEPSİNDE An 1 VE An 2'nin HER İKİ örneği için AYRI AYRI
 * `safe:true, worstViolationPx:0` ÖLÇÜLDÜ.
 *
 * EVENT SÖZLEŞMESİ (bkz. görev talimatı Bölüm 9/12): mevcut
 * `scene_intro_confirmed/scene_assessment_presented/scene_assessment_advanced/
 * scene_completion_unlocked/scene_hint_revealed` YENİDEN KULLANILDI. Uygun
 * mevcut bir event "yasak hamle denemesi" anlamını taşımadığı için TEK
 * yeni, sahneye özel OLMAYAN genel bir event eklendi:
 * `scene_illegal_move_attempted` (bkz. handleRejectedTap/handleLegalCaptureTap
 * altında) — HER gerçek dokunuş denemesinde üretilir; `legal`/
 * `isCurriculumTarget`/`boardChanged` GERÇEK sonucu taşır, An 1'e özel
 * `uniqueTargetNumber`/`uniqueTargetsFound`/`totalCurriculumTargets`/
 * `alreadyAttempted`/`hintWasVisible` alanları serbest-sıra ilerlemesini
 * yansıtır (yalnız An 1'de anlamlı; An 2'de `isCurriculumTarget:true` TEK
 * hedefi işaret eder, `legal:true`/`boardChanged:true`/`capturedCount:5`
 * ile GERÇEK yakalama semantiği taşır — reddedilen bir denemeyle
 * KARIŞTIRILMAZ, bkz. `legal` alanı). An 2'nin HER örneği ayrıca
 * `exampleIndex`/`exampleCount`/`sourceIndex` taşır — `assessmentIndex` bu
 * SIRADA SABİT kalır (dış an değişmiyor, yalnız İÇ örnek ilerliyor, bkz.
 * advanceToNextExample); örnekler arası geçişte GERÇEK bir
 * `scene_assessment_advanced` üretilir (`fromExampleIndex`/`toExampleIndex`
 * ile) ama SON örnekte ÜRETİLMEZ (bkz. görev talimatı: "sahte
 * {from:last,to:last} advanced eventi" yasağı).
 *
 * KAVRAM (bkz. illegalMovePolicy.js dosya başı notu): `concept:'forbidden_move'`
 * KASITLI olarak core/conceptMap.js'e eklenmedi — Teacher Studio Diagnostics
 * bunu bilinen-olmayan concept olarak raporlar (bilinçli, gizlenmeyen boşluk).
 */
import { mountTopicEndControls } from './topicEndControls.js?v=2026-09-01.1';
import { assessmentTransition } from './assessmentTransition.js?v=2026-09-01.1';
import {
  getIllegalMoveMoments, evaluateAttempt, reasonLabelTr, pointKey, resolveCaptureExampleMoment, toRuntimeColor,
  MOMENT_KINDS, CONCEPT,
} from './illegalMovePolicy.js?v=2026-09-01.1';

const STATE = { INTRO: 'intro', PLAYING: 'playing' };

const INTRO_TEXT = 'Go\'da her kesişime taş yerleştirilemez. Şimdi iki yasak hamleyi deneyelim.';
const CONTINUE_LABEL = 'Devam';
const FORBIDDEN_TAP_HINT = 'Tahtada kendi taşını nefessiz bırakacak 4 yasak noktayı bul ve dene — istediğin sırada.';
const LEGAL_CAPTURE_TAP_HINT = 'İşaretli hamleyi dene — intihar gibi görünse de sonucunu gözlemle.';
const HINT_BUTTON_LABEL = 'Yasak noktaları göster';
const OFF_TARGET_ILLEGAL_HINT = 'Bu, alıştırmanın hedeflerinden biri değil — başka bir kesişimi dene.';
const OFF_TARGET_LEGAL_HINT = 'Bu nokta yasal ama alıştırmanın hedefi değil — işaretli/ilgili kesişimi dene.';
// An 2'nin (legal_capture) hedef-dışı denemesi için AYRI, örneğe-özgü
// yönlendirme (bkz. görev talimatı Bölüm 10) — An 1'in genel
// OFF_TARGET_*_HINT'inden BİLEREK FARKLI, "bu ÖRNEKTE" diyerek çok-örnekli
// bağlamı netleştirir.
const CAPTURE_OFF_TARGET_HINT = 'Bu örnekte yakalamayı sağlayan kesişimi yeniden ara.';

/** An 2'nin AKTİF örneğinin GERÇEK authored hamle rengini SÖZ OLARAK da
    belirtir (bkz. görev talimatı Bölüm 4: "hamle rengi yalnız taş
    renginden anlaşılmaya bırakılmamalı; görev metni/erişilebilir açıklama
    da rengi belirtmeli"). `moveColor:'B'` (curriculum'un authored kısaltması)
    için nötr "Siyah oynuyor.", `'W'` için "Bu kez beyaz oynuyor." — İKİNCİ
    örneğin RENK DEĞİŞİKLİĞİNİ kullanıcıya açıkça vurgular. */
function captureColorLabelTr(moveColor) {
  return moveColor === 'W' ? 'Bu kez beyaz oynuyor.' : 'Siyah oynuyor.';
}
const SUMMARY_TEXT = 'Bazı kesişimlere taş konamayacağını ve görünüşte yasak bir hamlenin bazen yakalama istisnasıyla geçerli olabileceğini gerçek RuleEngine sonuçlarıyla gördün.';
// Aynı NOKTAYA hızlı çift tıklama TEK bir denemeye sayılmalı (bkz. görev
// talimatı Bölüm 4/12: "hızlı çift tıklama tek deneme/tek event üretir") —
// scenes/scene07CapturePractice.js'in AYNI debounce penceresiyle.
const TAP_DEBOUNCE_MS = 400;

let state = STATE.INTRO;
let moments = [];
let currentIndex = 0;
let currentExampleIndex = 0; // YALNIZ An 2 (legal_capture) için anlamlı — legalCaptureExamples[] içindeki aktif örnek
let answeredCorrectly = [];
let attemptCount = [];
let lastTap = null; // {row, col, at}
let attemptedForbiddenPoints = new Set(); // YALNIZ An 1 (REJECTED) için anlamlı
let hintRevealed = false; // an başına bir kez — seedMoment'te sıfırlanır
let awaitingContinue = false;
let transitioning = false;
let unlockedEmitted = false;
let topicEnded = false;
let topicEnd = null;
let els = null;
let cleanupFns = [];
let itemCleanupFns = [];
let unsubscribeTap = null;
let unsubscribeHover = null;

function resetState() {
  state = STATE.INTRO;
  moments = getIllegalMoveMoments();
  currentIndex = 0;
  currentExampleIndex = 0;
  answeredCorrectly = new Array(moments.length).fill(false);
  attemptCount = new Array(moments.length).fill(0);
  lastTap = null;
  attemptedForbiddenPoints = new Set();
  hintRevealed = false;
  awaitingContinue = false;
  transitioning = false;
  unlockedEmitted = false;
  topicEnded = false;
  topicEnd = null;
  unsubscribeTap = null;
  unsubscribeHover = null;
}

/** Aktif dış anı ("moments[currentIndex]") render/etkileşim için "çözümlenmiş"
    tek-örnek görünümüne çevirir — An 1 (rejected) için moment DEĞİŞMEDEN
    döner (birden fazla örneği yok), An 2 (legal_capture) için
    `currentExampleIndex`teki GERÇEK örneği taşıyan görünümü döner (bkz.
    scenes/illegalMovePolicy.js resolveCaptureExampleMoment). */
function currentResolvedMoment() {
  const moment = moments[currentIndex];
  if (moment.kind !== MOMENT_KINDS.LEGAL_CAPTURE) return moment;
  return resolveCaptureExampleMoment(moment, currentExampleIndex);
}

function on(el, type, handler) {
  el.addEventListener(type, handler);
  cleanupFns.push(() => el.removeEventListener(type, handler));
}
function onItem(el, type, handler) {
  el.addEventListener(type, handler);
  itemCleanupFns.push(() => el.removeEventListener(type, handler));
}
function clearItemListeners() {
  itemCleanupFns.forEach(fn => fn());
  itemCleanupFns = [];
  if (unsubscribeTap) { unsubscribeTap(); unsubscribeTap = null; }
  if (unsubscribeHover) { unsubscribeHover(); unsubscribeHover = null; }
}

function allAnsweredCorrectly() {
  return answeredCorrectly.length === moments.length && answeredCorrectly.every(Boolean);
}

function hideIllegalVisuals(context) {
  context.boardAdapter.clearMovePreview();
  context.boardAdapter.clearIllegalMoves();
  context.boardAdapter.clearIllegalHints();
}

/** Anın gerçek board seed'ini kurar — hedef(ler) ÖNCEDEN işaretlenmez
    (bkz. dosya başı not: kullanıcı hedefleri BİZZAT dener, pasif bir
    "işte yasak noktalar" kartı GÖSTERİLMEZ). */
function seedMoment(context, moment) {
  const board = context.boardAdapter;
  board.setSize(moment.size);
  board.reset();
  attemptedForbiddenPoints = new Set();
  hintRevealed = false;
  // Müfredat kamera preset'i HER anda önce uygulanır (bkz. görev talimatı
  // Bölüm 7) — l4.steps[0..1]'in HİÇBİRİ kendi `camera` alanını taşımıyor
  // (bkz. scenes/illegalMovePolicy.js cameraPresetName — moment.cameraPreset
  // bu iki an için her zaman null), bu yüzden ikisi de 'center'a düşer.
  board.focus(moment.cameraPreset || 'center');
  // GÖRÜNÜRLÜK-ÖNCELİKLİ katman (bkz. adapters/sceneBoardAdapter.js
  // focusPoints, Sahne #7 an 1'in AYNI genel API'si — sahne/adım BİLMEZ):
  // preset zaten güvenliyse NO-OP; değilse GERÇEK hedef nokta(lar)ı VE
  // board'daki GERÇEK bağlamsal taşlar (bu noktaların NEDEN yasak olduğunu
  // anlamak için gerekli — bkz. görev talimatı Bölüm 7) canvas'ın güvenli
  // alanına sığdırılır. An 1'de bu DÖRT hedef + 14 taş demektir — curriculum'un
  // KENDİ board'u zaten TAM OLARAK bu dört formasyonun birleşimidir (fazladan
  // taş YOK, eksik de YOK, bkz. illegalMovePolicy.js). Hiçbir koordinat
  // burada hard-code EDİLMEDİ — hepsi moment.board/moment.targetPoints'ten
  // gelir.
  const points = [
    ...moment.board.map(s => ({ row: s.y, col: s.x })),
    ...moment.targetPoints,
  ];
  // `minZoom:160` (varsayılan 320 yerine) — An 1'in DÖRT hedefi 9×9'un
  // köşeden köşeye YAYILIR (bkz. illegalMovePolicy.js dosya başı notu);
  // varsayılan zoom sınırında 844×390 (kısa yatay) viewport'ta
  // `safe:false, reason:'clamped-unresolved'` ölçüldü. `minZoom:160`
  // adapters/sceneBoardAdapter.js manuel zoom'un KENDİ alt sınırıyla
  // (`HALF*0.8`, 9×9'da 153.6) TUTARLI kalır — computeFraming'in kendi
  // algoritması DOKUNULMADI, yalnız BU ÇAĞRIYA özel daha geniş bir arama
  // aralığı verildi. Ölçüldü: BEŞ viewport'un (1280×720/768×1024/390×844/
  // 360×800/844×390) HEPSİNDE `safe:true, worstViolationPx:0`.
  board.focusPoints(points, { presetName: moment.cameraPreset || 'center', minZoom: 160 });
  for (const stone of moment.board) {
    board.playMove({ row: stone.y, col: stone.x, color: stone.color === 'B' ? 'black' : 'white' });
  }
  hideIllegalVisuals(context);
}

function buildProgressHtml(index) {
  const dots = moments.map((_, i) => {
    const cls = i < index ? 's05-dot s05-dot--done' : i === index ? 's05-dot s05-dot--active' : 's05-dot';
    return `<span class="${cls}" aria-hidden="true"></span>`;
  }).join('');
  return `
    <span class="s05-progress-text">${index + 1} / ${moments.length}</span>
    <span class="s05-progress-dots">${dots}</span>
  `;
}

/** Pointer hover ile hamle-öncesi taş silüeti — bkz. görev talimatı
    Bölüm 5: yasak/legal ayrımı YAPILMAZ, yalnız GERÇEKTEN dolu bir
    kesişimde silüet gösterilmez (adapters/sceneBoardAdapter.js
    isOccupied() — mevcut isLegalMove() burada YETERSİZ, o "dolu" ile
    "boş ama intihar" durumunu ayırt etmez, bkz. v0.18 notu). */
function handleHover(context, hit) {
  if (!hit || context.boardAdapter.isOccupied(hit)) {
    context.boardAdapter.clearMovePreview();
    return;
  }
  // AKTİF anın/örneğin GERÇEK oynayacağı renk — An 1 HER ZAMAN siyah
  // (moveColor alanı yok, toRuntimeColor(undefined)='black'), An 2'nin HER
  // örneği KENDİ authored `moveColor`'ını kullanır (bkz. görev talimatı:
  // "Hover preview aktif örneğin gerçek moveColor'ını kullanmalı").
  const moment = currentResolvedMoment();
  context.boardAdapter.setMovePreview({ row: hit.row, col: hit.col, color: toRuntimeColor(moment.moveColor) });
}

/** An 1'in (`kind:'rejected'`) bulunmuş/ipucu marker listelerini
    `attemptedForbiddenPoints`/`hintRevealed`'tan YENİDEN türetip adaptöre
    GÜNCEL TAM listeyi verir — adaptör birikimli EKLEME yapmaz (bkz.
    adapters/sceneBoardAdapter.js showIllegalMoves/showIllegalHints notu). */
function refreshForbiddenVisuals(context, moment) {
  const found = moment.targetPoints.filter(p => attemptedForbiddenPoints.has(pointKey(p)));
  context.boardAdapter.showIllegalMoves(found);
  if (hintRevealed) {
    const unfound = moment.targetPoints.filter(p => !attemptedForbiddenPoints.has(pointKey(p)));
    context.boardAdapter.showIllegalHints(unfound);
  } else {
    context.boardAdapter.clearIllegalHints();
  }
}

function updateForbiddenProgressUI(moment) {
  if (!els.forbiddenProgressEl) return;
  els.forbiddenProgressEl.textContent = `${attemptedForbiddenPoints.size} / ${moment.targetPoints.length} yasak nokta`;
}

function updateHintButtonState() {
  if (!els.hintBtn) return;
  els.hintBtn.setAttribute('aria-pressed', hintRevealed ? 'true' : 'false');
  els.hintBtn.classList.toggle('s08-hint-btn--active', hintRevealed);
}

/** "Yasak noktaları göster" — an başına EN FAZLA bir kez `scene_hint_
    revealed` üretir (bkz. scenes/scene07CapturePractice.js AYNI disiplin).
    Board state'i DEĞİŞTİRMEZ, ilerleme EKLEMEZ, noktaları "bulundu"
    SAYMAZ — yalnız henüz bulunmamış hedefleri AYRI bir görsel katmanda
    gösterir (bkz. refreshForbiddenVisuals). */
function revealForbiddenHint(context, moment) {
  if (hintRevealed) return;
  hintRevealed = true;
  refreshForbiddenVisuals(context, moment);
  context.emit('scene_hint_revealed', {
    assessmentIndex: currentIndex,
    stepIndex: moment.curriculumStepIndex,
    hintMode: 'on_request',
    hintRequested: true,
    uniqueTargetsFound: attemptedForbiddenPoints.size,
    totalCurriculumTargets: moment.targetPoints.length,
  });
  updateHintButtonState();
}

/** An 1 (`kind:'rejected'`) — curriculum'un DÖRT GERÇEK öz-yakalama
    noktasının SERBEST sırada bulunması. Aynı hedefe tekrar dokunmak
    ilerlemeyi ARTIRMAZ (bkz. görev talimatı Bölüm 4); hedef-dışı GERÇEK
    yasak/yasal bir nokta da ilerlemeyi/board'u ETKİLEMEZ. */
function handleRejectedTap(context, moment, hit, attempt) {
  const isTarget = attempt.isCurriculumTarget;
  const key = isTarget ? pointKey(hit) : null;
  const alreadyAttempted = isTarget && attemptedForbiddenPoints.has(key);
  const isNewUniqueTarget = isTarget && !alreadyAttempted;
  if (isNewUniqueTarget) attemptedForbiddenPoints.add(key);

  context.emit('scene_illegal_move_attempted', {
    assessmentIndex: currentIndex,
    stepIndex: moment.curriculumStepIndex,
    row: hit.row,
    col: hit.col,
    color: 'black',
    legal: attempt.legal,
    reason: attempt.reason,
    isCurriculumTarget: isTarget,
    boardChanged: false, // REJECTED anı ASLA commit ETMEZ.
    stoneCountBefore: moment.board.length,
    stoneCountAfter: moment.board.length,
    concept: CONCEPT,
    mode: moment.kind,
    attemptNumber: attemptCount[currentIndex],
    uniqueTargetNumber: isNewUniqueTarget ? attemptedForbiddenPoints.size : null,
    uniqueTargetsFound: attemptedForbiddenPoints.size,
    totalCurriculumTargets: moment.targetPoints.length,
    alreadyAttempted,
    hintWasVisible: hintRevealed,
  });

  if (isTarget) {
    context.boardAdapter.clearMovePreview();
    refreshForbiddenVisuals(context, moment);
    updateForbiddenProgressUI(moment);
    setFeedback(
      alreadyAttempted
        ? `Bu noktayı zaten bulmuştun. ${reasonLabelTr(attempt.reason)}`
        : `Doğru. ${reasonLabelTr(attempt.reason)}`,
      'ok',
    );
    if (attemptedForbiddenPoints.size === moment.targetPoints.length) {
      answeredCorrectly[currentIndex] = true;
      context.boardAdapter.setInputEnabled(false);
      showContinueControl(context);
    }
    return;
  }

  // Hedef-dışı GERÇEK bir nokta (yasak ya da yasal) — board/ilerleme/marker
  // DEĞİŞMEZ, yalnız kısa bir yönlendirme gösterilir.
  if (!attempt.legal) {
    setFeedback(`${reasonLabelTr(attempt.reason)} ${OFF_TARGET_ILLEGAL_HINT}`, 'err');
  } else {
    setFeedback(OFF_TARGET_LEGAL_HINT, 'err');
  }
}

/** An 2 (`kind:'legal_capture'`) — `moment` HER ZAMAN `currentResolvedMoment()`
    üzerinden gelen, TEK GERÇEK örneği taşıyan "çözümlenmiş" görünümdür (bkz.
    handleTap) — An 1'in çoklu-marker mekanizması BURAYA SIZMAZ. Hedef
    GERÇEKTEN yasalsa (RuleEngine'e göre) hamle GERÇEKTEN oynanır, taş
    yerleşir, GERÇEK yakalama olur. Topic-end'i açan `answeredCorrectly`
    YALNIZ SON örnekte set edilir (bkz. görev talimatı: "tek örnek
    tamamlandığında sahne bitmemeli") — ama "Devam" HER başarılı örnekte
    açılır (sıradaki örneğe veya — son örnekse — topic-end'e geçmek için,
    bkz. goToNextItem). */
function handleLegalCaptureTap(context, moment, hit, attempt) {
  const isSuccess = attempt.isCurriculumTarget && attempt.legal;
  // Bu örneğin GERÇEK authored hamle rengi (bkz. görev talimatı Bölüm 4:
  // "her formasyon curriculum'da yazıldığı renklerle birebir gösterilmeli")
  // — 'B' ise siyah, 'W' ise GERÇEKTEN beyaz oynanır, sahte bir 'black'
  // varsayımı YOK.
  const runtimeColor = toRuntimeColor(moment.moveColor);
  let playResult = null;
  if (isSuccess) {
    // Hızlı çift tıklama guard'ı — girdi GERÇEK commit/emit'ten ÖNCE
    // kapatılır (bkz. scenes/scene07CapturePractice.js AYNI disiplin).
    context.boardAdapter.setInputEnabled(false);
    playResult = context.boardAdapter.playMove({ row: hit.row, col: hit.col, color: runtimeColor });
    if (!playResult.ok) return; // savunma amaçlı — policy zaten yasallığı doğruladı.
  }
  const boardChanged = !!(playResult && playResult.ok);

  context.emit('scene_illegal_move_attempted', {
    assessmentIndex: currentIndex,
    stepIndex: moment.curriculumStepIndex,
    exampleIndex: moment.exampleIndex,
    exampleCount: moment.exampleCount,
    sourceIndex: moment.sourceIndex,
    row: hit.row,
    col: hit.col,
    // 'B'|'W' — curriculum'un KENDİ authored kısaltması (bkz. görev
    // talimatı Bölüm 9) — An 1'in `color:'black'` (kelime biçimi, HER ZAMAN
    // siyah, değişmedi) sözleşmesinden BİLEREK FARKLI: An 2'nin HER örneği
    // GERÇEKTEN farklı bir renk oynayabildiği için ham authored kısaltma
    // daha doğru bir sözleşmedir.
    color: moment.moveColor,
    capturedColor: moment.capturedColor,
    legal: attempt.legal,
    reason: attempt.reason,
    isCurriculumTarget: attempt.isCurriculumTarget,
    boardChanged,
    stoneCountBefore: moment.board.length,
    stoneCountAfter: moment.board.length + (boardChanged ? 1 - attempt.capturedCount : 0),
    concept: CONCEPT,
    mode: moment.kind,
    attemptNumber: attemptCount[currentIndex],
    ...(boardChanged ? { capturedCount: attempt.capturedCount, resultConcept: 'capture' } : {}),
  });

  if (isSuccess) {
    const isLastExample = moment.exampleIndex === moment.exampleCount - 1;
    if (isLastExample) answeredCorrectly[currentIndex] = true;
    context.boardAdapter.clearMovePreview();
    context.boardAdapter.clearIllegalMoves();
    setFeedback(`Doğru. Bu hamle görünüşe rağmen yasal — çünkü ${attempt.capturedCount} taş yakalıyor.`, 'ok');
    showContinueControl(context);
    return;
  }

  // Hedef-dışı VEYA beklenmeyen sonuç — board DEĞİŞMEDİ, seed korunur.
  if (!attempt.legal) {
    context.boardAdapter.clearMovePreview();
    context.boardAdapter.showIllegalMoves([hit]);
    setFeedback(`${reasonLabelTr(attempt.reason)} ${CAPTURE_OFF_TARGET_HINT}`, 'err');
  } else {
    context.boardAdapter.clearIllegalMoves();
    setFeedback(CAPTURE_OFF_TARGET_HINT, 'err');
  }
}

/**
 * TEK, birleşik dokunuş işleyicisi — `moment.kind`'a göre dallanır, HANGİ
 * momentIndex olduğuna göre DEĞİL (bkz. görev talimatı: içeriğe göre değil
 * gerçek veri şekline göre karar ver). `moment` HER ZAMAN `currentResolvedMoment()`
 * ile TAZE türetilir — bir önceki render'dan gelen KAPANMIŞ (stale) bir
 * closure'a GÜVENİLMEZ (bkz. görev talimatı: An 2 örnekleri arasında geçiş
 * sırasında board/hedef DEĞİŞİR). Her tıklama GERÇEK `evaluateAttempt()`
 * (core/ruleEngine.js) sonucuyla değerlendirilir.
 */
function handleTap(context, hit) {
  if (awaitingContinue || transitioning) return;

  const moment = currentResolvedMoment();
  const attempt = evaluateAttempt(moment, hit);

  const now = Date.now();
  if (lastTap && lastTap.row === hit.row && lastTap.col === hit.col && now - lastTap.at < TAP_DEBOUNCE_MS) {
    return; // AYNI noktaya hızlı çift tıklama — ikinci deneme SAYILMAZ.
  }
  lastTap = { row: hit.row, col: hit.col, at: now };
  attemptCount[currentIndex] += 1;

  if (moment.kind === MOMENT_KINDS.REJECTED) {
    handleRejectedTap(context, moment, hit, attempt);
  } else {
    handleLegalCaptureTap(context, moment, hit, attempt);
  }
}

function renderMomentItem(context, moment) {
  if (moment.kind === MOMENT_KINDS.REJECTED) {
    els.contentEl.innerHTML = `
      <div class="s05-item">
        <div class="s05-prompt">${moment.promptText}</div>
        <p class="s05-tap-hint">${FORBIDDEN_TAP_HINT}</p>
        <p class="s05-tap-hint" id="s08-forbidden-progress">0 / ${moment.targetPoints.length} yasak nokta</p>
        <button type="button" class="s07-hint-btn s08-hint-btn" id="s08-hint" aria-pressed="false">${HINT_BUTTON_LABEL}</button>
      </div>
    `;
    els.hintBtn = els.contentEl.querySelector('#s08-hint');
    els.forbiddenProgressEl = els.contentEl.querySelector('#s08-forbidden-progress');
    onItem(els.hintBtn, 'click', () => {
      if (awaitingContinue || transitioning) return;
      revealForbiddenHint(context, moment);
    });
  } else {
    // An 2 — birden fazla GERÇEK örnek olabileceği için (bkz. görev talimatı
    // Bölüm 9) AYRI bir "Yakalama istisnası N/M" alt-ilerleme metni (an
    // seviyesindeki ana "N/M" nokta göstergesinden — buildProgressHtml —
    // BAĞIMSIZ, o hep sabit 2 kalır: An1/An2).
    els.contentEl.innerHTML = `
      <div class="s05-item">
        <p class="s05-tap-hint" id="s08-capture-progress">Yakalama istisnası ${moment.exampleIndex + 1} / ${moment.exampleCount}</p>
        <div class="s05-prompt">${moment.promptText}</div>
        <p class="s05-tap-hint" id="s08-capture-color"><strong>${captureColorLabelTr(moment.moveColor)}</strong></p>
        <p class="s05-tap-hint">${LEGAL_CAPTURE_TAP_HINT}</p>
      </div>
    `;
    els.hintBtn = null;
    els.forbiddenProgressEl = null;
  }
  context.boardAdapter.setInputEnabled(true);
  unsubscribeTap = context.boardAdapter.onIntersectionTap(hit => handleTap(context, hit));
  unsubscribeHover = context.boardAdapter.onIntersectionHover(hit => handleHover(context, hit));
  return els.hintBtn || els.contentEl.querySelector('.s05-tap-hint');
}

function setFeedback(text, kind) {
  els.feedbackEl.textContent = text;
  els.feedbackEl.classList.remove('s05-feedback--ok', 's05-feedback--err');
  els.feedbackEl.classList.add(kind === 'ok' ? 's05-feedback--ok' : 's05-feedback--err');
}

function showContinueControl(context) {
  awaitingContinue = true;
  els.continueBtn.classList.remove('s05-continue--waiting');
  els.continueBtn.tabIndex = 0;
  els.continueBtn.focus({ preventScroll: true });
  if (currentIndex === moments.length - 1 && !unlockedEmitted && allAnsweredCorrectly()) {
    unlockedEmitted = true;
    context.emit('scene_completion_unlocked', {});
  }
}

function renderCurrentItem(context) {
  const moment = currentResolvedMoment();
  els.progressEl.innerHTML = buildProgressHtml(currentIndex);
  els.feedbackEl.textContent = '';
  els.feedbackEl.classList.remove('s05-feedback--ok', 's05-feedback--err');
  els.continueBtn.classList.add('s05-continue--waiting');
  els.continueBtn.tabIndex = -1;
  awaitingContinue = false;
  lastTap = null;
  seedMoment(context, moment);
  const firstFocusable = renderMomentItem(context, moment);
  return firstFocusable;
}

async function loadItem(context, index, { withTransition }) {
  clearItemListeners();
  context.boardAdapter.setInputEnabled(false);
  currentIndex = index;
  currentExampleIndex = 0; // YENİ dış ana geçiliyor — An 2 ise İLK örnekten başlar.
  if (!withTransition) {
    renderCurrentItem(context);
    presentCurrentMoment(context);
    return;
  }
  transitioning = true;
  let firstFocusable = null;
  await assessmentTransition({
    container: els.contentEl,
    renderNext: () => { firstFocusable = renderCurrentItem(context); },
    focusTarget: () => firstFocusable,
  });
  transitioning = false;
  presentCurrentMoment(context);
}

/** An 2 (`legal_capture`) İÇİNDE sıradaki GERÇEK curriculum örneğine geçer
    — dış `currentIndex` DEĞİŞMEZ (bkz. görev talimatı Bölüm 12:
    "assessmentIndex:1" sabit kalır, yalnız `exampleIndex` değişir), yalnız
    `currentExampleIndex` ilerler ve o örneğin TAZE seed'i kurulur (bkz.
    dosya başı "Model B — ayrı seed" notu). Son örnekte ÇAĞRILMAZ (bkz.
    goToNextItem) — "sahte {from:last,to:last} advanced eventi" ÜRETİLMEZ. */
async function advanceToNextExample(context, outerMoment, toExampleIndex) {
  clearItemListeners();
  context.boardAdapter.setInputEnabled(false);
  transitioning = true;
  context.emit('scene_assessment_advanced', {
    fromAssessmentIndex: currentIndex,
    toAssessmentIndex: currentIndex, // AYNI dış an — yalnız iç örnek ilerliyor.
    fromExampleIndex: currentExampleIndex,
    toExampleIndex,
    exampleCount: outerMoment.legalCaptureExamples.length,
    concept: CONCEPT,
    assessmentConcept: outerMoment.assessmentConcept,
    resultConcept: outerMoment.expectedResultConcept,
  });
  let firstFocusable = null;
  await assessmentTransition({
    container: els.contentEl,
    renderNext: () => { currentExampleIndex = toExampleIndex; firstFocusable = renderCurrentItem(context); },
    focusTarget: () => firstFocusable,
  });
  transitioning = false;
  presentCurrentMoment(context);
}

async function goToNextItem(context) {
  if (!awaitingContinue || transitioning) return;
  const completedMoment = moments[currentIndex];
  // An 2'nin SON ÖRNEĞİNDEN önceki bir örnekteyse — dış anı DEĞİŞTİRMEDEN
  // yalnız sıradaki curriculum örneğine geç (bkz. görev talimatı: "tek
  // örnek tamamlandığında sahne bitmemeli").
  if (completedMoment.kind === MOMENT_KINDS.LEGAL_CAPTURE
    && currentExampleIndex < completedMoment.legalCaptureExamples.length - 1) {
    await advanceToNextExample(context, completedMoment, currentExampleIndex + 1);
    return;
  }
  const fromIndex = currentIndex;
  const toIndex = currentIndex + 1;
  if (toIndex < moments.length) {
    context.emit('scene_assessment_advanced', {
      fromAssessmentIndex: fromIndex,
      toAssessmentIndex: toIndex,
      concept: CONCEPT,
      assessmentConcept: completedMoment.assessmentConcept,
      ...(completedMoment.expectedResultConcept ? { resultConcept: completedMoment.expectedResultConcept } : {}),
    });
  }
  if (toIndex >= moments.length) {
    goToTopicEnd(context);
    return;
  }
  await loadItem(context, toIndex, { withTransition: true });
}

function presentCurrentMoment(context) {
  const moment = currentResolvedMoment();
  context.emit('scene_assessment_presented', {
    assessmentIndex: currentIndex,
    assessmentCount: moments.length,
    stepIndex: moment.curriculumStepIndex,
    assessmentType: 'board_tap',
    concept: CONCEPT,
    assessmentConcept: moment.assessmentConcept,
    mode: moment.kind,
    ...(moment.kind === MOMENT_KINDS.REJECTED ? { totalCurriculumTargets: moment.targetPoints.length } : {}),
    ...(moment.kind === MOMENT_KINDS.LEGAL_CAPTURE
      ? { exampleIndex: moment.exampleIndex, exampleCount: moment.exampleCount, sourceIndex: moment.sourceIndex }
      : {}),
  });
}

function goToTopicEnd(context) {
  if (topicEnded) return;
  topicEnded = true;
  clearItemListeners();
  context.boardAdapter.setInputEnabled(false);
  hideIllegalVisuals(context);
  els.assessRow.hidden = true;
  topicEnd = mountTopicEndControls(context, { summaryText: SUMMARY_TEXT });
}

function buildDom(context) {
  const root = document.createElement('div');
  root.className = 'ls-strip-root';
  root.innerHTML = `
    <div class="ls-strip-row ls-strip-fade" id="s08-intro">
      <p class="ls-strip-text">${INTRO_TEXT}</p>
      <span class="ls-tick-wrap">
        <button type="button" class="ls-tick" id="s08-confirm" aria-label="Bilgiyi onayla">
          <svg class="ls-tick-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>
        </button>
        <span class="ls-tick-tip" aria-hidden="true">Onayla</span>
      </span>
    </div>
    <div class="ls-strip-row" id="s08-assess" hidden>
      <div class="s05-progress" id="s08-progress" aria-label="Alıştırma ilerlemesi"></div>
      <div class="s05-content" id="s08-content"></div>
      <div class="s05-feedback-row">
        <p class="s05-feedback" id="s08-feedback" role="status" aria-live="polite"></p>
        <button type="button" class="ls-strip-btn s05-continue--waiting" id="s08-continue" tabindex="-1">${CONTINUE_LABEL}</button>
      </div>
    </div>
  `;
  context.container.appendChild(root);
  return {
    root,
    introRow: root.querySelector('#s08-intro'),
    confirmBtn: root.querySelector('#s08-confirm'),
    assessRow: root.querySelector('#s08-assess'),
    progressEl: root.querySelector('#s08-progress'),
    contentEl: root.querySelector('#s08-content'),
    feedbackEl: root.querySelector('#s08-feedback'),
    continueBtn: root.querySelector('#s08-continue'),
    hintBtn: null,
    forbiddenProgressEl: null,
  };
}

export const scene08IllegalMoves = {
  id: 'scene-08-illegal-moves',
  version: 3,
  title: 'Yasak Hamleler',
  curriculumRef: { lessonId: 'l4', concept: CONCEPT, stepIndex: 0 },
  // Geriye uyumlu TEKİL curriculumRef korunurken, bu sahnenin GERÇEKTEN
  // kapsadığı İKİ curriculum adımı ayrıca burada listelenir (bkz.
  // scenes/scene07CapturePractice.js AYNI desen). `concept` alanı HER
  // GİRDİ İÇİN illegalMovePolicy.js'in GERÇEK assessmentConcept'inden
  // türetilir.
  curriculumRefs: getIllegalMoveMoments().map(m => ({
    lessonId: 'l4', concept: m.assessmentConcept, stepIndex: m.curriculumStepIndex,
  })),

  mount(context) {
    resetState();
    cleanupFns = [];
    els = buildDom(context);
    context.container.classList.add('s08-scene-host');

    context.boardAdapter.setSize(9);
    context.boardAdapter.reset();
    context.boardAdapter.focus('center');
    context.boardAdapter.setInputEnabled(false);
    hideIllegalVisuals(context);

    let confirming = false;
    on(els.confirmBtn, 'click', () => {
      if (confirming || state !== STATE.INTRO) return;
      confirming = true;
      els.confirmBtn.disabled = true;
      els.confirmBtn.classList.add('ls-confirmed');

      const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const doAdvance = () => {
        context.emit('scene_intro_confirmed', {});
        state = STATE.PLAYING;
        els.introRow.hidden = true;
        els.assessRow.hidden = false;
        renderCurrentItem(context);
        presentCurrentMoment(context);
      };
      if (reduceMotion) { doAdvance(); return; }
      els.introRow.classList.add('ls-closing');
      setTimeout(doAdvance, 220);
    });

    on(els.continueBtn, 'click', () => { goToNextItem(context); });

    render();
  },

  unmount(context) {
    clearItemListeners();
    context.container.classList.remove('s08-scene-host');
    hideIllegalVisuals(context);
    cleanupFns.forEach(fn => fn());
    cleanupFns = [];
    topicEnd?.destroy();
    topicEnd = null;
    els?.root?.remove();
    els = null;
    resetState();
  },

  canComplete() {
    return allAnsweredCorrectly();
  },

  complete() {
    // Runtime zaten scene_completed event'ini ve progress yazımını
    // yönetiyor — bu sahnenin tamamlanma ANINDA ek bir yan etkisi yok.
  },
};

function render() {
  if (!els) return;
  els.introRow.hidden = state !== STATE.INTRO;
  els.assessRow.hidden = state === STATE.INTRO || topicEnded;
}
