/**
 * scenes/sceneTransition.js
 *
 * Sahne #1/#2/#3 ORTAK, küçük ve yeniden kullanılabilir görsel geçiş
 * yardımcısı — sahneler arası DOM değişiminin (eski sahnenin kök DOM'u
 * kaldırılıp yenisinin eklenmesi) kullanıcıya ANLIK bir "kesinti" değil,
 * kısa ve sakin bir geçiş gibi görünmesini sağlar.
 *
 * KÖK NEDEN (bkz. görev talimatı Bölüm B): `core/sceneRuntime.js`'in
 * `advance()`/`start()`'ı tamamen SENKRON çalışır — eski sahnenin
 * `unmount()`'u kendi kök DOM'unu `container`'dan HEMEN kaldırır, yeni
 * sahnenin `mount()`'u kendi kök DOM'unu HEMEN ekler. Aradaki hiçbir
 * geçiş/animasyon YOKTU — `#ls-scene-host`'un doğal (auto) yüksekliği
 * içerik değiştikçe ANINDA sıçrıyordu.
 *
 * v0.15 — BİR ÖNCEKİ sürüm bu dosyada JS ile GEÇİCİ bir "height lock"
 * uyguluyordu (klon+crossfade sırasında container'ı eski/yeni içeriğin
 * büyük olanına kilitleyip sonda serbest bırakıyordu). Bu YANLIŞTI:
 * sıçramayı ORTADAN KALDIRMIYOR, yalnız geçişin SONUNA (cleanup anına)
 * ERTELİYORDU — kilit kalkınca `#ls-scene-host` yine auto yüksekliğe
 * (ör. ~84px→~40px) ANINDA düşüyordu, canlı ölçümle DOĞRULANDI. GERÇEK
 * kök neden düzeltmesi artık styles/learning-scenes.css'te: `#ls-scene-host`
 * KALICI bir `min-height: calc(var(--narration-h) - 1rem)` taşır — hangi
 * sahne/adım içeride olursa olsun dış kutu ARTIK İÇERİĞE göre KÜÇÜLMEZ.
 * Bu dosya artık HİÇBİR yükseklik/height stiliyle OYNAMAZ.
 *
 * Yükseklik kalıcı olarak sabit olduğundan, eski/yeni içeriği ÜST ÜSTE
 * bindirip bir "crossfade" ile gizlemeye de GEREK KALMADI — bu yüzden
 * KLON tabanlı yaklaşım TAMAMEN KALDIRILDI (bkz. görev talimatı Bölüm B
 * "klonsuz model... güvenle uygulanabiliyorsa klon yaklaşımını tamamen
 * kaldır"). Artık ARDIŞIK (sequential), klonsuz bir geçiş kullanılır:
 *   1. GERÇEK outgoing içerik (container'ın KENDİSİ) ~90ms'de opacity
 *      1→0 solar.
 *   2. Tamamen görünmez olduğu ANDA (fade bittikten SONRA) `swapFn()`
 *      TAM OLARAK BİR KEZ çağrılır — GERÇEK unmount+mount senkron çalışır.
 *      Eski ve yeni DOM ASLA aynı anda var OLMAZ; klon/duplicate id/
 *      aria-describedby çoğalması/odak çalma riski YOKTUR.
 *   3. GERÇEK incoming içerik ~110ms'de opacity 0→1 belirir.
 * Toplam süre ~200ms (görev talimatının 180–240ms hedefi içinde). Kısa
 * bir "tamamen görünmez" an KABUL EDİLEBİLİR (bkz. görev talimatı) —
 * board veya scene-host'un KENDİSİ (konumu/boyutu) bu sırada HİÇ hareket
 * ETMEZ, yalnız İÇERİĞİN opaklığı değişir.
 *
 * Eşzamanlılık: aynı `container` için aynı anda yalnız BİR geçiş çalışır
 * — üst üste gelen bir çağrı (ör. hızlı çift tıklama iki farklı olay
 * kaynağından tetiklense bile) ÖNCEKİ geçişin BİTMESİNİ bekler, `swapFn`
 * yine yalnız TOPLAMDA bir kez çağrılır.
 *
 * `prefers-reduced-motion: reduce` durumunda: hiçbir fade/bekleme
 * OLMADAN `swapFn()` anında çalışır, odak yine doğru incoming kontrole
 * taşınır — aynı son DOM/odak/sahne durumu, yalnız süresiz (bkz. görev
 * talimatı).
 */

const DEFAULT_FADE_OUT_MS = 90;
const DEFAULT_FADE_IN_MS = 110;

const pending = new WeakMap();

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** İlk odaklanabilir elemanı bulur — hangi sahne olduğunu BİLMEDEN, genel
    bir sözleşimle "anlamlı ilk kontrol"e odaklanabilmek için. */
function findFirstFocusable(root) {
  if (!root) return null;
  return root.querySelector('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
}

async function runTransition(container, swapFn, fadeOutMs, fadeInMs, focusIncoming) {
  const hasOutgoing = container.children.length > 0;

  if (!hasOutgoing || prefersReducedMotion()) {
    swapFn();
    const incoming = container.firstElementChild ?? null;
    if (focusIncoming) findFirstFocusable(incoming)?.focus();
    return incoming;
  }

  const prevTransition = container.style.transition;
  const prevOpacity = container.style.opacity;
  try {
    container.style.transition = `opacity ${fadeOutMs}ms ease`;
    // Zaten opacity:1 olan bir elemente 1→0'a geçiş uygulamak için tarayıcının
    // ÖNCE mevcut değeri "1" olarak COMMIT etmesi gerekir — bir sonraki
    // frame'e ertelenmiş bir rAF bunu garantiler (senkron style değişimi
    // + hemen ardından aynı değere set etme geçişi TETİKLEMEZ).
    await new Promise(resolve => requestAnimationFrame(resolve));
    container.style.opacity = '0';
    await wait(fadeOutMs);

    // Bu ANDA container TAMAMEN görünmezdir — eski ve yeni DOM ASLA aynı
    // anda var OLMAZ. swapFn TAM OLARAK BİR KEZ, GERÇEK unmount+mount'u
    // senkron çalıştırır.
    swapFn();

    const incoming = container.firstElementChild ?? null;
    container.style.transition = `opacity ${fadeInMs}ms ease`;
    await new Promise(resolve => requestAnimationFrame(resolve));
    container.style.opacity = '1';
    await wait(fadeInMs);

    if (focusIncoming) findFirstFocusable(incoming)?.focus();
    return incoming;
  } finally {
    // Geçici inline stiller HER ZAMAN temizlenir — hata olsa bile host
    // görünmez/kilitli KALMAZ (bkz. görev talimatı). Kalıcı yükseklik
    // CSS'i (styles/learning-scenes.css) bu fonksiyonun HİÇ bilmediği,
    // dokunmadığı ayrı bir katmandır.
    container.style.transition = prevTransition;
    container.style.opacity = prevOpacity;
  }
}

/**
 * `container`'ın (ör. `#ls-scene-host`) İÇİNDEKİ mevcut kök DOM'dan
 * yenisine ARDIŞIK (klonsuz) bir solma geçişiyle geçer. `swapFn` GERÇEK
 * unmount+mount işlemini (senkron) yapan çağırandır — bu yardımcı
 * swapFn'in NE yaptığını bilmez, yalnız `container`'ın GÖRÜNÜRLÜĞÜNÜ
 * çağırmadan önce/sonra sarar. Height/layout'a HİÇ dokunmaz (bkz. dosya
 * başı v0.15 notu — kalıcı yükseklik artık CSS'te).
 *
 * @param {HTMLElement} container
 * @param {() => void} swapFn
 * @param {{fadeOutMs?: number, fadeInMs?: number, focusIncoming?: boolean}} [options]
 * @returns {Promise<HTMLElement|null>} yeni kök DOM (varsa)
 */
export function transitionSceneSwap(container, swapFn, { fadeOutMs = DEFAULT_FADE_OUT_MS, fadeInMs = DEFAULT_FADE_IN_MS, focusIncoming = true } = {}) {
  if (!container) {
    swapFn();
    return Promise.resolve(null);
  }
  // Aynı container için aynı anda yalnız BİR geçiş — üst üste gelen
  // çağrılar ÖNCEKİNİN bitmesini bekler (bkz. dosya başı eşzamanlılık notu).
  const prior = pending.get(container) || Promise.resolve();
  const run = prior.then(
    () => runTransition(container, swapFn, fadeOutMs, fadeInMs, focusIncoming),
    () => runTransition(container, swapFn, fadeOutMs, fadeInMs, focusIncoming),
  );
  pending.set(container, run.catch(() => {}));
  return run;
}
