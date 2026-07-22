/**
 * tests/studio-motion-storyboard.test.js
 * node tests/studio-motion-storyboard.test.js
 *
 * AG-MOTION M1 — studio/adapters/motionStoryboardAdapter.js'in saf
 * StudioDocument → storyboard/timeline dönüşümünü doğrular. UI/IPC/dosya
 * yazma/render motoru YOK — yalnız veri sözleşmesi.
 */

import assert from 'node:assert/strict';

import { buildMotionStoryboard } from '../studio/adapters/motionStoryboardAdapter.js';
import { createDocument } from '../studio/model/studioDocument.js';
import {
  addChildMove,
  addPassMove,
  setMoveNodeAnnotations,
  setMoveNodeComment,
} from '../studio/model/moveTree.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓', name); passed++; }
  catch (e) { console.error('  ✗', name, '-', e.message); failed++; }
}
function ok(val, msg = 'assertion failed') { if (!val) throw new Error(msg); }
function eq(a, b, msg) { if (a !== b) throw new Error(msg ?? `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }

console.log('\n─── studio-motion-storyboard.test.js ───\n');

// ── 1. Boş belge ─────────────────────────────────────────────────────────

test('boş belge: empty timeline, initialStones boş', () => {
  const doc = createDocument({ id: 'sb-empty', title: 'Empty', slug: 'sb-empty' });
  const { storyboard, warnings } = buildMotionStoryboard(doc);
  eq(storyboard.version, '0.1');
  eq(storyboard.timeline.length, 0, 'timeline boş');
  eq(storyboard.board.initialStones.length, 0, 'initialStones boş');
  eq(storyboard.board.size, 9, 'varsayılan boyut 9');
  eq(storyboard.source.documentId, 'sb-empty');
  eq(storyboard.source.activeNodeId, 'root');
  eq(warnings.length, 0, 'boş belge warning üretmez');
  eq(storyboard.warnings.length, 0, 'storyboard.warnings da boş — dönüş değeriyle tutarlı');
});

// ── 2. Setup taşları ─────────────────────────────────────────────────────

test('setup taşları: initialStones dolu, timeline boş', () => {
  const doc = createDocument({ id: 'sb-setup', title: '', slug: 'sb-setup' });
  doc.moveTree.root.formation.stones.push({ x: 2, y: 2, color: 'black' });
  doc.moveTree.root.formation.stones.push({ x: 6, y: 6, color: 'white' });

  const { storyboard } = buildMotionStoryboard(doc);
  eq(storyboard.timeline.length, 0, 'hamle yok — timeline boş');
  eq(storyboard.board.initialStones.length, 2, 'initialStones 2 taş içeriyor');
  ok(storyboard.board.initialStones.some(s => s.x === 2 && s.y === 2 && s.color === 'black'), 'siyah setup taşı mevcut');
  ok(storyboard.board.initialStones.some(s => s.x === 6 && s.y === 6 && s.color === 'white'), 'beyaz setup taşı mevcut');
});

// ── 3. Tek hamle: event + before/after ───────────────────────────────────

test('tek hamle: bir move event, before/after doğru', () => {
  const doc = createDocument({ id: 'sb-move', title: '', slug: 'sb-move' });
  const root = doc.moveTree.root;
  const r1 = addChildMove(root, 'root', { color: 'black', x: 4, y: 4 });
  ok(r1.ok, 'hamle eklendi');
  doc.moveTree.activeNodeId = r1.node.id;

  const { storyboard } = buildMotionStoryboard(doc);
  eq(storyboard.timeline.length, 1, 'bir event');
  const evt = storyboard.timeline[0];
  eq(evt.type, 'move');
  eq(evt.nodeId, r1.node.id);
  eq(evt.id, `evt-${r1.node.id}`);
  eq(evt.color, 'black');
  eq(evt.pass, false);
  eq(evt.move.x, 4);
  eq(evt.move.y, 4);
  eq(evt.before.stones.length, 0, 'before: hamleden önce taş yok');
  eq(evt.before.turn, 'black', 'before: sıra siyahta');
  eq(evt.after.stones.length, 1, 'after: hamle sonrası 1 taş');
  eq(evt.after.turn, 'white', 'after: sıra beyaza geçti');
  eq(evt.captures.length, 0, 'capture yok');
  ok(Number.isInteger(evt.durationMs) && evt.durationMs > 0, 'durationMs pozitif tamsayı');
});

// ── 4. Pass hamlesi ───────────────────────────────────────────────────────

test('pass hamlesi: type pass, pass true, move null', () => {
  const doc = createDocument({ id: 'sb-pass', title: '', slug: 'sb-pass' });
  const root = doc.moveTree.root;
  const p1 = addPassMove(root, 'root', 'black');
  ok(p1.ok, 'pass eklendi');
  doc.moveTree.activeNodeId = p1.node.id;

  const { storyboard } = buildMotionStoryboard(doc);
  eq(storyboard.timeline.length, 1);
  const evt = storyboard.timeline[0];
  eq(evt.type, 'pass');
  eq(evt.pass, true);
  eq(evt.move, null, 'pass event\'te move null');
  eq(evt.color, 'black');
  eq(evt.after.turn, 'white', 'pass sonrası sıra değişti');
  eq(evt.after.stones.length, 0, 'pass taş yerleştirmez');
  eq(evt.captures.length, 0);
});

// ── 5. Capture içeren hamle ────────────────────────────────────────────────

test('capture içeren hamle: captures listesi doğru (köşe yakalama)', () => {
  // Beyaz (0,0) köşede, yalnız 2 nefes: (1,0) ve (0,1). (1,0) siyah setup.
  // Siyah (0,1)'e oynayınca beyaz taş yakalanır.
  const doc = createDocument({ id: 'sb-capture', title: '', slug: 'sb-capture' });
  const root = doc.moveTree.root;
  root.formation.stones.push({ x: 0, y: 0, color: 'white' });
  root.formation.stones.push({ x: 1, y: 0, color: 'black' });
  const r1 = addChildMove(root, 'root', { color: 'black', x: 0, y: 1 });
  ok(r1.ok, `hamle eklendi (${r1.reason ?? 'ok'})`);
  doc.moveTree.activeNodeId = r1.node.id;

  const { storyboard } = buildMotionStoryboard(doc);
  const evt = storyboard.timeline[0];
  eq(evt.captures.length, 1, 'bir taş yakalandı');
  eq(evt.captures[0].x, 0);
  eq(evt.captures[0].y, 0);
  eq(evt.captures[0].color, 'white', 'yakalanan taş beyaz');
  ok(!evt.after.stones.some(s => s.x === 0 && s.y === 0), 'yakalanan taş after snapshot\'ta yok');
  ok(evt.after.stones.some(s => s.x === 0 && s.y === 1 && s.color === 'black'), 'yeni siyah taş after\'ta var');
});

// ── 6/7. Active path ve varyasyon ────────────────────────────────────────

test('active path: yalnız seçili node\'a giden path, varyasyon dahil edilmez', () => {
  const doc = createDocument({ id: 'sb-variation', title: '', slug: 'sb-variation' });
  const root = doc.moveTree.root;
  const main = addChildMove(root, 'root', { color: 'black', x: 2, y: 2 });
  const variant = addChildMove(root, 'root', { color: 'black', x: 6, y: 6 });
  ok(main.ok && variant.ok);

  // Varsayılan mainline seçili (ilk eklenen preferred)
  doc.moveTree.activeNodeId = main.node.id;
  const { storyboard: sbMain } = buildMotionStoryboard(doc);
  eq(sbMain.timeline.length, 1);
  eq(sbMain.timeline[0].move.x, 2, 'ana hat seçiliyken yalnız (2,2) timeline\'da');
  eq(sbMain.source.activeNodeId, main.node.id);

  // Varyasyona geçilince yalnız o dal görünür
  doc.moveTree.activeNodeId = variant.node.id;
  const { storyboard: sbVariant } = buildMotionStoryboard(doc);
  eq(sbVariant.timeline.length, 1);
  eq(sbVariant.timeline[0].move.x, 6, 'varyasyon seçiliyken yalnız (6,6) timeline\'da');
  eq(sbVariant.source.activeNodeId, variant.node.id);
});

test('options.nodeId açıkça geçilirse doc.activeNodeId\'yi geçersiz kılar', () => {
  const doc = createDocument({ id: 'sb-nodeid', title: '', slug: 'sb-nodeid' });
  const root = doc.moveTree.root;
  const a = addChildMove(root, 'root', { color: 'black', x: 1, y: 1 });
  const b = addChildMove(root, 'root', { color: 'black', x: 3, y: 3 });
  doc.moveTree.activeNodeId = a.node.id; // belge b'yi değil a'yı işaret ediyor

  const { storyboard } = buildMotionStoryboard(doc, { nodeId: b.node.id });
  eq(storyboard.timeline[0].move.x, 3, 'options.nodeId doc\'un kendi activeNodeId\'sini geçersiz kılıyor');
});

test('options.mode "mainline": preferredChildId zincirini ana hattın sonuna kadar izler', () => {
  const doc = createDocument({ id: 'sb-mainline', title: '', slug: 'sb-mainline' });
  const root = doc.moveTree.root;
  const m1 = addChildMove(root, 'root', { color: 'black', x: 2, y: 2 });
  const m2 = addChildMove(root, m1.node.id, { color: 'white', x: 3, y: 3 });
  const variant = addChildMove(root, 'root', { color: 'black', x: 6, y: 6 }); // kardeş varyasyon
  ok(m1.ok && m2.ok && variant.ok);
  doc.moveTree.activeNodeId = variant.node.id; // aktif düğüm varyasyonda olsa bile

  const { storyboard } = buildMotionStoryboard(doc, { mode: 'mainline' });
  eq(storyboard.timeline.length, 2, 'mainline modu activeNodeId\'den bağımsız — preferred zinciri izlenir');
  eq(storyboard.timeline[0].move.x, 2);
  eq(storyboard.timeline[1].move.x, 3);
  eq(storyboard.source.activeNodeId, m2.node.id, 'mainline modunda activeNodeId zincirin son düğümü');
});

// ── 8. Annotations ────────────────────────────────────────────────────────

test('annotations: node.annotations event\'e taşınır', () => {
  const doc = createDocument({ id: 'sb-ann', title: '', slug: 'sb-ann' });
  const root = doc.moveTree.root;
  const r1 = addChildMove(root, 'root', { color: 'black', x: 4, y: 4 });
  ok(setMoveNodeAnnotations(root, r1.node.id, [{ type: 'circle', point: { x: 4, y: 4 } }], 9));
  doc.moveTree.activeNodeId = r1.node.id;

  const { storyboard } = buildMotionStoryboard(doc);
  const evt = storyboard.timeline[0];
  eq(evt.annotations.length, 1);
  eq(evt.annotations[0].type, 'circle');
  eq(evt.annotations[0].point.x, 4);
});

test('kök düğümün annotations\'ı timeline\'a sızmaz, warning\'e kaydedilir', () => {
  const doc = createDocument({ id: 'sb-root-ann', title: '', slug: 'sb-root-ann' });
  const root = doc.moveTree.root;
  ok(setMoveNodeAnnotations(root, 'root', [{ type: 'circle', point: { x: 1, y: 1 } }], 9));

  const { storyboard, warnings } = buildMotionStoryboard(doc);
  eq(storyboard.timeline.length, 0, 'hamle yok — timeline boş kalmalı');
  ok(warnings.some(w => w.includes('root') && w.includes('annotations')), 'kök annotation\'ı warning\'e kaydedildi: ' + JSON.stringify(warnings));
});

// ── 9. Comments ───────────────────────────────────────────────────────────

test('comments: node.comment event\'e taşınır', () => {
  const doc = createDocument({ id: 'sb-comment', title: '', slug: 'sb-comment' });
  const root = doc.moveTree.root;
  const r1 = addChildMove(root, 'root', { color: 'black', x: 4, y: 4 });
  ok(setMoveNodeComment(root, r1.node.id, 'Öğrenci ığüşöç ÇĞÜŞÖİ testi'));
  doc.moveTree.activeNodeId = r1.node.id;

  const { storyboard } = buildMotionStoryboard(doc);
  eq(storyboard.timeline[0].comment, 'Öğrenci ığüşöç ÇĞÜŞÖİ testi');
});

// ── 10. Legacy/global doc.board.markers ────────────────────────────────────

test('legacy doc.board.markers silinmez — overlay alanına taşınır ve warning\'e kaydedilir', () => {
  const doc = createDocument({ id: 'sb-legacy-markers', title: '', slug: 'sb-legacy-markers' });
  doc.board.markers = [{ x: 3, y: 3, type: 'triangle' }, { x: 5, y: 5, type: 'square' }];

  const { storyboard, warnings } = buildMotionStoryboard(doc);
  ok(Array.isArray(storyboard.legacyMarkersOverlay), 'legacyMarkersOverlay dizi olarak mevcut');
  eq(storyboard.legacyMarkersOverlay.length, 2, 'iki eski marker de korundu, silinmedi');
  ok(storyboard.legacyMarkersOverlay.some(m => m.x === 3 && m.type === 'triangle'));
  ok(warnings.some(w => w.includes('board.markers')), 'warning eski marker\'ların zaman çizgisine dağıtılmadığını belirtiyor: ' + JSON.stringify(warnings));
});

test('legacy doc.board.markers yoksa overlay alanı hiç oluşmaz', () => {
  const doc = createDocument({ id: 'sb-no-legacy', title: '', slug: 'sb-no-legacy' });
  const { storyboard } = buildMotionStoryboard(doc);
  ok(!('legacyMarkersOverlay' in storyboard), 'marker yoksa overlay alanı eklenmiyor');
});

// ── 11. Invalid doc → açık hata ─────────────────────────────────────────────

test('invalid doc: null/eksik moveTree açık hata fırlatır', () => {
  assert.throws(() => buildMotionStoryboard(null), /MOTION_STORYBOARD_INVALID_DOCUMENT/);
  assert.throws(() => buildMotionStoryboard(undefined), /MOTION_STORYBOARD_INVALID_DOCUMENT/);
  assert.throws(() => buildMotionStoryboard({}), /MOTION_STORYBOARD_NO_MOVETREE/);
  assert.throws(() => buildMotionStoryboard({ moveTree: {} }), /MOTION_STORYBOARD_NO_MOVETREE/);
});

// ── Ek: out-of-bounds / illegal hamle sessizce geçilmez ────────────────────

test('out-of-bounds hamle: sessizce atlanmaz, açık hata fırlatır', () => {
  const doc = createDocument({ id: 'sb-oob', title: '', slug: 'sb-oob' });
  const root = doc.moveTree.root;
  // addChildMove kendi sınır kontrolünü yapar; adapter'ın KENDİ kontrolünü
  // test etmek için doğrudan ağaca geçersiz koordinatlı düğüm ekliyoruz
  // (studio-sgf-adapter.test.js'teki "sınır dışı hamle" testiyle aynı teknik).
  root.children.push({
    id: 'oob-node', parentId: 'root', move: { color: 'black', x: 25, y: 25 },
    children: [], comment: '', annotations: [], rawProperties: {}, preferredChildId: null, formation: null,
  });
  root.preferredChildId = 'oob-node';
  doc.moveTree.activeNodeId = 'oob-node';

  assert.throws(() => buildMotionStoryboard(doc), /MOTION_STORYBOARD_ILLEGAL_MOVE/);
});

test('dolu noktaya hamle (illegal): sessizce atlanmaz, açık hata fırlatır', () => {
  const doc = createDocument({ id: 'sb-illegal', title: '', slug: 'sb-illegal' });
  const root = doc.moveTree.root;
  root.formation.stones.push({ x: 4, y: 4, color: 'black' });
  root.children.push({
    id: 'illegal-node', parentId: 'root', move: { color: 'white', x: 4, y: 4 }, // dolu nokta
    children: [], comment: '', annotations: [], rawProperties: {}, preferredChildId: null, formation: null,
  });
  root.preferredChildId = 'illegal-node';
  doc.moveTree.activeNodeId = 'illegal-node';

  assert.throws(() => buildMotionStoryboard(doc), /MOTION_STORYBOARD_ILLEGAL_MOVE/);
});

// ── Ek: SGF exporter davranışı değişmedi (kapsam dışı — dokunulmadı doğrulaması) ──

test('sgfAdapter.js formatSGF bu adapter tarafından etkilenmedi', async () => {
  const { formatSGF } = await import('../studio/adapters/sgfAdapter.js');
  const doc = createDocument({ id: 'sb-sgf-untouched', title: '', slug: 'sb-sgf-untouched' });
  const { sgf } = formatSGF(doc);
  ok(sgf.startsWith('(;GM[1]FF[4]CA[UTF-8]'), 'formatSGF hâlâ aynı şekilde çalışıyor');
});

console.log(`\nToplam: ${passed + failed}  ✓ ${passed}  ✗ ${failed}`);
if (failed) process.exit(1);
