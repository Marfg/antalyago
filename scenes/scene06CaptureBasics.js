/**
 * scenes/scene06CaptureBasics.js
 *
 * Konu #6 — "Taş Alma". Müfredat kaynağı: core/curriculum.js, l3 "Taş
 * Alma" dersinin kullanıcıya görünen 1., 2. ve 3. adımları (sıfır tabanlı
 * steps[0..2] — bkz. scenes/capturePolicy.js, TEK doğruluk kaynağı). Bu
 * ÜÇ ayrı curriculum adımı ÜÇ AYRI sahne DEĞİL, TEK bir sahnenin (bu
 * dosya) kendi İÇ anlarıdır — scenes/scene05LibertyAssessment.js'in "beş
 * ayrı adım, tek runtime sahne geçişi" deseniyle AYNI (bkz. o dosyanın
 * dosya başı notu).
 *
 * PEDAGOJİK UYARLAMA (görev talimatının "önerilen akış"ından sapma —
 * gerekçeli): görev talimatı üç anı "An1: nefeslerin kapanmasını göster
 * (pasif) → An2: son nefes noktasını fark ettir (pasif) → An3: kullanıcı
 * oynar" biçiminde önerir. GERÇEK curriculum verisi (l3.steps[0..2]) bu
 * varsayımla ÖRTÜŞMEZ: HER ÜÇ adım da zaten `answer`/`turn:'black'` taşır
 * — yani hepsi doğrudan ETKİLEŞİMLİDİR, hiçbiri salt-bilgi/pasif bir ön
 * adım DEĞİLDİR (steps[0]'ın kendi `mascot.sequence`'ı bile zaten "bak,
 * bu nokta boş → oraya oyna" akışını TEK adımda birleştirir). Curriculum
 * icat etmek yerine (bkz. görev talimatı: "içeriği uydurma"), üç GERÇEK
 * adım üç ETKİLEŞİMLİ an olarak korunur — her an KENDİ içinde An1+An2'nin
 * pedagojik özünü (gerçek hedef grubun GERÇEK son nefes noktasını hemen,
 * dokunmadan ÖNCE turkuaz/neon işaretle göstermek — bkz. seedMoment)
 * taşır, sonra An3'ün etkileşimini (dokunup yakalamak) sunar. Üç an
 * arasındaki geçiş scenes/assessmentTransition.js'in aynı iç-fade
 * deseniyle olur (Sahne #5 ile AYNI altyapı, YENİDEN YAZILMADI).
 * Grup boyutu üç anda 1→2→3 taşa yükselir — bu ESCALATION curriculum'un
 * KENDİ authored sırasıdır (icat edilmedi), "taş VEYA grup" pedagojik
 * hedefini (bkz. görev talimatı Bölüm 3) doğal biçimde pekiştirir.
 *
 * TERMİNOLOJİ (bkz. görev talimatı Bölüm 2): "özgürlük/serbestlik" veya
 * İngilizce "liberty/liberties" KULLANILMAZ — yalnız "nefes noktası"/
 * "nefes noktaları". Ana dil: "son nefes noktası", "taşı almak", "taş
 * grubu", "tahta dışına kaldırmak". İç teknik tanımlayıcılar (`concept:
 * 'capture'`, `libertyCount`, RuleEngine API'leri) DEĞİŞMEDİ.
 *
 * KAVRAM SÖZLEŞMESİ (bkz. görev talimatı Bölüm 8/9 — Sahne #5 ile AYNI
 * üç-alan deseni): `concept` sahne-seviyesi (her zaman 'capture' —
 * core/conceptMap.js LESSON_DEFAULT_CONCEPT.l3 ile AYNI), `assessmentConcept`
 * an-seviyesi (libertyAssessmentPolicy.js/capturePolicy.js'in GERÇEK
 * RuleEngine-hesaplı sonucu — üç anın hepsi zaten 'atari'dir, statik
 * varsayım DEĞİL), `resultConcept` YALNIZ doğru cevap board'u GERÇEKTEN
 * bir yakalamaya dönüştürdüyse eklenir ('capture').
 */
import { mountTopicEndControls } from './topicEndControls.js?v=2026-08-25.2';
import { assessmentTransition } from './assessmentTransition.js?v=2026-08-25.2';
import {
  getCaptureMoments, isValidCapturePoint, computeCaptureResult,
} from './capturePolicy.js?v=2026-08-25.2';

const CONCEPT = 'capture';

const STATE = { INTRO: 'intro', PLAYING: 'playing' };

const INTRO_TEXT = 'Bir taş ya da taş grubu son nefes noktasını kaybettiğinde tahtadan alınır. Bunu üç örnekte gerçek hamlelerle dene.';
const CONTINUE_LABEL = 'Devam';
const TAP_HINT = 'Turkuaz işaretli son nefes noktasına dokun.';
const WRONG_HINT = 'Taşı almak için son nefes noktasına oyna.';
const DEFAULT_OK_TEXT = 'Son nefes noktası kapanınca taş tahtadan alındı.';
const SUMMARY_TEXT = 'Bir taş ya da grup son nefes noktasını kaybedince gerçekten tahtadan kalkar — bunu üç örnekte kendi hamlelerinle gördün.';

let state = STATE.INTRO;
let moments = [];
let currentIndex = 0;
let answeredCorrectly = [];
let attemptCount = [];
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
  moments = getCaptureMoments();
  currentIndex = 0;
  answeredCorrectly = new Array(moments.length).fill(false);
  attemptCount = new Array(moments.length).fill(0);
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
function clearItemListeners() {
  if (unsubscribeTap) { unsubscribeTap(); unsubscribeTap = null; }
}

function allAnsweredCorrectly() {
  return answeredCorrectly.length === moments.length && answeredCorrectly.every(Boolean);
}

/** Anın gerçek board seed'ini kurar ve hedef grubun GERÇEK son nefes
    noktasını (noktalarını) HEMEN, dokunmadan ÖNCE turkuaz/neon işaretle
    gösterir — bkz. dosya başı "pedagojik uyarlama" notu: bu, görev
    talimatının An1 (nefes noktalarını göster) + An2 (son nefesi fark
    ettir) adımlarının GERÇEK curriculum verisiyle doğal biçimde
    birleştiği noktadır (curriculum.js steps[0]'ın kendi
    `guidanceLevel:'direct'` + mascot "bak, bu nokta boş" deseniyle AYNI
    ruh — bkz. görev talimatı Bölüm 4 An3: "Başlangıçta son nefes noktası
    turkuaz/neon işaretle gösterilsin"). */
function seedMoment(context, moment) {
  const board = context.boardAdapter;
  board.setSize(moment.size);
  board.reset();
  board.focus(moment.cameraPreset || 'center');
  for (const stone of moment.board) {
    board.playMove({ row: stone.y, col: stone.x, color: stone.color === 'B' ? 'black' : 'white' });
  }
  board.showLiberties(moment.lastLibertyPoints);
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
  els.contentEl.innerHTML = `
    <div class="s05-item">
      <div class="s05-prompt">${moment.promptText}</div>
      <p class="s05-tap-hint">${TAP_HINT}</p>
    </div>
  `;
  context.boardAdapter.setInputEnabled(true);
  unsubscribeTap = context.boardAdapter.onIntersectionTap(hit => {
    if (awaitingContinue || transitioning) return;
    const isCorrect = isValidCapturePoint(moment, hit);
    attemptCount[currentIndex] += 1;
    // Yanlış cevapta hamle HİÇ oynanmaz — board eski durumda kalır, son
    // nefes noktası işareti YERİNDE kalır (bkz. görev talimatı Bölüm 7:
    // "Yanlış hamlede doğru konumda kalır"). Doğru cevapta ise GERÇEK
    // hamle core/ruleEngine.js üzerinden (adapters/sceneBoardAdapter.js
    // playMove) oynanır ve bu SPESİFİK sonucun GERÇEK `captured`
    // listesinden okunur — curriculum'un statik capture alanından DEĞİL.
    let resultInfo = null;
    let playResult = null;
    if (isCorrect) {
      resultInfo = computeCaptureResult(moment, hit);
      playResult = context.boardAdapter.playMove({ row: hit.row, col: hit.col, color: 'black' });
      if (!playResult.ok) return; // savunma amaçlı — geçerli hedefler zaten her zaman yasaldır.
    }
    context.emit('scene_assessment_answered', {
      assessmentIndex: currentIndex,
      curriculumStepIndex: moment.curriculumStepIndex,
      concept: CONCEPT,
      assessmentConcept: moment.assessmentConcept,
      attemptNumber: attemptCount[currentIndex],
      correct: isCorrect,
      row: hit.row,
      col: hit.col,
      targetGroupSize: moment.targetGroupSize,
      libertyCountBeforeMove: moment.lastLibertyPoints.length,
      lastLibertyPoint: moment.lastLibertyPoints[0] ?? null,
      // Yanlış cevapta hamle SONUCU alanları HİÇ EKLENMEZ (hamle
      // oynanmadı) — bkz. scenes/scene05LibertyAssessment.js AYNI ilke.
      ...(isCorrect ? {
        capturedCount: resultInfo.capturedCount,
        targetRemovedFromBoard: resultInfo.targetRemovedFromBoard,
        resultConcept: 'capture',
      } : {}),
    });
    if (!isCorrect) {
      setFeedback(moment.feedbackErr || WRONG_HINT, 'err');
      return; // board state DEĞİŞMEZ — yanlış dokunma taş bırakmaz, işaret bozulmaz.
    }
    answeredCorrectly[currentIndex] = true;
    // Hızlı çift tıklama guard'ı — playMove ZATEN oynandı, girdi HEMEN
    // kapatılır (adapters/sceneBoardAdapter.js handleClick, `inputEnabled`i
    // ÇAĞRI ANINDA — senkron — kontrol eder, bkz. görev talimatı Bölüm 7).
    context.boardAdapter.setInputEnabled(false);
    // Son nefes noktası işareti doğru yakalamadan HEMEN SONRA temizlenir
    // (bkz. görev talimatı Bölüm 7).
    context.boardAdapter.clearLiberties();
    setFeedback(moment.feedbackOk || DEFAULT_OK_TEXT, 'ok');
    showContinueControl(context);
  });
  return els.contentEl.querySelector('.s05-tap-hint');
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
  // sahte bir toAssessmentIndex ÜRETİLMEZ; konu sonu zaten
  // scene_completion_unlocked/scene_completed ile temsil edilir (bkz.
  // scenes/scene05LibertyAssessment.js AYNI ilke).
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
    curriculumStepIndex: moment.curriculumStepIndex,
    assessmentType: 'board_tap',
    concept: CONCEPT,
    assessmentConcept: moment.assessmentConcept,
    targetGroupSize: moment.targetGroupSize,
    libertyCountBeforeMove: moment.lastLibertyPoints.length,
    lastLibertyPoint: moment.lastLibertyPoints[0] ?? null,
  });
}

function goToTopicEnd(context) {
  if (topicEnded) return;
  topicEnded = true;
  clearItemListeners();
  context.boardAdapter.setInputEnabled(false);
  context.boardAdapter.clearLiberties();
  els.assessRow.hidden = true;
  topicEnd = mountTopicEndControls(context, { summaryText: SUMMARY_TEXT });
}

function buildDom(context) {
  const root = document.createElement('div');
  root.className = 'ls-strip-root';
  root.innerHTML = `
    <div class="ls-strip-row ls-strip-fade" id="s06-intro">
      <p class="ls-strip-text">${INTRO_TEXT}</p>
      <span class="ls-tick-wrap">
        <button type="button" class="ls-tick" id="s06-confirm" aria-label="Bilgiyi onayla">
          <svg class="ls-tick-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>
        </button>
        <span class="ls-tick-tip" aria-hidden="true">Onayla</span>
      </span>
    </div>
    <div class="ls-strip-row" id="s06-assess" hidden>
      <div class="s05-progress" id="s06-progress" aria-label="Alıştırma ilerlemesi"></div>
      <div class="s05-content" id="s06-content"></div>
      <div class="s05-feedback-row">
        <p class="s05-feedback" id="s06-feedback" role="status" aria-live="polite"></p>
        <button type="button" class="ls-strip-btn s05-continue--waiting" id="s06-continue" tabindex="-1">${CONTINUE_LABEL}</button>
      </div>
    </div>
  `;
  context.container.appendChild(root);
  return {
    root,
    introRow: root.querySelector('#s06-intro'),
    confirmBtn: root.querySelector('#s06-confirm'),
    assessRow: root.querySelector('#s06-assess'),
    progressEl: root.querySelector('#s06-progress'),
    contentEl: root.querySelector('#s06-content'),
    feedbackEl: root.querySelector('#s06-feedback'),
    continueBtn: root.querySelector('#s06-continue'),
  };
}

export const scene06CaptureBasics = {
  id: 'scene-06-capture-basics',
  version: 1,
  title: 'Taş Alma',
  curriculumRef: { lessonId: 'l3', concept: 'capture', stepIndex: 0 },
  // Geriye uyumlu TEKİL curriculumRef korunurken, bu sahnenin GERÇEKTEN
  // kapsadığı ÜÇ curriculum adımı ayrıca burada listelenir — Teacher
  // Studio Diagnostics'in kendi doğrulaması BUNU okur (bkz.
  // scenes/scene05LibertyAssessment.js AYNI desen). `concept` alanı HER
  // GİRDİ İÇİN capturePolicy.js'in GERÇEK, RuleEngine-hesaplı
  // `assessmentConcept`'inden türetilir (statik 3×'atari' listesi DEĞİL).
  curriculumRefs: getCaptureMoments().map(m => ({
    lessonId: 'l3', concept: m.assessmentConcept, stepIndex: m.curriculumStepIndex,
  })),

  mount(context) {
    resetState();
    cleanupFns = [];
    els = buildDom(context);
    // Sahne #5'in dört bloklu (progress/content/feedback/devam) düzeni ile
    // AYNI taşma sorunu — AYNI çözüm (bkz. styles/learning-scenes.css
    // #s06-assess / .s06-scene-host, #s05-assess'in birebir eşdeğeri).
    context.container.classList.add('s06-scene-host');

    context.boardAdapter.setSize(9);
    context.boardAdapter.reset();
    context.boardAdapter.focus('center');
    context.boardAdapter.setInputEnabled(false);
    context.boardAdapter.clearLiberties();

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
    context.container.classList.remove('s06-scene-host');
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
