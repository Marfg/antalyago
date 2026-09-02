/**
 * scenes/scene09KoRule.js
 *
 * Konu #9 — "Ko Kuralı". Müfredat kaynağı: core/curriculum.js, l5 "Ko Kuralı"
 * dersinin kullanıcıya görünen 1. ve 2. adımları (sıfır tabanlı steps[0..1]
 * — bkz. scenes/koRulePolicy.js, TEK doğruluk kaynağı). Bu iki curriculum
 * adımı Sahne #7/#8 ile AYNI "tek mount, tek scene_started, çoklu iç an"
 * deseninde İKİ AYRI ana ayrılır (`scenes/scene08IllegalMoves.js`'in
 * moments-dizisi mimarisiyle AYNI, ama o dosyaya HİÇ dokunulmadı/import
 * edilmedi — görev talimatı).
 *
 * PEDAGOJİK ÇEKİRDEK — İKİ FARKLI AN (bkz. scenes/koRulePolicy.js dosya başı
 * notu, GERÇEK RuleEngine sonucuyla doğrulandı):
 *   An 1 (`moment.kind === 'ko_reject'`): tipik bir ko pozisyonu gösterilir,
 *     siyah tek beyaz taşı GERÇEKTEN yakalar (otomatik/scripted — kullanıcı
 *     tıklaması gerekmez, curriculum'un "Siyah beyazı yakalar" ifadesi
 *     böylece görsel bir demo olur). Yakalanan nokta ko noktası olarak
 *     KIRMIZI işaretlenir. Kullanıcı bu noktaya BEYAZ olarak oynamayı dener
 *     — `core/ruleEngine.js` GERÇEKTEN `KO` reason'ıyla reddeder, board
 *     DEĞİŞMEZ.
 *   An 2 (`moment.kind === 'ko_retake'`): An 1'in yakalama hamlesi GERÇEKTEN
 *     yeniden oynanarak (ko kısıtı, statik bir taş listesinden DEĞİL GERÇEK
 *     oyun geçmişinden gelir — bkz. koRulePolicy.js "KÖK NEDEN NOTU") aynı
 *     ko-kısıtlı durum kurulur (KIRMIZI). Ardından curriculum'un KENDİ
 *     scripted dizisi (beyaz tehdit → siyah yanıt) otomatik oynanır — bu
 *     ikisi GERÇEKTEN oynandığı için ko kısıtı doğal olarak kalkar (YEŞİL
 *     neon'a döner). Kullanıcı artık BEYAZ olarak ko noktasına oynar —
 *     RuleEngine kabul eder, GERÇEK bir yakalama gerçekleşir.
 * İki an FARKLI beklenen sonuç taşır (`moment.kind`) — TEK bir kalıba
 * ZORLANMADI (bkz. görev talimatı: "iki durumu ayırt et").
 *
 * KULLANICI RENGİ (bkz. görev talimatı, scenes/koRulePolicy.js
 * `KO_ATTEMPT_COLOR`): diğer TÜM sahnelerin "kullanıcı her zaman siyah
 * oynar" geleneğinden BİLİNÇLİ bir sapma — bu iki anda kullanıcı BEYAZ
 * olarak dener, çünkü ko kuralının konusu bizzat beyazın geri alma
 * denemesidir. Otomatik/scripted ara hamleler (yakalama, tehdit, yanıt)
 * sahnenin KENDİSİ tarafından `board.playMove` ile oynatılır — kullanıcı
 * tıklaması GEREKMEZ, TÜM tıklamalar yalnız tek bir gerçek hedefe (ko
 * noktası) karşı değerlendirilir.
 *
 * OTOMATİK/SCRİPTED ARA-DİZİ (bkz. `runMomentIntro`): mevcut sahnelerin
 * HİÇBİRİNDE birebir emsali yok (Sahne #8'in l4.steps[1] auto-demo'su En
 * YAKIN emsal — orada da scripted hamleler `board.playMove` ile, kullanıcı
 * etkileşimi OLMADAN, seedMoment içinde oynatılıyordu). Farkı: burada
 * dizinin TAMAMLANMASI kullanıcı girdisini AÇAR (girdi diziden ÖNCE kapalı
 * kalır, `context.boardAdapter.setInputEnabled(true)` yalnız dizi bitince
 * çağrılır) — bu yüzden dizi `assessmentTransition`'ın senkron
 * `renderNext()` çağrısından BAĞIMSIZ, ayrı bir async akış olarak
 * yürütülür (renderCurrentItem/DOM/odak zamanlaması SENKRON kalır,
 * `assessmentTransition.js`'e HİÇ dokunulmadı) — `moduleIntroToken` bir
 * SONRAKİ ana geçildiğinde veya sahne unmount edildiğinde ESKİ bir async
 * devamın (stale continuation) artık hiçbir şey YAPMAMASINI garantiler.
 * `prefers-reduced-motion` aktifken TÜM bekleme süreleri SIFIRLANIR
 * (animasyonlar kullanıcı etkileşimini KİLİTLEMEMELİ — bkz. görev
 * talimatı), dizi yine de SIRAYLA (anlık ama doğru sırada) oynanır.
 *
 * GÖRSEL DİL (bkz. görev talimatı: "renk tek başına bilgi taşımasın"):
 *   Kırmızı/yasak — mevcut `board.showIllegalMoves()` (Sahne #8'in
 *     kehribar-kırmızı halka+çarpı dili) YENİDEN KULLANILIR.
 *   Yeşil/serbest — YENİ `board.showKoFree()` (bkz. adapters/
 *     sceneBoardAdapter.js v0.20) — kullanıcı isteğiyle "neon" efekt:
 *     `drawLibertyMark()`'ın YEŞİL versiyonu (glow) + ✓ şekli (çarpının
 *     TERSİ, renk-körü kullanıcılar için de ayırt edilebilir).
 *   İkisi de AYRICA bir DOM metin etiketiyle (`#s09-ko-status`,
 *     `aria-live="polite"`) desteklenir — renk TEK BAŞINA bilgi taşımaz.
 *
 * EVENT SÖZLEŞMESİ: mevcut `scene_intro_confirmed/scene_assessment_presented/
 * scene_assessment_advanced/scene_completion_unlocked` YENİDEN KULLANILDI.
 * Sahne #8'in `scene_illegal_move_attempted`'i BURAYA sızdırılmadı (o event
 * adı scene08/illegalMovePolicy'e özel) — onun yerine TEK yeni, sahneye özel
 * OLMAYAN genel bir event: `scene_ko_attempt` (bkz. handleTap altında).
 *
 * KAVRAM (bkz. scenes/koRulePolicy.js dosya başı notu): `concept:'ko'`
 * KASITLI olarak core/conceptMap.js'e eklenmedi — Teacher Studio Diagnostics
 * bunu bilinen-olmayan concept olarak raporlar (bilinçli, gizlenmeyen boşluk).
 */
import { mountTopicEndControls } from './topicEndControls.js?v=2026-09-02.1';
import { assessmentTransition } from './assessmentTransition.js?v=2026-09-02.1';
import {
  getKoRuleMoments, evaluateKoAttempt, isSuccessfulAttempt, reasonLabelTr, MOMENT_KINDS, CONCEPT,
  KO_ATTEMPT_COLOR,
} from './koRulePolicy.js?v=2026-09-02.1';

const STATE = { INTRO: 'intro', PLAYING: 'playing' };

const INTRO_TEXT = 'Ko kuralı, aynı tahta pozisyonunun hemen tekrar oluşmasını engeller. Şimdi bu kuralı iki adımda görelim.';
const CONTINUE_LABEL = 'Devam';
const REJECT_TAP_HINT = 'Beyaz olarak kırmızı işaretli ko noktasına oynamayı dene.';
const RETAKE_TAP_HINT = 'Ko noktası artık serbest — beyaz olarak yeşil işaretli noktaya oynayıp taşı geri al.';
const SEQUENCE_PLAYING_HINT = 'Diziliş oynatılıyor…';
const OFF_TARGET_HINT = 'Bu, alıştırmanın hedefi değil — işaretli ko noktasını dene.';
const KO_STATUS_RED = 'Ko noktası: şu an yasak (kırmızı) — hemen geri alınamaz.';
const KO_STATUS_GREEN = 'Ko noktası: artık serbest (yeşil) — beyaz başka yerde ko tehdidi yaptı, siyah cevap verdi.';
const KO_STATUS_PENDING = 'Ko noktası hazırlanıyor…';
const SUMMARY_TEXT = 'Ko kuralının aynı pozisyonun hemen tekrar oluşmasını engellediğini, ama bu yasağın kalıcı olmadığını gördün: beyaz başka yerde bir tehdit hamlesi yaptı, siyah bu tehdide cevap verdikten sonra beyaz aynı noktayı gerçek RuleEngine sonuçlarıyla geri alabildi.';
// AYNI NOKTAYA hızlı çift tıklama TEK bir denemeye sayılmalı — scenes/
// scene07CapturePractice.js/scene08IllegalMoves.js İLE AYNI debounce penceresi.
const TAP_DEBOUNCE_MS = 400;
// Scripted ara-hamleler arası bekleme (bkz. dosya başı "OTOMATİK/SCRİPTED
// ARA-DİZİ" notu) — prefers-reduced-motion'da SIFIRLANIR.
const SEQUENCE_STEP_MS = 550;

let state = STATE.INTRO;
let moments = [];
let currentIndex = 0;
let answeredCorrectly = [];
let attemptCount = [];
let lastTap = null; // {row, col, at}
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
let interactiveTargetActive = false;
// Bir SONRAKİ ana geçildiğinde veya unmount'ta ESKİ bir async intro-dizisinin
// (bkz. runMomentIntro) devamının artık hiçbir şey YAPMAMASI için — stale
// continuation guard (bkz. dosya başı not).
let moduleIntroToken = 0;

function resetState() {
  state = STATE.INTRO;
  moments = getKoRuleMoments();
  currentIndex = 0;
  answeredCorrectly = new Array(moments.length).fill(false);
  attemptCount = new Array(moments.length).fill(0);
  lastTap = null;
  awaitingContinue = false;
  transitioning = false;
  unlockedEmitted = false;
  topicEnded = false;
  topicEnd = null;
  unsubscribeTap = null;
  unsubscribeHover = null;
  interactiveTargetActive = false;
  moduleIntroToken++;
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

function reduceMotionActive() {
  return typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}
function wait(ms) {
  if (reduceMotionActive()) return Promise.resolve();
  return new Promise(resolve => setTimeout(resolve, ms));
}

function hideKoVisuals(context) {
  context.boardAdapter.clearMovePreview();
  context.boardAdapter.clearIllegalMoves();
  context.boardAdapter.clearKoFree();
}

function updateKoStatus(text, kind) {
  if (!els?.koStatusEl) return;
  els.koStatusEl.textContent = text;
  els.koStatusEl.classList.remove('s09-ko-status--red', 's09-ko-status--green');
  if (kind === 'red') els.koStatusEl.classList.add('s09-ko-status--red');
  if (kind === 'green') els.koStatusEl.classList.add('s09-ko-status--green');
}

function updateTapHint(text) {
  if (els?.tapHintEl) els.tapHintEl.textContent = text;
}

/** An'ın GERÇEK oyun-geçmişi kurulumunu (statik taşlar + gerekli scripted
    ön-hamleler) senkron olarak yerleştirir — ko kısıtının GERÇEKTEN oyun
    geçmişinden geldiği ilkesiyle (bkz. scenes/koRulePolicy.js "KÖK NEDEN
    NOTU") her iki an da AYNI şekilde kurulur: An 1 kendi orijinal board'unu
    + yakalama hamlesini, An 2 An 1'İN orijinal board'unu + AYNI yakalama
    hamlesini (koRulePolicy.js `originBoard`/`originCaptureMove`) oynatır —
    `steps[1].board`'un authored statik seed'i (yalnız içerik/açıklama
    amaçlı `moment.board`) canlı tahtaya ASLA doğrudan taş-taş
    YERLEŞTİRİLMEZ (bu, ko bayrağını kaybederdi). */
function seedMomentBase(context, moment) {
  const board = context.boardAdapter;
  board.setSize(moment.size);
  board.reset();
  board.focus(moment.cameraPreset || 'center');
  hideKoVisuals(context);
  const originBoard = moment.kind === MOMENT_KINDS.REJECT ? moment.board : moment.originBoard;
  for (const stone of originBoard) {
    board.playMove({ row: stone.y, col: stone.x, color: stone.color === 'B' ? 'black' : 'white' });
  }
}

/** Bir anın ko-öncesi/ko-sonrası scripted dizisini GERÇEKTEN, kısa
    aralıklarla oynatır ve dizinin SONUNDA interaktif hedefi açar (bkz.
    dosya başı "OTOMATİK/SCRİPTED ARA-DİZİ" notu). Fire-and-forget olarak
    çağrılır — `renderCurrentItem`/`assessmentTransition` akışını BEKLETMEZ,
    yalnız girdi (`setInputEnabled`) diziyi bitirene kadar KAPALI kalır. */
async function runMomentIntro(context, moment) {
  const token = moduleIntroToken;
  const stale = () => token !== moduleIntroToken;

  if (moment.kind === MOMENT_KINDS.REJECT) {
    updateKoStatus(KO_STATUS_PENDING, null);
    await wait(SEQUENCE_STEP_MS);
    if (stale()) return;
    const mv = moment.scriptedMoves[0];
    context.boardAdapter.playMove({ row: mv.row, col: mv.col, color: mv.color });
    context.boardAdapter.showIllegalMoves([{ row: moment.koPoint.row, col: moment.koPoint.col }]);
    updateKoStatus(KO_STATUS_RED, 'red');
    await wait(SEQUENCE_STEP_MS);
    if (stale()) return;
  } else {
    const cap = moment.originCaptureMove;
    context.boardAdapter.playMove({ row: cap.row, col: cap.col, color: cap.color });
    context.boardAdapter.showIllegalMoves([{ row: moment.koPoint.row, col: moment.koPoint.col }]);
    updateKoStatus(KO_STATUS_RED, 'red');
    await wait(SEQUENCE_STEP_MS);
    if (stale()) return;
    const [threat, response] = moment.scriptedThreatMoves;
    context.boardAdapter.playMove({ row: threat.row, col: threat.col, color: threat.color });
    await wait(SEQUENCE_STEP_MS);
    if (stale()) return;
    context.boardAdapter.playMove({ row: response.row, col: response.col, color: response.color });
    await wait(SEQUENCE_STEP_MS * 0.7);
    if (stale()) return;
    context.boardAdapter.clearIllegalMoves();
    context.boardAdapter.showKoFree([{ row: moment.koPoint.row, col: moment.koPoint.col }]);
    updateKoStatus(KO_STATUS_GREEN, 'green');
    await wait(SEQUENCE_STEP_MS * 0.6);
    if (stale()) return;
  }

  activateInteractiveTarget(context, moment);
}

/** Pointer hover ile hamle-öncesi taş silüeti — BEYAZ (bkz. dosya başı
    "KULLANICI RENGİ" notu). Yalnız GERÇEKTEN dolu bir kesişimde
    gösterilmez (bkz. scenes/scene08IllegalMoves.js `handleHover` AYNI ilke). */
function handleHover(context, hit) {
  if (!interactiveTargetActive || !hit || context.boardAdapter.isOccupied(hit)) {
    context.boardAdapter.clearMovePreview();
    return;
  }
  context.boardAdapter.setMovePreview({ row: hit.row, col: hit.col, color: KO_ATTEMPT_COLOR });
}

function activateInteractiveTarget(context, moment) {
  interactiveTargetActive = true;
  updateTapHint(moment.kind === MOMENT_KINDS.REJECT ? REJECT_TAP_HINT : RETAKE_TAP_HINT);
  context.boardAdapter.setInputEnabled(true);
  unsubscribeTap = context.boardAdapter.onIntersectionTap(hit => handleTap(context, moment, hit));
  unsubscribeHover = context.boardAdapter.onIntersectionHover(hit => handleHover(context, hit));
}

/** TEK, birleşik dokunuş işleyicisi — `moment.kind`'a göre dallanır (bkz.
    scenes/koRulePolicy.js `isSuccessfulAttempt`, sahne kendi başarı
    mantığını İCAT ETMEZ). Her tıklama GERÇEK `evaluateKoAttempt()`
    (koRulePolicy.js → core/ruleEngine.js) sonucuyla değerlendirilir. */
function handleTap(context, moment, hit) {
  if (!interactiveTargetActive || awaitingContinue || transitioning) return;

  const attempt = evaluateKoAttempt(moment, hit);

  const now = Date.now();
  if (lastTap && lastTap.row === hit.row && lastTap.col === hit.col && now - lastTap.at < TAP_DEBOUNCE_MS) {
    return; // AYNI noktaya hızlı çift tıklama — ikinci deneme SAYILMAZ.
  }
  lastTap = { row: hit.row, col: hit.col, at: now };
  attemptCount[currentIndex] += 1;

  const success = isSuccessfulAttempt(moment, attempt);
  const isRetake = moment.kind === MOMENT_KINDS.RETAKE;

  let playResult = null;
  if (success && isRetake) {
    // Hızlı çift tıklama guard'ı — girdi GERÇEK commit/emit'ten ÖNCE kapatılır
    // (bkz. scenes/scene07CapturePractice.js/scene08IllegalMoves.js AYNI disiplin).
    context.boardAdapter.setInputEnabled(false);
    playResult = context.boardAdapter.playMove({ row: hit.row, col: hit.col, color: KO_ATTEMPT_COLOR });
    if (!playResult.ok) return; // savunma amaçlı — policy zaten yasallığı doğruladı.
  }
  const boardChanged = !!(playResult && playResult.ok);

  context.emit('scene_ko_attempt', {
    assessmentIndex: currentIndex,
    stepIndex: moment.curriculumStepIndex,
    moment: moment.kind,
    row: hit.row,
    col: hit.col,
    color: KO_ATTEMPT_COLOR,
    legal: attempt.legal,
    reason: attempt.reason,
    isTarget: attempt.isTarget,
    boardChanged,
    concept: CONCEPT,
    attemptNumber: attemptCount[currentIndex],
    ...(boardChanged ? { capturedCount: attempt.capturedCount, resultConcept: 'capture' } : {}),
  });

  if (success) {
    answeredCorrectly[currentIndex] = true;
    context.boardAdapter.clearMovePreview();
    context.boardAdapter.setInputEnabled(false);
    if (moment.kind === MOMENT_KINDS.REJECT) {
      setFeedback(reasonLabelTr('KO'), 'ok');
      // Kırmızı işaret KALIR — hiçbir şey değişmedi, yasak HÂLÂ geçerli.
    } else {
      setFeedback(`Doğru. Beyaz başka yerde bir ko tehdidi yaptı, siyah tehdide cevap verdi — şimdi beyaz ko noktasını geri alabilir, ${attempt.capturedCount} taş yakalandı.`, 'ok');
      // GERÇEK taş artık o noktada — yeşil "serbest" işareti temizlenir
      // (nokta artık dolu, "serbest boş nokta" göstergesi ANLAMSIZ kalırdı).
      context.boardAdapter.clearKoFree();
    }
    showContinueControl(context);
    return;
  }

  // Hedef-dışı VEYA beklenmeyen sonuç — board DEĞİŞMEDİ (REJECT anında
  // hiçbir zaman playMove çağrılmadı; RETAKE anında yalnız success'te
  // çağrılır), yalnız kısa bir yönlendirme gösterilir.
  context.boardAdapter.clearMovePreview();
  if (!attempt.legal) {
    setFeedback(`${reasonLabelTr(attempt.reason)} ${OFF_TARGET_HINT}`, 'err');
  } else {
    setFeedback(OFF_TARGET_HINT, 'err');
  }
}

function setFeedback(text, kind) {
  els.feedbackEl.textContent = text;
  els.feedbackEl.classList.remove('s05-feedback--ok', 's05-feedback--err');
  els.feedbackEl.classList.add(kind === 'ok' ? 's05-feedback--ok' : 's05-feedback--err');
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

function renderMomentItem(context, moment) {
  els.contentEl.innerHTML = `
    <div class="s05-item">
      <div class="s05-prompt">${moment.promptText}</div>
      <p class="s05-tap-hint s09-ko-status" id="s09-ko-status" aria-live="polite"></p>
      <p class="s05-tap-hint" id="s09-tap-hint">${SEQUENCE_PLAYING_HINT}</p>
    </div>
  `;
  els.koStatusEl = els.contentEl.querySelector('#s09-ko-status');
  els.tapHintEl = els.contentEl.querySelector('#s09-tap-hint');
  return els.contentEl.querySelector('.s05-tap-hint');
}

function renderCurrentItem(context) {
  const moment = moments[currentIndex];
  els.progressEl.innerHTML = buildProgressHtml(currentIndex);
  els.feedbackEl.textContent = '';
  els.feedbackEl.classList.remove('s05-feedback--ok', 's05-feedback--err');
  els.continueBtn.classList.add('s05-continue--waiting');
  els.continueBtn.tabIndex = -1;
  awaitingContinue = false;
  lastTap = null;
  interactiveTargetActive = false;
  context.boardAdapter.setInputEnabled(false);
  moduleIntroToken++; // bir ÖNCEKİ anın stale async devamını iptal et
  seedMomentBase(context, moment);
  const firstFocusable = renderMomentItem(context, moment);
  runMomentIntro(context, moment); // fire-and-forget — bkz. dosya başı not
  return firstFocusable;
}

async function loadItem(context, index, { withTransition }) {
  clearItemListeners();
  context.boardAdapter.setInputEnabled(false);
  currentIndex = index;
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

async function goToNextItem(context) {
  if (!awaitingContinue || transitioning) return;
  const fromIndex = currentIndex;
  const toIndex = currentIndex + 1;
  const completedMoment = moments[fromIndex];
  if (toIndex < moments.length) {
    context.emit('scene_assessment_advanced', {
      fromAssessmentIndex: fromIndex,
      toAssessmentIndex: toIndex,
      concept: CONCEPT,
      assessmentConcept: completedMoment.assessmentConcept,
    });
  }
  if (toIndex >= moments.length) {
    goToTopicEnd(context);
    return;
  }
  await loadItem(context, toIndex, { withTransition: true });
}

function presentCurrentMoment(context) {
  const moment = moments[currentIndex];
  context.emit('scene_assessment_presented', {
    assessmentIndex: currentIndex,
    assessmentCount: moments.length,
    stepIndex: moment.curriculumStepIndex,
    assessmentType: 'board_tap',
    concept: CONCEPT,
    assessmentConcept: moment.assessmentConcept,
    mode: moment.kind,
    koPoint: moment.koPoint,
  });
}

function goToTopicEnd(context) {
  if (topicEnded) return;
  topicEnded = true;
  moduleIntroToken++; // olası devam eden intro dizisini iptal et
  clearItemListeners();
  context.boardAdapter.setInputEnabled(false);
  hideKoVisuals(context);
  els.assessRow.hidden = true;
  topicEnd = mountTopicEndControls(context, { summaryText: SUMMARY_TEXT });
}

function buildDom(context) {
  const root = document.createElement('div');
  root.className = 'ls-strip-root';
  root.innerHTML = `
    <div class="ls-strip-row ls-strip-fade" id="s09-intro">
      <p class="ls-strip-text">${INTRO_TEXT}</p>
      <span class="ls-tick-wrap">
        <button type="button" class="ls-tick" id="s09-confirm" aria-label="Bilgiyi onayla">
          <svg class="ls-tick-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>
        </button>
        <span class="ls-tick-tip" aria-hidden="true">Onayla</span>
      </span>
    </div>
    <div class="ls-strip-row" id="s09-assess" hidden>
      <div class="s05-progress" id="s09-progress" aria-label="Alıştırma ilerlemesi"></div>
      <div class="s05-content" id="s09-content"></div>
      <div class="s05-feedback-row">
        <p class="s05-feedback" id="s09-feedback" role="status" aria-live="polite"></p>
        <button type="button" class="ls-strip-btn s05-continue--waiting" id="s09-continue" tabindex="-1">${CONTINUE_LABEL}</button>
      </div>
    </div>
  `;
  context.container.appendChild(root);
  return {
    root,
    introRow: root.querySelector('#s09-intro'),
    confirmBtn: root.querySelector('#s09-confirm'),
    assessRow: root.querySelector('#s09-assess'),
    progressEl: root.querySelector('#s09-progress'),
    contentEl: root.querySelector('#s09-content'),
    feedbackEl: root.querySelector('#s09-feedback'),
    continueBtn: root.querySelector('#s09-continue'),
    koStatusEl: null,
    tapHintEl: null,
  };
}

export const scene09KoRule = {
  id: 'scene-09-ko-rule',
  version: 1,
  title: 'Ko Kuralı',
  curriculumRef: { lessonId: 'l5', concept: CONCEPT, stepIndex: 0 },
  // Geriye uyumlu TEKİL curriculumRef korunurken, bu sahnenin GERÇEKTEN
  // kapsadığı İKİ curriculum adımı ayrıca burada listelenir (bkz.
  // scenes/scene07CapturePractice.js/scene08IllegalMoves.js AYNI desen).
  curriculumRefs: getKoRuleMoments().map(m => ({
    lessonId: 'l5', concept: m.assessmentConcept, stepIndex: m.curriculumStepIndex,
  })),

  mount(context) {
    resetState();
    cleanupFns = [];
    els = buildDom(context);
    context.container.classList.add('s09-scene-host');

    context.boardAdapter.setSize(9);
    context.boardAdapter.reset();
    context.boardAdapter.focus('center');
    context.boardAdapter.setInputEnabled(false);
    hideKoVisuals(context);

    let confirming = false;
    on(els.confirmBtn, 'click', () => {
      if (confirming || state !== STATE.INTRO) return;
      confirming = true;
      els.confirmBtn.disabled = true;
      els.confirmBtn.classList.add('ls-confirmed');

      const reduceMotion = reduceMotionActive();
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
    moduleIntroToken++; // olası devam eden intro dizisini iptal et
    clearItemListeners();
    context.container.classList.remove('s09-scene-host');
    hideKoVisuals(context);
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
