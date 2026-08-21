/**
 * scenes/scene02TurnsAndIntersections.js
 *
 * Sahne #2 — "Sırayla Oynama ve Kesişim Noktaları". Kullanıcı üç gerçek
 * gerçeği DENEYİMLEYEREK öğrenir: (1) Go sırayla oynanır, (2) taşlar
 * kesişim noktalarına konur, (3) ilk hamleyi siyah yapar. Sahne sonunda
 * tahtada 3 siyah + 3 beyaz = 6 gerçek, kural-doğrulanmış taş vardır.
 *
 * v0.9 — kesişim "rehber" (yeşil neon nokta) sistemi BİLEREK KALDIRILDI
 * (bkz. görev talimatı Bölüm B, adapters/sceneBoardAdapter.js dosya başı
 * notu): kullanıcı kesişimleri artık doğal tahta çizgileri, adaptörün
 * ince tek-noktalı pointer hover geri bildirimi ve taşın gerçek yerleşme
 * davranışıyla öğrenir. `scene_guides_shown`/`scene_guides_cleared`
 * event'leri ve ilgili state ARTIK ÜRETİLMEZ.
 *
 * DOM'u ORTAK anlatım şeridi ilkelleriyle (ls-strip-row, ls-tick — bkz.
 * styles/learning-scenes.css) kurar — ayrı bir sağ panel YOK.
 *
 * scene01BoardIntro.js İLE AYNI desen: `core/sceneRuntime.js`'in
 * {id,version,title,curriculumRef,mount,unmount,canComplete,complete}
 * sözleşmesini uygular; kendi (oturumluk) durumunu modül-seviyesi
 * kapalı (closure) değişkenlerde tutar — HİÇBİR ŞEY
 * adapters/sceneProgressAdapter.js'e yazılmaz (yalnız scene COMPLETION
 * kalıcıdır, bkz. o dosyanın başlık notu).
 *
 * Beyazın cevap hamlesi Claude/LLM'e veya herhangi bir localhost proxy'ye
 * BAĞLI DEĞİLDİR — scenes/turnPolicy.js'deki saf, deterministik
 * `pickDeterministicWhiteMove()` kullanılır (bkz. o dosyanın başlık notu).
 *
 * Beyazın "düşünme" gecikmesi varsayılan olarak 450–700ms aralığının
 * ORTASINDA sabit bir değerdir (DEFAULT_WHITE_DELAY_MS) — testlerin
 * gerçek zamanlı bekleme YAPMAMASI için `context.whiteMoveDelayMs` /
 * `context.scheduleTimeout` / `context.clearScheduledTimeout` üzerinden
 * enjekte edilebilir (host bunları contextExtras ile geçebilir; verilmezse
 * gerçek setTimeout/clearTimeout kullanılır — üretim davranışı DEĞİŞMEZ).
 *
 * Tamamlanma tamamen İÇSEL/teknik kalır: kullanıcıya HİÇBİR ZAMAN "Sahne
 * tamamlandı" veya eşdeğeri gösterilmez — altı taş yerleşince sade bir
 * "Devam et" eylemi (scene01BoardIntro.js'deki continueBtn İLE AYNI
 * idiyom) sunulur; sıradaki sahne yoksa host (learning-scenes.html) zaten
 * paylaşılan #ls-final ekranını nötr metinle gösterir.
 */

import { pickDeterministicWhiteMove } from './turnPolicy.js';

const INFO_STEPS = [
  {
    text: 'Go, sırayla oynanan bir oyundur. Taraflar dönüşümlü olarak hamle yapar — aynı anda iki taş birden konmaz.',
    ariaLabel: '1. adımı onayla',
  },
  {
    text: 'Taşlar karelerin İÇİNE değil, çizgilerin KESİŞTİĞİ noktalara konur.',
    ariaLabel: '2. adımı onayla',
  },
  {
    text: "Go'da ilk hamleyi her zaman SİYAH taraf yapar. Şimdi sırayla oynayacaksın: önce sen, sonra beyaz karşılık verecek.",
    ariaLabel: '3. adımı onayla',
  },
];
const TOTAL_PAIRS = 3;
const DEFAULT_WHITE_DELAY_MS = 550; // 450–700ms aralığının ortası, sabit/deterministik

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Yalnız bu modülün kendi bellek-içi (oturumluk) durumu — mount() her
// zaman sıfırlar, unmount() temizler.
let step = 0; // 0..3 — kaç bilgi adımı onaylandı
let blackMoves = 0;
let whiteMoves = 0;
let turn = null; // 'black' | 'white' | null
let sequenceDone = false;
let els = null;
let cleanupFns = [];
let unsubscribeTap = null;
let whiteTimerId = null;
let clearScheduledTimeoutFn = clearTimeout;

function resetState() {
  step = 0;
  blackMoves = 0;
  whiteMoves = 0;
  turn = null;
  sequenceDone = false;
  unsubscribeTap = null;
  whiteTimerId = null;
  clearScheduledTimeoutFn = clearTimeout;
}

function render() {
  if (!els) return;
  els.stepEls.forEach((el, i) => { el.hidden = i !== step; });
}

function updateTurnUI() {
  if (!els) return;
  els.dotsEl.innerHTML = Array.from({ length: TOTAL_PAIRS })
    .map((_, i) => `<span class="ls-strip-dot${i < whiteMoves ? ' done' : ''}"></span>`)
    .join('');

  if (sequenceDone) {
    els.turnEl.textContent = 'Altı taş sırayla yerleştirildi.';
    els.turnEl.classList.add('success');
    els.continueBtn.hidden = false;
    return;
  }
  els.turnEl.classList.remove('success');
  els.continueBtn.hidden = true;
  if (turn === 'black') els.turnEl.textContent = 'Sıra sende — Siyah';
  else if (turn === 'white') els.turnEl.textContent = 'Beyaz düşünüyor…';
  else els.turnEl.textContent = '';
}

function scheduleWhiteMove(context) {
  const delay = context.whiteMoveDelayMs ?? DEFAULT_WHITE_DELAY_MS;
  const schedule = context.scheduleTimeout ?? ((fn, ms) => setTimeout(fn, ms));
  clearScheduledTimeoutFn = context.clearScheduledTimeout ?? clearTimeout;
  whiteTimerId = schedule(() => {
    whiteTimerId = null;
    playWhiteMove(context);
  }, delay);
}

function playWhiteMove(context) {
  const candidate = pickDeterministicWhiteMove({
    isLegalMove: (row, col) => context.boardAdapter.isLegalMove({ row, col, color: 'white' }),
    size: context.boardAdapter.getSize(),
  });
  const result = candidate ? context.boardAdapter.playMove({ row: candidate.row, col: candidate.col, color: 'white' }) : { ok: false };

  if (!result.ok) {
    // Savunma ağı: 9×9'da 6 taşla pratikte imkansız, ama beyaz için yasal
    // aday bulunamazsa akışı KİLİTLEMEDEN siyaha geri ver.
    turn = 'black';
    context.boardAdapter.setInputEnabled(true);
    updateTurnUI();
    return;
  }

  whiteMoves += 1;
  context.emit('scene_move_played', { moveNumber: blackMoves + whiteMoves, color: 'white', row: candidate.row, col: candidate.col });

  if (blackMoves >= TOTAL_PAIRS && whiteMoves >= TOTAL_PAIRS) {
    sequenceDone = true;
    turn = null;
    context.emit('scene_completion_unlocked', {});
  } else {
    turn = 'black';
    context.boardAdapter.setInputEnabled(true);
  }
  updateTurnUI();
}

function handleTap(context, { row, col }) {
  if (turn !== 'black' || sequenceDone) return;
  if (!context.boardAdapter.isLegalMove({ row, col, color: 'black' })) return; // yasal değil/dolu/dışarı — hamle sayılmaz
  const result = context.boardAdapter.playMove({ row, col, color: 'black' });
  if (!result.ok) return;

  blackMoves += 1;
  context.emit('scene_move_played', { moveNumber: blackMoves + whiteMoves, color: 'black', row, col });

  turn = 'white';
  context.boardAdapter.setInputEnabled(false);
  updateTurnUI();
  scheduleWhiteMove(context);
}

function startPlay(context) {
  els.playRow.hidden = false;
  turn = 'black';
  context.boardAdapter.setInputEnabled(true);
  unsubscribeTap = context.boardAdapter.onIntersectionTap(hit => handleTap(context, hit));
  updateTurnUI();
}

function buildDom(context) {
  const root = document.createElement('div');
  root.className = 'ls-strip-root';
  root.innerHTML = `
    <div class="ls-strip-steps" id="s02-steps">
      ${INFO_STEPS.map((s, i) => `
        <div class="ls-strip-row ls-strip-fade" id="s02-step-${i}" ${i > 0 ? 'hidden' : ''}>
          <p class="ls-strip-text">${escapeHtml(s.text)}</p>
          <span class="ls-tick-wrap">
            <button type="button" class="ls-tick" data-confirm="${i}" aria-label="${escapeHtml(s.ariaLabel)}">
              <svg class="ls-tick-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>
            </button>
            <span class="ls-tick-tip" aria-hidden="true">Onayla</span>
          </span>
        </div>
      `).join('')}
    </div>
    <div class="ls-strip-row" id="s02-play" hidden>
      <span class="ls-strip-status" id="s02-turn" role="status" aria-live="polite"></span>
      <div class="ls-strip-dots" id="s02-dots" aria-hidden="true"></div>
      <button type="button" class="ls-strip-btn" id="s02-continue" hidden>Devam et</button>
    </div>
  `;
  context.container.appendChild(root);

  return {
    root,
    stepEls: INFO_STEPS.map((_, i) => root.querySelector(`#s02-step-${i}`)),
    confirmBtns: Array.from(root.querySelectorAll('[data-confirm]')),
    playRow: root.querySelector('#s02-play'),
    turnEl: root.querySelector('#s02-turn'),
    dotsEl: root.querySelector('#s02-dots'),
    continueBtn: root.querySelector('#s02-continue'),
  };
}

function on(el, type, handler) {
  el.addEventListener(type, handler);
  cleanupFns.push(() => el.removeEventListener(type, handler));
}

export const scene02TurnsAndIntersections = {
  id: 'scene-02-turns-and-intersections',
  version: 1,
  title: 'Sırayla Oynama ve Kesişim Noktaları',
  curriculumRef: { lessonId: 'l1', concept: 'stone_placement' },

  mount(context) {
    resetState();
    cleanupFns = [];
    els = buildDom(context);

    // Sahne #1'in son kullandığı boyuttan BAĞIMSIZ — her zaman gerçek 9×9.
    context.boardAdapter.setSize(9);
    context.boardAdapter.reset();
    context.boardAdapter.focus('center');
    context.boardAdapter.setInputEnabled(false);
    context.boardAdapter.clearLiberties();

    let confirmingStep = null;
    els.confirmBtns.forEach((btn, i) => {
      on(btn, 'click', () => {
        if (confirmingStep !== null || step !== i) return;
        confirmingStep = i;
        btn.disabled = true;
        btn.classList.add('ls-confirmed');

        const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const doAdvance = () => {
          confirmingStep = null;
          step = i + 1;
          context.emit('scene_info_step_confirmed', { step });
          if (i === 2) startPlay(context);
          render();
        };
        if (reduceMotion) { doAdvance(); return; }
        els.stepEls[i].classList.add('ls-closing');
        setTimeout(doAdvance, 220);
      });
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
    if (whiteTimerId != null) { clearScheduledTimeoutFn(whiteTimerId); whiteTimerId = null; }
    els?.root?.remove();
    els = null;
    resetState();
  },

  canComplete() {
    return sequenceDone;
  },

  complete() {
    // Runtime zaten scene_completed event'ini ve progress yazımını
    // yönetiyor — bu sahnenin tamamlanma ANINDA ek bir yan etkisi yok.
  },
};
