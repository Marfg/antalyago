/**
 * scenes/scene10EndgameCounting.js
 *
 * Konu #10 — "Oyun Sonu ve Sayım". Müfredat kaynağı: core/curriculum.js, l6
 * "Oyun Sonu ve Sayım" dersinin kullanıcıya görünen 1. adımı (sıfır tabanlı
 * `steps[0]` — bkz. scenes/endgameCountingPolicy.js, TEK doğruluk kaynağı).
 * Görev talimatı KASITLI olarak dar tutuldu: bu sahne YALNIZ bu tek adımı
 * kapsar — l6'nın sonraki adımları (puan hesabı, alıştırma) BURAYA
 * eklenmez/taklit edilmez.
 *
 * PEDAGOJİK ÇEKİRDEK — TEK an (`kind:'region_identify'`, bkz.
 * scenes/endgameCountingPolicy.js `MOMENT_KINDS`): curriculum'un authored
 * board'u AYNEN kurulur (hiçbir taş EKLENMEZ/KALDIRILMAZ — bu bir hamle
 * sahnesi DEĞİLDİR, bkz. görev talimatı Bölüm 7). Kullanıcı iki GERÇEK boş
 * bölgeyi (siyahın tamamen çevrelediği, beyazın tamamen çevrelediği — bkz.
 * `computeRegions()` flood-fill) SERBEST sırada dokunarak bulur — Sahne
 * #8'in An 1'iyle (`attemptedForbiddenPoints`, çoklu-hedef serbest-sıra)
 * AYNI temel desen, ama BURADA "hedef" tek bir nokta değil bir BÖLGEDİR:
 * bölgenin İÇİNDEKİ herhangi bir boş noktaya dokunmak TÜM bölgeyi "bulunmuş"
 * sayar ve bölgenin TÜM noktalarını aynı anda işaretler (kullanıcının
 * "gördüğü" şey tek bir nokta değil, bütün bir bölgenin biçimidir).
 *
 * GATING KARARI (bkz. görev talimatı Bölüm 7 — "pedagojik olarak belirle ve
 * testle sabitle"): onay ÖNCESİ authored board TEMİZ gösterilir (hiçbir
 * bölge marker'ı YOK — bkz. `mount()`). Onay SONRASI board girdisi açılır
 * ve kullanıcı aktif biçimde ARAR/DOKUNUR; bölgeler yalnız DOĞRU bir
 * dokunuşun SONUCUNDA "tanıtılır" (reveal) — hazır, tıklama gerektirmeyen
 * bir "işte bölgeler" kartı ASLA gösterilmez (bkz. görev talimatı Bölüm 4
 * son satırı: "kullanıcının yalnızca metin okuyup geçmesine izin verme").
 * Bu, curriculum'un kendi "Kazanan, daha fazla bölge çeviren oyuncudur"
 * cümlesini pasif bir açıklama değil, AKTİF bir keşif hâline getirir.
 *
 * TERS RENK DÜZELTMESİ (bkz. görev talimatı Bölüm 2, scenes/
 * endgameCountingPolicy.js dosya başı notu): curriculum'un `l6.steps[0].fb.t`
 * metni bu görev kapsamında düzeltildi — sahne bu metni CANLI olarak
 * `moment.infoText` üzerinden okur, burada AYRICA yazılmaz.
 *
 * GÖRSEL DİL (bkz. adapters/sceneBoardAdapter.js v0.21 `showRegionMarks`):
 * RENK-AGNOSTİK genel bölge API'si kullanılır — bu dosya adapter'a HANGİ
 * rengin hangi ekran-RGB'siyle çizileceğini SÖYLEMEZ, yalnız
 * `{row,col,color:'black'|'white'}` verir (bkz. dosya başı ilke: "sahneye
 * özel hard-code adapter'a gömülmez").
 *
 * EVENT SÖZLEŞMESİ (bkz. görev talimatı Bölüm 8): mevcut
 * `scene_intro_confirmed`/`scene_assessment_presented`/
 * `scene_completion_unlocked` YENİDEN KULLANILDI (bu sahnede yalnız TEK
 * moment olduğu için `scene_assessment_advanced` HİÇ üretilmez — bkz.
 * `goToNextItem`, `toIndex>=moments.length` her zaman doğrudan topic-end'e
 * gider). Uygun mevcut bir event "bölge tanıma denemesi" anlamını
 * taşımadığı için TEK yeni, sahneye özel OLMAYAN genel bir event eklendi:
 * `scene_region_identified` (bkz. `handleTap` altında) — `sceneId`/
 * `sceneVersion`/`mode`/`lessonId` runtime tarafından OTOMATİK eklenir (bkz.
 * core/sceneRuntime.js `context.emit`), bu yüzden payload'a BURADA tekrar
 * yazılmaz; `stepIndex`/`row`/`col`/`regionColor`('B'|'W'|null)/
 * `regionPoints`/`regionSignature`/`blackFound`/`whiteFound`/
 * `regionsFoundCount`/`completionReady` taşınır.
 *
 * KAVRAM (bkz. scenes/endgameCountingPolicy.js dosya başı notu):
 * `concept:'territory'` KASITLI olarak core/conceptMap.js'e eklenmedi —
 * Teacher Studio Diagnostics bunu bilinen-olmayan concept olarak raporlar
 * (Sahne #8/#9 İLE AYNI bilinçli, gizlenmeyen boşluk).
 */
import { mountTopicEndControls } from './topicEndControls.js?v=2026-09-22.illegal-native2';
import {
  getEndgameCountingMoment, evaluateRegionTap, regionSignature, CONCEPT,
} from './endgameCountingPolicy.js?v=2026-09-22.illegal-native2';

const STATE = { INTRO: 'intro', PLAYING: 'playing' };

const INTRO_TEXT = 'Oyun bittiğinde kazananı, çevrilen bölge belirler. Şimdi tahtadaki siyah ve beyaz bölgeleri ayırt edelim.';
const CONTINUE_LABEL = 'Devam';
const REGION_TAP_HINT = 'Siyahın çevrelediği boş bölgeye VE beyazın çevrelediği boş bölgeye — istediğin sırada — dokun.';
const OFF_TARGET_NEUTRAL_HINT = 'Bu nokta tek bir renge ait değil — siyahın veya beyazın tamamen çevrelediği bir bölgeyi dene.';
const OFF_TARGET_STONE_HINT = 'Burada zaten bir taş var — boş bir bölge noktasını dene.';
const ALREADY_FOUND_HINT_PREFIX = 'Bu bölgeyi zaten bulmuştun.';
const SUMMARY_TEXT = 'Bir Go tahtasında boş kalan bölgelerin, çevrelerindeki tek bir renge ait olduğunu ve bu bölgelerin oyun sonunda puan olarak sayıldığını gördün.';
// AYNI noktaya hızlı çift tıklama TEK bir denemeye sayılmalı — scenes/
// scene08IllegalMoves.js/scene09KoRule.js İLE AYNI debounce penceresi.
const TAP_DEBOUNCE_MS = 400;

let state = STATE.INTRO;
let moments = [];
let currentIndex = 0;
let answeredCorrectly = [];
let attemptCount = [];
let lastTap = null; // {row, col, at}
let blackFound = false;
let whiteFound = false;
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
  moments = [getEndgameCountingMoment()];
  currentIndex = 0;
  answeredCorrectly = new Array(moments.length).fill(false);
  attemptCount = new Array(moments.length).fill(0);
  lastTap = null;
  blackFound = false;
  whiteFound = false;
  awaitingContinue = false;
  transitioning = false;
  unlockedEmitted = false;
  topicEnded = false;
  topicEnd = null;
  unsubscribeTap = null;
  unsubscribeHover = null;
}

function on(el, type, handler) {
  el.addEventListener(type, handler);
  cleanupFns.push(() => el.removeEventListener(type, handler));
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

function hideRegionVisuals(context) {
  context.boardAdapter.clearMovePreview();
  context.boardAdapter.clearRegionMarks();
}

/** Anın gerçek board seed'ini kurar — hiçbir bölge marker'ı ÖNCEDEN
    gösterilmez (bkz. dosya başı "GATING KARARI" notu).
    GÖRÜNÜRLÜK-ÖNCELİKLİ katman (bkz. adapters/sceneBoardAdapter.js
    focusPoints, scenes/scene08IllegalMoves.js seedMoment İLE AYNI genel,
    sahne/adım BİLMEYEN API): bu adımın authored board'u 39 taşla VE 42
    boş bölge noktasıyla (22 siyah + 20 beyaz — nötr YOK, bkz.
    scenes/endgameCountingPolicy.js) tahtanın köşeden köşeye TAMAMINI
    kaplıyor — yalnız `board.focus(cameraPreset)` (preset'in kendi sabit
    kadrajı) dar viewport'larda uzak köşe noktalarını GÜVENLİ ALAN DIŞINDA
    bırakabilir (bkz. görev talimatı Bölüm 12: "her örneğin kendi fresh
    seed'i hedef + tam bağlamı göstermeli"). Preset zaten güvenliyse
    (`computeFraming` `adjusted:false`) bu çağrı NO-OP'tur — masaüstü
    davranışı bozulmaz. */
function seedMoment(context, moment) {
  const board = context.boardAdapter;
  board.setSize(moment.size);
  board.reset();
  blackFound = false;
  whiteFound = false;
  board.focus(moment.cameraPreset || 'center');
  const points = [
    ...moment.board.map(s => ({ row: s.y, col: s.x })),
    ...moment.blackRegionPoints,
    ...moment.whiteRegionPoints,
  ];
  board.focusPoints(points, { presetName: moment.cameraPreset || 'center', minZoom: 160 });
  for (const stone of moment.board) {
    board.playMove({ row: stone.y, col: stone.x, color: stone.color === 'B' ? 'black' : 'white' });
  }
  hideRegionVisuals(context);
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

/** Board input yalnız hit-testin KENDİSİ için kullanılır — bu sahne hamle
    OYNAMAZ, bu yüzden hover'da hiçbir taş silüeti (`setMovePreview`)
    GÖSTERİLMEZ (bkz. dosya başı notu: "taş oynama sahnesi DEĞİL"). Adapter
    zaten `movePreview` boşken kendi nötr hover noktasını (drawHoverPoint)
    otomatik çizer — burada EK bir görsel EKLENMEZ. */
function handleHover() {
  // Kasıtlı no-op — bkz. fonksiyon başı notu.
}

function refreshRegionVisuals(context, moment) {
  const points = [];
  if (blackFound) points.push(...moment.blackRegionPoints.map(p => ({ row: p.row, col: p.col, color: 'black' })));
  if (whiteFound) points.push(...moment.whiteRegionPoints.map(p => ({ row: p.row, col: p.col, color: 'white' })));
  context.boardAdapter.showRegionMarks(points);
}

function updateRegionProgressUI() {
  if (!els.regionProgressEl) return;
  const count = (blackFound ? 1 : 0) + (whiteFound ? 1 : 0);
  els.regionProgressEl.textContent = `${count} / 2 bölge`;
}

/** TEK dokunuş işleyicisi — bkz. scenes/endgameCountingPolicy.js
    `evaluateRegionTap` (TEK doğruluk kaynağı, sahne kendi sınıflandırma
    mantığını İCAT ETMEZ). Aynı bölgeye tekrar dokunmak (Section 7:
    "ilerlemeyi iki kez artırmasın") `blackFound`/`whiteFound` bayrakları
    zaten SET olduğu için doğal olarak no-op'tur — yalnız bilgilendirici bir
    geri bildirim gösterilir, progress/marker DEĞİŞMEZ (showRegionMarks
    ZATEN aynı noktaları veriyor, adapter'ın kendi `t`-koruma tekniği bkz.
    v0.21 sayesinde titreme de OLMAZ). */
function handleTap(context, moment, hit) {
  if (awaitingContinue || transitioning) return;

  const attempt = evaluateRegionTap(moment, hit);

  const now = Date.now();
  if (lastTap && lastTap.row === hit.row && lastTap.col === hit.col && now - lastTap.at < TAP_DEBOUNCE_MS) {
    return; // AYNI noktaya hızlı çift tıklama — ikinci deneme SAYILMAZ.
  }
  lastTap = { row: hit.row, col: hit.col, at: now };
  attemptCount[currentIndex] += 1;

  const wasBlackFound = blackFound;
  const wasWhiteFound = whiteFound;
  let matched = false;
  let alreadyFound = false;

  if (attempt.regionColor === 'B') {
    alreadyFound = wasBlackFound;
    matched = !wasBlackFound;
    blackFound = true;
  } else if (attempt.regionColor === 'W') {
    alreadyFound = wasWhiteFound;
    matched = !wasWhiteFound;
    whiteFound = true;
  }

  const regionPoints = attempt.regionColor === 'B' ? moment.blackRegionPoints
    : attempt.regionColor === 'W' ? moment.whiteRegionPoints
    : null;

  context.emit('scene_region_identified', {
    assessmentIndex: currentIndex,
    stepIndex: moment.curriculumStepIndex,
    row: hit.row,
    col: hit.col,
    regionColor: attempt.regionColor,
    isOccupied: attempt.isOccupied,
    matched,
    alreadyFound,
    regionPoints,
    regionSignature: regionPoints ? regionSignature(regionPoints) : null,
    blackFound,
    whiteFound,
    regionsFoundCount: (blackFound ? 1 : 0) + (whiteFound ? 1 : 0),
    concept: CONCEPT,
    mode: moment.kind,
    attemptNumber: attemptCount[currentIndex],
    completionReady: blackFound && whiteFound,
  });

  if (attempt.regionColor) {
    refreshRegionVisuals(context, moment);
    updateRegionProgressUI();
    const colorWord = attempt.regionColor === 'B' ? 'siyah' : 'beyaz';
    setFeedback(
      alreadyFound
        ? `${ALREADY_FOUND_HINT_PREFIX} Bu, ${colorWord} bölge.`
        : `Doğru — bu, ${colorWord} bölge.`,
      'ok',
    );
    if (blackFound && whiteFound) {
      answeredCorrectly[currentIndex] = true;
      context.boardAdapter.setInputEnabled(false);
      showContinueControl(context);
    }
    return;
  }

  // Sahipsiz/karışık (dame) bir nokta VEYA dolu bir kesişim — board/ilerleme/
  // marker DEĞİŞMEZ, yalnız kısa bir yönlendirme gösterilir.
  setFeedback(attempt.isOccupied ? OFF_TARGET_STONE_HINT : OFF_TARGET_NEUTRAL_HINT, 'err');
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

function renderMomentItem(context, moment) {
  els.contentEl.innerHTML = `
    <div class="s05-item">
      <div class="s05-prompt">${moment.promptText}</div>
      ${moment.infoText ? `<p class="s05-tap-hint" id="s10-info-text"><strong>${moment.infoText}</strong></p>` : ''}
      <p class="s05-tap-hint">${REGION_TAP_HINT}</p>
      <p class="s05-tap-hint" id="s10-region-progress">0 / 2 bölge</p>
    </div>
  `;
  els.regionProgressEl = els.contentEl.querySelector('#s10-region-progress');
  context.boardAdapter.setInputEnabled(true);
  unsubscribeTap = context.boardAdapter.onIntersectionTap(hit => handleTap(context, moment, hit));
  unsubscribeHover = context.boardAdapter.onIntersectionHover(handleHover);
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
  seedMoment(context, moment);
  const firstFocusable = renderMomentItem(context, moment);
  return firstFocusable;
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
  });
}

function goToTopicEnd(context) {
  if (topicEnded) return;
  topicEnded = true;
  clearItemListeners();
  context.boardAdapter.setInputEnabled(false);
  hideRegionVisuals(context);
  els.assessRow.hidden = true;
  topicEnd = mountTopicEndControls(context, { summaryText: SUMMARY_TEXT });
}

/** Bu sahnede TEK moment var — "Devam" her zaman doğrudan topic-end'e gider
    (bkz. dosya başı "EVENT SÖZLEŞMESİ" notu: `scene_assessment_advanced`
    bu yüzden HİÇ üretilmez, Sahne #9/#8'in çok-moment akışından FARKLI). */
function goToNextItem(context) {
  if (!awaitingContinue || transitioning) return;
  goToTopicEnd(context);
}

function buildDom(context) {
  const root = document.createElement('div');
  root.className = 'ls-strip-root';
  root.innerHTML = `
    <div class="ls-strip-row ls-strip-fade" id="s10-intro">
      <p class="ls-strip-text">${INTRO_TEXT}</p>
      <span class="ls-tick-wrap">
        <button type="button" class="ls-tick" id="s10-confirm" aria-label="Bilgiyi onayla">
          <svg class="ls-tick-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>
        </button>
        <span class="ls-tick-tip" aria-hidden="true">Onayla</span>
      </span>
    </div>
    <div class="ls-strip-row" id="s10-assess" hidden>
      <div class="s05-progress" id="s10-progress" aria-label="Alıştırma ilerlemesi"></div>
      <div class="s05-content" id="s10-content"></div>
      <div class="s05-feedback-row">
        <p class="s05-feedback" id="s10-feedback" role="status" aria-live="polite"></p>
        <button type="button" class="ls-strip-btn s05-continue--waiting" id="s10-continue" tabindex="-1">${CONTINUE_LABEL}</button>
      </div>
    </div>
  `;
  context.container.appendChild(root);
  return {
    root,
    introRow: root.querySelector('#s10-intro'),
    confirmBtn: root.querySelector('#s10-confirm'),
    assessRow: root.querySelector('#s10-assess'),
    progressEl: root.querySelector('#s10-progress'),
    contentEl: root.querySelector('#s10-content'),
    feedbackEl: root.querySelector('#s10-feedback'),
    continueBtn: root.querySelector('#s10-continue'),
    regionProgressEl: null,
  };
}

export const scene10EndgameCounting = {
  id: 'scene-10-endgame-counting',
  version: 1,
  title: 'Oyun Sonu ve Sayım',
  curriculumRef: { lessonId: 'l6', concept: CONCEPT, stepIndex: 0 },

  mount(context) {
    resetState();
    cleanupFns = [];
    els = buildDom(context);
    context.container.classList.add('s10-scene-host');

    context.boardAdapter.setSize(9);
    context.boardAdapter.reset();
    context.boardAdapter.focus('high');
    context.boardAdapter.setInputEnabled(false);
    hideRegionVisuals(context);

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
    context.container.classList.remove('s10-scene-host');
    hideRegionVisuals(context);
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
