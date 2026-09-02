/**
 * scenes/scene07CapturePractice.js
 *
 * Konu #7 — "Taş Alma Uygulamaları". Müfredat kaynağı: core/curriculum.js,
 * l3 "Taş Alma" dersinin kullanıcıya görünen 4., 5., 6., 7., 8. ve 9.
 * adımları (sıfır tabanlı steps[3..8] — bkz. scenes/capturePracticePolicy.js,
 * TEK doğruluk kaynağı). Bu ALTI curriculum adımı ALTI AYRI sahne DEĞİL,
 * TEK bir sahnenin (bu dosya) kendi İÇ anlarıdır — scenes/scene06CaptureBasics.js
 * ile AYNI "tek mount, tek scene_started, çoklu iç an" deseni (bkz. o
 * dosyanın dosya başı notu).
 *
 * SAHNE #6'DAN FARKI — İPUCU MEKANİZMASI (bkz. görev talimatı Bölüm 5):
 * Sahne #6'da son nefes noktası HER anın başında otomatik gösteriliyordu.
 * Sahne #7'de bu artık KADEMELİ bir ipucu — `moment.hintMode` (policy'de
 * momentIndex + GERÇEK targetGroupSize'a göre hesaplanır) bu anın neon
 * işaretinin NE ZAMAN göründüğünü belirler: `immediate` (an başında
 * otomatik), `after_mistake` (yanlış denemeden SONRA otomatik açılır, ama
 * kullanıcı erkenden de isteyebilir), `on_request`/`none_until_request`
 * (YALNIZ "Nefes noktasını göster" düğmesiyle, hiç otomatik açılış yok).
 * İpucu açıldığında neon işaretle BİRLİKTE aynı kesişimde yarı saydam taş
 * silüeti de gösterilir (mevcut `board.setMovePreview` — sahte bir hamle
 * DEĞİL, move/capture event'i ÜRETMEZ, bkz. görev talimatı Bölüm 6).
 *
 * TERMİNOLOJİ (bkz. görev talimatı Bölüm 2): "özgürlük/serbestlik" veya
 * İngilizce "liberty/liberties" KULLANILMAZ — yalnız "nefes noktası"/
 * "nefes noktaları"/"son nefes noktası". İç teknik tanımlayıcılar
 * (`concept:'capture'`, `libertyCount`, RuleEngine API'leri) DEĞİŞMEDİ.
 *
 * KAVRAM SÖZLEŞMESİ (Sahne #6 ile AYNI üç-alan deseni): `concept`
 * sahne-seviyesi (her zaman 'capture'), `assessmentConcept` an-seviyesi
 * (altı anın hepsi GERÇEK RuleEngine hesabıyla 'atari'dir), `resultConcept`
 * YALNIZ doğru cevap board'u GERÇEKTEN bir yakalamaya dönüştürdüyse
 * eklenir ('capture').
 *
 * EVENT SÖZLEŞMESİ (bkz. görev talimatı Bölüm 9): mevcut
 * `scene_assessment_presented/answered/advanced` ve
 * `scene_completion_unlocked` YENİDEN KULLANILDI. İpucu için TEK yeni,
 * SAHNEYE ÖZEL OLMAYAN genel event: `scene_hint_revealed` (bkz.
 * revealHint altında) — bir an için EN FAZLA BİR KEZ üretilir.
 */
import { mountTopicEndControls } from './topicEndControls.js?v=2026-09-02.1';
import { assessmentTransition } from './assessmentTransition.js?v=2026-09-02.1';
import {
  getCapturePracticeMoments, isValidCapturePoint, computePracticeResult, buildResultText,
} from './capturePracticePolicy.js?v=2026-09-02.1';

const CONCEPT = 'capture';

const STATE = { INTRO: 'intro', PLAYING: 'playing' };

const INTRO_TEXT = 'Şimdi farklı taş ve grupların son nefes noktalarını bulup onları tahtadan alalım.';
const CONTINUE_LABEL = 'Devam';
const TAP_HINT = 'Son nefes noktasını bul ve dokun.';
const WRONG_HINT = 'Bu hamle grubu almıyor. Son nefes noktasını yeniden ara.';
const HINT_BUTTON_LABEL = 'Nefes noktasını göster';
const SUMMARY_TEXT = 'Farklı boyuttaki taş gruplarının son nefes noktasını bulup onları gerçekten tahtadan aldın.';
// Aynı yanlış NOKTAYA hızlı çift tıklama TEK bir yanlış-event üretmeli
// (bkz. görev talimatı Bölüm 7) — fiziksel çift tıklamanın tipik aralığı
// (birkaç yüz ms) bu pencerenin İÇİNDE kalır, kasıtlı ayrı bir yeniden
// deneme (>400ms sonra) YİNE kabul edilir.
const WRONG_TAP_DEBOUNCE_MS = 400;

let state = STATE.INTRO;
let moments = [];
let currentIndex = 0;
let answeredCorrectly = [];
let attemptCount = [];
let hintRevealed = [];
let lastWrongTap = null; // {row, col, at}
let awaitingContinue = false;
let transitioning = false;
let unlockedEmitted = false;
let topicEnded = false;
let topicEnd = null;
let els = null;
let cleanupFns = [];
let itemCleanupFns = [];
let unsubscribeTap = null;

function resetState() {
  state = STATE.INTRO;
  moments = getCapturePracticeMoments();
  currentIndex = 0;
  answeredCorrectly = new Array(moments.length).fill(false);
  attemptCount = new Array(moments.length).fill(0);
  hintRevealed = new Array(moments.length).fill(false);
  lastWrongTap = null;
  awaitingContinue = false;
  transitioning = false;
  unlockedEmitted = false;
  topicEnded = false;
  topicEnd = null;
  unsubscribeTap = null;
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
}

function allAnsweredCorrectly() {
  return answeredCorrectly.length === moments.length && answeredCorrectly.every(Boolean);
}

/** An'ın gerçek board seed'ini kurar — ipucu BİLEREK gösterilmez (hintMode
    'immediate' HARİÇ, bkz. renderMomentItem'daki koşullu açılış). */
function seedMoment(context, moment) {
  const board = context.boardAdapter;
  board.setSize(moment.size);
  board.reset();
  // Müfredat kamera preset'i HER anda (istisnasız) uygulanır — bkz. görev
  // talimatı v0.16: "masaüstünde hedef zaten güvenliyse mevcut curriculum
  // kamera preset'ini... değiştirmesin". board.focusPoints() (aşağıda,
  // yalnız an 1 için) bu preset'in ÜZERİNE, GÖRÜNÜRLÜK-ÖNCELİKLİ bir katman
  // olarak eklenir — preset zaten güvenliyse (bkz. adapters/
  // sceneBoardAdapter.js computeFraming) kameraya HİÇ DOKUNMAZ.
  board.focus(moment.cameraPreset || 'center');
  // An 1 (hintMode:'immediate' — bkz. capturePracticePolicy.js computeHintMode,
  // YALNIZ momentIndex===0 için döner): mobil kadraj sorunu — köşe
  // preset'inin (corner_tl) kendi yaw'ı, adapters/sceneBoardAdapter.js'in
  // TÜM preset'lere uyguladığı genel mobil geçersiz kılma tarafından
  // siliniyor, hedef beyaz taş/neon 390px viewport'ta TAMAMEN ekran dışına
  // taşıyordu. Bu an artık sahneye/adım'a KÖR genel focusPoints()
  // API'siyle — YALNIZ hedefler güvenli alan DIŞINDAYSA en küçük düzeltmeyle
  // — kadrajlanır: hedef beyaz grubun taşları + saldıran komşu taş(lar) +
  // son nefes noktası (moment.board/moment.lastLibertyPoints'ten GERÇEK,
  // hiçbir koordinat burada hard-code EDİLMEDİ). Diğer TÜM anlar YALNIZ
  // yukarıdaki preset-tabanlı focus()'u kullanır — DOKUNULMADI.
  if (moment.hintMode === 'immediate') {
    const points = [
      ...moment.board.map(s => ({ row: s.y, col: s.x })),
      ...moment.lastLibertyPoints,
    ];
    // presetName: bu an'ın curriculum preset'i (ör. 'corner_tl') — bkz.
    // adapters/sceneBoardAdapter.js computeFraming: düzeltme GEREKİRSE
    // buradan, O ANKİ CANLI canvas genişliğiyle YENİDEN türetilir (orientation
    // değişiminde donmuş bir önceki düzeltmenin ÜZERİNE ZİNCİRLENMEZ).
    board.focusPoints(points, { presetName: moment.cameraPreset || 'center' });
  }
  for (const stone of moment.board) {
    board.playMove({ row: stone.y, col: stone.x, color: stone.color === 'B' ? 'black' : 'white' });
  }
  board.clearLiberties();
  board.clearMovePreview();
}

/** İpucuyu (neon son-nefes işareti + yarı saydam taş silüeti — bkz. görev
    talimatı Bölüm 6) GERÇEKTEN gösterir ve gerekiyorsa TEK BİR
    `scene_hint_revealed` event'i üretir. `hintRevealed[currentIndex]`
    zaten true ise (bu an için daha önce açılmışsa) event TEKRAR
    ÜRETİLMEZ — yalnız görsel durum (zaten açık) korunur. */
function revealHint(context, moment, hintRequested) {
  const alreadyRevealed = hintRevealed[currentIndex];
  context.boardAdapter.showLiberties(moment.lastLibertyPoints);
  const target = moment.lastLibertyPoints[0];
  // İlk an (moment.showAutomaticMovePreview === false — bkz.
  // capturePracticePolicy.js normalizeMoment): YALNIZ neon nefes işareti
  // otomatik gösterilir, taş silüeti GÖSTERİLMEZ. Kullanıcı imleci hedefe
  // getirirse adaptörün KENDİ bağımsız hover-önizleme mekanizması
  // (drawHoverPoint) zaten normal şekilde devreye girer — bu satır o
  // mekanizmayı etkilemez.
  if (target && moment.showAutomaticMovePreview !== false) {
    context.boardAdapter.setMovePreview({ row: target.row, col: target.col, color: 'black' });
  }
  if (alreadyRevealed) return;
  hintRevealed[currentIndex] = true;
  context.emit('scene_hint_revealed', {
    assessmentIndex: currentIndex,
    stepIndex: moment.curriculumStepIndex,
    targetGroupSize: moment.targetGroupSize,
    lastLibertyPoint: target ?? null,
    hintMode: moment.hintMode,
    hintRequested: !!hintRequested,
  });
  updateHintButtonState();
}

function hideHintVisuals(context) {
  context.boardAdapter.clearLiberties();
  context.boardAdapter.clearMovePreview();
}

function updateHintButtonState() {
  if (!els?.hintBtn) return;
  const revealed = hintRevealed[currentIndex];
  els.hintBtn.setAttribute('aria-pressed', revealed ? 'true' : 'false');
  els.hintBtn.classList.toggle('s07-hint-btn--active', revealed);
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

function renderMomentItem(context, moment) {
  // Düğme kalabalığı YARATMAMAK için (bkz. görev talimatı Bölüm 10):
  // 'immediate' modda düğme YOK (ipucu zaten görünür, düğme gereksiz).
  const showHintButton = moment.hintMode !== 'immediate';
  els.contentEl.innerHTML = `
    <div class="s05-item">
      <div class="s05-prompt">${moment.promptText}</div>
      <p class="s05-tap-hint">${TAP_HINT}</p>
      ${showHintButton ? `<button type="button" class="s07-hint-btn" id="s07-hint" aria-pressed="false">${HINT_BUTTON_LABEL}</button>` : ''}
    </div>
  `;
  els.hintBtn = showHintButton ? els.contentEl.querySelector('#s07-hint') : null;

  if (moment.hintMode === 'immediate') {
    revealHint(context, moment, false);
  } else {
    hideHintVisuals(context);
    updateHintButtonState();
  }

  if (els.hintBtn) {
    onItem(els.hintBtn, 'click', () => {
      if (awaitingContinue || transitioning) return;
      revealHint(context, moment, true);
    });
  }

  context.boardAdapter.setInputEnabled(true);
  unsubscribeTap = context.boardAdapter.onIntersectionTap(hit => {
    if (awaitingContinue || transitioning) return;
    const isCorrect = isValidCapturePoint(moment, hit);

    if (!isCorrect) {
      const now = Date.now();
      if (lastWrongTap && lastWrongTap.row === hit.row && lastWrongTap.col === hit.col &&
          now - lastWrongTap.at < WRONG_TAP_DEBOUNCE_MS) {
        return; // AYNI yanlış noktaya hızlı çift tıklama — ikinci tekrar YOK SAYILIR.
      }
      lastWrongTap = { row: hit.row, col: hit.col, at: now };
    }

    attemptCount[currentIndex] += 1;
    let resultInfo = null;
    let playResult = null;
    if (isCorrect) {
      // Hızlı çift tıklama guard'ı — girdi, GERÇEK hamle/emit'ten ÖNCE,
      // isCorrect belirlenir belirlenmez KAPATILIR (bkz. adapters/
      // sceneBoardAdapter.js handleClick, `inputEnabled`i ÇAĞRI ANINDA —
      // senkron — kontrol eder). Bu, aynı hedefe hızlı ikinci bir tıklamanın
      // (Promise.all ile eş zamanlı gönderilen İKİ ayrı 'click' event'i
      // dahil) İKİNCİ event'inin `handleClick` seviyesinde EN ERKEN
      // noktada reddedilmesini sağlar — playMove/emit'ten SONRAYA
      // BIRAKILIRSA, iki 'click' event'inin senkron JS çalıştırma sırası
      // arasında (özellikle CDP üzerinden programatik olarak gönderilen
      // eş zamanlı tıklamalarda) teorik bir pencere kalabilir.
      context.boardAdapter.setInputEnabled(false);
      resultInfo = computePracticeResult(moment, hit);
      playResult = context.boardAdapter.playMove({ row: hit.row, col: hit.col, color: 'black' });
      if (!playResult.ok) return; // savunma amaçlı — geçerli hedefler zaten her zaman yasaldır.
    }
    context.emit('scene_assessment_answered', {
      assessmentIndex: currentIndex,
      stepIndex: moment.curriculumStepIndex,
      concept: CONCEPT,
      assessmentConcept: moment.assessmentConcept,
      attemptNumber: attemptCount[currentIndex],
      isCorrect,
      correct: isCorrect,
      tappedPoint: { row: hit.row, col: hit.col },
      row: hit.row,
      col: hit.col,
      targetGroupSize: moment.targetGroupSize,
      libertyCountBeforeMove: moment.lastLibertyPoints.length,
      lastLibertyPoint: moment.lastLibertyPoints[0] ?? null,
      hintMode: moment.hintMode,
      hintWasVisible: hintRevealed[currentIndex],
      hintRequested: hintRevealed[currentIndex],
      // Yanlış cevapta hamle SONUCU/başarı alanları HİÇ EKLENMEZ (hamle
      // oynanmadı) — bkz. scenes/scene06CaptureBasics.js AYNI ilke.
      ...(isCorrect ? {
        capturedCount: resultInfo.capturedCount,
        targetRemovedFromBoard: resultInfo.targetRemovedFromBoard,
        resultConcept: 'capture',
      } : {}),
    });

    if (!isCorrect) {
      setFeedback(WRONG_HINT, 'err');
      // 'after_mistake' — YALNIZ bu anın İLK yanlış denemesinden sonra,
      // henüz açılmamışsa otomatik ipucu açılır (bkz. görev talimatı
      // Bölüm 5: "Görünen adım 5/8: after_mistake").
      if (moment.hintMode === 'after_mistake' && !hintRevealed[currentIndex]) {
        revealHint(context, moment, false);
      }
      return; // board state DEĞİŞMEZ — yanlış dokunma taş bırakmaz.
    }

    answeredCorrectly[currentIndex] = true;
    // (setInputEnabled(false) ZATEN yukarıda, isCorrect belirlenir
    // belirlenmez çağrıldı — bkz. yukarıdaki not.)
    // İpucu (neon + silüet) doğru yakalamadan HEMEN SONRA temizlenir.
    hideHintVisuals(context);
    setFeedback(moment.feedbackOk || buildResultText(resultInfo.capturedCount), 'ok');
    showContinueControl(context);
  });
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
  const moment = moments[currentIndex];
  els.progressEl.innerHTML = buildProgressHtml(currentIndex);
  els.feedbackEl.textContent = '';
  els.feedbackEl.classList.remove('s05-feedback--ok', 's05-feedback--err');
  els.continueBtn.classList.add('s05-continue--waiting');
  els.continueBtn.tabIndex = -1;
  awaitingContinue = false;
  lastWrongTap = null;
  seedMoment(context, moment);
  const firstFocusable = renderMomentItem(context, moment);
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
  // Yalnız GERÇEK bir sonraki an varsa emit edilir — son an tamamlanınca
  // sahte bir toAssessmentIndex ÜRETİLMEZ (bkz. görev talimatı Bölüm 9:
  // "sahte {from:5,to:5} advanced eventi üretme").
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
  const moment = moments[currentIndex];
  context.emit('scene_assessment_presented', {
    assessmentIndex: currentIndex,
    assessmentCount: moments.length,
    stepIndex: moment.curriculumStepIndex,
    assessmentType: 'board_tap',
    concept: CONCEPT,
    assessmentConcept: moment.assessmentConcept,
    targetGroupSize: moment.targetGroupSize,
    libertyCountBeforeMove: moment.lastLibertyPoints.length,
    lastLibertyPoint: moment.lastLibertyPoints[0] ?? null,
    hintMode: moment.hintMode,
  });
}

function goToTopicEnd(context) {
  if (topicEnded) return;
  topicEnded = true;
  clearItemListeners();
  context.boardAdapter.setInputEnabled(false);
  hideHintVisuals(context);
  els.assessRow.hidden = true;
  topicEnd = mountTopicEndControls(context, { summaryText: SUMMARY_TEXT });
}

function buildDom(context) {
  const root = document.createElement('div');
  root.className = 'ls-strip-root';
  root.innerHTML = `
    <div class="ls-strip-row ls-strip-fade" id="s07-intro">
      <p class="ls-strip-text">${INTRO_TEXT}</p>
      <span class="ls-tick-wrap">
        <button type="button" class="ls-tick" id="s07-confirm" aria-label="Bilgiyi onayla">
          <svg class="ls-tick-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>
        </button>
        <span class="ls-tick-tip" aria-hidden="true">Onayla</span>
      </span>
    </div>
    <div class="ls-strip-row" id="s07-assess" hidden>
      <div class="s05-progress" id="s07-progress" aria-label="Alıştırma ilerlemesi"></div>
      <div class="s05-content" id="s07-content"></div>
      <div class="s05-feedback-row">
        <p class="s05-feedback" id="s07-feedback" role="status" aria-live="polite"></p>
        <button type="button" class="ls-strip-btn s05-continue--waiting" id="s07-continue" tabindex="-1">${CONTINUE_LABEL}</button>
      </div>
    </div>
  `;
  context.container.appendChild(root);
  return {
    root,
    introRow: root.querySelector('#s07-intro'),
    confirmBtn: root.querySelector('#s07-confirm'),
    assessRow: root.querySelector('#s07-assess'),
    progressEl: root.querySelector('#s07-progress'),
    contentEl: root.querySelector('#s07-content'),
    feedbackEl: root.querySelector('#s07-feedback'),
    continueBtn: root.querySelector('#s07-continue'),
    hintBtn: null,
  };
}

export const scene07CapturePractice = {
  id: 'scene-07-capture-practice',
  version: 2,
  title: 'Taş Alma Uygulamaları',
  curriculumRef: { lessonId: 'l3', concept: 'capture', stepIndex: 3 },
  // Geriye uyumlu TEKİL curriculumRef korunurken, bu sahnenin GERÇEKTEN
  // kapsadığı ALTI curriculum adımı ayrıca burada listelenir (bkz.
  // scenes/scene06CaptureBasics.js AYNI desen). `concept` alanı HER GİRDİ
  // İÇİN capturePracticePolicy.js'in GERÇEK, RuleEngine-hesaplı
  // `assessmentConcept`'inden türetilir.
  curriculumRefs: getCapturePracticeMoments().map(m => ({
    lessonId: 'l3', concept: m.assessmentConcept, stepIndex: m.curriculumStepIndex,
  })),

  mount(context) {
    resetState();
    cleanupFns = [];
    els = buildDom(context);
    // Sahne #5/#6'nın dört bloklu (progress/content/feedback/devam) düzeni
    // ile AYNI taşma çözümü (bkz. styles/learning-scenes.css #s07-assess /
    // .s07-scene-host, #s05-assess'in birebir eşdeğeri).
    context.container.classList.add('s07-scene-host');

    context.boardAdapter.setSize(9);
    context.boardAdapter.reset();
    context.boardAdapter.focus('center');
    context.boardAdapter.setInputEnabled(false);
    context.boardAdapter.clearLiberties();
    context.boardAdapter.clearMovePreview();

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
    context.container.classList.remove('s07-scene-host');
    context.boardAdapter.clearMovePreview();
    context.boardAdapter.clearLiberties();
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
