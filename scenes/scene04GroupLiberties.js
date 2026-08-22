/**
 * scenes/scene04GroupLiberties.js
 *
 * Konu #4 — "Grubun Nefesi". Müfredat kaynağı: core/curriculum.js, l2
 * "Nefes Noktaları" dersinin `steps[2]` (0-tabanlı index — kullanıcıya
 * görünen "3. adım", bkz. proje CLAUDE.md'sindeki "l2 Nefes Noktaları —
 * 8 adım" sayımı). O adımın ORİJİNAL (pasif/auto) tanımı:
 *
 *   text: "Yatay veya dikey olarak birbirine bağlı taşlar <b>grup</b>
 *          oluşturur. Grubun özgürlüğü tüm taşlarının boş komşularının
 *          toplamıdır."
 *   board: [{B,x:3,y:4}, {B,x:4,y:4}, {B,x:5,y:4}]   // üç bitişik siyah taş
 *   fb: "Bu üç taş bir grup — birlikte 8 nefes noktası var."
 *
 * v0.16 — kök neden düzeltmesi: önceki sürüm completion'ı İLK bağlantıdan
 * (2 taş/6 nefes) sonra açıyordu — müfredatın GERÇEK örneği (3 taş/8 nefes,
 * DOĞRUSAL) hiç zorunlu kılınmıyordu. Üçüncü taş/L-biçimi vs doğrusal ayrımı
 * ("groupSize===3 tek başına yeterli değil") hiç test edilmiyordu. Artık:
 *   - Hedef koordinatlar scenes/groupLibertyPolicy.js'den (curriculum'un
 *     KENDİ board seed'inden TÜRETİLİR, ikinci kez sabitlenmez) okunur.
 *   - Sahne yalnız curriculum'un SIRALI iki bağlantı hedefini ((4,4) sonra
 *     (4,5)) kabul eder — hedef DIŞI (L-biçimi dahil) her tıklama state'i
 *     DEĞİŞTİRMEDEN reddedilir (bkz. handleTap/isExpectedNextTarget).
 *   - completion YALNIZ ikinci (SON) bağlantıdan sonra, nihai board
 *     curriculum seed'iyle BİREBİR eşleştiğinde açılır (bkz. canComplete).
 *
 * Etkileşim modeli:
 *   1. mount() çapa taşını yerleştirir — curriculum seed'inin ilk noktası.
 *   2. Tick onayından hemen sonra çapanın GERÇEK nefes noktaları
 *      (adapters/sceneBoardAdapter.js getLibertiesAt → core/ruleEngine.js)
 *      turkuaz işaretlerle gösterilir; SIRADAKİ hedef (4,4) pointer
 *      hareketi BEKLENMEDEN yarı saydam bir ghost olarak görünür.
 *   3. Kullanıcı (4,4)'e tıklar → GERÇEK taş (playMove). Grup 2 taşlı olur,
 *      YENİ ortak nefes kümesi (6 nokta) yeniden hesaplanıp gösterilir.
 *      Completion AÇILMAZ — ghost artık SON hedefe (4,5) geçer.
 *   4. Kullanıcı (4,5)'e tıklar → GERÇEK taş. Grup 3 taşlı, curriculum'un
 *      TAM örneğiyle BİREBİR aynı, GERÇEK ortak nefes 8. Yalnız BURADA
 *      completion açılır.
 *   5. Sıradaki hedef DIŞINDA bir noktaya tıklama (L-biçimi dahil) hiçbir
 *      state'i DEĞİŞTİRMEZ — yalnız yönlendirici bir metin gösterilir.
 *
 * Sayılar HER ZAMAN core/ruleEngine.js'in (getGroup+getLiberties, adaptör
 * üzerinden getLibertiesAt) gerçek sonucudur — sabit metinden ÜRETİLMEZ.
 */

import { mountTopicEndControls } from './topicEndControls.js';
import { getAnchor, getNextTarget, totalConnectionsRequired, isSequenceComplete, isExpectedNextTarget, matchesCurriculumSeed } from './groupLibertyPolicy.js';

const STATE = {
  INTRO: 'intro',
  AWAITING_CONNECT: 'awaiting_connect',
  CONNECTED: 'connected',
};

const ANCHOR = getAnchor();
const TOTAL_CONNECTIONS = totalConnectionsRequired();

const INTRO_TEXT = 'Yatay veya dikey olarak birbirine bağlı taşlar <strong>grup</strong> oluşturur. Grubun özgürlüğü tüm taşlarının boş komşularının toplamıdır.';
const FIRST_TARGET_INSTRUCTION = 'Taşın yanına, yatay veya dikey bitişik başka bir siyah taş yerleştir.';
const NEXT_TARGET_INSTRUCTION = 'Zinciri tamamlamak için işaretli noktaya bir taş daha yerleştir.';
const WRONG_POINT_HINT = 'Taşı mevcut grubun devamındaki işaretli noktaya yerleştir.';
const CONTINUE_DISABLED_HINT = 'Devam etmek için grubu tamamla.';
const SUMMARY_TEXT = 'Grup nefesi, taşların nefeslerini ayrı ayrı toplamak değil, grubun çevresindeki tekil boş noktalardır.';

let state = STATE.INTRO;
let connectionsMade = 0;
let unlockedEmitted = false;
let topicEnded = false;
let topicEnd = null;
let els = null;
let cleanupFns = [];
let unsubscribeTap = null;

function resetState() {
  state = STATE.INTRO;
  connectionsMade = 0;
  unlockedEmitted = false;
  topicEnded = false;
  topicEnd = null;
  unsubscribeTap = null;
}

function groupSize() { return connectionsMade + 1; }
function sequenceDone() { return isSequenceComplete(connectionsMade); }

function render() {
  if (!els) return;
  els.introRow.hidden = state !== STATE.INTRO;
  els.playRow.hidden = state === STATE.INTRO || topicEnded;
  if (topicEnded) return;

  const done = sequenceDone();
  els.nextBtn.disabled = !done;
  els.continueHint.hidden = done;

  if (state === STATE.AWAITING_CONNECT) {
    els.statusEl.textContent = FIRST_TARGET_INSTRUCTION;
    els.captionEl.textContent = '';
  }
}

function unsubscribeBoardListeners() {
  if (unsubscribeTap) { unsubscribeTap(); unsubscribeTap = null; }
}

/** Grubun GERÇEK, o anki ortak nefes noktaları — her zaman çapanın
    konumundan core/ruleEngine.js (getGroup/getLiberties) üzerinden. */
function currentGroupLiberties(context) {
  return context.boardAdapter.getLibertiesAt({ row: ANCHOR.row, col: ANCHOR.col });
}

/** Sıradaki hedefi (varsa) pointer hareketi BEKLENMEDEN ghost olarak
    gösterir; hedef kalmadıysa (sekans tamamlandıysa) ghost'u temizler. */
function showNextTargetGhost(context) {
  const target = getNextTarget(connectionsMade);
  if (target) context.boardAdapter.setMovePreview({ row: target.row, col: target.col, color: 'black' });
  else context.boardAdapter.clearMovePreview();
}

function statusTextFor(size, libertyCount) {
  return `Bu ${size} taş bir grup — birlikte ${libertyCount} nefes noktası var.`;
}

function handleTap(context, { row, col }) {
  if (topicEnded || state === STATE.INTRO || sequenceDone()) return;

  if (!isExpectedNextTarget(connectionsMade, { row, col })) {
    els.statusEl.textContent = WRONG_POINT_HINT;
    return; // gerçek state DEĞİŞMEZ — hedef dışı deneme taş bırakmaz, liberty işaretleri BOZULMAZ.
  }

  const result = context.boardAdapter.playMove({ row, col, color: 'black' });
  if (!result.ok) return; // savunma amaçlı — hedef noktalar zaten her zaman yasaldır.

  connectionsMade += 1;
  const size = groupSize();
  const newLiberties = currentGroupLiberties(context);
  const libertyCount = newLiberties.length;

  context.emit('scene_move_played', { row, col, color: 'black', groupSize: size, libertyCount, connectionNumber: connectionsMade });
  context.boardAdapter.showLiberties(newLiberties);
  context.emit('scene_liberties_shown', { row, col, groupSize: size, libertyCount });

  els.statusEl.textContent = statusTextFor(size, libertyCount);

  if (sequenceDone()) {
    context.boardAdapter.clearMovePreview();
    els.captionEl.textContent = '';
    // Savunma amaçlı nihai doğrulama — bkz. scenes/groupLibertyPolicy.js
    // dosya başı notu (yalnız groupSize===3 YETERLİ DEĞİL, nihai KONUM
    // curriculum'un doğrusal örneğiyle BİREBİR eşleşmeli).
    const placedPoints = [ANCHOR, ...Array.from({ length: connectionsMade }, (_, i) => getTargetAt(i))];
    if (matchesCurriculumSeed(placedPoints) && !unlockedEmitted) {
      unlockedEmitted = true;
      context.emit('scene_completion_unlocked', {});
    }
  } else {
    showNextTargetGhost(context);
    els.captionEl.textContent = NEXT_TARGET_INSTRUCTION;
  }
  state = STATE.CONNECTED;
  render();
}

/** i'inci (0-tabanlı) tamamlanmış bağlantı hedefi — canComplete/handleTap
    nihai board doğrulaması için (bkz. scenes/groupLibertyPolicy.js). */
function getTargetAt(i) {
  // TOTAL_CONNECTIONS sabit ve küçüktür (bu örnekte 2) — sırayla
  // getNextTarget(0..TOTAL_CONNECTIONS-1) tam tamamlanmış hedef listesini verir.
  return getNextTarget(i);
}

function goToNextTopic(context) {
  if (!sequenceDone() || topicEnded) return;
  topicEnded = true;
  context.boardAdapter.setInputEnabled(false);
  unsubscribeBoardListeners();
  topicEnd = mountTopicEndControls(context, { summaryText: SUMMARY_TEXT });
  render();
}

function buildDom(context) {
  const root = document.createElement('div');
  root.className = 'ls-strip-root';
  root.innerHTML = `
    <div class="ls-strip-row ls-strip-fade" id="s04-intro">
      <p class="ls-strip-text">${INTRO_TEXT}</p>
      <span class="ls-tick-wrap">
        <button type="button" class="ls-tick" id="s04-confirm" aria-label="Bilgiyi onayla">
          <svg class="ls-tick-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>
        </button>
        <span class="ls-tick-tip" aria-hidden="true">Onayla</span>
      </span>
    </div>
    <div class="ls-strip-row" id="s04-play" hidden>
      <span class="ls-strip-status" id="s04-status" role="status" aria-live="polite"></span>
      <span class="ls-strip-caption" id="s04-caption"></span>
      <button type="button" class="ls-strip-btn" id="s04-next" disabled aria-describedby="s04-continue-hint">Sonraki konu</button>
      <span class="ls-strip-caption" id="s04-continue-hint">${CONTINUE_DISABLED_HINT}</span>
    </div>
  `;
  context.container.appendChild(root);

  return {
    root,
    introRow: root.querySelector('#s04-intro'),
    confirmBtn: root.querySelector('#s04-confirm'),
    playRow: root.querySelector('#s04-play'),
    statusEl: root.querySelector('#s04-status'),
    captionEl: root.querySelector('#s04-caption'),
    nextBtn: root.querySelector('#s04-next'),
    continueHint: root.querySelector('#s04-continue-hint'),
  };
}

function on(el, type, handler) {
  el.addEventListener(type, handler);
  cleanupFns.push(() => el.removeEventListener(type, handler));
}

export const scene04GroupLiberties = {
  id: 'scene-04-group-liberties',
  version: 2,
  title: 'Grubun Nefesi',
  curriculumRef: { lessonId: 'l2', concept: 'liberty', stepIndex: 2 },

  mount(context) {
    resetState();
    cleanupFns = [];
    els = buildDom(context);

    context.boardAdapter.setSize(9);
    context.boardAdapter.reset();
    context.boardAdapter.focus('center');
    context.boardAdapter.setInputEnabled(false);
    context.boardAdapter.clearLiberties();
    // Çapa taş — curriculum grup örneğinin ilk taşı (bkz. dosya başı notu).
    // Board State'e her zaman yasal (boş tahta) — sonuç göz ardı edilebilir.
    context.boardAdapter.playMove({ row: ANCHOR.row, col: ANCHOR.col, color: 'black' });

    let confirming = false;
    on(els.confirmBtn, 'click', () => {
      if (confirming || state !== STATE.INTRO) return;
      confirming = true;
      els.confirmBtn.disabled = true;
      els.confirmBtn.classList.add('ls-confirmed');

      const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const doAdvance = () => {
        context.emit('scene_intro_confirmed', {});
        state = STATE.AWAITING_CONNECT;
        context.boardAdapter.setInputEnabled(true);
        unsubscribeTap = context.boardAdapter.onIntersectionTap(hit => handleTap(context, hit));
        // Çapanın GERÇEK nefes noktaları — "buraya bağlanabilirsin" görsel
        // referansı (bkz. dosya başı notu, currentGroupLiberties).
        context.boardAdapter.showLiberties(currentGroupLiberties(context));
        // İlk hedef ((4,4)) pointer hareketi BEKLENMEDEN ghost olarak görünür.
        showNextTargetGhost(context);
        render();
      };
      if (reduceMotion) { doAdvance(); return; }
      els.introRow.classList.add('ls-closing');
      setTimeout(doAdvance, 220);
    });

    on(els.nextBtn, 'click', () => goToNextTopic(context));

    render();
  },

  unmount(context) {
    context.boardAdapter.clearMovePreview();
    context.boardAdapter.clearLiberties();
    cleanupFns.forEach(fn => fn());
    cleanupFns = [];
    unsubscribeBoardListeners();
    topicEnd?.destroy();
    topicEnd = null;
    els?.root?.remove();
    els = null;
    resetState();
  },

  canComplete() {
    if (!sequenceDone()) return false;
    const placedPoints = [ANCHOR, ...Array.from({ length: connectionsMade }, (_, i) => getTargetAt(i))];
    return matchesCurriculumSeed(placedPoints);
  },

  complete() {
    // Runtime zaten scene_completed event'ini ve progress yazımını
    // yönetiyor — bu sahnenin tamamlanma ANINDA ek bir yan etkisi yok.
  },
};
