/**
 * scenes/sceneRegistry.js
 *
 * Sahne kayıt defteri. DOM/localStorage yok — saf, test edilebilir.
 *
 * Sorumluluklar:
 *   - Sahne sırasını belirlemek (kayıt sırası = tamamlanma sırası).
 *   - Sahne kimliklerini tekilleştirmek (duplicate ID sessizce YOK SAYILMAZ
 *     — `issues`'a eklenir, Teacher Studio Diagnostics bunu okur).
 *   - Bilinmeyen/eksik sözleşmeli sahne tanımlarını doğrulamak.
 *   - `next(id)` ile bir sonraki sahneyi çözmek.
 *
 * Şu an yalnız Sahne #1 kayıtlı — mimariyi göstermek için sahte bir
 * Sahne #2 EKLENMEDİ (bkz. görev talimatı).
 */

const REQUIRED_METHODS = ['mount', 'unmount', 'canComplete', 'complete'];

/**
 * Tek bir sahne tanımının şeklini doğrular. Registry'ye eklenmeden ÖNCE
 * çağrılır; Teacher Studio Diagnostics'in de doğrudan kullandığı TEK
 * doğrulama noktası (ikinci bir validation yazılmadı).
 * @param {object} scene
 * @returns {{valid:boolean, reasons:string[]}}
 */
export function validateSceneDefinition(scene) {
  const reasons = [];
  if (!scene || typeof scene !== 'object') return { valid: false, reasons: ['NOT_AN_OBJECT'] };
  if (typeof scene.id !== 'string' || !scene.id.trim()) reasons.push('MISSING_ID');
  if (!Number.isInteger(scene.version) || scene.version < 1) reasons.push('INVALID_VERSION');
  if (typeof scene.title !== 'string' || !scene.title.trim()) reasons.push('MISSING_TITLE');
  if (!scene.curriculumRef || typeof scene.curriculumRef !== 'object') {
    reasons.push('MISSING_CURRICULUM_REF');
  } else {
    if (typeof scene.curriculumRef.lessonId !== 'string' || !scene.curriculumRef.lessonId) reasons.push('MISSING_CURRICULUM_LESSON_ID');
    if (typeof scene.curriculumRef.concept !== 'string' || !scene.curriculumRef.concept) reasons.push('MISSING_CURRICULUM_CONCEPT');
  }
  for (const method of REQUIRED_METHODS) {
    if (typeof scene[method] !== 'function') reasons.push(`MISSING_METHOD_${method.toUpperCase()}`);
  }
  if (scene.nextSceneId !== undefined && typeof scene.nextSceneId !== 'string') reasons.push('INVALID_NEXT_SCENE_ID');
  return { valid: reasons.length === 0, reasons };
}

/**
 * @param {object[]} scenes — sırayla kaydedilecek sahne tanımları
 * @returns {SceneRegistry}
 */
export function createSceneRegistry(scenes = []) {
  const byId = new Map();
  const order = [];
  /** @type {Array<{id:?string, reasons:string[]}>} */
  const issues = [];

  for (const scene of scenes) {
    const { valid, reasons } = validateSceneDefinition(scene);
    if (!valid) {
      issues.push({ id: scene?.id ?? null, reasons: reasons.filter(r => r !== 'DUPLICATE_ID') });
      continue; // geçersiz bir sahne asla kayıt edilmez
    }
    if (byId.has(scene.id)) {
      issues.push({ id: scene.id, reasons: ['DUPLICATE_ID'] });
      continue; // ilk kayıt kazanır, sonraki duplicate'ler yok sayılır
    }
    byId.set(scene.id, scene);
    order.push(scene.id);
  }

  // İkinci geçiş: nextSceneId açıkça verilmiş ama registry'de yoksa raporla.
  for (const id of order) {
    const scene = byId.get(id);
    if (scene.nextSceneId != null && !byId.has(scene.nextSceneId)) {
      issues.push({ id, reasons: [`UNKNOWN_NEXT_SCENE:${scene.nextSceneId}`] });
    }
  }

  return {
    get(id) { return byId.get(id) || null; },
    has(id) { return byId.has(id); },
    list() { return order.map(id => byId.get(id)); },
    /** @returns {object|null} registry SIRASINDAKİ bir sonraki sahne — nextSceneId varsa o öncelikli. */
    next(id) {
      const scene = byId.get(id);
      if (!scene) return null;
      if (scene.nextSceneId != null) return byId.get(scene.nextSceneId) || null;
      const idx = order.indexOf(id);
      if (idx === -1 || idx === order.length - 1) return null;
      return byId.get(order[idx + 1]);
    },
    get size() { return order.length; },
    /** Kayıt sırasında toplanan sorunlar — Diagnostics bunu doğrudan okur. */
    get issues() { return issues.map(i => ({ ...i, reasons: [...i.reasons] })); },
  };
}

/** @typedef {ReturnType<typeof createSceneRegistry>} SceneRegistry */
