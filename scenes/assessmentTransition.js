/**
 * scenes/assessmentTransition.js
 *
 * Sahne #5'in İÇ değerlendirme geçişleri (1/5 → 2/5 → … → 5/5) için küçük,
 * odaklı bir fade yardımcısı. `scenes/sceneTransition.js` BİLEREK
 * kullanılmadı (bkz. görev talimatı Bölüm 6) — o yardımcı GERÇEK runtime
 * sahne değişimleri (`context.advanceToNext()`/`replayActive()`, tam
 * unmount+mount) için tasarlandı; Sahne #5 içindeki değerlendirme geçişleri
 * runtime açısından HİÇBİR şey DEĞİŞTİRMEZ — yalnız aynı sahnenin kendi DOM
 * içeriğini ve board seed'ini değiştirir. Bu yardımcı SAHNE GEÇİŞİ değildir.
 *
 * Sözleşme:
 *   await assessmentTransition({
 *     container,           // içeriği değiştirilecek DOM elemanı
 *     boardAdapter,         // girdiyi geçiş boyunca kilitlemek için
 *     renderNext,           // () => void — container'ı YENİ içerikle doldurur
 *     focusTarget,          // () => HTMLElement|null — geçiş sonunda odaklanılacak eleman
 *   });
 *
 * ~90ms fade-out → renderNext() (container temizlenip yeniden doldurulur,
 * board seed swap ÇAĞIRANIN renderNext içinde yapması beklenir) → ~110ms
 * fade-in → focus. reduced-motion'da SÜRESİZ, aynı uç durumla ANINDA
 * tamamlanır. Geçiş boyunca board input KAPALI tutulur (çağıran
 * setInputEnabled ile geçişten ÖNCE kapatmalı — bu yardımcı yalnız DOM/
 * odak/zamanlama yönetir, adaptör girdi state'ine doğrudan dokunmaz).
 */
const FADE_OUT_MS = 90;
const FADE_IN_MS = 110;

function reducedMotionActive() {
  return typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

/**
 * @param {{container: HTMLElement, renderNext: () => void, focusTarget?: () => (HTMLElement|null)}} opts
 * @returns {Promise<void>}
 */
export function assessmentTransition({ container, renderNext, focusTarget }) {
  return new Promise(resolve => {
    const reduce = reducedMotionActive();
    const finish = () => {
      renderNext();
      container.classList.remove('ls-assessment-fade-out');
      if (reduce) {
        resolve();
        return;
      }
      container.classList.add('ls-assessment-fade-in');
      setTimeout(() => {
        container.classList.remove('ls-assessment-fade-in');
        focusTarget?.()?.focus?.();
        resolve();
      }, FADE_IN_MS);
    };

    if (reduce) {
      finish();
      focusTarget?.()?.focus?.();
      return;
    }
    container.classList.add('ls-assessment-fade-out');
    setTimeout(finish, FADE_OUT_MS);
  });
}
