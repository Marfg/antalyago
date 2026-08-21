/**
 * scenes/scene03LibertiesByPosition.js
 *
 * Konu #3 — "Taşların Nefesi". Kullanıcı SERBESTÇE keşfeder: boş 9×9
 * tahtada istediği herhangi bir kesişime siyah taş koyar, RuleEngine'in
 * hesapladığı GERÇEK nefes sayısını görür (köşe→2, kenar→3, iç→4),
 * "Başka bir noktayı dene" ile sınırsız kez tekrar dener. Grup/bağlantı/
 * capture/atari veya yatay-dikey taş bağlantısı konusuna GİRİLMEZ.
 *
 * v0.10 — TAMAMEN YENİDEN YAZILDI (bkz. görev talimatı Bölüm B): eski
 * "yalnız merkez hamlesi → deterministik beyaz köşe hamlesi → merkez/köşe
 * karşılaştırma sorusu" akışı KALDIRILDI. Artık beyaz taş, corner-move
 * policy'si, karşılaştırma sorusu ve bunlara özgü event'ler YOK. Kullanıcı
 * yalnız KENDİ seçtiği konumları inceler; pedagojik hedef, en az İKİ
 * FARKLI bölge türünde (köşe/kenar/iç) geçerli bir taş yerleştirmektir —
 * merkeze veya belirli bir sıraya ZORLANMAZ.
 *
 * Bölge sınıflandırması scenes/boardZones.js'in saf classifyBoardZone()'u
 * ile yapılır — YALNIZ pedagojik etiket/keşif takibi için; GERÇEK nefes
 * sayısı HER ZAMAN adapters/sceneBoardAdapter.js'in getLibertiesAt()
 * (core/ruleEngine.js) sonucudur, asla sabit metinden türetilmez.
 *
 * Yeşil neon "rehber" sistemi GERİ GETİRİLMEDİ — kullanıcı kesişimleri
 * doğal tahta çizgileri ve taşın gerçek yerleşme davranışıyla bulur.
 * Nefes vurguları (ince, içi boş, kehribar tonlu halkalar) YALNIZ
 * kullanıcının SEÇTİĞİ taş için gösterilir, "oynanabilir hedef" DEĞİLDİR.
 *
 * Konu sonu (en az iki farklı bölge görüldüğünde) ORTAK
 * scenes/topicEndControls.js kullanır (bkz. görev talimatı Bölüm A).
 */

import { classifyBoardZone, EXPECTED_LIBERTY_COUNT_BY_ZONE } from './boardZones.js';
import { mountTopicEndControls } from './topicEndControls.js';

const STATE = {
  INTRO: 'intro',
  AWAITING_MOVE: 'awaiting_move',
  SHOWING_RESULT: 'showing_result', // "ready_for_retry_or_continue" ile aynı an — ek zamanlayıcı yok
};

const INTRO_TEXT = 'Bir taşın yatay ve dikey komşu boş noktalarına nefes noktası denir.';
const MOVE_INSTRUCTION = 'Tahtada istediğin boş kesişime siyah bir taş yerleştir.';
const ZONE_SUBJECT = { corner: 'Köşedeki', edge: 'Kenardaki', interior: 'Tahtanın içindeki' };
const ZONE_ACCUSATIVE = { corner: 'köşeyi', edge: 'kenarı', interior: 'tahtanın içini' };
const REQUIRED_DISTINCT_ZONES = 2;
const SUMMARY_TEXT = 'Taşın konumu, sahip olduğu nefes sayısını değiştirir.';

function resultText(zone, count) {
  return `${ZONE_SUBJECT[zone]} taşın ${count} nefes noktası var.`;
}
function suggestUnseenZone(zonesSeen) {
  const unseen = ['corner', 'edge', 'interior'].filter(z => !zonesSeen.has(z));
  if (unseen.length === 0 || unseen.length === 3) return '';
  return `Bir de ${unseen.map(z => ZONE_ACCUSATIVE[z]).join(' veya ')} deneyebilirsin.`;
}

// Yalnız bu modülün kendi bellek-içi (oturumluk) durumu — mount() her
// zaman sıfırlar, unmount() temizler.
let state = STATE.INTRO;
let zonesSeen = new Set();
let unlockedEmitted = false;
let topicEnded = false;
let topicEnd = null;
let els = null;
let cleanupFns = [];
let unsubscribeTap = null;

function resetState() {
  state = STATE.INTRO;
  zonesSeen = new Set();
  unlockedEmitted = false;
  topicEnded = false;
  topicEnd = null;
  unsubscribeTap = null;
}

function render() {
  if (!els) return;
  els.introRow.hidden = state !== STATE.INTRO;
  els.playRow.hidden = state === STATE.INTRO || topicEnded;
  if (topicEnded) return;

  els.retryBtn.hidden = state !== STATE.SHOWING_RESULT;
  els.nextBtn.hidden = state !== STATE.SHOWING_RESULT;
  if (state === STATE.SHOWING_RESULT) {
    els.nextBtn.disabled = zonesSeen.size < REQUIRED_DISTINCT_ZONES;
  }

  if (state === STATE.AWAITING_MOVE) {
    els.statusEl.textContent = MOVE_INSTRUCTION;
    els.captionEl.textContent = '';
  }
}

function handleTap(context, { row, col }) {
  if (state !== STATE.AWAITING_MOVE) return;
  if (!context.boardAdapter.isLegalMove({ row, col, color: 'black' })) return; // dolu/tahta dışı — hamle sayılmaz
  const result = context.boardAdapter.playMove({ row, col, color: 'black' });
  if (!result.ok) return;

  const size = context.boardAdapter.getSize();
  const zone = classifyBoardZone({ row, col, size });
  context.emit('scene_move_played', { row, col, zone });

  // Girdi, sonuç gösterilirken GEÇİCİ olarak kilitlenir — yeni bir taş
  // ancak "Başka bir noktayı dene" ile yeniden mümkün olur.
  context.boardAdapter.setInputEnabled(false);

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
  context.emit('scene_liberties_shown', { row, col, zone, libertyCount: count });

  zonesSeen.add(zone);
  if (zonesSeen.size >= REQUIRED_DISTINCT_ZONES && !unlockedEmitted) {
    unlockedEmitted = true;
    context.emit('scene_completion_unlocked', {});
  }

  els.statusEl.textContent = resultText(zone, count);
  els.captionEl.textContent = zonesSeen.size < REQUIRED_DISTINCT_ZONES ? suggestUnseenZone(zonesSeen) : '';
  state = STATE.SHOWING_RESULT;
  render();
}

function retry(context) {
  if (state !== STATE.SHOWING_RESULT) return;
  context.boardAdapter.reset(); // taşı + liberty halkalarını temizler
  context.emit('scene_position_retry_started', {});
  context.boardAdapter.setInputEnabled(true);
  state = STATE.AWAITING_MOVE;
  render();
}

function goToNextTopic(context) {
  if (state !== STATE.SHOWING_RESULT || zonesSeen.size < REQUIRED_DISTINCT_ZONES || topicEnded) return;
  topicEnded = true;
  context.boardAdapter.setInputEnabled(false);
  if (unsubscribeTap) { unsubscribeTap(); unsubscribeTap = null; }
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
      <button type="button" class="ls-strip-btn ls-strip-btn--ghost" id="s03-retry" hidden>Başka bir noktayı dene</button>
      <button type="button" class="ls-strip-btn" id="s03-next" hidden disabled>Sonraki konu</button>
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
    retryBtn: root.querySelector('#s03-retry'),
    nextBtn: root.querySelector('#s03-next'),
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
        render();
      };
      if (reduceMotion) { doAdvance(); return; }
      els.introRow.classList.add('ls-closing');
      setTimeout(doAdvance, 220);
    });

    on(els.retryBtn, 'click', () => retry(context));
    on(els.nextBtn, 'click', () => goToNextTopic(context));

    render();
  },

  unmount() {
    cleanupFns.forEach(fn => fn());
    cleanupFns = [];
    if (unsubscribeTap) { unsubscribeTap(); unsubscribeTap = null; }
    topicEnd?.destroy();
    topicEnd = null;
    els?.root?.remove();
    els = null;
    resetState();
  },

  canComplete() {
    return zonesSeen.size >= REQUIRED_DISTINCT_ZONES;
  },

  complete() {
    // Runtime zaten scene_completed event'ini ve progress yazımını
    // yönetiyor — bu sahnenin tamamlanma ANINDA ek bir yan etkisi yok.
  },
};
