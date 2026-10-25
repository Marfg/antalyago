/**
 * scenes/welcomeIntro.js
 *
 * Öğrenme sahnelerinin karşılaması — bir öğrenme sahnesi DEĞİL, registry'de
 * yer almaz ve ilerleme kaydına dokunmaz. Sayfa açılınca kamera tahtaya
 * süzülür, birkaç taş düşüp bir açılış dizilimi kurar ve tek bir düğme
 * gösterilir. Düğmeye basınca taşlar kalkar, yazı söner ve `onStart`
 * çağrılır; sayfa aynı tahtada her zamanki ilk/sıradaki konuyu başlatır.
 * Sahne sırası, içerik ve formasyonlar bu modülden ETKİLENMEZ.
 *
 * Yazı DOM'u learning-scenes.html'de durur (#ls-welcome); bu modül yalnız
 * metni varyanta göre doldurur ve zamanlamayı yönetir.
 */

// Süs dizilimi (ders örneği DEĞİL): dört köşeye yayılan, çakışmasız bir
// 19×19 açılışı. Hepsi boş tahtada yasal; hiçbiri birbirini almaz.
export const WELCOME_STONES = [
  { col: 15, row: 3, color: 'black' },
  { col: 3, row: 15, color: 'white' },
  { col: 16, row: 15, color: 'black' },
  { col: 3, row: 3, color: 'white' },
  { col: 9, row: 15, color: 'black' },
  { col: 13, row: 2, color: 'white' },
  { col: 16, row: 5, color: 'black' },
  { col: 10, row: 2, color: 'white' },
  { col: 2, row: 9, color: 'black' },
  { col: 5, row: 16, color: 'white' },
  { col: 15, row: 10, color: 'black' },
  { col: 6, row: 3, color: 'white' },
];

const CAMERA = { yaw: 0.3, pitch: 1.0 };
const CAMERA_NARROW = { yaw: 0.16, pitch: 1.05 }; // dar ekranda tahta genişliğe sığar
const CAMERA_FROM = { yaw: 1.05, pitch: 0.62, distScale: 0.55 };
const CAMERA_DUR = 2.8;
const FIRST_STONE_MS = 700;
const STONE_GAP_MS = 190;
const EXIT_MS = 450;

/**
 * Karşılama gösterilsin mi? Doğrudan bir konuya giden bağlantılar
 * (`?scene=`, test kancaları) ve `?welcome=0` karşılamayı atlar;
 * `?welcome=1` her zaman gösterir. İlerlemesi olan öğrenci karşılamayı
 * tarayıcı oturumu başına bir kez görür.
 * @param {{params: URLSearchParams, hasProgress: boolean, seenThisSession: boolean}} input
 */
export function shouldShowWelcome({ params, hasProgress, seenThisSession }) {
  const flag = params.get('welcome');
  if (flag === '1') return true;
  if (flag === '0') return false;
  if (params.has('scene') || params.has('testScene') || params.has('exposeBoardAdapter')
    || params.has('forceMountError') || params.has('whiteMoveDelayMs')) return false;
  return !hasProgress || !seenThisSession;
}

/**
 * @param {{completedCount:number, total:number, nextTitle:string|null}} progress
 * @returns {{eyebrow:string, title:string, lead:string, action:string}}
 */
export function welcomeCopy({ completedCount, total, nextTitle }) {
  if (completedCount === 0) {
    return {
      eyebrow: 'Antalya GO · Öğrenme sahneleri',
      title: "Go'yu oynayarak öğren.",
      lead: `İlk taştan taktiklere ${total} kısa konu. Her adımı tahtada kendin oynarsın.`,
      action: 'Öğrenmeye başla',
    };
  }
  if (nextTitle) {
    return {
      eyebrow: 'Tekrar hoş geldin',
      title: 'Kaldığın yerden devam et.',
      lead: `${completedCount}/${total} konu tamam. Sıradaki: ${nextTitle}`,
      action: 'Devam et',
    };
  }
  return {
    eyebrow: 'Tekrar hoş geldin',
    title: 'Bütün konuları bitirdin.',
    lead: 'İstediğin konuyu Konular listesinden yeniden açabilirsin.',
    action: 'Son konuyu tekrar et',
  };
}

/**
 * @param {{root: HTMLElement, canvas: HTMLCanvasElement, boardAdapter: object,
 *   copy: ReturnType<typeof welcomeCopy>, onStart: () => void}} deps
 */
export function createWelcomeIntro({ root, canvas, boardAdapter, copy, onStart }) {
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const panel = root.querySelector('.ls-welcome-copy');
  const startBtn = root.querySelector('#ls-welcome-start');
  const timers = new Set();
  let active = false;
  let finishing = null;

  function later(fn, ms) {
    const id = setTimeout(() => { timers.delete(id); fn(); }, ms);
    timers.add(id);
  }
  function clearTimers() { for (const id of timers) clearTimeout(id); timers.clear(); }

  // Yazının tahtaya bindiği yükseklik — kamera tahtayı bunun üstüne sığdırır.
  function bottomInset() {
    const canvasBottom = canvas.getBoundingClientRect().bottom;
    return Math.max(0, canvasBottom - panel.offsetTop + 12);
  }
  const camera = () => (canvas.clientWidth < 640 ? CAMERA_NARROW : CAMERA);
  function onResize() {
    if (active) boardAdapter.frameBoard({ ...camera(), bottomInset: bottomInset(), duration: 0 });
  }

  function show() {
    active = true;
    root.querySelector('.ls-welcome-eyebrow').textContent = copy.eyebrow;
    root.querySelector('#ls-welcome-title').textContent = copy.title;
    root.querySelector('.ls-welcome-lead').textContent = copy.lead;
    startBtn.textContent = copy.action;
    root.hidden = false;
    document.body.classList.add('ls-welcome-open');

    boardAdapter.reset();
    boardAdapter.frameBoard({ ...camera(), bottomInset: bottomInset(), from: CAMERA_FROM, duration: CAMERA_DUR });
    if (reduceMotion) {
      for (const stone of WELCOME_STONES) boardAdapter.playMove(stone);
    } else {
      WELCOME_STONES.forEach((stone, i) => later(() => boardAdapter.playMove(stone), FIRST_STONE_MS + i * STONE_GAP_MS));
      later(() => boardAdapter.setDrift(true), CAMERA_DUR * 1000);
    }
    window.addEventListener('resize', onResize);
    requestAnimationFrame(() => root.classList.add('is-in'));
    startBtn.addEventListener('click', () => finish(), { once: true });
  }

  /** Karşılamayı kapatır ve konuyu başlatır; ikinci çağrı aynı sözü döndürür. */
  function finish() {
    if (finishing) return finishing;
    finishing = new Promise(resolve => {
      clearTimers();
      window.removeEventListener('resize', onResize);
      boardAdapter.setDrift(false);
      boardAdapter.sweepStones();
      root.classList.add('is-out');
      const done = () => {
        active = false;
        root.hidden = true;
        root.classList.remove('is-in', 'is-out');
        document.body.classList.remove('ls-welcome-open');
        onStart();
        resolve();
      };
      if (reduceMotion) done(); else setTimeout(done, EXIT_MS);
    });
    return finishing;
  }

  return { show, finish, isActive: () => active };
}
