/**
 * scenes/scene04GroupLiberties.js
 *
 * Konu #4 — "Grubun Nefesi". Müfredat kaynağı: core/curriculum.js, l2
 * "Nefes Noktaları" dersinin `steps[2]` (kullanıcıya görünen "3. adım").
 * O adımın ORİJİNAL (pasif) tanımı curriculum.js'te SADECE bir örnek
 * olarak kalır — sahne artık bu örneği ZORUNLU KILMAZ (bkz. v0.17 notu).
 *
 * v0.17 — kök neden düzeltmesi (bkz. görev talimatı): önceki sürüm
 * curriculum'un ÜÇ TAŞLI DOĞRUSAL örneğini SIRALI, ZORUNLU bir hedef
 * listesine çeviriyordu — kullanıcı yalnız (4,4) sonra (4,5)'e
 * tıklayabiliyordu; L/T/dallanan şekiller REDDEDİLİYORDU. Bu, sahnenin
 * "bir örnek ezberlet" laboratuvarına dönüşmesine yol açtı. Artık:
 *   - Kullanıcı tek çapa taşıyla başlar, grubun GERÇEK nefes
 *     noktalarından HERHANGİ birine (istediği sırada) tıklayarak
 *     3-7 taşlık İSTEDİĞİ bağlı şekli serbestçe kurar (bkz.
 *     scenes/groupLibertyPolicy.js canAddStone/isSelectableLibertyPoint).
 *   - Ghost artık ZORUNLU/varsayılan değil — yalnız pointer GERÇEKTEN
 *     bir nefes noktasının üzerine geldiğinde görünür (bkz. handleHover).
 *   - completion grup İLK KEZ 3 taşa ulaştığında açılır (tam bir kez);
 *     kullanıcı isterse 7'ye kadar eklemeye devam edebilir, 8. taş
 *     HİÇBİR KOŞULDA eklenmez (bkz. scenes/groupLibertyPolicy.js
 *     MIN_GROUP_SIZE/MAX_GROUP_SIZE).
 *
 * v0.16 (eski, artık geçersiz): sabit `(4,3)→(4,4)→(4,5)` sırası +
 * `matchesCurriculumSeed()` completion şartı — bkz. yukarıdaki not.
 *
 * v0.18 — `version: 3 → 4`. Davranış AYNI (v0.17'nin serbest keşif
 * mantığı değişmedi) — yalnız GitHub Pages/CDN'in .js dosyalarına
 * uyguladığı saatlerce süren Cache-Control yüzünden bir kullanıcının
 * tarayıcısında hâlâ ÖNCEKİ (sıralı/zorunlu) modülün çalışıyor olabildiği
 * kök neden düzeltmesinin bir parçası (bkz. core/releaseVersion.js,
 * scripts/stamp-scene-release.mjs). `sceneVersion:4` event payload'ında
 * görünür — Diagnostics/Event Log'da "gerçekten yeni kod mu çalışıyor"
 * ayrımını KANITLANABİLİR yapar.
 *
 * TERMİNOLOJİ (bkz. görev talimatı Bölüm 1): kullanıcıya gösterilen HİÇBİR
 * metinde "özgürlük/özgürlüğü/serbestlik" veya İngilizce "liberty/liberties"
 * KULLANILMAZ — yalnız "nefes noktası"/"nefes noktaları". İç teknik
 * sözleşmeler (concept ID 'liberty', `libertyCount`, `getLibertiesAt`,
 * event payload alanları, RuleEngine API'leri) BİLEREK değiştirilmedi —
 * bunlar kod-içi tanımlayıcılardır, kullanıcıya hiç gösterilmez.
 *
 * Sayılar HER ZAMAN core/ruleEngine.js'in (getGroup+getLiberties, adaptör
 * üzerinden getLibertiesAt) gerçek sonucudur — sabit metinden ÜRETİLMEZ.
 */

import { mountTopicEndControls } from './topicEndControls.js?v=2026-09-02.1';
import { ANCHOR, MIN_GROUP_SIZE, MAX_GROUP_SIZE, shapeSignature, isConnectedSingleGroup } from './groupLibertyPolicy.js?v=2026-09-02.1';

const STATE = {
  INTRO: 'intro',
  AWAITING_MOVE: 'awaiting_move',
  PLAYING: 'playing',
};

const INTRO_TEXT = 'Yatay veya dikey bitişik taşlar bir grup oluşturur. Grubun nefes noktaları, grubun çevresindeki boş kesişimlerdir.';
const MOVE_INSTRUCTION = 'Turkuaz işaretli nefes noktalarından birine tıklayarak gruba yeni bir taş ekle.';
const WRONG_POINT_HINT = 'Yeni taşı turkuazla gösterilen nefes noktalarından birine yerleştir.';
const BELOW_MIN_HINT = 'Örüntüyü görmek için grubu en az 3 taşa ulaştır.';
const CONTINUE_OPTIONAL_HINT = 'Grubun şeklini değiştirmek için istersen taş eklemeye devam edebilirsin.';
const MAX_REACHED_HINT = 'Yedi taşlık örüntünü oluşturdun.';
const SUMMARY_TEXT = 'Grup nefesi, taşların nefeslerini ayrı ayrı toplamak değil, grubun çevresindeki tekil boş noktalardır. Aynı boş kesişim yalnız bir kez sayılır.';

let state = STATE.INTRO;
/** @type {Array<{row:number,col:number}>} — çapa dahil, kullanıcının kurduğu GERÇEK şekil. */
let placedPoints = [];
let unlockedEmitted = false;
let topicEnded = false;
let topicEnd = null;
let els = null;
let cleanupFns = [];
let unsubscribeTap = null;
let unsubscribeHover = null;

function resetState() {
  state = STATE.INTRO;
  placedPoints = [];
  unlockedEmitted = false;
  topicEnded = false;
  topicEnd = null;
  unsubscribeTap = null;
  unsubscribeHover = null;
}

function groupSize() { return placedPoints.length; }
function atMax() { return groupSize() >= MAX_GROUP_SIZE; }
function meetsMin() { return groupSize() >= MIN_GROUP_SIZE; }

function render() {
  if (!els) return;
  els.introRow.hidden = state !== STATE.INTRO;
  els.playRow.hidden = state === STATE.INTRO || topicEnded;
  if (topicEnded) return;

  const done = meetsMin();
  els.nextBtn.disabled = !done;
  els.continueHint.hidden = done;

  if (state === STATE.AWAITING_MOVE && groupSize() === 1) {
    els.statusEl.textContent = MOVE_INSTRUCTION;
    els.captionEl.textContent = '';
  }
}

function unsubscribeBoardListeners() {
  if (unsubscribeTap) { unsubscribeTap(); unsubscribeTap = null; }
  if (unsubscribeHover) { unsubscribeHover(); unsubscribeHover = null; }
}

/** Grubun GERÇEK, o anki ortak nefes noktaları — çapanın konumundan
    core/ruleEngine.js (getGroup/getLiberties, adaptör üzerinden) alınır.
    Çapa her zaman grubun bir üyesidir, bu yüzden hangi şekil kurulursa
    kurulsun AYNI (doğru) grubu döndürür. */
function currentGroupLiberties(context) {
  return context.boardAdapter.getLibertiesAt({ row: ANCHOR.row, col: ANCHOR.col });
}

function isValidSelection(context, hit) {
  if (!hit || atMax()) return false;
  return currentGroupLiberties(context).some(l => l.row === hit.row && l.col === hit.col);
}

function statusTextFor(size, libertyCount) {
  return `Bu ${size} taş bir grup — birlikte ${libertyCount} nefes noktası var.`;
}

/** Yalnız pointer GERÇEKTEN bir nefes noktasının üzerine geldiğinde ghost
    gösterir — zorunlu/varsayılan hedef YOK (bkz. dosya başı notu). */
function handleHover(context, hit) {
  if (topicEnded || state === STATE.INTRO) { context.boardAdapter.clearMovePreview(); return; }
  if (!isValidSelection(context, hit)) { context.boardAdapter.clearMovePreview(); return; }
  context.boardAdapter.setMovePreview({ row: hit.row, col: hit.col, color: 'black' });
}

function closeInput(context) {
  context.boardAdapter.setInputEnabled(false); // preview'ı da temizler (bkz. adaptör sözleşmesi)
  unsubscribeBoardListeners();
}

function handleTap(context, hit) {
  if (topicEnded || state === STATE.INTRO) return;
  if (!isValidSelection(context, hit)) {
    els.statusEl.textContent = WRONG_POINT_HINT;
    return; // gerçek state DEĞİŞMEZ — hedef dışı deneme taş bırakmaz, liberty işaretleri BOZULMAZ.
  }

  const result = context.boardAdapter.playMove({ row: hit.row, col: hit.col, color: 'black' });
  if (!result.ok) return; // savunma amaçlı — seçilebilir nefes noktaları zaten her zaman yasaldır.

  placedPoints.push({ row: hit.row, col: hit.col });
  const size = groupSize();
  const newLiberties = currentGroupLiberties(context);
  const libertyCount = newLiberties.length;
  const connectionNumber = size - 1; // çapadan sonraki kaçıncı kullanıcı hamlesi

  context.emit('scene_move_played', {
    row: hit.row, col: hit.col, color: 'black',
    groupSize: size, libertyCount, connectionNumber,
    shapeSignature: shapeSignature(placedPoints),
  });
  context.boardAdapter.showLiberties(newLiberties);
  context.emit('scene_liberties_shown', { groupSize: size, libertyCount });
  context.boardAdapter.clearMovePreview(); // yeni hover gerekir — eski hedefin ghost'u kalıntı bırakmaz.

  els.statusEl.textContent = statusTextFor(size, libertyCount);

  if (size === MIN_GROUP_SIZE && !unlockedEmitted) {
    unlockedEmitted = true;
    context.emit('scene_completion_unlocked', {});
  }

  if (atMax()) {
    els.captionEl.textContent = MAX_REACHED_HINT;
    closeInput(context);
  } else if (meetsMin()) {
    els.captionEl.textContent = CONTINUE_OPTIONAL_HINT;
  } else {
    els.captionEl.textContent = '';
  }

  state = STATE.PLAYING;
  render();
}

function goToNextTopic(context) {
  if (!meetsMin() || topicEnded) return;
  topicEnded = true;
  closeInput(context);
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
      <span class="ls-strip-caption" id="s04-continue-hint">${BELOW_MIN_HINT}</span>
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
  version: 4,
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
    // Çapa taş — serbest keşfin başlangıç noktası (bkz. dosya başı notu).
    // Board State'e her zaman yasal (boş tahta) — sonuç göz ardı edilebilir.
    context.boardAdapter.playMove({ row: ANCHOR.row, col: ANCHOR.col, color: 'black' });
    placedPoints = [{ row: ANCHOR.row, col: ANCHOR.col }];

    let confirming = false;
    on(els.confirmBtn, 'click', () => {
      if (confirming || state !== STATE.INTRO) return;
      confirming = true;
      els.confirmBtn.disabled = true;
      els.confirmBtn.classList.add('ls-confirmed');

      const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const doAdvance = () => {
        context.emit('scene_intro_confirmed', {});
        state = STATE.AWAITING_MOVE;
        context.boardAdapter.setInputEnabled(true);
        unsubscribeTap = context.boardAdapter.onIntersectionTap(hit => handleTap(context, hit));
        unsubscribeHover = context.boardAdapter.onIntersectionHover(hit => handleHover(context, hit));
        // Çapanın GERÇEK nefes noktaları — hepsi seçilebilir hedeftir,
        // hepsi turkuaz işaretlenir (bkz. dosya başı notu).
        context.boardAdapter.showLiberties(currentGroupLiberties(context));
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
    return meetsMin() && isConnectedSingleGroup(placedPoints);
  },

  complete() {
    // Runtime zaten scene_completed event'ini ve progress yazımını
    // yönetiyor — bu sahnenin tamamlanma ANINDA ek bir yan etkisi yok.
  },
};
