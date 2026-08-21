/**
 * scenes/scene03LibertiesByPosition.js
 *
 * Konu #3 — "Taşların Nefesi". Kullanıcı SERBESTÇE keşfeder: boş 9×9
 * tahtada istediği herhangi bir kesişime siyah taş koyar, RuleEngine'in
 * hesapladığı GERÇEK nefes sayısını görür (köşe→2, kenar→3, iç→4).
 * Grup/bağlantı/capture/atari veya yatay-dikey taş bağlantısı konusuna
 * GİRİLMEZ.
 *
 * v0.11 — Bölüm C düzeltmesi (bkz. görev talimatı): eski "iki farklı
 * bölge görülmeden devam AÇILMAZ + ayrı 'Başka bir noktayı dene' düğmesi
 * ZORUNLU" akışı KALDIRILDI. Artık:
 *   - İlk yasal hamle TEK BAŞINA pedagojik hedefi karşılar (completion
 *     yalnız bir kez işaretlenir, "Sonraki konu" hemen aktif olur).
 *   - Board input İLK hamleden sonra da AÇIK kalır — kullanıcı doğrudan
 *     başka bir kesişime tıklayarak YENİ bir örnek seçebilir (ayrı bir
 *     "dene" düğmesine basmadan). Her yeni seçim `replaceExampleStone`
 *     ile tahtayı temiz tek-taşlı bir örneğe döndürür (bkz. adapters/
 *     sceneBoardAdapter.js) — önceki taşı gerçek Go'da HAREKET ETTİRMEZ,
 *     bağımsız bir yeni pedagojik örnek olarak ele alınır.
 *   - Hamle öncesi, pointer yasal bir boş kesişime yaklaştığında ince,
 *     yarı saydam bir "taş silueti" (ghost preview) gösterilir (bkz.
 *     boardAdapter.setMovePreview/clearMovePreview).
 *
 * Bölge sınıflandırması scenes/boardZones.js'in saf classifyBoardZone()'u
 * ile yapılır — YALNIZ pedagojik etiket/dinamik geri bildirim için;
 * GERÇEK nefes sayısı HER ZAMAN adapters/sceneBoardAdapter.js'in
 * getLibertiesAt() (core/ruleEngine.js) sonucudur, asla sabit metinden
 * türetilmez veya completion gating'i için kullanılmaz.
 *
 * Nefes vurguları artık eski `ogren-3d.html` referansıyla AYNI görsel
 * dili kullanır (turkuaz/cyan kısa ışık kolları — bkz. adapters/
 * sceneBoardAdapter.js drawLibertyMark) — kehribar halka KALDIRILDI.
 *
 * Konu sonu ORTAK scenes/topicEndControls.js kullanır (bkz. görev
 * talimatı Bölüm A) — yalnız kullanıcı "Sonraki konu"ya BASINCA mount
 * edilir; ilk hamleden hemen sonra DEĞİL (kullanıcı isterse durmadan
 * başka konumları incelemeye devam edebilsin diye).
 */

import { classifyBoardZone, EXPECTED_LIBERTY_COUNT_BY_ZONE } from './boardZones.js';
import { mountTopicEndControls } from './topicEndControls.js';

const STATE = {
  INTRO: 'intro',
  AWAITING_FIRST_MOVE: 'awaiting_first_move',
  SHOWING_EXAMPLE: 'showing_example', // en az bir örnek yerleşti; board YİNE DE tıklamaya açık
};

const INTRO_TEXT = 'Bir taşın yatay ve dikey komşu boş noktalarına nefes noktası denir.';
const MOVE_INSTRUCTION = 'Tahtada istediğin boş kesişime siyah bir taş yerleştir.';
const SECONDARY_HINT = 'İstersen başka bir kesişimi de deneyebilirsin.';
const CONTINUE_DISABLED_HINT = 'Devam etmek için tahtada bir kesişime taş yerleştir.';
const ZONE_SUBJECT = { corner: 'Köşedeki', edge: 'Kenardaki', interior: 'Tahtanın içindeki' };
const SUMMARY_TEXT = 'Taşın konumu, sahip olduğu nefes sayısını değiştirir.';

function resultText(zone, count) {
  return `${ZONE_SUBJECT[zone]} taşın ${count} nefes noktası var.`;
}

// Yalnız bu modülün kendi bellek-içi (oturumluk) durumu — mount() her
// zaman sıfırlar, unmount() temizler.
let state = STATE.INTRO;
let hasPlacedFirst = false;
let unlockedEmitted = false;
let exampleNumber = 0;
let topicEnded = false;
let topicEnd = null;
let els = null;
let cleanupFns = [];
let unsubscribeTap = null;
let unsubscribeHover = null;

function resetState() {
  state = STATE.INTRO;
  hasPlacedFirst = false;
  unlockedEmitted = false;
  exampleNumber = 0;
  topicEnded = false;
  topicEnd = null;
  unsubscribeTap = null;
  unsubscribeHover = null;
}

function render() {
  if (!els) return;
  els.introRow.hidden = state !== STATE.INTRO;
  els.playRow.hidden = state === STATE.INTRO || topicEnded;
  if (topicEnded) return;

  els.nextBtn.disabled = !hasPlacedFirst;
  els.continueHint.hidden = hasPlacedFirst;

  if (state === STATE.AWAITING_FIRST_MOVE) {
    els.statusEl.textContent = MOVE_INSTRUCTION;
    els.captionEl.textContent = '';
  }
}

function unsubscribeBoardListeners() {
  if (unsubscribeTap) { unsubscribeTap(); unsubscribeTap = null; }
  if (unsubscribeHover) { unsubscribeHover(); unsubscribeHover = null; }
}

function handleHover(context, hit) {
  if (topicEnded || state === STATE.INTRO || !hit) {
    context.boardAdapter.clearMovePreview();
    return;
  }
  if (!context.boardAdapter.isLegalMove({ row: hit.row, col: hit.col, color: 'black' })) {
    context.boardAdapter.clearMovePreview();
    return;
  }
  context.boardAdapter.setMovePreview({ row: hit.row, col: hit.col, color: 'black' });
}

function handleTap(context, { row, col }) {
  if (topicEnded || state === STATE.INTRO) return;

  // Her örnek BAĞIMSIZDIR (önceki taşı gerçek Go'da hareket ettirmiyoruz) —
  // replaceExampleStone tahtayı temiz tek-taşlı bir örneğe döndürüp yeni
  // hamleyi GERÇEK RuleEngine ile doğrular; başarısızsa (pratikte yalnız
  // tahta-dışı savunma durumu) hiçbir şey değişmez.
  const result = context.boardAdapter.replaceExampleStone({ row, col, color: 'black' });
  if (!result.ok) return;

  exampleNumber += 1;
  const size = context.boardAdapter.getSize();
  const zone = classifyBoardZone({ row, col, size });
  context.emit('scene_move_played', { row, col, zone, exampleNumber });
  if (exampleNumber > 1) {
    context.emit('scene_position_example_changed', { row, col, zone, exampleNumber });
  }

  const libs = context.boardAdapter.getLibertiesAt({ row, col });
  const count = libs.length;
  // Güvenlik ağı: sabit pedagojik beklentiyle gerçek sonuç UYUŞMAZSA asla
  // sessizce yanlış bilgi gösterme — metin HER ZAMAN gerçek `count`'u
  // kullanır, bu yalnız teşhis amaçlı bir konsol uyarısıdır.
  if (EXPECTED_LIBERTY_COUNT_BY_ZONE[zone] !== count) {
    // eslint-disable-next-line no-console
    console.warn('[scene-03-liberties-by-position] beklenmeyen nefes sayısı', { zone, expected: EXPECTED_LIBERTY_COUNT_BY_ZONE[zone], actual: count, row, col });
  }
  context.boardAdapter.showLiberties(libs);
  context.emit('scene_liberties_shown', { row, col, zone, libertyCount: count, exampleNumber });

  els.statusEl.textContent = resultText(zone, count);
  els.captionEl.textContent = SECONDARY_HINT;

  if (!hasPlacedFirst) {
    hasPlacedFirst = true;
    if (!unlockedEmitted) {
      unlockedEmitted = true;
      context.emit('scene_completion_unlocked', {});
    }
  }
  state = STATE.SHOWING_EXAMPLE;
  render();
}

function goToNextTopic(context) {
  if (!hasPlacedFirst || topicEnded) return;
  topicEnded = true;
  context.boardAdapter.setInputEnabled(false); // preview'ı da temizler (bkz. adaptör)
  unsubscribeBoardListeners();
  topicEnd = mountTopicEndControls(context, { summaryText: SUMMARY_TEXT });
  render();
}

function buildDom(context) {
  const root = document.createElement('div');
  root.className = 'ls-strip-root';
  root.innerHTML = `
    <div class="ls-strip-row ls-strip-fade" id="s03-intro">
      <p class="ls-strip-text">${INTRO_TEXT}</p>
      <span class="ls-tick-wrap">
        <button type="button" class="ls-tick" id="s03-confirm" aria-label="Bilgiyi onayla">
          <svg class="ls-tick-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>
        </button>
        <span class="ls-tick-tip" aria-hidden="true">Onayla</span>
      </span>
    </div>
    <div class="ls-strip-row" id="s03-play" hidden>
      <span class="ls-strip-status" id="s03-status" role="status" aria-live="polite"></span>
      <span class="ls-strip-caption" id="s03-caption"></span>
      <button type="button" class="ls-strip-btn" id="s03-next" disabled aria-describedby="s03-continue-hint">Sonraki konu</button>
      <span class="ls-strip-caption" id="s03-continue-hint">${CONTINUE_DISABLED_HINT}</span>
    </div>
  `;
  context.container.appendChild(root);

  return {
    root,
    introRow: root.querySelector('#s03-intro'),
    confirmBtn: root.querySelector('#s03-confirm'),
    playRow: root.querySelector('#s03-play'),
    statusEl: root.querySelector('#s03-status'),
    captionEl: root.querySelector('#s03-caption'),
    nextBtn: root.querySelector('#s03-next'),
    continueHint: root.querySelector('#s03-continue-hint'),
  };
}

function on(el, type, handler) {
  el.addEventListener(type, handler);
  cleanupFns.push(() => el.removeEventListener(type, handler));
}

export const scene03LibertiesByPosition = {
  id: 'scene-03-liberties-by-position',
  version: 1,
  title: 'Taşların Nefesi',
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
        state = STATE.AWAITING_FIRST_MOVE;
        context.boardAdapter.setInputEnabled(true);
        unsubscribeTap = context.boardAdapter.onIntersectionTap(hit => handleTap(context, hit));
        unsubscribeHover = context.boardAdapter.onIntersectionHover(hit => handleHover(context, hit));
        render();
      };
      if (reduceMotion) { doAdvance(); return; }
      els.introRow.classList.add('ls-closing');
      setTimeout(doAdvance, 220);
    });

    on(els.nextBtn, 'click', () => goToNextTopic(context));

    render();
  },

  unmount() {
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
    return hasPlacedFirst;
  },

  complete() {
    // Runtime zaten scene_completed event'ini ve progress yazımını
    // yönetiyor — bu sahnenin tamamlanma ANINDA ek bir yan etkisi yok.
  },
};
