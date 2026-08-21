/**
 * scenes/scene03LibertiesByPosition.js
 *
 * Sahne #3 — "Konuma Göre Nefes Noktaları". Kullanıcı DENEYİMLEYEREK
 * öğrenir: bir taşın yatay/dikey komşu boş noktaları onun nefes
 * noktalarıdır ve tahtadaki KONUM bu sayıyı değiştirir — merkezde 4,
 * köşede 2. Grup/bağlantı/capture/atari veya yatay-dikey taş bağlantısı
 * konusuna GİRİLMEZ (bir sonraki sahnenin kapsamı).
 *
 * core/curriculum.js'in l1 dersindeki KULLANICIYA GÖRÜNEN 3. ve 4.
 * adımlarını (0-index'te steps[2]: nefes noktası keşfi, steps[3]: köşe
 * taşının 2 nefesi) temel alır — ancak eski LessonEngine/CURRICULUM
 * veri yapısını KULLANMAZ, Scene Runtime mimarisinde bağımsız bir
 * deneyim olarak yeniden inşa eder (bkz. steps[4]'ün — beyaza bitişik
 * taş koyma — BİLİNÇLİ olarak bu sahneye dahil EDİLMEDİĞİ).
 *
 * scene01BoardIntro.js/scene02TurnsAndIntersections.js İLE AYNI desen:
 * {id,version,title,curriculumRef,mount,unmount,canComplete,complete}
 * sözleşmesini uygular, kendi (oturumluk) durumunu modül-seviyesi kapalı
 * değişkenlerde tutar — persistence YALNIZ scene COMPLETION'da olur.
 *
 * Beyazın köşe hamlesi Claude/LLM/proxy'ye BAĞLI DEĞİLDİR —
 * scenes/cornerMovePolicy.js'deki saf, deterministik
 * `pickDeterministicCornerMove()` kullanılır.
 *
 * Nefes noktası vurguları (adapters/sceneBoardAdapter.js'in
 * getLibertiesAt/showLiberties/clearLiberties API'si) YALNIZ pedagojik
 * bilgilendirmedir — Sahne #2'den kaldırılan "rehber" (oynanabilir hedef
 * işareti) sistemiyle KARIŞTIRILMAMALI, o sistem GERİ GETİRİLMEDİ.
 *
 * Zamanlamalar (nefes gösterimi süresi, beyazın gecikmesi, geçiş
 * gecikmesi) testlerin gerçek zamanlı BEKLEMEMESİ için `context.
 * centerLibertyDisplayMs` / `context.whiteCornerDelayMs` /
 * `context.transitionDelayMs` / `context.scheduleTimeout` /
 * `context.clearScheduledTimeout` üzerinden enjekte edilebilir; hiçbiri
 * verilmezse üretim varsayılanları (450–700ms aralığı) kullanılır.
 */

import { pickDeterministicCornerMove } from './cornerMovePolicy.js';

const STATE = {
  INTRO: 'intro',
  AWAITING_CENTER_MOVE: 'awaiting_center_move',
  SHOWING_CENTER_LIBERTIES: 'showing_center_liberties',
  WHITE_THINKING: 'white_thinking',
  COMPARISON_QUESTION: 'comparison_question', // köşe nefesleri de bu state'te gösterilir
  TRANSITION: 'transition',
};

const INTRO_TEXT = 'Bir taşın yatay ve dikey komşu boş noktalarına nefes noktası denir.';
const CENTER_INSTRUCTION = 'Şimdi siyah taşı tahtanın merkezine yerleştir.';
const CENTER_WRONG_FEEDBACK = 'Tahtanın tam ortasındaki kesişimi dene.';
const WHITE_THINKING_TEXT = 'Beyaz köşeyi deniyor…';
const COMPARISON_QUESTION_TEXT = 'Hangisinin nefes noktası daha az?';
const COMPARISON_WRONG_FEEDBACK = 'Tahtanın kenarları taşın çevresindeki boş yönleri azaltır. Bir daha bak.';
const COMPARISON_CORRECT_TEXT = 'Doğru. Köşede yalnızca iki nefes yönü vardır.';
const TRANSITION_TEXT = 'Taşın tahtadaki yeri, sahip olduğu nefes sayısını değiştirir.';

const CENTER_LIBERTY_DISPLAY_MS = 700;
const DEFAULT_WHITE_CORNER_DELAY_MS = 550; // 450–700ms aralığının ortası
const CORNER_LIBERTY_DISPLAY_MS = 250; // köşe halkaları görünür olsun diye kısa bir an, ardından soru
const TRANSITION_DELAY_MS = 700;

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Yalnız bu modülün kendi bellek-içi (oturumluk) durumu — mount() her
// zaman sıfırlar, unmount() temizler.
let state = STATE.INTRO;
let centerPoint = null;
let cornerPoint = null;
let feedbackText = '';
let comparisonCorrect = false;
let answering = false;
let els = null;
let cleanupFns = [];
let unsubscribeTap = null;
let pendingTimerId = null;
let clearScheduledTimeoutFn = clearTimeout;

function resetState() {
  state = STATE.INTRO;
  centerPoint = null;
  cornerPoint = null;
  feedbackText = '';
  comparisonCorrect = false;
  answering = false;
  unsubscribeTap = null;
  pendingTimerId = null;
  clearScheduledTimeoutFn = clearTimeout;
}

function schedule(context, fn, ms) {
  const scheduleFn = context.scheduleTimeout ?? ((f, d) => setTimeout(f, d));
  clearScheduledTimeoutFn = context.clearScheduledTimeout ?? clearTimeout;
  pendingTimerId = scheduleFn(() => { pendingTimerId = null; fn(); }, ms);
}

function render() {
  if (!els) return;
  els.introRow.hidden = state !== STATE.INTRO;
  els.playRow.hidden = state === STATE.INTRO;

  els.choicesEl.hidden = !(state === STATE.COMPARISON_QUESTION && els.questionRevealed);
  els.continueBtn.hidden = !(state === STATE.TRANSITION && comparisonCorrect && els.transitionRevealed);
  els.statusEl.classList.toggle('success', state === STATE.TRANSITION);
  els.feedbackEl.textContent = feedbackText;

  switch (state) {
    case STATE.AWAITING_CENTER_MOVE:
      els.statusEl.textContent = CENTER_INSTRUCTION;
      break;
    case STATE.SHOWING_CENTER_LIBERTIES:
      break; // statusEl metni updateAfterCenterLiberties() içinde gerçek sayıyla ayarlanır
    case STATE.WHITE_THINKING:
      els.statusEl.textContent = WHITE_THINKING_TEXT;
      break;
    case STATE.COMPARISON_QUESTION:
      break; // statusEl metni updateAfterCornerLiberties() içinde gerçek sayıyla ayarlanır
    case STATE.TRANSITION:
      els.statusEl.textContent = els.transitionRevealed ? TRANSITION_TEXT : COMPARISON_CORRECT_TEXT;
      break;
    default:
      break;
  }
}

function handleTap(context, { row, col }) {
  if (state !== STATE.AWAITING_CENTER_MOVE) return;
  const isCenter = row === centerPoint.row && col === centerPoint.col;
  context.emit('scene_center_move_attempted', { row, col, correct: isCenter });

  if (!isCenter) {
    feedbackText = CENTER_WRONG_FEEDBACK;
    render();
    return; // taş KALICI YERLEŞTİRİLMEZ, completion ilerlemez
  }
  if (!context.boardAdapter.isLegalMove({ row, col, color: 'black' })) return; // savunma amaçlı, pratikte hep yasal
  const result = context.boardAdapter.playMove({ row, col, color: 'black' });
  if (!result.ok) return;

  context.emit('scene_move_played', { moveNumber: 1, color: 'black', row, col });
  feedbackText = '';
  context.boardAdapter.setInputEnabled(false);
  if (unsubscribeTap) { unsubscribeTap(); unsubscribeTap = null; }

  const libs = context.boardAdapter.getLibertiesAt({ row, col });
  context.boardAdapter.showLiberties(libs);
  context.emit('scene_liberties_shown', { target: 'center', row, col, count: libs.length });
  els.statusEl.textContent = `Merkezdeki taşın ${libs.length} nefes noktası var.`;
  state = STATE.SHOWING_CENTER_LIBERTIES;
  render();

  schedule(context, () => beginWhiteTurn(context), context.centerLibertyDisplayMs ?? CENTER_LIBERTY_DISPLAY_MS);
}

function beginWhiteTurn(context) {
  state = STATE.WHITE_THINKING;
  context.boardAdapter.focus('corner_tl');
  render();
  schedule(context, () => playWhiteCornerMove(context), context.whiteCornerDelayMs ?? DEFAULT_WHITE_CORNER_DELAY_MS);
}

function playWhiteCornerMove(context) {
  const candidate = pickDeterministicCornerMove({
    isLegalMove: (row, col) => context.boardAdapter.isLegalMove({ row, col, color: 'white' }),
    size: context.boardAdapter.getSize(),
  });
  if (!candidate) return; // savunma amaçlı; bu sahnede (tek taşlı tahta) pratikte imkansız
  const result = context.boardAdapter.playMove({ row: candidate.row, col: candidate.col, color: 'white' });
  if (!result.ok) return;

  cornerPoint = candidate;
  context.emit('scene_move_played', { moveNumber: 2, color: 'white', row: candidate.row, col: candidate.col });

  context.boardAdapter.clearLiberties(); // merkez taşının vurgusu artık kaldırılır
  const libs = context.boardAdapter.getLibertiesAt({ row: candidate.row, col: candidate.col });
  context.boardAdapter.showLiberties(libs);
  context.emit('scene_liberties_shown', { target: 'corner', row: candidate.row, col: candidate.col, count: libs.length });

  els.statusEl.textContent = `Köşedeki taşın yalnızca ${libs.length} nefes noktası var.`;
  els.questionRevealed = false;
  state = STATE.COMPARISON_QUESTION;
  render();

  schedule(context, () => {
    els.statusEl.textContent = COMPARISON_QUESTION_TEXT;
    els.questionRevealed = true;
    render();
  }, CORNER_LIBERTY_DISPLAY_MS);
}

function handleComparisonAnswer(context, choice) {
  if (state !== STATE.COMPARISON_QUESTION || answering) return;
  const correct = choice === 'corner';
  context.emit('scene_comparison_answered', { correct, choice });

  if (!correct) {
    feedbackText = COMPARISON_WRONG_FEEDBACK;
    render();
    return; // scene İLERLEMEZ, nefes göstergeleri KORUNUR
  }

  answering = true;
  feedbackText = '';
  comparisonCorrect = true;
  context.emit('scene_completion_unlocked', {});
  state = STATE.TRANSITION;
  els.transitionRevealed = false;
  render();

  schedule(context, () => {
    els.transitionRevealed = true;
    render();
  }, context.transitionDelayMs ?? TRANSITION_DELAY_MS);
}

function buildDom(context) {
  const root = document.createElement('div');
  root.className = 'ls-strip-root';
  root.innerHTML = `
    <div class="ls-strip-row ls-strip-fade" id="s03-intro">
      <p class="ls-strip-text">${escapeHtml(INTRO_TEXT)}</p>
      <span class="ls-tick-wrap">
        <button type="button" class="ls-tick" id="s03-confirm" aria-label="Bilgiyi onayla">
          <svg class="ls-tick-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>
        </button>
        <span class="ls-tick-tip" aria-hidden="true">Onayla</span>
      </span>
    </div>
    <div class="ls-strip-row" id="s03-play" hidden>
      <span class="ls-strip-status" id="s03-status" role="status" aria-live="polite"></span>
      <span class="ls-strip-caption" id="s03-feedback" role="status" aria-live="polite"></span>
      <div class="ls-choices" id="s03-choices" hidden>
        <button type="button" class="ls-choice" data-choice="center">Merkezdeki siyah taş</button>
        <button type="button" class="ls-choice" data-choice="corner">Köşedeki beyaz taş</button>
      </div>
      <button type="button" class="ls-strip-btn" id="s03-continue" hidden>Devam et</button>
    </div>
  `;
  context.container.appendChild(root);

  return {
    root,
    transitionRevealed: false,
    questionRevealed: false,
    introRow: root.querySelector('#s03-intro'),
    confirmBtn: root.querySelector('#s03-confirm'),
    playRow: root.querySelector('#s03-play'),
    statusEl: root.querySelector('#s03-status'),
    feedbackEl: root.querySelector('#s03-feedback'),
    choicesEl: root.querySelector('#s03-choices'),
    choiceBtns: Array.from(root.querySelectorAll('.ls-choice')),
    continueBtn: root.querySelector('#s03-continue'),
  };
}

function on(el, type, handler) {
  el.addEventListener(type, handler);
  cleanupFns.push(() => el.removeEventListener(type, handler));
}

export const scene03LibertiesByPosition = {
  id: 'scene-03-liberties-by-position',
  version: 1,
  title: 'Konuma Göre Nefes Noktaları',
  curriculumRef: { lessonId: 'l1', concept: 'liberty' },

  mount(context) {
    resetState();
    cleanupFns = [];
    els = buildDom(context);

    // Sahne #2'den taş/timer/input-lock/sıra state'i KALMAZ — her zaman
    // temiz, gerçek 9×9.
    context.boardAdapter.setSize(9);
    context.boardAdapter.reset();
    context.boardAdapter.focus('center');
    context.boardAdapter.setInputEnabled(false);
    context.boardAdapter.clearLiberties();

    // 9×9 için gerçek merkez koordinatı — board adaptörünün RAPORLADIĞI
    // gerçek boyuttan türetilir, sahne modülünde sabit/canvas hesabı YOK.
    const size = context.boardAdapter.getSize();
    centerPoint = { row: Math.floor(size / 2), col: Math.floor(size / 2) };

    let confirming = false;
    on(els.confirmBtn, 'click', () => {
      if (confirming || state !== STATE.INTRO) return;
      confirming = true;
      els.confirmBtn.disabled = true;
      els.confirmBtn.classList.add('ls-confirmed');

      const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const doAdvance = () => {
        context.emit('scene_intro_confirmed', {});
        state = STATE.AWAITING_CENTER_MOVE;
        context.boardAdapter.setInputEnabled(true);
        unsubscribeTap = context.boardAdapter.onIntersectionTap(hit => handleTap(context, hit));
        render();
      };
      if (reduceMotion) { doAdvance(); return; }
      els.introRow.classList.add('ls-closing');
      setTimeout(doAdvance, 220);
    });

    els.choiceBtns.forEach(btn => {
      on(btn, 'click', () => handleComparisonAnswer(context, btn.dataset.choice));
    });

    on(els.continueBtn, 'click', () => {
      if (els.continueBtn.hidden) return;
      const result = context.requestComplete();
      if (result?.advance?.done) {
        context.container.dispatchEvent(new CustomEvent('scene:all-complete', { bubbles: true }));
      }
    });

    render();
  },

  unmount() {
    cleanupFns.forEach(fn => fn());
    cleanupFns = [];
    if (unsubscribeTap) { unsubscribeTap(); unsubscribeTap = null; }
    if (pendingTimerId != null) { clearScheduledTimeoutFn(pendingTimerId); pendingTimerId = null; }
    els?.root?.remove();
    els = null;
    resetState();
  },

  canComplete() {
    return comparisonCorrect;
  },

  complete() {
    // Runtime zaten scene_completed event'ini ve progress yazımını
    // yönetiyor — bu sahnenin tamamlanma ANINDA ek bir yan etkisi yok.
  },
};
