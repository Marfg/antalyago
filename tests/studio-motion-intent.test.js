/**
 * tests/studio-motion-intent.test.js
 * node tests/studio-motion-intent.test.js
 *
 * AG-MOTION M2 — studio/adapters/motionIntentAdapter.js'in saf
 * storyboard → sahne/motion-intent planı dönüşümünü doğrular. UI/IPC/dosya
 * yazma/render motoru YOK — yalnız veri sözleşmesi.
 */

import assert from 'node:assert/strict';

import { buildMotionIntent } from '../studio/adapters/motionIntentAdapter.js';
import { buildMotionStoryboard } from '../studio/adapters/motionStoryboardAdapter.js';
import { createDocument } from '../studio/model/studioDocument.js';
import { addChildMove, setMoveNodeAnnotations, setMoveNodeComment } from '../studio/model/moveTree.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓', name); passed++; }
  catch (e) { console.error('  ✗', name, '-', e.message); failed++; }
}
function ok(val, msg = 'assertion failed') { if (!val) throw new Error(msg); }
function eq(a, b, msg) { if (a !== b) throw new Error(msg ?? `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }

console.log('\n─── studio-motion-intent.test.js ───\n');

// ── Yardımcı: minimal, elle kurulmuş storyboard fixture'ları ────────────
// (M1'in gerçek çıktı şekliyle birebir — izole/kesin M2 testleri için.)

function baseStoryboard(overrides = {}) {
  return {
    version: '0.1',
    source: { documentId: 'sb-1', title: 'Test', activeNodeId: 'root', boardSize: 9 },
    board: { size: 9, initialStones: [] },
    timeline: [],
    warnings: [],
    ...overrides,
  };
}

function moveEvent(overrides = {}) {
  return {
    id: 'evt-m1', nodeId: 'm1', type: 'move', color: 'black',
    move: { x: 4, y: 4 }, pass: false, comment: '', annotations: [],
    before: { stones: [], turn: 'black' }, after: { stones: [{ x: 4, y: 4, color: 'black' }], turn: 'white' },
    captures: [], durationMs: 800,
    ...overrides,
  };
}

// ── 1. Boş storyboard → boş scenes ───────────────────────────────────────

test('boş storyboard: scenes boş', () => {
  const { plan, warnings } = buildMotionIntent(baseStoryboard());
  eq(plan.version, '0.1');
  eq(plan.scenes.length, 0, 'ne setup ne event yoksa scenes boş');
  eq(warnings.length, 0);
  eq(plan.warnings.length, 0);
});

// ── 2. initialStones → setup scene ───────────────────────────────────────

test('initialStones: setup scene + show-initial-stones action', () => {
  const sb = baseStoryboard({ board: { size: 9, initialStones: [{ x: 2, y: 2, color: 'black' }, { x: 6, y: 6, color: 'white' }] } });
  const { plan } = buildMotionIntent(sb);
  eq(plan.scenes.length, 1, 'yalnız setup sahnesi');
  const scene = plan.scenes[0];
  eq(scene.kind, 'setup');
  eq(scene.id, 'scene-setup');
  eq(scene.eventId, null);
  eq(scene.nodeId, 'root');
  eq(scene.actions.length, 1);
  eq(scene.actions[0].type, 'show-initial-stones');
  eq(scene.actions[0].stones.length, 2);
  ok(scene.narration.includes('2'), 'narration taş sayısını içeriyor: ' + scene.narration);
  ok(Number.isInteger(scene.durationMs) && scene.durationMs > 0, 'setup durationMs pozitif');
});

test('initialStones yoksa setup sahnesi hiç üretilmez', () => {
  const { plan } = buildMotionIntent(baseStoryboard({ timeline: [moveEvent()] }));
  ok(!plan.scenes.some(s => s.kind === 'setup'), 'setup sahnesi yok');
  eq(plan.scenes.length, 1, 'yalnız move sahnesi var');
});

// ── 3. Tek move → move scene ─────────────────────────────────────────────

test('tek move: move scene + place-stone/highlight-move, focus = move koordinatı', () => {
  const sb = baseStoryboard({ timeline: [moveEvent()] });
  const { plan } = buildMotionIntent(sb);
  eq(plan.scenes.length, 1);
  const scene = plan.scenes[0];
  eq(scene.kind, 'move');
  eq(scene.eventId, 'evt-m1');
  eq(scene.nodeId, 'm1');
  eq(scene.focus.x, 4);
  eq(scene.focus.y, 4);
  const actionTypes = scene.actions.map(a => a.type);
  ok(actionTypes.includes('place-stone'), 'place-stone action mevcut');
  ok(actionTypes.includes('highlight-move'), 'highlight-move action mevcut');
  const placeStone = scene.actions.find(a => a.type === 'place-stone');
  eq(placeStone.point.x, 4);
  eq(placeStone.color, 'black');
});

// ── 4. Capture event → capture scene ─────────────────────────────────────

test('capture event: kind=capture, remove-captured-stones action, narration açıkça belirtiyor', () => {
  const sb = baseStoryboard({
    timeline: [moveEvent({ captures: [{ x: 0, y: 0, color: 'white' }] })],
  });
  const { plan } = buildMotionIntent(sb);
  const scene = plan.scenes[0];
  eq(scene.kind, 'capture', 'capture move olan kinden önceliklidir');
  eq(scene.title, 'Yakalama');
  const removeAction = scene.actions.find(a => a.type === 'remove-captured-stones');
  ok(removeAction, 'remove-captured-stones action mevcut');
  eq(removeAction.stones.length, 1);
  eq(removeAction.stones[0].x, 0);
  ok(scene.narration.toLowerCase().includes('yakaland'), 'narration capture\'ı açıkça söylüyor: ' + scene.narration);
  // place-stone/highlight-move hâlâ mevcut — capture bir move'un üstüne eklenir, yerine geçmez
  ok(scene.actions.some(a => a.type === 'place-stone'), 'capture olsa da place-stone hâlâ var');
});

// ── 5. Pass event → pass scene ───────────────────────────────────────────

test('pass event: kind=pass, show-pass action, move null kalır', () => {
  const sb = baseStoryboard({
    timeline: [{
      id: 'evt-p1', nodeId: 'p1', type: 'pass', color: 'white',
      move: null, pass: true, comment: '', annotations: [],
      before: { stones: [], turn: 'white' }, after: { stones: [], turn: 'black' },
      captures: [], durationMs: 800,
    }],
  });
  const { plan } = buildMotionIntent(sb);
  const scene = plan.scenes[0];
  eq(scene.kind, 'pass');
  eq(scene.title, 'Pas');
  eq(scene.focus, null, 'pass\'te focus point yok');
  const passAction = scene.actions.find(a => a.type === 'show-pass');
  ok(passAction, 'show-pass action mevcut');
  eq(passAction.color, 'white');
  ok(!scene.actions.some(a => a.type === 'place-stone'), 'pass\'te place-stone yok');
  ok(scene.narration.includes('pas'), 'narration pas geçtiğini belirtiyor: ' + scene.narration);
});

// ── 6. Annotation event → highlight-annotation action ────────────────────

test('annotation event: highlight-annotation action, point/type taşınıyor', () => {
  const sb = baseStoryboard({
    timeline: [moveEvent({ annotations: [{ id: 'a1', type: 'circle', point: { x: 4, y: 4 } }] })],
  });
  const { plan } = buildMotionIntent(sb);
  const scene = plan.scenes[0];
  const annAction = scene.actions.find(a => a.type === 'highlight-annotation');
  ok(annAction, 'highlight-annotation action mevcut');
  eq(annAction.annotation.type, 'circle');
  eq(annAction.annotation.point.x, 4);
  eq(annAction.annotation.id, 'a1');
  eq(scene.kind, 'move', 'annotation kind\'i move\'dan capture/annotation\'a değiştirmiyor');
});

test('birden fazla annotation: her biri ayrı highlight-annotation action üretir', () => {
  const sb = baseStoryboard({
    timeline: [moveEvent({
      annotations: [
        { id: 'a1', type: 'circle', point: { x: 4, y: 4 } },
        { id: 'a2', type: 'triangle', point: { x: 5, y: 5 } },
      ],
    })],
  });
  const { plan } = buildMotionIntent(sb);
  const annActions = plan.scenes[0].actions.filter(a => a.type === 'highlight-annotation');
  eq(annActions.length, 2);
});

// ── 7. Comment event → show-comment / narration ──────────────────────────

test('comment event: show-comment action, comment narration\'a taşınıyor', () => {
  const sb = baseStoryboard({
    timeline: [moveEvent({ comment: 'Öğrenci ığüşöç ÇĞÜŞÖİ testi' })],
  });
  const { plan } = buildMotionIntent(sb);
  const scene = plan.scenes[0];
  const commentAction = scene.actions.find(a => a.type === 'show-comment');
  ok(commentAction, 'show-comment action mevcut');
  eq(commentAction.text, 'Öğrenci ığüşöç ÇĞÜŞÖİ testi');
  ok(scene.narration.includes('Öğrenci ığüşöç ÇĞÜŞÖİ testi'), 'comment narration alanına taşındı: ' + scene.narration);
});

// ── 8. move+annotation+comment aynı event'te — actions birlikte ─────────

test('move+annotation+comment aynı event: tüm action türleri bir arada, tek sahne', () => {
  const sb = baseStoryboard({
    timeline: [moveEvent({
      captures: [{ x: 0, y: 0, color: 'white' }],
      annotations: [{ id: 'a1', type: 'square', point: { x: 4, y: 4 } }],
      comment: 'Güzel hamle',
    })],
  });
  const { plan } = buildMotionIntent(sb);
  eq(plan.scenes.length, 1, 'tek event → tek sahne (birden fazla değil)');
  const scene = plan.scenes[0];
  eq(scene.kind, 'capture');
  const types = scene.actions.map(a => a.type);
  ok(types.includes('place-stone'), 'place-stone var');
  ok(types.includes('highlight-move'), 'highlight-move var');
  ok(types.includes('remove-captured-stones'), 'remove-captured-stones var');
  ok(types.includes('highlight-annotation'), 'highlight-annotation var');
  ok(types.includes('show-comment'), 'show-comment var');
  ok(scene.narration.includes('yakaland') && scene.narration.includes('Güzel hamle'), 'narration hem capture hem comment\'i içeriyor: ' + scene.narration);
});

// ── 9. legacyMarkersOverlay → warning ─────────────────────────────────────

test('legacyMarkersOverlay: hiçbir sahneye dağıtılmaz, açık warning üretir', () => {
  const sb = baseStoryboard({ legacyMarkersOverlay: [{ x: 1, y: 1, type: 'triangle' }] });
  const { plan, warnings } = buildMotionIntent(sb);
  ok(warnings.some(w => w.includes('legacy') && w.includes('dağıt')), 'warning legacy marker\'ın dağıtılmadığını belirtiyor: ' + JSON.stringify(warnings));
  eq(plan.warnings, warnings, 'plan.warnings dönüş değeriyle tutarlı');
  ok(!plan.scenes.some(s => JSON.stringify(s).includes('triangle')), 'legacy marker hiçbir sahnenin içine sızmadı');
});

test('storyboard\'un kendi warnings\'i (M1) plana taşınır, kaybolmaz', () => {
  const sb = baseStoryboard({ warnings: ['M1: root annotation dahil edilmedi'] });
  const { warnings } = buildMotionIntent(sb);
  ok(warnings.includes('M1: root annotation dahil edilmedi'), 'M1 warning\'i M2\'ye taşındı');
});

// ── 10. Default duration korunuyor ────────────────────────────────────────

test('event.durationMs sahneye değiştirilmeden taşınıyor', () => {
  const sb = baseStoryboard({ timeline: [moveEvent({ durationMs: 1234 })] });
  const { plan } = buildMotionIntent(sb);
  eq(plan.scenes[0].durationMs, 1234, 'M1\'in kendi durationMs\'i (varsayılan ya da özel) korunuyor');
});

// ── 11. Invalid storyboard → açık hata ────────────────────────────────────

test('invalid storyboard: null/eksik timeline açık hata fırlatır', () => {
  assert.throws(() => buildMotionIntent(null), /MOTION_INTENT_INVALID_STORYBOARD/);
  assert.throws(() => buildMotionIntent(undefined), /MOTION_INTENT_INVALID_STORYBOARD/);
  assert.throws(() => buildMotionIntent({}), /MOTION_INTENT_NO_TIMELINE/);
  assert.throws(() => buildMotionIntent({ timeline: 'not-array' }), /MOTION_INTENT_NO_TIMELINE/);
});

// ── 12. M1 entegrasyon smoke ───────────────────────────────────────────────

test('M1 entegrasyon smoke: küçük Studio doc → buildMotionStoryboard → buildMotionIntent', () => {
  const doc = createDocument({ id: 'intent-smoke', title: 'Smoke', slug: 'intent-smoke' });
  const root = doc.moveTree.root;
  root.formation.stones.push({ x: 0, y: 0, color: 'white' });
  root.formation.stones.push({ x: 1, y: 0, color: 'black' });
  const r1 = addChildMove(root, 'root', { color: 'black', x: 0, y: 1 }); // (0,0) beyazı yakalar
  ok(r1.ok, `hamle eklendi (${r1.reason ?? 'ok'})`);
  ok(setMoveNodeAnnotations(root, r1.node.id, [{ type: 'circle', point: { x: 0, y: 1 } }], 9));
  ok(setMoveNodeComment(root, r1.node.id, 'Köşe yakalama'));
  doc.moveTree.activeNodeId = r1.node.id;

  const { storyboard } = buildMotionStoryboard(doc);
  const { plan, warnings } = buildMotionIntent(storyboard);

  eq(plan.scenes.length, 2, 'setup (2 taş) + 1 hamle sahnesi');
  eq(plan.scenes[0].kind, 'setup');
  eq(plan.scenes[1].kind, 'capture', 'yakalama içeren hamle capture kind\'inde');
  ok(plan.scenes[1].actions.some(a => a.type === 'highlight-annotation'), 'annotation entegrasyonda da taşınıyor');
  ok(plan.scenes[1].actions.some(a => a.type === 'show-comment'), 'comment entegrasyonda da taşınıyor');
  eq(plan.source.documentId, 'intent-smoke');
  eq(warnings.length, 0, 'bu senaryoda hiç warning üretilmez (kök annotation yok, eski marker yok)');
});

console.log(`\nToplam: ${passed + failed}  ✓ ${passed}  ✗ ${failed}`);
if (failed) process.exit(1);
