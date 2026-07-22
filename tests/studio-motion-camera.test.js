/**
 * tests/studio-motion-camera.test.js
 * node tests/studio-motion-camera.test.js
 *
 * AG-MOTION M3 — studio/adapters/motionCameraAdapter.js'in saf motion-intent
 * planı → sahne başına kamera/focus çerçevesi dönüşümünü doğrular.
 * UI/IPC/dosya yazma/render motoru YOK — yalnız veri sözleşmesi.
 */

import assert from 'node:assert/strict';

import { buildMotionCameraPlan } from '../studio/adapters/motionCameraAdapter.js';
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

console.log('\n─── studio-motion-camera.test.js ───\n');

// ── Yardımcı: minimal, elle kurulmuş intentPlan fixture'ları ─────────────

function basePlan(overrides = {}) {
  return {
    version: '0.1',
    source: { documentId: 'p-1', title: 'Test', activeNodeId: 'root', boardSize: 9 },
    board: { size: 9, initialStones: [] },
    scenes: [],
    warnings: [],
    ...overrides,
  };
}

function setupScene(stones) {
  return {
    id: 'scene-setup', eventId: null, nodeId: 'root', kind: 'setup', title: 'Kurulum',
    narration: `Kurulum: ${stones.length} taş.`, focus: null,
    actions: [{ type: 'show-initial-stones', stones }],
    durationMs: 1000,
  };
}

function moveScene(overrides = {}) {
  return {
    id: 'scene-e1', eventId: 'evt-e1', nodeId: 'n1', kind: 'move', title: 'Hamle',
    narration: 'Siyah (4,4) oynadı.', focus: { x: 4, y: 4 },
    actions: [
      { type: 'place-stone', point: { x: 4, y: 4 }, color: 'black' },
      { type: 'highlight-move', point: { x: 4, y: 4 }, color: 'black' },
    ],
    durationMs: 800,
    ...overrides,
  };
}

function captureScene(overrides = {}) {
  return {
    id: 'scene-e2', eventId: 'evt-e2', nodeId: 'n2', kind: 'capture', title: 'Yakalama',
    narration: 'Siyah (0,1) oynadı. 1 taş yakalandı.', focus: { x: 0, y: 1 },
    actions: [
      { type: 'place-stone', point: { x: 0, y: 1 }, color: 'black' },
      { type: 'highlight-move', point: { x: 0, y: 1 }, color: 'black' },
      { type: 'remove-captured-stones', stones: [{ x: 0, y: 0, color: 'white' }] },
    ],
    durationMs: 800,
    ...overrides,
  };
}

function passScene(overrides = {}) {
  return {
    id: 'scene-e3', eventId: 'evt-e3', nodeId: 'n3', kind: 'pass', title: 'Pas',
    narration: 'Beyaz pas geçti.', focus: null,
    actions: [{ type: 'show-pass', color: 'white' }],
    durationMs: 800,
    ...overrides,
  };
}

// ── 1. Boş intent plan → boş frames ──────────────────────────────────────

test('boş intent plan: frames boş', () => {
  const { cameraPlan, warnings } = buildMotionCameraPlan(basePlan());
  eq(cameraPlan.version, '0.1');
  eq(cameraPlan.frames.length, 0);
  eq(warnings.length, 0);
});

// ── 2. Setup scene → full-board + initial stones focus ──────────────────

test('setup scene: full-board camera, focus.stones = initialStones', () => {
  const stones = [{ x: 2, y: 2, color: 'black' }, { x: 6, y: 6, color: 'white' }];
  const plan = basePlan({ board: { size: 9, initialStones: stones }, scenes: [setupScene(stones)] });
  const { cameraPlan } = buildMotionCameraPlan(plan);
  const frame = cameraPlan.frames[0];
  eq(frame.id, 'frame-scene-setup');
  eq(frame.camera.mode, 'full-board');
  eq(frame.camera.center, null);
  eq(frame.focus.stones.length, 2);
  eq(frame.focus.points.length, 0, 'setup\'ta annotation yoksa focus.points boş');
  eq(frame.overlays.length, 0, 'setup caption yoksa overlay boş');
  eq(frame.easing, 'ease-out');
});

// ── 3. Move scene → point-focus + move center ────────────────────────────

test('move scene: point-focus camera, center = move koordinatı, zoom varsayılan 1.4', () => {
  const plan = basePlan({ scenes: [moveScene()] });
  const { cameraPlan } = buildMotionCameraPlan(plan);
  const frame = cameraPlan.frames[0];
  eq(frame.camera.mode, 'point-focus');
  eq(frame.camera.center.x, 4);
  eq(frame.camera.center.y, 4);
  eq(frame.camera.zoom, 1.4);
  ok(frame.focus.points.some(p => p.x === 4 && p.y === 4), 'focus.points move koordinatını içeriyor');
  eq(frame.focus.captures.length, 0);
  eq(frame.easing, 'ease-in-out');
});

// ── 4. Capture scene → area-focus + captures + bounding center ──────────

test('capture scene: area-focus camera, bounding center, focus.captures dolu, zoom varsayılan 1.6', () => {
  const plan = basePlan({ scenes: [captureScene()] });
  const { cameraPlan } = buildMotionCameraPlan(plan);
  const frame = cameraPlan.frames[0];
  eq(frame.camera.mode, 'area-focus');
  // move (0,1) + capture (0,0) → bounding center (0, 0.5)
  eq(frame.camera.center.x, 0);
  eq(frame.camera.center.y, 0.5);
  eq(frame.camera.zoom, 1.6);
  eq(frame.focus.captures.length, 1);
  eq(frame.focus.captures[0].x, 0);
  eq(frame.focus.captures[0].color, 'white');
  ok(frame.focus.points.some(p => p.x === 0 && p.y === 1), 'focus.points hamle noktasını da içeriyor');
  eq(frame.easing, 'emphasized');
});

// ── 5. Pass scene → full-board + pass overlay ────────────────────────────

test('pass scene: full-board camera, pass overlay rengiyle birlikte', () => {
  const plan = basePlan({ scenes: [passScene()] });
  const { cameraPlan } = buildMotionCameraPlan(plan);
  const frame = cameraPlan.frames[0];
  eq(frame.camera.mode, 'full-board');
  eq(frame.camera.center, null);
  const passOverlay = frame.overlays.find(o => o.type === 'pass');
  ok(passOverlay, 'pass overlay mevcut');
  eq(passOverlay.color, 'white');
  eq(frame.easing, 'linear');
});

// ── 6. Annotation action → annotation overlay + focus point ──────────────

test('annotation action: overlay + focus.points\'e annotation noktası eklenir', () => {
  const scene = moveScene({
    actions: [
      { type: 'place-stone', point: { x: 4, y: 4 }, color: 'black' },
      { type: 'highlight-move', point: { x: 4, y: 4 }, color: 'black' },
      { type: 'highlight-annotation', annotation: { id: 'a1', type: 'circle', point: { x: 5, y: 5 } } },
    ],
  });
  const plan = basePlan({ scenes: [scene] });
  const { cameraPlan } = buildMotionCameraPlan(plan);
  const frame = cameraPlan.frames[0];
  const overlay = frame.overlays.find(o => o.type === 'annotation');
  ok(overlay, 'annotation overlay mevcut');
  eq(overlay.annotation.type, 'circle');
  eq(overlay.annotation.point.x, 5);
  ok(frame.focus.points.some(p => p.x === 5 && p.y === 5), 'annotation noktası focus.points\'e eklendi');
  ok(frame.focus.points.some(p => p.x === 4 && p.y === 4), 'move noktası da hâlâ focus.points\'te');
});

test('edge-type annotation (arrow): from/to ikisi de focus.points\'e eklenir', () => {
  const scene = moveScene({
    actions: [
      { type: 'place-stone', point: { x: 4, y: 4 }, color: 'black' },
      { type: 'highlight-move', point: { x: 4, y: 4 }, color: 'black' },
      { type: 'highlight-annotation', annotation: { id: 'a2', type: 'arrow', from: { x: 1, y: 1 }, to: { x: 2, y: 2 } } },
    ],
  });
  const { cameraPlan } = buildMotionCameraPlan(basePlan({ scenes: [scene] }));
  const points = cameraPlan.frames[0].focus.points;
  ok(points.some(p => p.x === 1 && p.y === 1), 'arrow from noktası dahil');
  ok(points.some(p => p.x === 2 && p.y === 2), 'arrow to noktası dahil');
});

// ── 7. Comment action → caption overlay ───────────────────────────────────

test('comment action: caption overlay metin taşıyor', () => {
  const scene = moveScene({
    actions: [
      { type: 'place-stone', point: { x: 4, y: 4 }, color: 'black' },
      { type: 'highlight-move', point: { x: 4, y: 4 }, color: 'black' },
      { type: 'show-comment', text: 'Öğrenci ığüşöç ÇĞÜŞÖİ testi' },
    ],
  });
  const { cameraPlan } = buildMotionCameraPlan(basePlan({ scenes: [scene] }));
  const overlay = cameraPlan.frames[0].overlays.find(o => o.type === 'caption');
  ok(overlay, 'caption overlay mevcut');
  eq(overlay.text, 'Öğrenci ığüşöç ÇĞÜŞÖİ testi');
});

// ── 8. move+annotation+comment birlikte ───────────────────────────────────

test('move+annotation+comment birlikte: tüm overlay/focus korunur', () => {
  const scene = captureScene({
    actions: [
      { type: 'place-stone', point: { x: 0, y: 1 }, color: 'black' },
      { type: 'highlight-move', point: { x: 0, y: 1 }, color: 'black' },
      { type: 'remove-captured-stones', stones: [{ x: 0, y: 0, color: 'white' }] },
      { type: 'highlight-annotation', annotation: { id: 'a1', type: 'square', point: { x: 3, y: 3 } } },
      { type: 'show-comment', text: 'Güzel hamle' },
    ],
  });
  const { cameraPlan } = buildMotionCameraPlan(basePlan({ scenes: [scene] }));
  const frame = cameraPlan.frames[0];
  eq(frame.camera.mode, 'area-focus', 'capture kind\'i korunuyor');
  ok(frame.focus.captures.length === 1, 'captures korunuyor');
  ok(frame.focus.points.some(p => p.x === 3 && p.y === 3), 'annotation noktası korunuyor');
  ok(frame.overlays.some(o => o.type === 'annotation'));
  ok(frame.overlays.some(o => o.type === 'caption' && o.text === 'Güzel hamle'));
});

// ── 9. Duration/easing defaults ───────────────────────────────────────────

test('durationMs scene\'den değiştirilmeden geliyor; easing kind\'e göre varsayılan', () => {
  const plan = basePlan({
    scenes: [
      setupScene([{ x: 0, y: 0, color: 'black' }]),
      moveScene({ durationMs: 1234 }),
      captureScene({ durationMs: 555 }),
      passScene({ durationMs: 999 }),
    ],
    board: { size: 9, initialStones: [{ x: 0, y: 0, color: 'black' }] },
  });
  const { cameraPlan } = buildMotionCameraPlan(plan);
  const [setupF, moveF, captureF, passF] = cameraPlan.frames;
  eq(setupF.durationMs, 1000);
  eq(setupF.easing, 'ease-out');
  eq(moveF.durationMs, 1234);
  eq(moveF.easing, 'ease-in-out');
  eq(captureF.durationMs, 555);
  eq(captureF.easing, 'emphasized');
  eq(passF.durationMs, 999);
  eq(passF.easing, 'linear');
});

// ── 10. 9/13/19 board size smoke ──────────────────────────────────────────

test('9/13/19 board boyutları: center board sınırlarını aşmaz', () => {
  for (const size of [9, 13, 19]) {
    const maxCoord = size - 1;
    const scene = moveScene({ focus: { x: maxCoord, y: maxCoord } , actions: [
      { type: 'place-stone', point: { x: maxCoord, y: maxCoord }, color: 'black' },
      { type: 'highlight-move', point: { x: maxCoord, y: maxCoord }, color: 'black' },
    ] });
    const plan = basePlan({ board: { size, initialStones: [] }, scenes: [scene] });
    const { cameraPlan } = buildMotionCameraPlan(plan);
    const frame = cameraPlan.frames[0];
    eq(cameraPlan.board.size, size);
    ok(frame.camera.center.x <= maxCoord && frame.camera.center.x >= 0, `${size}x${size}: center.x sınır içinde`);
    ok(frame.camera.center.y <= maxCoord && frame.camera.center.y >= 0, `${size}x${size}: center.y sınır içinde`);
  }
});

// ── 11. Warnings taşınır ───────────────────────────────────────────────────

test('intentPlan.warnings cameraPlan.warnings\'e taşınır', () => {
  const plan = basePlan({ warnings: ['M2: legacy marker overlay dağıtılmadı'] });
  const { warnings } = buildMotionCameraPlan(plan);
  ok(warnings.includes('M2: legacy marker overlay dağıtılmadı'), 'M1/M2 warning zinciri M3\'e kadar korunuyor');
});

test('bilinmeyen scene.kind: sessizce yok sayılmaz, warning ile full-board\'a düşer', () => {
  const plan = basePlan({
    scenes: [{
      id: 'scene-weird', eventId: 'evt-w', nodeId: 'nw', kind: 'annotation', title: 'Bilinmeyen',
      narration: '', focus: null, actions: [], durationMs: 500,
    }],
  });
  const { cameraPlan, warnings } = buildMotionCameraPlan(plan);
  eq(cameraPlan.frames[0].camera.mode, 'full-board');
  ok(warnings.some(w => w.includes('bilinmeyen') && w.includes('annotation')), 'bilinmeyen kind warning\'e kaydedildi: ' + JSON.stringify(warnings));
});

// ── 12. Invalid plan → açık hata ───────────────────────────────────────────

test('invalid intent plan: null/eksik scenes açık hata fırlatır', () => {
  assert.throws(() => buildMotionCameraPlan(null), /MOTION_CAMERA_INVALID_PLAN/);
  assert.throws(() => buildMotionCameraPlan(undefined), /MOTION_CAMERA_INVALID_PLAN/);
  assert.throws(() => buildMotionCameraPlan({}), /MOTION_CAMERA_NO_SCENES/);
  assert.throws(() => buildMotionCameraPlan({ scenes: 'not-array' }), /MOTION_CAMERA_NO_SCENES/);
});

// ── 13. M1+M2+M3 entegrasyon smoke ─────────────────────────────────────────

test('M1+M2+M3 entegrasyon smoke: küçük Studio doc → storyboard → intent → cameraPlan', () => {
  const doc = createDocument({ id: 'camera-smoke', title: 'Smoke', slug: 'camera-smoke' });
  const root = doc.moveTree.root;
  root.formation.stones.push({ x: 0, y: 0, color: 'white' });
  root.formation.stones.push({ x: 1, y: 0, color: 'black' });
  const r1 = addChildMove(root, 'root', { color: 'black', x: 0, y: 1 }); // (0,0) beyazı yakalar
  ok(r1.ok, `hamle eklendi (${r1.reason ?? 'ok'})`);
  ok(setMoveNodeAnnotations(root, r1.node.id, [{ type: 'circle', point: { x: 0, y: 1 } }], 9));
  ok(setMoveNodeComment(root, r1.node.id, 'Köşe yakalama'));
  doc.moveTree.activeNodeId = r1.node.id;

  const { storyboard } = buildMotionStoryboard(doc);
  const { plan } = buildMotionIntent(storyboard);
  const { cameraPlan, warnings } = buildMotionCameraPlan(plan);

  eq(cameraPlan.frames.length, 2, 'setup + 1 hamle frame');
  eq(cameraPlan.frames[0].camera.mode, 'full-board');
  eq(cameraPlan.frames[1].camera.mode, 'area-focus', 'yakalama içeren hamle area-focus');
  ok(cameraPlan.frames[1].overlays.some(o => o.type === 'annotation'), 'annotation entegrasyonda da overlay olarak var');
  ok(cameraPlan.frames[1].overlays.some(o => o.type === 'caption' && o.text === 'Köşe yakalama'), 'comment entegrasyonda da caption olarak var');
  eq(cameraPlan.source.documentId, 'camera-smoke');
  eq(warnings.length, 0, 'bu senaryoda hiç warning üretilmez');
});

console.log(`\nToplam: ${passed + failed}  ✓ ${passed}  ✗ ${failed}`);
if (failed) process.exit(1);
