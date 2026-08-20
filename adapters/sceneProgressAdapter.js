/**
 * adapters/sceneProgressAdapter.js
 *
 * Sahne tabanlı öğrenme deneyiminin AYRI, version'lanmış persistence'ı.
 * `core/` DIŞINDA (localStorage bilir) — `adapters/teacherContentOverrides.js`
 * ile AYNI desen.
 *
 * BİLEREK farklı bir anahtar: eski ders sisteminin `go_done_3d`'siyle
 * KARIŞTIRILMAZ. Bu adaptör o anahtara hiçbir zaman dokunmaz, okumaz,
 * yazmaz — eski kullanıcı ilerlemesi bu sistemden tamamen izole.
 *
 * Sözleşme:
 *   { version: 1, activeSceneId: string|null, completedSceneIds: string[], sceneState: object }
 *
 * `sceneState` bilerek boş/serbest bırakıldı — bu milestone'da HİÇBİR
 * sahne buraya bir şey yazmıyor (bkz. Sahne #1: boardSizesSeen/introConfirmed
 * BİLİNÇLİ olarak yalnız oturumluk, sahne modülünün kendi belleğinde
 * tutulur — kalıcı olan TEK şey scene COMPLETION'dır).
 */

const KEY = 'go_scene_progress_v1';
const VERSION = 1;

function emptyState() {
  return { version: VERSION, activeSceneId: null, completedSceneIds: [], sceneState: {} };
}

function isValidState(raw) {
  return !!raw && typeof raw === 'object'
    && raw.version === VERSION
    && Array.isArray(raw.completedSceneIds)
    && raw.completedSceneIds.every(id => typeof id === 'string')
    && (raw.activeSceneId === null || typeof raw.activeSceneId === 'string')
    && raw.sceneState && typeof raw.sceneState === 'object';
}

export const sceneProgressAdapter = {
  /** @returns {object} her zaman geçerli bir state — bozuk/bilinmeyen version güvenle boş state'e düşer. */
  load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      return isValidState(raw) ? raw : emptyState();
    } catch {
      return emptyState();
    }
  },

  save(state) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
  },

  setActive(sceneId) {
    const state = this.load();
    state.activeSceneId = sceneId;
    this.save(state);
    return state;
  },

  markCompleted(sceneId) {
    const state = this.load();
    if (!state.completedSceneIds.includes(sceneId)) state.completedSceneIds.push(sceneId);
    this.save(state);
    return state;
  },

  isCompleted(sceneId) {
    return this.load().completedSceneIds.includes(sceneId);
  },

  reset() {
    try { localStorage.removeItem(KEY); } catch {}
  },
};
