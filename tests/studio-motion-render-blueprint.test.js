/**
 * tests/studio-motion-render-blueprint.test.js
 * node tests/studio-motion-render-blueprint.test.js
 *
 * AG-MOTION M4 — studio/adapters/motionRenderBlueprintAdapter.js'in saf
 * camera-plan → renderer-bağımsız render blueprint dönüşümünü doğrular.
 * DOM/SVG/canvas/UI/IPC/dosya yazma YOK — yalnız veri sözleşmesi.
 */

import assert from 'node:assert/strict';

import { buildMotionRenderBlueprint, pointToPixel } from '../studio/adapters/motionRenderBlueprintAdapter.js';
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

console.log('\n─── studio-motion-render-blueprint.test.js ───\n');

// ── Yardımcı: minimal, elle kurulmuş cameraPlan fixture'ları ─────────────

function basePlan(overrides = {}) {
  return {
    version: '0.1',
    source: { documentId: 'c-1', title: 'Test', activeNodeId: 'root', boardSize: 9 },
    board: { size: 9, initialStones: [] },
    frames: [],
    warnings: [],
    ...overrides,
  };
}

function setupFrame(stones) {
  return {
    id: 'frame-scene-setup', sceneId: 'scene-setup', nodeId: 'root', kind: 'setup',
    camera: { mode: 'full-board', center: null, zoom: 1, padding: 1.5 },
    focus: { points: [], stones, captures: [] },
    overlays: [], durationMs: 1000, easing: 'ease-out',
  };
}

function moveFrame(overrides = {}) {
  return {
    id: 'frame-e1', sceneId: 'scene-e1', nodeId: 'n1', kind: 'move',
    camera: { mode: 'point-focus', center: { x: 4, y: 4 }, zoom: 1.4, padding: 1.5 },
    focus: { points: [{ x: 4, y: 4 }], stones: [], captures: [] },
    overlays: [], durationMs: 800, easing: 'ease-in-out',
    ...overrides,
  };
}

function captureFrame(overrides = {}) {
  return {
    id: 'frame-e2', sceneId: 'scene-e2', nodeId: 'n2', kind: 'capture',
    camera: { mode: 'area-focus', center: { x: 0, y: 0.5 }, zoom: 1.6, padding: 1.5 },
    focus: { points: [{ x: 0, y: 1 }], stones: [], captures: [{ x: 0, y: 0, color: 'white' }] },
    overlays: [], durationMs: 800, easing: 'emphasized',
    ...overrides,
  };
}

function passFrame(overrides = {}) {
  return {
    id: 'frame-e3', sceneId: 'scene-e3', nodeId: 'n3', kind: 'pass',
    camera: { mode: 'full-board', center: null, zoom: 1, padding: 1.5 },
    focus: { points: [], stones: [], captures: [] },
    overlays: [{ type: 'pass', color: 'white' }], durationMs: 800, easing: 'linear',
    ...overrides,
  };
}

// ── 1. Boş cameraPlan → boş clips ────────────────────────────────────────

test('boş cameraPlan: clips boş, viewport her zaman geçerli', () => {
  const { blueprint, warnings } = buildMotionRenderBlueprint(basePlan());
  eq(blueprint.version, '0.1');
  eq(blueprint.clips.length, 0);
  eq(warnings.length, 0);
  eq(blueprint.viewport.width, 1280);
  eq(blueprint.viewport.height, 720);
  ok(blueprint.viewport.boardRect.width > 0 && blueprint.viewport.boardRect.height > 0, 'boardRect geçerli');
  eq(blueprint.viewport.coordinateSystem.origin, 'top-left');
  eq(blueprint.viewport.coordinateSystem.yAxis, 'down');
});

// ── 2. Setup frame → draw-board + draw-initial-stones ────────────────────

test('setup frame: draw-board ile başlar, draw-initial-stones içerir', () => {
  const stones = [{ x: 2, y: 2, color: 'black' }, { x: 6, y: 6, color: 'white' }];
  const plan = basePlan({ board: { size: 9, initialStones: stones }, frames: [setupFrame(stones)] });
  const { blueprint } = buildMotionRenderBlueprint(plan);
  const clip = blueprint.clips[0];
  eq(clip.id, 'clip-frame-scene-setup');
  eq(clip.steps[0].type, 'draw-board', 'ilk step her zaman draw-board');
  const initStep = clip.steps.find(s => s.type === 'draw-initial-stones');
  ok(initStep, 'draw-initial-stones mevcut');
  eq(initStep.stones.length, 2);
  ok(initStep.stones[0].pixel, 'stone pixel dönüşümü hazır');
  ok(clip.layers.includes('board') && clip.layers.includes('stones'));
  eq(clip.steps.some(s => s.type === 'camera-move'), false, 'full-board\'ta camera-move yok');
});

// ── 3. Move frame → place-stone + pulse-move ─────────────────────────────

test('move frame: place-stone + pulse-move sırayla, pixel dönüşümü doğru', () => {
  const plan = basePlan({ frames: [moveFrame()] });
  const { blueprint } = buildMotionRenderBlueprint(plan);
  const clip = blueprint.clips[0];
  const types = clip.steps.map(s => s.type);
  eq(types[0], 'draw-board');
  ok(types.includes('place-stone'));
  ok(types.includes('pulse-move'));
  const placeIdx = types.indexOf('place-stone');
  const pulseIdx = types.indexOf('pulse-move');
  ok(placeIdx < pulseIdx, 'place-stone pulse-move\'dan önce');
  const placeStep = clip.steps[placeIdx];
  eq(placeStep.point.x, 4);
  eq(placeStep.point.y, 4);
  ok(Number.isFinite(placeStep.pixel.x) && Number.isFinite(placeStep.pixel.y), 'place-stone pixel hazır');
});

// ── 4. Capture frame → capture step sırası ────────────────────────────────

test('capture frame: place-stone, pulse-move, lift-captured-stones, fade-out-captured-stones sırayla', () => {
  const plan = basePlan({ frames: [captureFrame()] });
  const { blueprint } = buildMotionRenderBlueprint(plan);
  const clip = blueprint.clips[0];
  const types = clip.steps.map(s => s.type);
  const expectedOrder = ['draw-board', 'place-stone', 'pulse-move', 'lift-captured-stones', 'fade-out-captured-stones'];
  eq(types.slice(0, 5).join(','), expectedOrder.join(','), 'capture step sırası: ' + types.join(','));
  const lift = clip.steps.find(s => s.type === 'lift-captured-stones');
  eq(lift.stones.length, 1);
  eq(lift.stones[0].x, 0);
  eq(lift.stones[0].color, 'white');
  ok(clip.layers.includes('captures'));
});

// ── 5. Pass frame → show-pass ─────────────────────────────────────────────

test('pass frame: show-pass, renk overlay\'den geliyor, place-stone yok', () => {
  const plan = basePlan({ frames: [passFrame()] });
  const { blueprint } = buildMotionRenderBlueprint(plan);
  const clip = blueprint.clips[0];
  const passStep = clip.steps.find(s => s.type === 'show-pass');
  ok(passStep, 'show-pass mevcut');
  eq(passStep.color, 'white');
  ok(!clip.steps.some(s => s.type === 'place-stone'), 'pass\'te place-stone yok');
  ok(!clip.steps.some(s => s.type === 'camera-move'), 'pass full-board — camera-move yok');
});

// ── 6. Annotation overlay → fade-in-annotation ────────────────────────────

test('annotation overlay: fade-in-annotation, annotation + points pixel dahil', () => {
  const frame = moveFrame({ overlays: [{ type: 'annotation', annotation: { id: 'a1', type: 'circle', point: { x: 5, y: 5 } } }] });
  const { blueprint } = buildMotionRenderBlueprint(basePlan({ frames: [frame] }));
  const step = blueprint.clips[0].steps.find(s => s.type === 'fade-in-annotation');
  ok(step, 'fade-in-annotation mevcut');
  eq(step.annotation.type, 'circle');
  eq(step.points.length, 1);
  eq(step.points[0].x, 5);
  ok(step.points[0].pixel, 'annotation noktası pixel\'e çevrilmiş');
  ok(blueprint.clips[0].layers.includes('annotations'));
});

test('edge-type annotation (arrow) blueprint\'te de from/to ikisini işler', () => {
  const frame = moveFrame({ overlays: [{ type: 'annotation', annotation: { id: 'a2', type: 'arrow', from: { x: 1, y: 1 }, to: { x: 2, y: 2 } } }] });
  const { blueprint } = buildMotionRenderBlueprint(basePlan({ frames: [frame] }));
  const step = blueprint.clips[0].steps.find(s => s.type === 'fade-in-annotation');
  eq(step.points.length, 2);
});

// ── 7. Caption overlay → show-caption ──────────────────────────────────────

test('caption overlay: show-caption metni taşıyor', () => {
  const frame = moveFrame({ overlays: [{ type: 'caption', text: 'Öğrenci ığüşöç ÇĞÜŞÖİ testi' }] });
  const { blueprint } = buildMotionRenderBlueprint(basePlan({ frames: [frame] }));
  const step = blueprint.clips[0].steps.find(s => s.type === 'show-caption');
  ok(step, 'show-caption mevcut');
  eq(step.text, 'Öğrenci ığüşöç ÇĞÜŞÖİ testi');
  ok(blueprint.clips[0].layers.includes('caption'));
});

// ── 8. point-focus/area-focus → camera-move; full-board → yok ────────────

test('point-focus ve area-focus camera-move step üretir', () => {
  const { blueprint: bpMove } = buildMotionRenderBlueprint(basePlan({ frames: [moveFrame()] }));
  const moveCam = bpMove.clips[0].steps.find(s => s.type === 'camera-move');
  ok(moveCam, 'move (point-focus) camera-move üretir');
  eq(moveCam.mode, 'point-focus');
  ok(moveCam.pixel, 'camera-move pixel dönüşümü hazır');

  const { blueprint: bpCapture } = buildMotionRenderBlueprint(basePlan({ frames: [captureFrame()] }));
  const captureCam = bpCapture.clips[0].steps.find(s => s.type === 'camera-move');
  ok(captureCam, 'capture (area-focus) camera-move üretir');
  eq(captureCam.mode, 'area-focus');
});

test('full-board (setup/pass) gereksiz camera-move üretmez', () => {
  const stones = [{ x: 0, y: 0, color: 'black' }];
  const { blueprint } = buildMotionRenderBlueprint(basePlan({
    board: { size: 9, initialStones: stones },
    frames: [setupFrame(stones), passFrame()],
  }));
  ok(!blueprint.clips[0].steps.some(s => s.type === 'camera-move'), 'setup camera-move yok');
  ok(!blueprint.clips[1].steps.some(s => s.type === 'camera-move'), 'pass camera-move yok');
});

// ── 9. Duration/easing korunur ────────────────────────────────────────────

test('clip.durationMs/easing frame\'den değiştirilmeden geliyor', () => {
  const plan = basePlan({
    frames: [
      moveFrame({ durationMs: 1234, easing: 'ease-in-out' }),
      captureFrame({ durationMs: 555, easing: 'emphasized' }),
    ],
  });
  const { blueprint } = buildMotionRenderBlueprint(plan);
  eq(blueprint.clips[0].durationMs, 1234);
  eq(blueprint.clips[0].easing, 'ease-in-out');
  eq(blueprint.clips[1].durationMs, 555);
  eq(blueprint.clips[1].easing, 'emphasized');
});

// ── 10. pointToPixel: 9/13/19 board, boardRenderer yönüyle uyumlu ────────

test('pointToPixel: doğrusal, flip yok — boardRenderer.js px()/cell() ile aynı yön', () => {
  const boardRect = { x: 100, y: 50, width: 400, height: 400 };
  for (const size of [9, 13, 19]) {
    const topLeft = pointToPixel({ x: 0, y: 0 }, size, boardRect);
    eq(topLeft.x, boardRect.x, `${size}: (0,0) → boardRect.x`);
    eq(topLeft.y, boardRect.y, `${size}: (0,0) → boardRect.y (üst — flip yok)`);

    const bottomRight = pointToPixel({ x: size - 1, y: size - 1 }, size, boardRect);
    eq(bottomRight.x, boardRect.x + boardRect.width, `${size}: (max,max) → sağ kenar`);
    eq(bottomRight.y, boardRect.y + boardRect.height, `${size}: (max,max) → alt kenar (y aşağı artıyor)`);

    // x ve y aynı yönde, aynı doğrusal ölçekte artıyor (boardRenderer'daki
    // px(idx,size)=PAD+idx*cell(size) formülüyle birebir aynı yapı)
    const mid = pointToPixel({ x: 1, y: 0 }, size, boardRect);
    const cellSize = boardRect.width / (size - 1);
    ok(Math.abs(mid.x - (boardRect.x + cellSize)) < 1e-9, `${size}: hücre boyutu tutarlı`);
  }
});

// ── 11. Warnings taşınır ───────────────────────────────────────────────────

test('cameraPlan.warnings blueprint.warnings\'e taşınır', () => {
  const plan = basePlan({ warnings: ['M2: legacy marker overlay dağıtılmadı', 'M3: bilinmeyen kind'] });
  const { warnings } = buildMotionRenderBlueprint(plan);
  ok(warnings.includes('M2: legacy marker overlay dağıtılmadı'));
  ok(warnings.includes('M3: bilinmeyen kind'));
});

test('bilinmeyen frame.kind: sessizce yok sayılmaz, warning ile yalnız draw-board üretilir', () => {
  const plan = basePlan({
    frames: [{
      id: 'frame-weird', sceneId: 'scene-weird', nodeId: 'nw', kind: 'annotation',
      camera: { mode: 'full-board', center: null, zoom: 1, padding: 1.5 },
      focus: { points: [], stones: [], captures: [] }, overlays: [], durationMs: 500, easing: 'linear',
    }],
  });
  const { blueprint, warnings } = buildMotionRenderBlueprint(plan);
  eq(blueprint.clips[0].steps.length, 1, 'yalnız draw-board');
  eq(blueprint.clips[0].steps[0].type, 'draw-board');
  ok(warnings.some(w => w.includes('bilinmeyen') && w.includes('annotation')));
});

// ── 12. Invalid cameraPlan → açık hata ─────────────────────────────────────

test('invalid cameraPlan: null/eksik frames açık hata fırlatır', () => {
  assert.throws(() => buildMotionRenderBlueprint(null), /MOTION_BLUEPRINT_INVALID_CAMERA_PLAN/);
  assert.throws(() => buildMotionRenderBlueprint(undefined), /MOTION_BLUEPRINT_INVALID_CAMERA_PLAN/);
  assert.throws(() => buildMotionRenderBlueprint({}), /MOTION_BLUEPRINT_NO_FRAMES/);
  assert.throws(() => buildMotionRenderBlueprint({ frames: 'not-array' }), /MOTION_BLUEPRINT_NO_FRAMES/);
});

// ── 13. M1+M2+M3+M4 entegrasyon smoke ──────────────────────────────────────

test('M1+M2+M3+M4 entegrasyon smoke: küçük Studio doc → storyboard → intent → camera → blueprint', () => {
  const doc = createDocument({ id: 'blueprint-smoke', title: 'Smoke', slug: 'blueprint-smoke' });
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
  const { cameraPlan } = buildMotionCameraPlan(plan);
  const { blueprint, warnings } = buildMotionRenderBlueprint(cameraPlan);

  eq(blueprint.clips.length, 2, 'setup + 1 hamle clip');
  eq(blueprint.clips[0].steps[0].type, 'draw-board');
  ok(blueprint.clips[0].steps.some(s => s.type === 'draw-initial-stones'));
  const captureClip = blueprint.clips[1];
  eq(captureClip.kind, 'capture');
  ok(captureClip.steps.some(s => s.type === 'lift-captured-stones'));
  ok(captureClip.steps.some(s => s.type === 'fade-in-annotation'), 'annotation entegrasyonda da adım oldu');
  ok(captureClip.steps.some(s => s.type === 'show-caption' && s.text === 'Köşe yakalama'), 'comment entegrasyonda da caption oldu');
  ok(captureClip.steps.some(s => s.type === 'camera-move'), 'capture area-focus olduğu için camera-move var');
  eq(blueprint.source.documentId, 'blueprint-smoke');
  eq(warnings.length, 0, 'bu senaryoda hiç warning üretilmez');
});

console.log(`\nToplam: ${passed + failed}  ✓ ${passed}  ✗ ${failed}`);
if (failed) process.exit(1);
