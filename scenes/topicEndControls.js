/**
 * scenes/topicEndControls.js
 *
 * Sahne #1/#2/#3'ün ORTAK "konu sonu" davranışı (bkz. görev talimatı
 * Bölüm A). Her sahnenin kendi pedagojik hedefi karşılandığında (kendi
 * gating'ine göre — 3 tahta boyutu, 6 taş, 2 farklı bölge, vb.) BU
 * yardımcı BİR KEZ çağrılır:
 *
 *   topicEnd = mountTopicEndControls(context, { summaryText: '...' });
 *   // ...
 *   unmount() { topicEnd?.destroy(); ... }
 *
 * Sorumlulukları:
 *   1. `context.markComplete()`'i HEMEN çağırır — completion KALICI olarak
 *      işaretlenir (advance ETMEZ). Bu, "Her konu pedagojik hedefini
 *      karşıladığında teknik final ekranına anında geçme; alt anlatım
 *      şeridinde kısa ve doğal bir özet göster" gereksinimini karşılar.
 *   2. `context.container` içine sade bir özet satırı + iki kontrol
 *      (Bu konuyu tekrar et / Sonraki konu ya da Konular) ekler.
 *   3. "Bu konuyu tekrar et" → context.replayActive() (hızlı çift
 *      tıklamada İKİNCİ replay'i engelleyen bir kilitle).
 *   4. "Sonraki konu" (context.hasNextScene true ise) → context.advanceToNext().
 *      "Konular" (son kayıtlı sahnede) → context.openTopicsList().
 *
 * Kullanıcıya HİÇBİR ZAMAN runtime/scene terminolojisi (Sahne #N, scene,
 * completion, registry) GÖSTERMEZ — yalnız özet metni + iki düz buton.
 *
 * DOM'suz test EDİLEMEZ (gerçek buton/click gerektirir) — bu yüzden proje
 * kuralına göre yalnız Playwright ile test edilir (bkz. tests/verify-
 * learning-scenes.mjs), scene modülleri gibi.
 *
 * v0.14 — "Sonraki konu"/"Bu konuyu tekrar et" artık GERÇEK sahne
 * geçişini (context.advanceToNext()/replayActive()) doğrudan senkron
 * çağırmak yerine scenes/sceneTransition.js'in ORTAK crossfade
 * yardımcısıyla SARAR — bkz. o dosyanın başlık notu (kök neden: sahneler
 * arası ANLIK DOM değişimi, anlatım alanının içerik yüksekliğinde
 * belirgin bir sıçrama yaratıyordu). `core/sceneRuntime.js`'e VEYA
 * sahne modüllerine (scene01/02/03) HİÇ dokunulmadı — geçiş tamamen bu
 * ORTAK katmanda, `context.container`'ı sarmalayarak uygulanır.
 */

import { transitionSceneSwap } from './sceneTransition.js?v=2026-08-29.1';

/**
 * @param {object} context — sahnenin mount context'i (markComplete/
 *   advanceToNext/replayActive/hasNextScene/openTopicsList/container taşır)
 * @param {{summaryText: string}} options
 * @returns {{ destroy(): void }}
 */
export function mountTopicEndControls(context, { summaryText }) {
  context.markComplete();

  const row = document.createElement('div');
  row.className = 'ls-strip-row ls-topic-end';
  row.innerHTML = `
    <p class="ls-strip-text ls-topic-end-summary"></p>
    <div class="ls-topic-end-actions">
      <button type="button" class="ls-strip-btn ls-strip-btn--ghost" data-action="replay">Bu konuyu tekrar et</button>
      <button type="button" class="ls-strip-btn" data-action="advance"></button>
    </div>
  `;
  row.querySelector('.ls-topic-end-summary').textContent = summaryText;

  const replayBtn = row.querySelector('[data-action="replay"]');
  const advanceBtn = row.querySelector('[data-action="advance"]');
  advanceBtn.textContent = context.hasNextScene ? 'Sonraki konu' : 'Konular';

  // Hızlı çift tıklamada İKİNCİ bir replay/advance NAVİGASYONU üretmeyen
  // kilit — yalnız GERÇEK sahne geçişi yapan eylemler için (replay/Sonraki
  // konu). "Konular" bir navigasyon DEĞİL, sade bir panel açar — o yüzden
  // kilitlenmez (tekrar tıklanabilir kalması zararsız/idempotent).
  let navigated = false;
  function onReplayClick() {
    if (navigated) return;
    navigated = true;
    replayBtn.disabled = true;
    advanceBtn.disabled = true;
    transitionSceneSwap(context.container, () => context.replayActive());
  }
  function onAdvanceClick() {
    if (!context.hasNextScene) { context.openTopicsList?.(); return; }
    if (navigated) return;
    navigated = true;
    replayBtn.disabled = true;
    advanceBtn.disabled = true;
    transitionSceneSwap(context.container, () => context.advanceToNext());
  }
  replayBtn.addEventListener('click', onReplayClick);
  advanceBtn.addEventListener('click', onAdvanceClick);

  context.container.appendChild(row);

  return {
    destroy() {
      replayBtn.removeEventListener('click', onReplayClick);
      advanceBtn.removeEventListener('click', onAdvanceClick);
      row.remove();
    },
  };
}
