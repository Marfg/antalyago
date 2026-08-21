/**
 * tests/sceneRuntime.test.js
 * node tests/sceneRuntime.test.js
 *
 * core/sceneRuntime.js — sahte (DOM'suz) sahne nesneleriyle test edilir.
 * Amaç: runtime'ın mount/unmount/completion/advance orkestrasyonunu,
 * gerçek bir sahnenin (Sahne #1'in) DOM'una hiç bağımlı olmadan, sağlam
 * biçimde doğrulamak (bkz. görev talimatı: "yalnız DOM metni arayan
 * kırılgan testler yazma").
 */

import { createSceneRuntime } from '../core/sceneRuntime.js';
import { createSceneRegistry } from '../scenes/sceneRegistry.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓', name); passed++; }
  catch (e) { console.error('  ✗', name, '-', e.message); failed++; }
}
function ok(value, message = 'assertion failed') { if (!value) throw new Error(message); }
function equal(actual, expected, message) {
  if (actual !== expected) throw new Error(message || `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function fakeScene(id, { canCompleteAfter = 0, onMount, onUnmount, onComplete } = {}) {
  let mountCount = 0, unmountCount = 0;
  let readyCalls = 0;
  return {
    id, version: 1, title: id,
    curriculumRef: { lessonId: 'l1', concept: 'board' },
    mount(context) { mountCount++; onMount?.(context); },
    unmount(context) { unmountCount++; onUnmount?.(context); },
    canComplete() { readyCalls++; return readyCalls > canCompleteAfter; },
    complete(context) { onComplete?.(context); },
    get mountCount() { return mountCount; },
    get unmountCount() { return unmountCount; },
  };
}

function fakeProgressAdapter() {
  const state = { activeSceneId: null, completedSceneIds: [] };
  return {
    setActive(id) { state.activeSceneId = id; },
    markCompleted(id) { if (!state.completedSceneIds.includes(id)) state.completedSceneIds.push(id); },
    state,
  };
}

function makeEventSink() {
  const events = [];
  return { events, sink: e => events.push(e) };
}

// ── 1. Registry geçerli sahneyi kabul ediyor (delege, bkz. sceneRegistry.test.js) ──
test('registry geçerli bir sahneyi kabul ediyor (entegrasyon ön koşulu)', () => {
  const scene = fakeScene('s1');
  const registry = createSceneRegistry([scene]);
  ok(registry.has('s1'));
});

// ── 3. Bilinmeyen scene güvenli hata üretiyor ──
test('start(): bilinmeyen sahne id\'si scene_failed üretir, throw ETMEZ', () => {
  const registry = createSceneRegistry([fakeScene('s1')]);
  const { events, sink } = makeEventSink();
  const runtime = createSceneRuntime({ registry, emitEvent: sink });
  const result = runtime.start('bilinmeyen-id');
  equal(result.ok, false);
  equal(result.reason, 'UNKNOWN_SCENE');
  ok(events.some(e => e.type === 'scene_failed' && e.payload.sceneId === 'bilinmeyen-id'));
});

test('start(): mount() içinde atılan hata scene_failed üretir, runtime\'ı çökertmez', () => {
  const scene = fakeScene('s1', { onMount: () => { throw new Error('boom'); } });
  const registry = createSceneRegistry([scene]);
  const { events, sink } = makeEventSink();
  const runtime = createSceneRuntime({ registry, emitEvent: sink });
  const result = runtime.start('s1');
  equal(result.ok, false);
  equal(result.reason, 'MOUNT_ERROR');
  ok(events.some(e => e.type === 'scene_failed'));
  equal(runtime.isMounted(), false);
});

// ── 4. Scene mount yalnız bir kez çalışıyor ──
test('start(): zaten mount\'lu AYNI sahne için tekrar çağrılırsa mount() İKİNCİ KEZ çalışmaz', () => {
  const scene = fakeScene('s1');
  const registry = createSceneRegistry([scene]);
  const runtime = createSceneRuntime({ registry, emitEvent: () => {} });
  runtime.start('s1');
  runtime.start('s1');
  equal(scene.mountCount, 1);
});

// ── 5/6. Scene değişiminde unmount çalışıyor + eski state sızmıyor ──
test('advance(): sahne değişirken ÖNCEKİ sahnenin unmount() çağrısı yapılır', () => {
  const s1 = fakeScene('s1', { canCompleteAfter: 0 });
  const s2 = fakeScene('s2');
  const registry = createSceneRegistry([s1, s2]);
  const runtime = createSceneRuntime({ registry, emitEvent: () => {} });
  runtime.start('s1');
  runtime.complete();
  runtime.advance();
  equal(s1.unmountCount, 1);
  equal(s2.mountCount, 1);
  equal(runtime.getActiveSceneId(), 's2');
});

test('advance(): yeni sahnenin context\'i öncekiyle PAYLAŞILMAZ (eski context sızmıyor)', () => {
  const seenContexts = [];
  const s1 = fakeScene('s1', { onMount: ctx => seenContexts.push(ctx) });
  const s2 = fakeScene('s2', { onMount: ctx => seenContexts.push(ctx) });
  const registry = createSceneRegistry([s1, s2]);
  const runtime = createSceneRuntime({ registry, emitEvent: () => {} });
  runtime.start('s1');
  runtime.complete();
  runtime.advance();
  ok(seenContexts[0] !== seenContexts[1], 'context nesneleri aynı olmamalı');
  equal(seenContexts[0].sceneId, 's1');
  equal(seenContexts[1].sceneId, 's2');
});

// ── 7. Completion yalnız bir kez işleniyor ──
test('complete(): aynı sahne için İKİNCİ complete() çağrısı YENİDEN işlenmez, event tekrar üretilmez', () => {
  const scene = fakeScene('s1');
  const registry = createSceneRegistry([scene]);
  const { events, sink } = makeEventSink();
  const runtime = createSceneRuntime({ registry, emitEvent: sink });
  runtime.start('s1');
  const first = runtime.complete();
  const second = runtime.complete();
  equal(first.ok, true);
  equal(second.ok, false);
  equal(second.reason, 'ALREADY_COMPLETED');
  equal(events.filter(e => e.type === 'scene_completed').length, 1);
});

// ── 8. Tamamlanamayan sahne ilerlemiyor ──
test('complete(): canComplete() false iken NOT_READY döner, ilerlemez', () => {
  const scene = fakeScene('s1', { canCompleteAfter: 1000 }); // hep false
  const registry = createSceneRegistry([scene]);
  const { events, sink } = makeEventSink();
  const runtime = createSceneRuntime({ registry, emitEvent: sink });
  runtime.start('s1');
  const result = runtime.complete();
  equal(result.ok, false);
  equal(result.reason, 'NOT_READY');
  ok(!events.some(e => e.type === 'scene_completed'));
});

test('advance(): tamamlanmamış bir sahneden çağrılsa bile unmount eder ama SONRAKİ sahne başlamaz beklentisi runtime\'da yok — complete() zorunlu adım', () => {
  // Not: advance() kendi başına canComplete kontrolü YAPMAZ (bu complete()'in işi).
  // Bu test yalnız complete() olmadan advance() çağırmanın güvenli davrandığını kanıtlar.
  const s1 = fakeScene('s1', { canCompleteAfter: 1000 });
  const s2 = fakeScene('s2');
  const registry = createSceneRegistry([s1, s2]);
  const runtime = createSceneRuntime({ registry, emitEvent: () => {} });
  runtime.start('s1');
  runtime.advance(); // complete() ÇAĞRILMADI
  equal(s2.mountCount, 1, 'advance() doğrudan çağrılırsa yine de ilerler — gating sorumluluğu UI/complete() katmanında');
});

// ── 9. Next scene doğru çözülüyor ──
test('advance(): registry sırasındaki bir sonraki sahneyi doğru başlatır', () => {
  const s1 = fakeScene('s1'), s2 = fakeScene('s2'), s3 = fakeScene('s3');
  const registry = createSceneRegistry([s1, s2, s3]);
  const runtime = createSceneRuntime({ registry, emitEvent: () => {} });
  runtime.start('s1'); runtime.complete(); runtime.advance();
  equal(runtime.getActiveSceneId(), 's2');
  runtime.complete(); runtime.advance();
  equal(runtime.getActiveSceneId(), 's3');
});

// ── 10. Son sahne güvenli final durumu üretiyor ──
test('advance(): son sahnede done:true + nextSceneId:null döner, ASLA throw etmez veya bilinmeyen bir sahneye geçmez', () => {
  const scene = fakeScene('s1');
  const registry = createSceneRegistry([scene]);
  const runtime = createSceneRuntime({ registry, emitEvent: () => {} });
  runtime.start('s1'); runtime.complete();
  const result = runtime.advance();
  equal(result.ok, true);
  equal(result.done, true);
  equal(result.nextSceneId, null);
  equal(runtime.getActiveSceneId(), null);
  equal(runtime.isMounted(), false);
});

// ── 11. Bozuk persistence güvenli fallback oluşturuyor ──
test('progressAdapter hiç verilmezse (veya bozuksa) runtime yine de çalışır, throw etmez', () => {
  const scene = fakeScene('s1');
  const registry = createSceneRegistry([scene]);
  const runtime = createSceneRuntime({ registry, emitEvent: () => {}, progressAdapter: null });
  const result = runtime.start('s1');
  equal(result.ok, true);
  const completeResult = runtime.complete();
  equal(completeResult.ok, true);
});

// ── 12. Eski go_done_3d verisine dokunulmuyor ──
test('runtime hiçbir zaman "go_done_3d" adlı bir anahtardan bahsetmez/dokunmaz (mimari izolasyon)', () => {
  const src = createSceneRuntime.toString();
  ok(!src.includes('go_done_3d'), 'sceneRuntime.js eski lesson-progress anahtarını BİLMEMELİ');
});

// ── requestComplete() / completeAndAdvance() context sözleşmesi ────────

test('context.requestComplete() complete()+advance()\'ı BİRLİKTE tetikler', () => {
  const s1 = fakeScene('s1');
  const s2 = fakeScene('s2');
  const registry = createSceneRegistry([s1, s2]);
  let capturedContext = null;
  const runtime = createSceneRuntime({
    registry, emitEvent: () => {},
    contextExtras: {},
  });
  runtime.start('s1');
  // context'i mount sırasında yakalamak için start()'ın döndürdüğü context'i kullan
  const started = runtime.start('s1'); // zaten mount'lu — context'i tekrar döner
  capturedContext = started.context;
  const result = capturedContext.requestComplete();
  equal(result.ok, true);
  equal(result.advance.nextSceneId, 's2');
  equal(runtime.getActiveSceneId(), 's2');
});

test('context.emit() sceneId/sceneVersion/curriculumRef\'i payload\'a otomatik ekler', () => {
  const scene = fakeScene('custom-scene');
  const registry = createSceneRegistry([scene]);
  const { events, sink } = makeEventSink();
  const runtime = createSceneRuntime({ registry, emitEvent: sink });
  const { context } = runtime.start('custom-scene');
  context.emit('scene_intro_confirmed', { extra: 1 });
  const ev = events.find(e => e.type === 'scene_intro_confirmed');
  equal(ev.payload.sceneId, 'custom-scene');
  equal(ev.payload.sceneVersion, 1);
  equal(ev.payload.extra, 1);
  equal(ev.lessonId, 'l1');
  equal(ev.stepId, 'custom-scene');
});

test('contextExtras (board adapter / container gibi host verileri) context\'e birleştirilir', () => {
  const scene = fakeScene('s1');
  const registry = createSceneRegistry([scene]);
  const fakeBoardAdapter = { setSize() {} };
  const runtime = createSceneRuntime({ registry, emitEvent: () => {}, contextExtras: { boardAdapter: fakeBoardAdapter, container: 'FAKE_DOM_NODE' } });
  const { context } = runtime.start('s1');
  equal(context.boardAdapter, fakeBoardAdapter);
  equal(context.container, 'FAKE_DOM_NODE');
});

/* ══════════════════════════════════════════════════════════════════
   v0.10 — Replay sözleşmesi (bkz. görev talimatı Bölüm A)
   ══════════════════════════════════════════════════════════════════ */

test('replay: aktif sahne replayActive() ile TEMİZ biçimde yeniden mount edilir', () => {
  const scene = fakeScene('s1');
  const registry = createSceneRegistry([scene]);
  const runtime = createSceneRuntime({ registry, emitEvent: () => {} });
  runtime.start('s1');
  const result = runtime.replayActive();
  equal(result.ok, true);
  equal(result.mode, 'replay');
  equal(runtime.getActiveSceneId(), 's1');
});

test('replay: unmount öncesi (replay tetiklenmeden önce) yalnız BİR KEZ çalışır', () => {
  const scene = fakeScene('s1');
  const registry = createSceneRegistry([scene]);
  const runtime = createSceneRuntime({ registry, emitEvent: () => {} });
  runtime.start('s1');
  runtime.replayActive();
  equal(scene.unmountCount, 1);
});

test('replay: mount yalnız BİR KEZ (replay başına) çalışır', () => {
  const scene = fakeScene('s1');
  const registry = createSceneRegistry([scene]);
  const runtime = createSceneRuntime({ registry, emitEvent: () => {} });
  runtime.start('s1');
  runtime.replayActive();
  equal(scene.mountCount, 2, 'ilk start() + bir replay = toplam 2 mount');
});

test('replay: completion kaydını (progressAdapter.markCompleted) SİLMEZ', () => {
  const scene = fakeScene('s1');
  const registry = createSceneRegistry([scene]);
  const progressAdapter = fakeProgressAdapter();
  const runtime = createSceneRuntime({ registry, emitEvent: () => {}, progressAdapter });
  runtime.start('s1');
  runtime.complete();
  ok(progressAdapter.state.completedSceneIds.includes('s1'));
  runtime.replayActive();
  ok(progressAdapter.state.completedSceneIds.includes('s1'), 'replay sonrası completion hâlâ kalıcı olmalı');
});

test('replay: tamamlanmış sahne tekrar tamamlansa bile completedSceneIds\'e İKİNCİ KEZ eklenmez', () => {
  const scene = fakeScene('s1');
  const registry = createSceneRegistry([scene]);
  const progressAdapter = fakeProgressAdapter();
  const runtime = createSceneRuntime({ registry, emitEvent: () => {}, progressAdapter });
  runtime.start('s1');
  runtime.complete();
  runtime.replayActive();
  runtime.complete(); // replay sonrası tekrar tamamlama — completedSceneIds değişmemeli
  equal(progressAdapter.state.completedSceneIds.filter(id => id === 's1').length, 1);
});

test('replay: start(id,{mode:"replay"}) TEK çağrıda tek scene_replay_started üretir (aynı tıklama iki event üretmez)', () => {
  const scene = fakeScene('s1');
  const registry = createSceneRegistry([scene]);
  const { events, sink } = makeEventSink();
  const runtime = createSceneRuntime({ registry, emitEvent: sink });
  runtime.start('s1');
  runtime.replayActive();
  equal(events.filter(e => e.type === 'scene_replay_started').length, 1);
});

test('replay: timer/listener sızıntısı yok — unmount() her replay öncesi çağrılır (temizlik fırsatı verilir)', () => {
  let unmountCalls = 0;
  const scene = fakeScene('s1', { onUnmount: () => { unmountCalls++; } });
  const registry = createSceneRegistry([scene]);
  const runtime = createSceneRuntime({ registry, emitEvent: () => {} });
  runtime.start('s1');
  runtime.replayActive();
  runtime.replayActive();
  equal(unmountCalls, 2, 'her replayActive() çağrısından önce bir unmount olmalı');
});

test('replay sonrası registry sırasındaki bir sonraki sahneye normal biçimde geçilebiliyor', () => {
  const s1 = fakeScene('s1');
  const s2 = fakeScene('s2');
  const registry = createSceneRegistry([s1, s2]);
  const runtime = createSceneRuntime({ registry, emitEvent: () => {} });
  runtime.start('s1');
  runtime.complete();
  runtime.replayActive();
  runtime.complete();
  runtime.advance();
  equal(runtime.getActiveSceneId(), 's2');
});

test('replay: bilinmeyen sahne id\'si için start(id,{mode:"replay"}) güvenle UNKNOWN_SCENE döner, throw ETMEZ', () => {
  const registry = createSceneRegistry([fakeScene('s1')]);
  const { events, sink } = makeEventSink();
  const runtime = createSceneRuntime({ registry, emitEvent: sink });
  const result = runtime.start('yok-boyle-bir-sahne', { mode: 'replay' });
  equal(result.ok, false);
  equal(result.reason, 'UNKNOWN_SCENE');
  ok(events.some(e => e.type === 'scene_failed'));
});

test('replay: aktif sahne yokken replayActive() güvenli NO_ACTIVE_SCENE döner', () => {
  const registry = createSceneRegistry([fakeScene('s1')]);
  const runtime = createSceneRuntime({ registry, emitEvent: () => {} });
  const result = runtime.replayActive();
  equal(result.ok, false);
  equal(result.reason, 'NO_ACTIVE_SCENE');
});

test('context.mode: normal start\'ta "normal", replay start\'ta "replay" olur ve emit() payload\'ına otomatik eklenir', () => {
  const scene = fakeScene('s1');
  const registry = createSceneRegistry([scene]);
  const { events, sink } = makeEventSink();
  const runtime = createSceneRuntime({ registry, emitEvent: sink });
  const started = runtime.start('s1');
  equal(started.context.mode, 'normal');
  started.context.emit('custom_event', {});
  const replayed = runtime.replayActive();
  equal(replayed.context.mode, 'replay');
  replayed.context.emit('custom_event', {});
  const customEvents = events.filter(e => e.type === 'custom_event');
  equal(customEvents[0].payload.mode, 'normal');
  equal(customEvents[1].payload.mode, 'replay');
});

test('context.hasNextScene: son sahnede false, sonraki sahnesi olan sahnede true', () => {
  const s1 = fakeScene('s1');
  const s2 = fakeScene('s2');
  const registry = createSceneRegistry([s1, s2]);
  const runtime = createSceneRuntime({ registry, emitEvent: () => {} });
  const started1 = runtime.start('s1');
  equal(started1.context.hasNextScene, true);
  started1.context.markComplete();
  const advanced = started1.context.advanceToNext();
  equal(advanced.ok, true);
  equal(runtime.getActiveSceneId(), 's2');
  equal(activeContextHasNext(runtime, registry), false);
});
function activeContextHasNext(runtime, registry) {
  // Yardımcı: aktif sahnenin context'ini yeniden yakalamak için no-op bir
  // normal start() çağrısı (zaten mount'lu → context'i döner, mount()
  // İKİNCİ KEZ çalışmaz).
  const id = runtime.getActiveSceneId();
  const result = runtime.start(id);
  return result.context.hasNextScene;
}

test('context.markComplete()/advanceToNext() ayrı ayrı çağrılabilir (requestComplete\'in tek-adım kısayoluna ek olarak)', () => {
  const s1 = fakeScene('s1');
  const s2 = fakeScene('s2');
  const registry = createSceneRegistry([s1, s2]);
  const runtime = createSceneRuntime({ registry, emitEvent: () => {} });
  const started = runtime.start('s1');
  const completeResult = started.context.markComplete();
  equal(completeResult.ok, true);
  equal(runtime.getActiveSceneId(), 's1', 'markComplete() ADVANCE ETMEMELİ');
  const advanceResult = started.context.advanceToNext();
  equal(advanceResult.ok, true);
  equal(runtime.getActiveSceneId(), 's2');
});

test('mount hatası console.error ile sahne id\'si ve gerçek exception ile loglanır', () => {
  const originalError = console.error;
  const calls = [];
  console.error = (...args) => calls.push(args);
  try {
    const scene = fakeScene('s1', { onMount: () => { throw new Error('kasıtlı test hatası'); } });
    const registry = createSceneRegistry([scene]);
    const runtime = createSceneRuntime({ registry, emitEvent: () => {} });
    runtime.start('s1');
  } finally {
    console.error = originalError;
  }
  ok(calls.length >= 1, 'console.error hiç çağrılmadı');
  const loggedText = calls.map(c => c.join(' ')).join(' ');
  ok(loggedText.includes('s1'), 'log sahne id\'sini içermiyor');
  ok(calls.some(c => c.some(a => a instanceof Error && a.message === 'kasıtlı test hatası')), 'gerçek exception loglanmadı');
});

console.log(`\nToplam: ${passed + failed}  ✓ ${passed}  ✗ ${failed}`);
if (failed) process.exit(1);
