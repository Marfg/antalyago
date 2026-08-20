/**
 * scenes/scene01BoardIntro.js
 *
 * Sahne #1 — "Tahtaları Tanı". Kullanıcının yeni öğrenme kabuğunda
 * karşılaştığı ilk sahne: tek cümlelik bilgi kartı + üç gerçek tahta
 * boyutunun (9×9/13×13/19×19) keşfi.
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

const BOARD_SIZES = [9, 13, 19];
const SIZE_LABELS = { 9: 'Başlangıç', 13: 'Orta', 19: 'Standart' };
const SIZE_DESCS = {
  9: 'Daha az kesişim, daha hızlı oyun. Temel kuralları ve yakın mücadeleyi öğrenmek için ideal.',
  13: 'Alan genişler, kararlar çoğalır. Yerel mücadele ile tahta geneli arasında geçiş başlar.',
  19: 'Profesyonel standart tahta. Tam strateji derinliği ve uzun oyunlar için.',
};
const INTRO_TEXT = "Go, 19×19'luk bir tahta üzerinde oynanan iki kişilik bir strateji oyunudur.";
const DEFAULT_SIZE = 19;

function gridIconSvg(size) {
  const n = size === 9 ? 4 : size === 13 ? 5 : 7;
  const w = 22, step = w / (n - 1);
  let lines = '';
  for (let i = 0; i < n; i++) {
    const p = (i * step).toFixed(1);
    lines += `<line x1="${p}" y1="0" x2="${p}" y2="${w}"/><line x1="0" y1="${p}" x2="${w}" y2="${p}"/>`;
  }
  return `<svg class="s01-grid" width="22" height="22" viewBox="0 0 ${w} ${w}" aria-hidden="true"><g stroke="currentColor" stroke-width=".7" opacity=".6">${lines}</g></svg>`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Yalnız bu modülün kendi bellek-içi (oturumluk) durumu — mount() her
// zaman sıfırlar, unmount() temizler.
let boardSizesSeen = new Set();
let introConfirmed = false;
let els = null; // mount sırasında doldurulan DOM referansları
let cleanupFns = [];

function render(context) {
  if (!els) return;
  const seenCount = boardSizesSeen.size;
  const allSeen = seenCount >= BOARD_SIZES.length;

  els.introCard.hidden = introConfirmed;
  els.exploreWrap.hidden = !introConfirmed;

  els.dotsEl.innerHTML = BOARD_SIZES.map(s => `<span class="s01-dot${boardSizesSeen.has(s) ? ' done' : ''}"></span>`).join('');
  els.progressText.textContent = `${seenCount}/${BOARD_SIZES.length} tahta keşfedildi`;

  const nextUnseen = BOARD_SIZES.find(s => !boardSizesSeen.has(s));
  els.cards.forEach(btn => {
    const size = Number(btn.dataset.size);
    btn.classList.toggle('seen', boardSizesSeen.has(size));
    btn.classList.toggle('next-hint', nextUnseen != null && size === nextUnseen && !boardSizesSeen.has(size));
  });

  if (allSeen) {
    els.reasonEl.textContent = 'Tahtaları tanıdın.';
    els.reasonEl.classList.add('success');
    els.continueBtn.disabled = false;
    els.continueBtn.removeAttribute('aria-disabled');
  } else {
    const remaining = BOARD_SIZES.length - seenCount;
    els.reasonEl.textContent = remaining === BOARD_SIZES.length
      ? 'Devam etmek için üç tahta boyutunu da keşfet.'
      : `Devam etmek için ${remaining} tahta boyutu daha keşfet.`;
    els.reasonEl.classList.remove('success');
    els.continueBtn.disabled = true;
    els.continueBtn.setAttribute('aria-disabled', 'true');
  }
}

function selectSize(context, size) {
  const wasSeen = boardSizesSeen.has(size);
  boardSizesSeen.add(size);

  context.boardAdapter.setSize(size);
  context.boardAdapter.reset();
  context.boardAdapter.focus(size === 19 ? 'board19' : 'overview');

  els.cards.forEach(btn => {
    const active = Number(btn.dataset.size) === size;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
  els.descEl.textContent = SIZE_DESCS[size];

  if (!wasSeen) {
    context.emit('scene_board_size_viewed', { boardSize: size });
  }
  render(context);
  if (!wasSeen && boardSizesSeen.size === BOARD_SIZES.length) {
    context.emit('scene_completion_unlocked', {});
  }
}

function buildDom(context) {
  const root = document.createElement('div');
  root.className = 's01-root';
  root.innerHTML = `
    <div class="s01-intro" id="s01-intro">
      <div class="s01-intro-card">
        <p id="s01-intro-text"></p>
        <span class="s01-tick-wrap">
          <button type="button" class="s01-tick" id="s01-confirm" aria-label="Bilgiyi onayla">
            <svg class="s01-tick-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>
          </button>
          <span class="s01-tick-tip" aria-hidden="true">Onayla</span>
        </span>
      </div>
    </div>
    <div class="s01-explore" id="s01-explore" hidden>
      <div class="s01-label">Üç tahta boyutunu da keşfet.</div>
      <div class="s01-cards" role="group" aria-label="Tahta boyutu seç"></div>
      <div class="s01-desc" id="s01-desc"></div>
      <div class="s01-progress" role="status" aria-live="polite">
        <span class="s01-dots" id="s01-dots"></span>
        <span class="s01-progress-text" id="s01-progress-text"></span>
      </div>
      <div class="s01-continue-wrap">
        <p class="s01-continue-reason" id="s01-continue-reason"></p>
        <button type="button" class="s01-continue-btn" id="s01-continue" disabled aria-describedby="s01-continue-reason">Devam et</button>
      </div>
    </div>
  `;
  context.container.appendChild(root);

  const cardsWrap = root.querySelector('.s01-cards');
  const cardButtons = BOARD_SIZES.map(size => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 's01-card';
    btn.dataset.size = String(size);
    btn.setAttribute('aria-pressed', 'false');
    btn.innerHTML = `${size}×${size}${gridIconSvg(size)}<span class="s01-sub">${escapeHtml(SIZE_LABELS[size])}</span><span class="s01-check" aria-hidden="true">✓</span>`;
    cardsWrap.appendChild(btn);
    return btn;
  });

  return {
    root,
    introCard: root.querySelector('#s01-intro'),
    introText: root.querySelector('#s01-intro-text'),
    confirmBtn: root.querySelector('#s01-confirm'),
    exploreWrap: root.querySelector('#s01-explore'),
    cards: cardButtons,
    descEl: root.querySelector('#s01-desc'),
    dotsEl: root.querySelector('#s01-dots'),
    progressText: root.querySelector('#s01-progress-text'),
    reasonEl: root.querySelector('#s01-continue-reason'),
    continueBtn: root.querySelector('#s01-continue'),
  };
}

function on(el, type, handler) {
  el.addEventListener(type, handler);
  cleanupFns.push(() => el.removeEventListener(type, handler));
}

export const scene01BoardIntro = {
  id: 'scene-01-board-intro',
  version: 1,
  title: 'Tahtaları Tanı',
  curriculumRef: { lessonId: 'l1', concept: 'board' },

  mount(context) {
    boardSizesSeen = new Set();
    introConfirmed = false;
    cleanupFns = [];
    els = buildDom(context);

    els.introText.textContent = INTRO_TEXT;

    // Başlangıçta 19×19 gerçek tahtayı göster (henüz "görüldü" sayılmadan —
    // kart onaylanınca otomatik görülmüş sayılır, bkz. confirm handler).
    context.boardAdapter.setSize(DEFAULT_SIZE);
    context.boardAdapter.reset();
    context.boardAdapter.focus('board19');
    els.cards.forEach(btn => {
      const active = Number(btn.dataset.size) === DEFAULT_SIZE;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
    els.descEl.textContent = SIZE_DESCS[DEFAULT_SIZE];

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
      els.confirmBtn.classList.add('s01-confirmed');

      const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const doConfirm = () => {
        introConfirmed = true;
        context.emit('scene_intro_confirmed', {});
        // Kart kapanır kapanmaz kullanıcı zaten varsayılan (19×19) tahtayı
        // görüyor — bunu otomatik "görüldü" say (tıklama BEKLENMEZ).
        selectSize(context, DEFAULT_SIZE);
        render(context);
        const firstCard = els.cards.find(b => b.classList.contains('active')) || els.cards[0];
        if (firstCard) firstCard.focus();
      };
      if (reduceMotion) { doConfirm(); return; }
      els.introCard.classList.add('s01-closing');
      setTimeout(doConfirm, 220);
    });

    els.cards.forEach(btn => {
      on(btn, 'click', () => selectSize(context, Number(btn.dataset.size)));
    });

    on(els.continueBtn, 'click', () => {
      if (els.continueBtn.disabled) return;
      const result = context.requestComplete();
      // Host'a (learning-scenes.html) "sıradaki sahne yok" bilgisini bir
      // DOM event'iyle iletiyoruz — bu modül host'un "sahne bitti" UI'ının
      // ŞEKLİNİ bilmek zorunda kalmasın diye (ayrım korunuyor).
      if (result?.advance?.done) {
        context.container.dispatchEvent(new CustomEvent('scene:all-complete', { bubbles: true }));
      }
    });

    render(context);
  },

  unmount() {
    cleanupFns.forEach(fn => fn());
    cleanupFns = [];
    els?.root?.remove();
    els = null;
    boardSizesSeen = new Set();
    introConfirmed = false;
  },

  canComplete() {
    return introConfirmed && boardSizesSeen.size >= BOARD_SIZES.length;
  },

  complete() {
    // Runtime zaten scene_completed event'ini ve progress yazımını
    // yönetiyor — bu sahnenin tamamlanma ANINDA ek bir yan etkisi yok.
  },
};
