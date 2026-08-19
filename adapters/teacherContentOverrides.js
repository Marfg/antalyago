/**
 * adapters/teacherContentOverrides.js
 *
 * Teacher Studio v0.7 — teaching note local override'larının TEK
 * localStorage erişim noktası. `core/` DIŞINDA (localStorage bilir) —
 * `core/eventLog.js`/`core/studentModel.js`'in AYNI "saf core + browser
 * adapter" ayrımı deseni.
 *
 * BİLEREK yeni bir dizin: `ogren-3d.html` (Teacher Lab, retrieval'in
 * effective content'i OKUR) ve `teacher-studio.html` (RAG Content Browser,
 * override'ları YAZAR) AYNI localStorage anahtarına ihtiyaç duyan İKİ ayrı
 * HTML giriş noktasıdır — mantık iki yerde ayrı ayrı yazılmasın diye tek
 * bir paylaşılan modülde toplandı (bkz. spesifikasyon §34 "küçük bir
 * adapter/service kullan").
 *
 * UI bu adapter'ın DIŞINDA localStorage'a HİÇ dokunmamalı — yalnız
 * get/save/reset çağırmalı.
 */

const CONTENT_OVERRIDE_KEY = 'go_teacher_content_overrides_v1';

function safeParse(raw) {
  try {
    const parsed = JSON.parse(raw ?? 'null');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(overridesById) {
  try {
    localStorage.setItem(CONTENT_OVERRIDE_KEY, JSON.stringify(overridesById));
  } catch {
    // localStorage yazılamıyorsa (gizli mod, kota dolu vb.) sessizce yok say
    // — Teacher Lab her zaman BASE içerikle çalışmaya devam eder.
  }
}

export const teacherContentOverrides = {
  /** @returns {Object<string,object>} tüm override'ların ham map'i — {[id]: overrideFields} */
  loadAll() {
    try { return safeParse(localStorage.getItem(CONTENT_OVERRIDE_KEY)); }
    catch { return {}; }
  },

  /** @returns {object|null} tek bir content id'nin override alanları */
  get(id) {
    return this.loadAll()[id] ?? null;
  },

  /**
   * Bir content id için override alanlarını kaydeder. Validation burada
   * YAPILMAZ — çağıran taraf (Teacher Studio UI) kaydetmeden önce
   * core/contentOverrides.js'in applyOverride()'ıyla doğrulamalıdır; bu
   * adapter yalnızca ham veriyi taşır.
   * @param {string} id
   * @param {object} overrideFields
   */
  save(id, overrideFields) {
    const all = this.loadAll();
    all[id] = { ...overrideFields };
    writeAll(all);
  },

  /** Tek bir content id'nin override'ını kaldırır (base'e döner). */
  resetOne(id) {
    const all = this.loadAll();
    if (id in all) {
      delete all[id];
      writeAll(all);
    }
  },

  /** TÜM override'ları temizler. */
  resetAll() {
    try { localStorage.removeItem(CONTENT_OVERRIDE_KEY); } catch {}
  },
};
