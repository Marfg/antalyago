/**
 * tests/sceneProgressAdapter.test.js
 * node tests/sceneProgressAdapter.test.js
 *
 * adapters/sceneProgressAdapter.js — 'go_scene_progress_v1' anahtarının
 * eski lesson-progress ('go_done_3d') anahtarından TAMAMEN izole olduğunu,
 * bozuk/eski version verisinin güvenle sıfıra düştüğünü kanıtlar.
 */

function makeLocalStorageShim() {
  const store = new Map();
  return {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: k => { store.delete(k); },
    _store: store,
  };
}
globalThis.localStorage = makeLocalStorageShim();

const { sceneProgressAdapter } = await import('../adapters/sceneProgressAdapter.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓', name); passed++; }
  catch (e) { console.error('  ✗', name, '-', e.message); failed++; }
}
function ok(value, message = 'assertion failed') { if (!value) throw new Error(message); }
function equal(actual, expected, message) {
  if (actual !== expected) throw new Error(message || `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function reset() { globalThis.localStorage._store.clear(); }

test('load(): hiç veri yokken güvenli boş state döner', () => {
  reset();
  const state = sceneProgressAdapter.load();
  equal(state.version, 1);
  equal(state.activeSceneId, null);
  equal(state.completedSceneIds.length, 0);
});

test('markCompleted(): tamamlanan sahne kalıcı olarak yazılır', () => {
  reset();
  sceneProgressAdapter.markCompleted('scene-01-board-intro');
  const state = sceneProgressAdapter.load();
  ok(state.completedSceneIds.includes('scene-01-board-intro'));
});

test('markCompleted(): aynı sahne iki kez tamamlansa da listede TEK kez görünür', () => {
  reset();
  sceneProgressAdapter.markCompleted('s1');
  sceneProgressAdapter.markCompleted('s1');
  const state = sceneProgressAdapter.load();
  equal(state.completedSceneIds.filter(id => id === 's1').length, 1);
});

test('isCompleted(): doğru şekilde true/false döner', () => {
  reset();
  equal(sceneProgressAdapter.isCompleted('s1'), false);
  sceneProgressAdapter.markCompleted('s1');
  equal(sceneProgressAdapter.isCompleted('s1'), true);
});

test('setActive(): activeSceneId\'i günceller, completedSceneIds\'e dokunmaz', () => {
  reset();
  sceneProgressAdapter.markCompleted('s1');
  sceneProgressAdapter.setActive('s2');
  const state = sceneProgressAdapter.load();
  equal(state.activeSceneId, 's2');
  equal(state.completedSceneIds.length, 1);
});

test('load(): bozuk JSON güvenle boş state\'e düşer (throw etmez)', () => {
  reset();
  globalThis.localStorage.setItem('go_scene_progress_v1', '{not valid json');
  const state = sceneProgressAdapter.load();
  equal(state.version, 1);
  equal(state.completedSceneIds.length, 0);
});

test('load(): eski/bilinmeyen version güvenle boş state\'e düşer', () => {
  reset();
  globalThis.localStorage.setItem('go_scene_progress_v1', JSON.stringify({ version: 999, completedSceneIds: ['x'] }));
  const state = sceneProgressAdapter.load();
  equal(state.version, 1);
  equal(state.completedSceneIds.length, 0);
});

test('load(): şekli bozuk (completedSceneIds dizi değil) veri güvenle boş state\'e düşer', () => {
  reset();
  globalThis.localStorage.setItem('go_scene_progress_v1', JSON.stringify({ version: 1, completedSceneIds: 'not-an-array', sceneState: {} }));
  const state = sceneProgressAdapter.load();
  equal(state.completedSceneIds.length, 0);
});

test('reset(): anahtarı tamamen temizler', () => {
  reset();
  sceneProgressAdapter.markCompleted('s1');
  sceneProgressAdapter.reset();
  equal(globalThis.localStorage.getItem('go_scene_progress_v1'), null);
});

test('İZOLASYON: sceneProgressAdapter ASLA "go_done_3d" anahtarını okumaz/yazmaz', () => {
  reset();
  globalThis.localStorage.setItem('go_done_3d', JSON.stringify(['l1', 'l2']));
  sceneProgressAdapter.markCompleted('scene-01-board-intro');
  // Eski anahtar DOKUNULMADAN kalmalı.
  equal(globalThis.localStorage.getItem('go_done_3d'), JSON.stringify(['l1', 'l2']));
  const src = Object.values(sceneProgressAdapter).map(v => typeof v === 'function' ? v.toString() : '').join('\n')
    + sceneProgressAdapter.load.toString() + sceneProgressAdapter.save.toString();
  ok(!src.includes('go_done_3d'), 'sceneProgressAdapter kaynağı go_done_3d anahtarını İÇERMEMELİ');
});

console.log(`\nToplam: ${passed + failed}  ✓ ${passed}  ✗ ${failed}`);
if (failed) process.exit(1);
