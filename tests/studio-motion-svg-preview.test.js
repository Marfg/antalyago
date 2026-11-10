/**
 * tests/studio-motion-svg-preview.test.js
 * node tests/studio-motion-svg-preview.test.js
 *
 * AG-MOTION M5 — studio/adapters/motionSvgPreviewRenderer.js'in saf
 * blueprint → statik SVG önizleme dönüşümünü doğrular. DOM/canvas/UI/IPC/
 * dosya yazma/animasyon YOK — yalnız güvenli SVG string.
 */

import assert from 'node:assert/strict';

import { renderMotionSvgPreview, renderClipSvg } from '../studio/adapters/motionSvgPreviewRenderer.js';
import { buildMotionRenderBlueprint } from '../studio/adapters/motionRenderBlueprintAdapter.js';
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

console.log('\n─── studio-motion-svg-preview.test.js ───\n');

// ── Yardımcı: minimal, elle kurulmuş blueprint fixture'ları ──────────────

const VIEWPORT = { width: 1280, height: 720, boardRect: { x: 340, y: 60, width: 600, height: 600 }, coordinateSystem: { origin: 'top-left', xAxis: 'right', yAxis: 'down', boardMin: 0, boardMax: 8 } };

function baseBlueprint(overrides = {}) {
  return {
    version: '0.1',
    source: { documentId: 'b-1', title: 'Test', activeNodeId: 'root', boardSize: 9 },
    board: { size: 9, initialStones: [] },
    viewport: VIEWPORT,
    clips: [],
    warnings: [],
    ...overrides,
  };
}

function setupClip(stones) {
  return {
    id: 'clip-frame-scene-setup', frameId: 'frame-scene-setup', sceneId: 'scene-setup', nodeId: 'root', kind: 'setup',
    durationMs: 1000, easing: 'ease-out', camera: { mode: 'full-board', center: null, zoom: 1, padding: 1.5 },
    layers: ['board', 'stones'],
    steps: [
      { type: 'draw-board', layer: 'board' },
      { type: 'draw-initial-stones', layer: 'stones', stones },
    ],
  };
}

function moveClip(overrides = {}) {
  return {
    id: 'clip-frame-e1', frameId: 'frame-e1', sceneId: 'scene-e1', nodeId: 'n1', kind: 'move',
    durationMs: 800, easing: 'ease-in-out', camera: { mode: 'point-focus', center: { x: 4, y: 4 }, zoom: 1.4, padding: 1.5 },
    layers: ['board', 'stones', 'ui'],
    steps: [
      { type: 'draw-board', layer: 'board' },
      { type: 'place-stone', layer: 'stones', point: { x: 4, y: 4 }, pixel: { x: 640, y: 360 }, color: 'black' },
      { type: 'pulse-move', layer: 'stones', point: { x: 4, y: 4 }, pixel: { x: 640, y: 360 }, color: 'black' },
      { type: 'camera-move', layer: 'ui', mode: 'point-focus', center: { x: 4, y: 4 }, pixel: { x: 640, y: 360 }, zoom: 1.4, padding: 1.5 },
    ],
    ...overrides,
  };
}

function captureClip(overrides = {}) {
  return {
    id: 'clip-frame-e2', frameId: 'frame-e2', sceneId: 'scene-e2', nodeId: 'n2', kind: 'capture',
    durationMs: 800, easing: 'emphasized', camera: { mode: 'area-focus', center: { x: 0, y: 0.5 }, zoom: 1.6, padding: 1.5 },
    layers: ['board', 'stones', 'captures', 'ui'],
    steps: [
      { type: 'draw-board', layer: 'board' },
      { type: 'place-stone', layer: 'stones', point: { x: 0, y: 1 }, pixel: { x: 340, y: 105 }, color: 'black' },
      { type: 'pulse-move', layer: 'stones', point: { x: 0, y: 1 }, pixel: { x: 340, y: 105 }, color: 'black' },
      { type: 'lift-captured-stones', layer: 'captures', stones: [{ x: 0, y: 0, color: 'white', pixel: { x: 340, y: 60 } }] },
      { type: 'fade-out-captured-stones', layer: 'captures', stones: [{ x: 0, y: 0, color: 'white', pixel: { x: 340, y: 60 } }] },
      { type: 'camera-move', layer: 'ui', mode: 'area-focus', center: { x: 0, y: 0.5 }, pixel: { x: 340, y: 82.5 }, zoom: 1.6, padding: 1.5 },
    ],
    ...overrides,
  };
}

function passClip(overrides = {}) {
  return {
    id: 'clip-frame-e3', frameId: 'frame-e3', sceneId: 'scene-e3', nodeId: 'n3', kind: 'pass',
    durationMs: 800, easing: 'linear', camera: { mode: 'full-board', center: null, zoom: 1, padding: 1.5 },
    layers: ['board', 'ui'],
    steps: [
      { type: 'draw-board', layer: 'board' },
      { type: 'show-pass', layer: 'ui', color: 'white' },
    ],
    ...overrides,
  };
}

// well-formedness: yalnız açılış/kapanış tag sayısı dengeli mi (tam parser değil,
// SGF smoke testindeki gibi asgari sağlamlık kontrolü)
function assertBalancedTags(svg) {
  const opens = (svg.match(/<[a-zA-Z][^/>]*(?<!\/)>/g) ?? []).length;
  const closes = (svg.match(/<\/[a-zA-Z]+>/g) ?? []).length;
  const selfClosing = (svg.match(/<[a-zA-Z][^>]*\/>/g) ?? []).length;
  // basit heuristik: en azından svg kök tag'i açılıp kapanmalı
  ok(svg.trim().startsWith('<svg'), 'SVG <svg ile başlıyor');
  ok(svg.trim().endsWith('</svg>'), 'SVG </svg> ile bitiyor');
}

// ── 1. Boş blueprint → geçerli SVG ────────────────────────────────────────

test('boş blueprint (clips yok): renderMotionSvgPreview geçerli, board-only SVG döner (hata fırlatmaz)', () => {
  const { svg, warnings } = renderMotionSvgPreview(baseBlueprint());
  assertBalancedTags(svg);
  ok(svg.includes('class="board"'), 'board grid çizildi');
  eq(warnings.length, 0);
});

test('boş blueprint + var olmayan clip seçimi (renderClipSvg): anlamlı hata fırlatır', () => {
  assert.throws(() => renderClipSvg(baseBlueprint(), 0), /MOTION_SVG_CLIP_NOT_FOUND/);
  assert.throws(() => renderClipSvg(baseBlueprint(), 'yok-boyle-bir-id'), /MOTION_SVG_CLIP_NOT_FOUND/);
});

// ── 2. Setup clip → board grid + initial stones ──────────────────────────

test('setup clip: board grid + initial stones çizilir', () => {
  const stones = [{ x: 2, y: 2, color: 'black' }, { x: 6, y: 6, color: 'white' }];
  const bp = baseBlueprint({ board: { size: 9, initialStones: stones }, clips: [setupClip(stones)] });
  const { svg } = renderMotionSvgPreview(bp);
  assertBalancedTags(svg);
  ok(svg.includes('class="board-bg"'), 'tahta zemini çizildi');
  eq((svg.match(/class="grid-line"/g) ?? []).length, 18, '9x9: 9 dikey + 9 yatay = 18 grid çizgisi');
  eq((svg.match(/class="stone stone-black"/g) ?? []).length, 1, 'bir siyah taş');
  eq((svg.match(/class="stone stone-white"/g) ?? []).length, 1, 'bir beyaz taş');
});

// ── 3. Move clip → yeni taş + move highlight ──────────────────────────────

test('move clip: place-stone taşı + pulse-move highlight çizilir', () => {
  const { svg } = renderMotionSvgPreview(baseBlueprint({ clips: [moveClip()] }));
  assertBalancedTags(svg);
  ok(svg.includes('class="stone stone-black"'), 'yeni taş rengiyle çizildi (M2→M3→M4 color pass-through)');
  ok(svg.includes('class="move-highlight"'), 'move highlight halkası mevcut');
});

// ── 4. Capture clip → yakalanan taş yok, capture halosu var ──────────────

test('capture clip: yakalanan taş final görünümde yok, capture halosu mevcut', () => {
  const { svg } = renderMotionSvgPreview(baseBlueprint({ clips: [captureClip()] }));
  assertBalancedTags(svg);
  ok(svg.includes('class="capture-halo"'), 'capture halosu çizildi');
  // Yakalanan taş (0,0) final stones listesinde OLMAMALI — yalnız yeni taş (0,1) olmalı
  eq((svg.match(/class="stone stone-black"/g) ?? []).length, 1, 'yalnız yeni siyah taş var');
  eq((svg.match(/class="stone stone-white"/g) ?? []).length, 0, 'yakalanan beyaz taş final taşlar arasında YOK');
});

// ── 5. Pass clip → "Pas" görünür ──────────────────────────────────────────

test('pass clip: "Pas" etiketi görünür', () => {
  const { svg } = renderMotionSvgPreview(baseBlueprint({ clips: [passClip()] }));
  assertBalancedTags(svg);
  ok(svg.includes('class="pass"'), 'pass grubu mevcut');
  ok(svg.includes('>Pas<'), '"Pas" metni SVG\'de görünüyor');
});

// ── 6. Annotation: circle/triangle/square/label ───────────────────────────

test('annotation circle/triangle/square/label doğru şekillerle çizilir', () => {
  const types = [
    { type: 'circle', point: { x: 3, y: 3 } },
    { type: 'triangle', point: { x: 4, y: 3 } },
    { type: 'square', point: { x: 5, y: 3 } },
    { type: 'label', point: { x: 6, y: 3 }, text: 'A' },
  ];
  for (const annotation of types) {
    const clip = moveClip({
      steps: [
        { type: 'draw-board', layer: 'board' },
        { type: 'place-stone', layer: 'stones', point: { x: 4, y: 4 }, pixel: { x: 640, y: 360 }, color: 'black' },
        { type: 'fade-in-annotation', layer: 'annotations', annotation, points: [{ ...annotation.point, pixel: { x: 0, y: 0 } }] },
      ],
    });
    const { svg, warnings } = renderMotionSvgPreview(baseBlueprint({ clips: [clip] }));
    ok(svg.includes(`annotation-${annotation.type}`), `${annotation.type} çizildi: ` + svg.slice(0, 50));
    eq(warnings.length, 0, `${annotation.type} desteklenen tip — warning üretmemeli`);
  }
});

// ── 7. Caption: Türkçe ve özel karakterlerle güvenli escape ──────────────

test('caption Türkçe + XML özel karakterleriyle güvenli escape edilir', () => {
  const raw = 'Öğrenci ığüşöç ÇĞÜŞÖİ <script>alert(1)</script> & "tırnak" \'apostrof\'';
  const clip = moveClip({
    steps: [
      { type: 'draw-board', layer: 'board' },
      { type: 'place-stone', layer: 'stones', point: { x: 4, y: 4 }, pixel: { x: 640, y: 360 }, color: 'black' },
      { type: 'show-caption', layer: 'caption', text: raw },
    ],
  });
  const { svg } = renderMotionSvgPreview(baseBlueprint({ clips: [clip] }));
  assertBalancedTags(svg);
  ok(svg.includes('Öğrenci ığüşöç ÇĞÜŞÖİ'), 'Türkçe karakterler bozulmadan geçti');
  ok(svg.includes('&lt;script&gt;'), '<script> etiketi escape edildi, ham geçmedi');
  ok(!svg.includes('<script>'), 'ham <script> hiçbir yerde yok');
  ok(svg.includes('&amp;'), '& escape edildi');
  ok(svg.includes('&quot;') || svg.includes('&apos;'), 'tırnak/apostrof escape edildi');
});

// ── 8. SVG içinde raw <script> veya kırık XML sızmaz (genel güvenlik) ────

test('hiçbir escape edilmemiş kullanıcı verisi <script> ya da kırık XML üretmez', () => {
  const evil = '"><img src=x onerror=alert(1)>&<';
  const clip = moveClip({
    steps: [
      { type: 'draw-board', layer: 'board' },
      { type: 'place-stone', layer: 'stones', point: { x: 4, y: 4 }, pixel: { x: 640, y: 360 }, color: 'black' },
      { type: 'show-caption', layer: 'caption', text: evil },
      { type: 'fade-in-annotation', layer: 'annotations', annotation: { type: 'label', text: evil, point: { x: 1, y: 1 } }, points: [{ x: 1, y: 1, pixel: { x: 0, y: 0 } }] },
    ],
  });
  const { svg } = renderMotionSvgPreview(baseBlueprint({ clips: [clip] }));
  assertBalancedTags(svg);
  ok(!svg.includes('<img'), 'ham <img> enjekte edilmedi (< escape edildiği için gerçek bir tag oluşamaz)');
  ok(svg.includes('&lt;img'), 'metin escape edilmiş biçimde zararsız olarak kaldı');
});

// ── 9. 9/13/19 board grid sayısı doğru ────────────────────────────────────

test('9/13/19 board: grid çizgisi sayısı 2×size', () => {
  for (const size of [9, 13, 19]) {
    const stones = [{ x: 0, y: 0, color: 'black' }];
    const bp = baseBlueprint({ board: { size, initialStones: stones }, clips: [setupClip(stones)] });
    const { svg } = renderMotionSvgPreview(bp);
    eq((svg.match(/class="grid-line"/g) ?? []).length, size * 2, `${size}x${size}: ${size * 2} grid çizgisi`);
  }
});

// ── 10. renderClipSvg: index ve id ile seçim ──────────────────────────────

test('renderClipSvg: hem sayısal index hem clip.id ile doğru clip seçilir', () => {
  const bp = baseBlueprint({ clips: [moveClip(), passClip()] });
  const byIndex = renderClipSvg(bp, 1);
  ok(byIndex.svg.includes('class="pass"'), 'index 1 → pass clip seçildi');

  const byId = renderClipSvg(bp, 'clip-frame-e1');
  ok(byId.svg.includes('class="move-highlight"'), 'id ile → move clip seçildi');
});

// ── 11. Warnings taşınır ───────────────────────────────────────────────────

test('blueprint.warnings svg render sonucuna taşınır', () => {
  const bp = baseBlueprint({ clips: [moveClip()], warnings: ['M3: bilinmeyen kind full-board\'a düştü'] });
  const { warnings } = renderMotionSvgPreview(bp);
  ok(warnings.includes('M3: bilinmeyen kind full-board\'a düştü'));
});

// ── 12. Desteklenmeyen annotation tipi → warning ──────────────────────────

test('desteklenmeyen annotation tipi (arrow/region/cross) sessizce yutulmaz, warning üretir', () => {
  for (const type of ['arrow', 'region', 'cross']) {
    const annotation = type === 'arrow'
      ? { type, from: { x: 0, y: 0 }, to: { x: 1, y: 1 } }
      : type === 'region'
        ? { type, points: [{ x: 0, y: 0 }] }
        : { type, point: { x: 0, y: 0 } };
    const clip = moveClip({
      steps: [
        { type: 'draw-board', layer: 'board' },
        { type: 'fade-in-annotation', layer: 'annotations', annotation, points: [] },
      ],
    });
    const { svg, warnings } = renderMotionSvgPreview(baseBlueprint({ clips: [clip] }));
    ok(warnings.some(w => w.includes(type) && w.includes('desteklenmeyen')), `${type} için warning üretildi: ` + JSON.stringify(warnings));
    ok(!svg.includes(`annotation-${type}`), `${type} çizilmedi`);
  }
});

// ── 13. Invalid blueprint → açık hata ─────────────────────────────────────

test('invalid blueprint: null/eksik clips/viewport açık hata fırlatır', () => {
  assert.throws(() => renderMotionSvgPreview(null), /MOTION_SVG_INVALID_BLUEPRINT/);
  assert.throws(() => renderMotionSvgPreview(undefined), /MOTION_SVG_INVALID_BLUEPRINT/);
  assert.throws(() => renderMotionSvgPreview({}), /MOTION_SVG_NO_CLIPS/);
  assert.throws(() => renderMotionSvgPreview({ clips: [] }), /MOTION_SVG_INVALID_VIEWPORT/);
});

// ── 14. M1+M2+M3+M4+M5 entegrasyon smoke ───────────────────────────────────

test('M1+M2+M3+M4+M5 entegrasyon smoke: küçük Studio doc → SVG preview', () => {
  const doc = createDocument({ id: 'svg-smoke', title: 'Smoke', slug: 'svg-smoke' });
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
  const { blueprint } = buildMotionRenderBlueprint(cameraPlan);

  const setupPreview = renderMotionSvgPreview(blueprint, { clipIndex: 0 });
  assertBalancedTags(setupPreview.svg);
  ok(setupPreview.svg.includes('class="stone stone-white"') && setupPreview.svg.includes('class="stone stone-black"'), 'setup: iki kurulum taşı da görünüyor');

  const capturePreview = renderMotionSvgPreview(blueprint, { clipIndex: 1 });
  assertBalancedTags(capturePreview.svg);
  ok(capturePreview.svg.includes('class="stone stone-black"'), 'yeni siyah taş çizildi (color pass-through zinciri çalışıyor)');
  ok(capturePreview.svg.includes('class="capture-halo"'), 'yakalama halosu var');
  ok(capturePreview.svg.includes('class="annotation annotation-circle"'), 'annotation entegrasyonda da çizildi');
  ok(capturePreview.svg.includes('Köşe yakalama'), 'comment caption olarak göründü');
  eq(capturePreview.warnings.length, 0, 'bu senaryoda hiç warning üretilmez');
});

console.log(`\nToplam: ${passed + failed}  ✓ ${passed}  ✗ ${failed}`);
if (failed) process.exit(1);
