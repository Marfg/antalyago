/**
 * scenes/scene01BoardIntro.js
 *
 * Konu #1 — "Tahtayı Tanı". Kullanıcının yeni öğrenme kabuğunda
 * karşılaştığı ilk konu: tek cümlelik bilgi kartı + üç gerçek tahta
 * boyutunun (9×9/13×13/19×19) keşfi.
 *
 * v0.9 — DOM'u ORTAK anlatım şeridi ilkelleriyle (ls-strip-row, ls-tick,
 * ls-pill, ls-strip-btn — bkz. styles/learning-scenes.css) kurar; artık
 * ayrı bir sağ/sol "bilgi paneli" YOK, board'un hemen altındaki tek
 * dikey şeritte gösterilir (bkz. görev talimatı Bölüm A). Boyut açıklama
 * kutuları (.s01-desc) BİLİNÇLİ olarak KALDIRILDI — kompakt, sabit
 * yükseklikli şeritte pill üzerindeki kısa alt-etiket (Başlangıç/Orta/
 * Standart) pedagojik özeti zaten taşıyor.
 *
 * v0.10 — Konu sonu davranışı ORTAK scenes/topicEndControls.js'e taşındı
 * (bkz. görev talimatı Bölüm A): üç boyut da görüldüğünde eski "Devam et"
 * düğmesi yerine context.markComplete() + kısa doğal özet + [Bu konuyu
 * tekrar et]/[Sonraki konu] gösterilir. `context.requestComplete()` ve
 * `scene:all-complete` DOM event'i ARTIK KULLANILMIYOR.
 *
 * Bu modül core/sceneRuntime.js'in {id,version,title,curriculumRef,mount,
 * unmount,canComplete,complete} sözleşmesini uygular. `boardSizesSeen` ve
 * `introConfirmed` BİLİNÇLİ olarak yalnız bu modülün kendi (oturumluk)
 * kapatılmış (closure) durumundadır — adapters/sceneProgressAdapter.js'e
 * YAZILMAZ (bkz. dosya başı persistence notu — yalnız scene COMPLETION
 * kalıcıdır, yarım kalan keşif reload'da sıfırlanır).
 *
 * DOM'u `context.container` (host'un sağladığı boş bir element) içine
 * KENDİSİ kurar; global bir sayfa değişkenine veya ogren-3d.html'in DOM
 * kimliklerine ASLA bağımlı değildir.
 */

import { mountTopicEndControls } from './topicEndControls.js?v=2026-08-23.2';

const BOARD_SIZES = [9, 13, 19];
const SIZE_LABELS = { 9: 'Başlangıç', 13: 'Orta', 19: 'Standart' };
const INTRO_TEXT = "Go, 19×19'luk bir tahta üzerinde oynanan iki kişilik bir strateji oyunudur.";
const DEFAULT_SIZE = 19;
const SUMMARY_TEXT = 'Go tahtalarının farklı boyutlarını gördük.';

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Yalnız bu modülün kendi bellek-içi (oturumluk) durumu — mount() her
// zaman sıfırlar, unmount() temizler.
let boardSizesSeen = new Set();
let introConfirmed = false;
let topicEnded = false;
let topicEnd = null;
let els = null; // mount sırasında doldurulan DOM referansları
let cleanupFns = [];

function render(context) {
  if (!els) return;
  const seenCount = boardSizesSeen.size;
  const allSeen = seenCount >= BOARD_SIZES.length;

  els.introRow.hidden = introConfirmed;
  els.exploreRow.hidden = !introConfirmed || topicEnded;

  if (allSeen && !topicEnded) {
    topicEnded = true;
    context.emit('scene_completion_unlocked', {});
    topicEnd = mountTopicEndControls(context, { summaryText: SUMMARY_TEXT });
    els.exploreRow.hidden = true;
    return;
  }
  if (topicEnded) return;

  els.dotsEl.innerHTML = BOARD_SIZES.map(s => `<span class="ls-strip-dot${boardSizesSeen.has(s) ? ' done' : ''}"></span>`).join('');

  const nextUnseen = BOARD_SIZES.find(s => !boardSizesSeen.has(s));
  els.pills.forEach(btn => {
    const size = Number(btn.dataset.size);
    btn.classList.toggle('seen', boardSizesSeen.has(size));
    btn.classList.toggle('next-hint', nextUnseen != null && size === nextUnseen && !boardSizesSeen.has(size));
  });

  els.statusEl.textContent = 'Üç tahta boyutunu da keşfet.';
  els.statusEl.classList.remove('success');
  els.progressText.textContent = `${seenCount}/${BOARD_SIZES.length}`;
}

function selectSize(context, size) {
  const wasSeen = boardSizesSeen.has(size);
  boardSizesSeen.add(size);

  context.boardAdapter.setSize(size);
  context.boardAdapter.reset();
  context.boardAdapter.focus(size === 19 ? 'board19' : 'overview');

  els.pills.forEach(btn => {
    const active = Number(btn.dataset.size) === size;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  });

  if (!wasSeen) {
    context.emit('scene_board_size_viewed', { boardSize: size });
  }
  render(context);
}

function buildDom(context) {
  const root = document.createElement('div');
  root.className = 'ls-strip-root';
  root.innerHTML = `
    <div class="ls-strip-row ls-strip-fade" id="s01-intro">
      <p class="ls-strip-text" id="s01-intro-text"></p>
      <span class="ls-tick-wrap">
        <button type="button" class="ls-tick" id="s01-confirm" aria-label="Bilgiyi onayla">
          <svg class="ls-tick-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>
        </button>
        <span class="ls-tick-tip" aria-hidden="true">Onayla</span>
      </span>
    </div>
    <div class="ls-strip-row" id="s01-explore" hidden>
      <span class="ls-strip-status" id="s01-status"></span>
      <span class="ls-strip-caption" id="s01-progress-text"></span>
      <div class="ls-pills" id="s01-pills" role="group" aria-label="Tahta boyutu seç"></div>
      <div class="ls-strip-dots" id="s01-dots" aria-hidden="true"></div>
    </div>
  `;
  context.container.appendChild(root);

  const pillsWrap = root.querySelector('#s01-pills');
  const pillButtons = BOARD_SIZES.map(size => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ls-pill';
    btn.dataset.size = String(size);
    btn.setAttribute('aria-pressed', 'false');
    btn.innerHTML = `${size}×${size}<span class="ls-pill-sub">${escapeHtml(SIZE_LABELS[size])}</span><span class="ls-pill-check" aria-hidden="true">✓</span>`;
    pillsWrap.appendChild(btn);
    return btn;
  });

  return {
    root,
    introRow: root.querySelector('#s01-intro'),
    introText: root.querySelector('#s01-intro-text'),
    confirmBtn: root.querySelector('#s01-confirm'),
    exploreRow: root.querySelector('#s01-explore'),
    pills: pillButtons,
    statusEl: root.querySelector('#s01-status'),
    progressText: root.querySelector('#s01-progress-text'),
    dotsEl: root.querySelector('#s01-dots'),
  };
}

function on(el, type, handler) {
  el.addEventListener(type, handler);
  cleanupFns.push(() => el.removeEventListener(type, handler));
}

export const scene01BoardIntro = {
  id: 'scene-01-board-intro',
  version: 1,
  title: 'Tahtayı Tanı',
  curriculumRef: { lessonId: 'l1', concept: 'board' },

  mount(context) {
    boardSizesSeen = new Set();
    introConfirmed = false;
    topicEnded = false;
    topicEnd = null;
    cleanupFns = [];
    els = buildDom(context);

    els.introText.textContent = INTRO_TEXT;

    // Başlangıçta 19×19 gerçek tahtayı göster (henüz "görüldü" sayılmadan —
    // kart onaylanınca otomatik görülmüş sayılır, bkz. confirm handler).
    context.boardAdapter.setSize(DEFAULT_SIZE);
    context.boardAdapter.reset();
    context.boardAdapter.focus('board19');
    els.pills.forEach(btn => {
      const active = Number(btn.dataset.size) === DEFAULT_SIZE;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    });

    let confirming = false;
    on(els.confirmBtn, 'click', () => {
      // scene_intro_confirmed'in TEK sefer üretilmesini garanti eden kilit —
      // tıklama, tekrar tıklama veya Enter/Space tekrarı (220ms'lik kapanış
      // penceresi içinde) event'i İKİNCİ KEZ üretemez.
      if (confirming || introConfirmed) return;
      confirming = true;
      els.confirmBtn.disabled = true;
      // Tick'in kendi kısa tamamlanma geri bildirimi (renk/ikon vurgusu) —
      // kartın kapanma geçişiyle EŞ ZAMANLI başlar.
      els.confirmBtn.classList.add('ls-confirmed');

      const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const doConfirm = () => {
        introConfirmed = true;
        context.emit('scene_intro_confirmed', {});
        // Satır kapanır kapanmaz kullanıcı zaten varsayılan (19×19) tahtayı
        // görüyor — bunu otomatik "görüldü" say (tıklama BEKLENMEZ).
        selectSize(context, DEFAULT_SIZE);
        render(context);
        const firstPill = els.pills.find(b => b.classList.contains('active')) || els.pills[0];
        if (firstPill) firstPill.focus();
      };
      if (reduceMotion) { doConfirm(); return; }
      els.introRow.classList.add('ls-closing');
      setTimeout(doConfirm, 220);
    });

    els.pills.forEach(btn => {
      on(btn, 'click', () => selectSize(context, Number(btn.dataset.size)));
    });

    render(context);
  },

  unmount() {
    cleanupFns.forEach(fn => fn());
    cleanupFns = [];
    topicEnd?.destroy();
    topicEnd = null;
    els?.root?.remove();
    els = null;
    boardSizesSeen = new Set();
    introConfirmed = false;
    topicEnded = false;
  },

  canComplete() {
    return introConfirmed && boardSizesSeen.size >= BOARD_SIZES.length;
  },

  complete() {
    // Runtime zaten scene_completed event'ini ve progress yazımını
    // yönetiyor — bu sahnenin tamamlanma ANINDA ek bir yan etkisi yok.
  },
};
