/**
 * core/contentOverrides.js
 *
 * Teacher Studio v0.7 — yerel (localStorage-tabanlı) teaching note
 * override'larını BASE içerikle (core/contentStore.js) birleştirip
 * "effective" (retrieval'in gerçekte kullanacağı) içerik listesini üretir.
 *
 *   Base TEACHING_NOTES + Local Overrides → Effective Teaching Notes
 *
 * Statik GitHub Pages mimarisinde tarayıcı repository dosyasını
 * DEĞİŞTİREMEZ — bu yüzden override'lar hiçbir zaman `content/teacher-notes/*.js`
 * kaynak dosyalarını değiştirmez, yalnızca localStorage'da (bkz.
 * adapters/teacherContentOverrides.js) saklanır ve retrieval zamanında
 * BASE'in üzerine merge edilir.
 *
 * Saf: DOM yok, localStorage yok — girdi olarak zaten yüklenmiş base
 * entry'leri ve ham override map'ini alır, yeni bir dizi döndürür.
 * Geçersiz bir override asla effective listeye sızmaz (core/contentValidation.js
 * ile doğrulanır) — geçersizse sessizce BASE entry'ye düşer.
 */

import { validateContentEntry } from './contentValidation.js';

// İlk sürümde edit edilebilir alanlar (bkz. spesifikasyon §15). `id` ve
// `concept` BİLEREK read-only — retrieval identity/concept safety için kritik.
export const OVERRIDABLE_FIELDS = ['text', 'priority', 'studentStatus', 'tags'];

/**
 * Tek bir base entry'ye bir override uygular. Sonuç GEÇERSİZSE (mevcut
 * validateContentEntry ile) override sessizce reddedilir, base entry
 * DEĞİŞMEDEN döner — retrieval hiçbir zaman bozuk bir entry görmez.
 *
 * @param {object} baseEntry
 * @param {object|null|undefined} overrideFields — yalnız OVERRIDABLE_FIELDS içindekiler dikkate alınır
 * @returns {{entry:object, applied:boolean, invalidReason:string|null}}
 */
export function applyOverride(baseEntry, overrideFields) {
  if (!baseEntry) return { entry: baseEntry, applied: false, invalidReason: 'NO_BASE_ENTRY' };
  if (!overrideFields || typeof overrideFields !== 'object') {
    return { entry: baseEntry, applied: false, invalidReason: null };
  }

  const candidate = { ...baseEntry };
  for (const field of OVERRIDABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(overrideFields, field)) {
      candidate[field] = overrideFields[field];
    }
  }

  const result = validateContentEntry(candidate);
  if (!result.valid) {
    return { entry: baseEntry, applied: false, invalidReason: result.reason };
  }
  return { entry: candidate, applied: true, invalidReason: null };
}

/**
 * Tüm base listeye override map'ini uygular. Her entry'ye `source`
 * ('base'|'override') etiketi eklenir — Teacher Panel/Studio'nun hangi
 * metnin GERÇEKTEN kullanıldığını göstermesi için (bkz. spesifikasyon §38).
 * Bir override map'te olup da base'te KARŞILIĞI olmayan id'ler (silinmiş
 * bir content entry'sine ait kalıntı override) sessizce yok sayılır.
 *
 * @param {Array<object>} baseEntries
 * @param {Object<string,object>|null} overridesById — {[id]: overrideFields}
 * @returns {Array<object>} her biri `source` alanı taşıyan yeni entry listesi
 */
export function mergeContentOverrides(baseEntries, overridesById) {
  const overrides = overridesById && typeof overridesById === 'object' ? overridesById : {};
  return (baseEntries || []).map(base => {
    const override = overrides[base.id];
    if (!override) return { ...base, source: 'base' };
    const { entry, applied } = applyOverride(base, override);
    return applied ? { ...entry, source: 'override' } : { ...base, source: 'base' };
  });
}
