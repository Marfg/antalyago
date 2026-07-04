import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BoardState } from '../core/boardState.js';
import { createStudioBoardAdapter } from '../desktop/ipc/studioBoardAdapter.js';
import {
  STUDIO_VERSION,
  createDocument,
  migrateDocument,
} from '../studio/model/studioDocument.js';
import {
  ANNOTATION_TYPES,
  ANNOTATION_LABEL_MAX_LENGTH,
  MAX_ANNOTATIONS_PER_NODE,
  MAX_TREE_NODES,
  MAX_TREE_DEPTH,
  MAX_RAW_PROPERTIES_PER_NODE,
  MAX_RAW_PROP_VALUE_LENGTH,
  INTERNAL_RAW_PROP_ALLOWLIST,
  addChildMove,
  addPassMove,
  countTreeNodes,
  createAnnotation,
  createMoveNode,
  deleteMoveNode,
  ensureMoveTreeDocument,
  findMoveNode,
  getMovePath,
  isExportableSgfProperty,
  rebuildBoardState,
  serializeMainlineMoves,
  setMoveNodeAnnotations,
  setMoveNodeRawProperties,
  validateAnnotation,
  validateRawProperties,
} from '../studio/model/moveTree.js';
import fileHandlersModule from '../desktop/ipc/fileHandlers.cjs';

const { readAgstudioDocument, writeAgstudioDocument } = fileHandlersModule;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = path.join(root, 'tests', 'fixtures');

const PASS = [];
const FAIL = [];

// Async-aware test collector
const TESTS = [];
function test(name, fn) {
  TESTS.push({ name, fn });
}
function ok(value, message = 'assertion failed') { assert.ok(value, message); }
function eq(actual, expected, message) { assert.equal(actual, expected, message); }

console.log('\n─── studio-text-tree.test.js ───\n');

// ── Temel testler ────────────────────────────────────────────────────

test('masaüstü metinleri UTF-8 ve mojibake içermiyor', async () => {
  const mojibakePatterns = [/Ã/, /Ä/, /Å/, /Â/];
  const indexHtml = fs.readFileSync(path.join(root, 'desktop', 'index.html'), 'utf8');
  const appText = fs.readFileSync(path.join(root, 'desktop', 'renderer', 'app.mjs'), 'utf8');
  const mainText = fs.readFileSync(path.join(root, 'desktop', 'ipc', 'fileHandlers.cjs'), 'utf8');
  ok(indexHtml.includes('<meta charset="UTF-8">'), 'charset UTF-8 eksik');
  ok(indexHtml.includes('Hamle Ağacı'), 'Hamle Ağacı metni eksik');
  ok(appText.includes('Hamle ağacı'), 'renderer hamle ağacı metni eksik');
  ok(appText.includes('İçerik Üretici modu'), 'temiz Türkçe metin eksik');
  ok(mainText.includes('Geçersiz .agstudio yolu.'), 'ana süreçte UTF-8 metni eksik');
  for (const text of [indexHtml, appText, mainText]) {
    ok(!mojibakePatterns.some(p => p.test(text)), 'mojibake bulundu');
  }
});

test('createDocument moveTree kökü ve aktif düğümü hazırlar', () => {
  const doc = createDocument({ id: 'tree-doc', title: 'Tree Doc' });
  eq(doc.moveTree.root.id, 'root');
  eq(doc.moveTree.activeNodeId, 'root');
  eq(doc.activeNodeId, 'root');
  ok(Array.isArray(doc.moves), 'moves dizisi yok');
});

test('legacy moves[] ana dala dönüşür', () => {
  const doc = migrateDocument({
    studioVersion: '1.0.0',
    id: 'legacy-tree',
    status: 'draft',
    title: 'Legacy Tree',
    slug: 'legacy-tree',
    summary: '',
    curriculum: { section: 'B1', lesson: 'l1', step: '', objectives: [], skills: [], prerequisites: [] },
    classification: { problemType: 'tsumego', subtype: '', difficulty: 'beginner', playerToMove: 'black', goal: 'best-move' },
    board: { size: 9, turn: 'black', ko: null, stones: [], markers: [], regions: [], viewport: null },
    moves: [
      { color: 'black', x: 4, y: 4, annotation: 'ana hamle' },
      { color: 'white', x: 4, y: 5, annotation: 'devam' },
    ],
    solution: { sequences: [], acceptedFirstMoves: [], wrongMoves: [], hint: '', explanation: '' },
    timeline: { durationMs: 0, events: [] },
    sources: [],
    outputs: { problemBank: true, lesson3d: false, sgf: false, motion: false, obsidian: false, image: false },
    audit: { createdAt: '2026-07-03T00:00:00.000Z', updatedAt: '2026-07-03T00:00:00.000Z', author: '', reviewedAt: null },
    extensions: {},
  });
  eq(doc.moveTree.root.children.length, 1);
  eq(serializeMainlineMoves(doc.moveTree.root).length, 2);
  eq(doc.moves.length, 2);
});

test('ana dal ve varyant oluşturma çalışır', () => {
  const doc = createDocument({ id: 'variant-tree', title: 'Variant Tree',
    board: { size: 9, turn: 'black', ko: null, stones: [], markers: [], regions: [], viewport: null } });
  const rootNode = doc.moveTree.root;
  const first = addChildMove(rootNode, 'root', { color: 'black', x: 4, y: 4 });
  assert.ok(first.ok, first.reason);
  const second = addChildMove(rootNode, 'root', { color: 'black', x: 3, y: 3 });
  assert.ok(second.ok, second.reason);
  eq(rootNode.children.length, 2);
  eq(rootNode.preferredChildId, first.node.id);
  ok(findMoveNode(rootNode, second.node.id), 'varyant düğümü bulunamadı');
});

test('düğüme gidince tahta doğru yeniden kurulur', () => {
  const doc = createDocument({ id: 'rebuild-tree', title: 'Rebuild Tree',
    board: { size: 9, turn: 'black', ko: null, stones: [], markers: [], regions: [], viewport: null } });
  const rootNode = doc.moveTree.root;
  const a = addChildMove(rootNode, 'root', { color: 'black', x: 4, y: 4 });
  assert.ok(a.ok, a.reason);
  const b = addChildMove(rootNode, a.node.id, { color: 'white', x: 4, y: 5 });
  assert.ok(b.ok, b.reason);
  const board = rebuildBoardState(rootNode, b.node.id);
  eq(board.colorAt(4, 4), 'black');
  eq(board.colorAt(4, 5), 'white');
  eq(getMovePath(rootNode, b.node.id).length, 3);
});

test('yakalama geçmişi ileri geri gezinmede korunur', () => {
  const doc = createDocument({ id: 'capture-tree', title: 'Capture Tree',
    board: { size: 9, turn: 'black', ko: null, stones: [
      { x: 0, y: 1, color: 'black' }, { x: 2, y: 1, color: 'black' },
      { x: 1, y: 2, color: 'black' }, { x: 1, y: 1, color: 'white' },
    ], markers: [], regions: [], viewport: null } });
  const rootNode = doc.moveTree.root;
  const placed = addChildMove(rootNode, 'root', { color: 'black', x: 1, y: 0 });
  assert.ok(placed.ok, placed.reason);
  const board = rebuildBoardState(rootNode, placed.node.id);
  eq(board.colorAt(1, 0), 'black');
  eq(board.colorAt(1, 1), null);
});

test('yasadışı hamle reddedilir', () => {
  const doc = createDocument({ id: 'illegal-tree', title: 'Illegal Tree',
    board: { size: 9, turn: 'black', ko: null, stones: [{ x: 4, y: 4, color: 'black' }],
      markers: [], regions: [], viewport: null } });
  const result = addChildMove(doc.moveTree.root, 'root', { color: 'white', x: 4, y: 4 });
  eq(result.ok, false);
  ok(result.reason === 'OCCUPIED' || result.reason === 'SUICIDE');
});

test('varyant silme onaylı akışla temsil edilir', () => {
  const doc = createDocument({ id: 'delete-tree', title: 'Delete Tree',
    board: { size: 9, turn: 'black', ko: null, stones: [], markers: [], regions: [], viewport: null } });
  const rootNode = doc.moveTree.root;
  const first = addChildMove(rootNode, 'root', { color: 'black', x: 4, y: 4 });
  const second = addChildMove(rootNode, 'root', { color: 'black', x: 3, y: 3 });
  assert.ok(first.ok && second.ok);
  const deleted = deleteMoveNode(rootNode, second.node.id);
  eq(deleted.ok, true);
  eq(rootNode.children.length, 1);
});

test('kaydet-aç çevriminde ağaç korunur', async () => {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'agstudio-tree-'));
  const doc = createDocument({ id: 'roundtrip-tree', title: 'Roundtrip Tree', slug: 'roundtrip-tree',
    board: { size: 9, turn: 'black', ko: null, stones: [], markers: [], regions: [], viewport: null } });
  const rootNode = doc.moveTree.root;
  const first = addChildMove(rootNode, 'root', { color: 'black', x: 4, y: 4 });
  assert.ok(first.ok, first.reason);
  doc.moveTree.activeNodeId = first.node.id;
  doc.activeNodeId = first.node.id;
  const filePath = path.join(tmpDir, 'roundtrip-tree.agstudio');
  await writeAgstudioDocument(filePath, doc);
  const loaded = await readAgstudioDocument(filePath);
  eq(loaded.moveTree.root.children.length, 1);
  eq(loaded.activeNodeId, first.node.id);
  eq(loaded.moves.length, 1);
});

test('StudioBoardAdapter moveTree üzerinden tahtayı yeniden kurar', () => {
  const adapter = createStudioBoardAdapter(BoardState);
  const doc = createDocument({ id: 'adapter-tree', title: 'Adapter Tree',
    board: { size: 9, turn: 'black', ko: null, stones: [], markers: [], regions: [], viewport: null } });
  const rootNode = doc.moveTree.root;
  const first = addChildMove(rootNode, 'root', { color: 'black', x: 4, y: 4 });
  assert.ok(first.ok, first.reason);
  const state = adapter.fromMoveTree(doc.moveTree, first.node.id);
  eq(state.colorAt(4, 4), 'black');
});

// ── D0 sabitler ──────────────────────────────────────────────────────

test('D0 sabitler: ANNOTATION_TYPES doğru tipleri içeriyor', () => {
  const expected = ['triangle','square','circle','cross','selected','label','arrow','line','region'];
  for (const type of expected) ok(ANNOTATION_TYPES.includes(type), `${type} eksik`);
  eq(ANNOTATION_TYPES.length, expected.length);
});

test('D0 sabitler: limitler tanımlı ve makul', () => {
  ok(MAX_TREE_NODES >= 1000, `MAX_TREE_NODES çok küçük: ${MAX_TREE_NODES}`);
  ok(MAX_TREE_DEPTH >= 100, `MAX_TREE_DEPTH çok küçük: ${MAX_TREE_DEPTH}`);
  ok(MAX_ANNOTATIONS_PER_NODE >= 10, `MAX_ANNOTATIONS_PER_NODE çok küçük`);
  ok(ANNOTATION_LABEL_MAX_LENGTH >= 10, `ANNOTATION_LABEL_MAX_LENGTH çok küçük`);
});

// ── D0 validateAnnotation ─────────────────────────────────────────────

test('D0 ann: id zorunlu — eksikse reddedilir', () => {
  const r = validateAnnotation({ type: 'triangle', point: { x: 0, y: 0 } }, 9);
  eq(r.valid, false);
  eq(r.reason, 'ANNOTATION_ID_MISSING');
});

test('D0 ann: id boşsa reddedilir', () => {
  const r = validateAnnotation({ id: '', type: 'triangle', point: { x: 0, y: 0 } }, 9);
  eq(r.valid, false);
  eq(r.reason, 'ANNOTATION_ID_MISSING');
});

test('D0 ann: triangle id ile geçerli', () => {
  const r = validateAnnotation({ id: 'a1', type: 'triangle', point: { x: 3, y: 3 } }, 9);
  ok(r.valid, r.reason);
});

test('D0 ann: square, circle, cross, selected geçerli', () => {
  for (const type of ['square', 'circle', 'cross', 'selected']) {
    const r = validateAnnotation({ id: 'x', type, point: { x: 0, y: 0 } }, 9);
    ok(r.valid, `${type} geçersiz: ${r.reason}`);
  }
});

test('D0 ann: nokta işareti tahta dışı koordinat reddedilir', () => {
  const r = validateAnnotation({ id: 'x', type: 'triangle', point: { x: 9, y: 0 } }, 9);
  eq(r.valid, false);
  eq(r.reason, 'INVALID_POINT');
});

test('D0 ann: strict alan kontrolü — triangle+from reddedilir', () => {
  const r = validateAnnotation({ id: 'x', type: 'triangle', point: { x: 0, y: 0 }, from: { x: 1, y: 1 } }, 9);
  eq(r.valid, false);
  ok(r.reason.startsWith('UNEXPECTED_FIELD'), `beklenmeyen reason: ${r.reason}`);
});

test('D0 ann: strict alan kontrolü — arrow+point reddedilir', () => {
  const r = validateAnnotation({ id: 'x', type: 'arrow', from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, point: { x: 0, y: 0 } }, 9);
  eq(r.valid, false);
  ok(r.reason.startsWith('UNEXPECTED_FIELD'));
});

test('D0 ann: label geçerli', () => {
  const r = validateAnnotation({ id: 'x', type: 'label', point: { x: 2, y: 4 }, text: 'A' }, 9);
  ok(r.valid, r.reason);
});

test('D0 ann: label boş metin reddedilir', () => {
  const r = validateAnnotation({ id: 'x', type: 'label', point: { x: 2, y: 4 }, text: '' }, 9);
  eq(r.valid, false);
  eq(r.reason, 'EMPTY_LABEL_TEXT');
});

test('D0 ann: label uzunluk limiti aşılırsa reddedilir', () => {
  const r = validateAnnotation({ id: 'x', type: 'label', point: { x: 0, y: 0 }, text: 'A'.repeat(ANNOTATION_LABEL_MAX_LENGTH + 1) }, 9);
  eq(r.valid, false);
  eq(r.reason, 'LABEL_TOO_LONG');
});

test('D0 ann: arrow geçerli noktalarla kabul edilir', () => {
  const r = validateAnnotation({ id: 'x', type: 'arrow', from: { x: 0, y: 0 }, to: { x: 3, y: 3 } }, 9);
  ok(r.valid, r.reason);
});

test('D0 ann: arrow aynı başlangıç-bitiş reddedilir', () => {
  const r = validateAnnotation({ id: 'x', type: 'arrow', from: { x: 3, y: 3 }, to: { x: 3, y: 3 } }, 9);
  eq(r.valid, false);
  eq(r.reason, 'EDGE_SAME_START_END');
});

test('D0 ann: region geçerli', () => {
  const r = validateAnnotation({ id: 'x', type: 'region', points: [{ x: 0, y: 0 }] }, 9);
  ok(r.valid, r.reason);
});

test('D0 ann: region noktasız reddedilir', () => {
  const r = validateAnnotation({ id: 'x', type: 'region', points: [] }, 9);
  eq(r.valid, false);
  eq(r.reason, 'REGION_NO_POINTS');
});

test('D0 ann: bilinmeyen tip reddedilir', () => {
  const r = validateAnnotation({ id: 'x', type: 'nonexistent' }, 9);
  eq(r.valid, false);
  ok(r.reason.startsWith('UNKNOWN_ANNOTATION_TYPE'));
});

test('D0 ann: nesne olmayan değer reddedilir', () => {
  for (const value of [null, undefined, 'string', 42]) {
    const r = validateAnnotation(value, 9);
    eq(r.valid, false, `${JSON.stringify(value)} reddedilmedi`);
  }
});

test('D0 ann: createAnnotation id atar', () => {
  const ann = createAnnotation({ type: 'triangle', point: { x: 0, y: 0 } });
  ok(typeof ann.id === 'string' && ann.id.length > 0);
  ok(ann.id.startsWith('ann-'));
});

test('D0 ann: createAnnotation mevcut id korur', () => {
  const ann = createAnnotation({ id: 'my-id', type: 'square', point: { x: 1, y: 1 } });
  eq(ann.id, 'my-id');
});

// ── D0 setMoveNodeAnnotations sözleşme ───────────────────────────────

test('D0 setAnn: typed annotation kabul edilir', () => {
  const doc = createDocument({ id: 'ann-set', title: 'Ann Set',
    board: { size: 9, turn: 'black', ko: null, stones: [], markers: [], regions: [], viewport: null } });
  const result = setMoveNodeAnnotations(doc.moveTree.root, 'root', [
    { id: 'a1', type: 'triangle', point: { x: 3, y: 3 } },
    { id: 'a2', type: 'label', point: { x: 4, y: 4 }, text: 'X' },
  ], 9);
  ok(result, 'false döndü');
  eq(doc.moveTree.root.annotations.length, 2);
});

test('D0 setAnn: id eksikse otomatik atanır', () => {
  const doc = createDocument({ id: 'ann-auto-id', title: 'Ann AutoID',
    board: { size: 9, turn: 'black', ko: null, stones: [], markers: [], regions: [], viewport: null } });
  const result = setMoveNodeAnnotations(doc.moveTree.root, 'root', [
    { type: 'square', point: { x: 0, y: 0 } },
  ], 9);
  ok(result, 'false döndü');
  ok(typeof doc.moveTree.root.annotations[0].id === 'string');
  ok(doc.moveTree.root.annotations[0].id.length > 0);
});

test('D0 setAnn: benzersiz id zorunlu — tekrar eden reddedilir', () => {
  const doc = createDocument({ id: 'ann-dup-id', title: 'Ann DupID',
    board: { size: 9, turn: 'black', ko: null, stones: [], markers: [], regions: [], viewport: null } });
  const result = setMoveNodeAnnotations(doc.moveTree.root, 'root', [
    { id: 'same', type: 'triangle', point: { x: 0, y: 0 } },
    { id: 'same', type: 'square', point: { x: 1, y: 1 } },
  ], 9);
  eq(result, false, 'tekrar eden id kabul edildi');
});

test('D0 setAnn: MAX_ANNOTATIONS_PER_NODE aşılırsa reddedilir', () => {
  const doc = createDocument({ id: 'ann-limit', title: 'Ann Limit',
    board: { size: 9, turn: 'black', ko: null, stones: [], markers: [], regions: [], viewport: null } });
  const tooMany = Array.from({ length: MAX_ANNOTATIONS_PER_NODE + 1 }, (_, i) => ({
    id: `a${i}`, type: 'triangle', point: { x: 0, y: 0 },
  }));
  const result = setMoveNodeAnnotations(doc.moveTree.root, 'root', tooMany, 9);
  eq(result, false, 'limit aşıldı ama kabul edildi');
});

test('D0 setAnn: geçersiz annotation reddedilir — düğüm değişmez', () => {
  const doc = createDocument({ id: 'ann-reject', title: 'Ann Reject',
    board: { size: 9, turn: 'black', ko: null, stones: [], markers: [], regions: [], viewport: null } });
  setMoveNodeAnnotations(doc.moveTree.root, 'root', [{ id: 'ok1', type: 'triangle', point: { x: 1, y: 1 } }], 9);
  const result = setMoveNodeAnnotations(doc.moveTree.root, 'root', [
    { id: 'bad', type: 'label', point: { x: 2, y: 2 }, text: '' },
  ], 9);
  eq(result, false);
  eq(doc.moveTree.root.annotations.length, 1);
});

test('D0 setAnn: string reddedilir (LEGACY_STRING_ANNOTATION)', () => {
  const doc = createDocument({ id: 'ann-legacy-str', title: 'Ann LegacyStr',
    board: { size: 9, turn: 'black', ko: null, stones: [], markers: [], regions: [], viewport: null } });
  const result = setMoveNodeAnnotations(doc.moveTree.root, 'root', ['eski-string'], 9);
  eq(result, false, 'string kabul edildi');
});

test('D0 setAnn: tahta boyutuna göre koordinat doğrular', () => {
  const doc = createDocument({ id: 'ann-size', title: 'Ann Size',
    board: { size: 9, turn: 'black', ko: null, stones: [], markers: [], regions: [], viewport: null } });
  const result = setMoveNodeAnnotations(doc.moveTree.root, 'root', [
    { id: 'x', type: 'triangle', point: { x: 10, y: 10 } },
  ], 9);
  eq(result, false);
});

// ── D0 Pass hamlesi ──────────────────────────────────────────────────

test('D0 pass: addChildMove pass=true ile ekler', () => {
  const doc = createDocument({ id: 'pass-add', title: 'Pass Add',
    board: { size: 9, turn: 'black', ko: null, stones: [], markers: [], regions: [], viewport: null } });
  const result = addChildMove(doc.moveTree.root, 'root', { color: 'black', pass: true });
  ok(result.ok, result.reason);
  eq(result.node.move.color, 'black');
  eq(result.node.move.pass, true);
  ok(!('x' in result.node.move));
  ok(!('y' in result.node.move));
});

test('D0 pass: addPassMove kolaylık fonksiyonu', () => {
  const doc = createDocument({ id: 'pass-helper', title: 'Pass Helper',
    board: { size: 9, turn: 'black', ko: null, stones: [], markers: [], regions: [], viewport: null } });
  const result = addPassMove(doc.moveTree.root, 'root', 'white');
  ok(result.ok, result.reason);
  eq(result.node.move.color, 'white');
  eq(result.node.move.pass, true);
});

test('D0 pass: rebuildBoardState sırayı değiştirir', () => {
  const doc = createDocument({ id: 'pass-turn', title: 'Pass Turn',
    board: { size: 9, turn: 'black', ko: null, stones: [], markers: [], regions: [], viewport: null } });
  const r = addChildMove(doc.moveTree.root, 'root', { color: 'black', pass: true });
  ok(r.ok, r.reason);
  const board = rebuildBoardState(doc.moveTree.root, r.node.id);
  eq(board.turn, 'white');
});

test('D0 pass: iki ardışık pass sırayı başa döndürür', () => {
  const doc = createDocument({ id: 'pass-double', title: 'Pass Double',
    board: { size: 9, turn: 'black', ko: null, stones: [], markers: [], regions: [], viewport: null } });
  const p1 = addChildMove(doc.moveTree.root, 'root', { color: 'black', pass: true });
  ok(p1.ok, p1.reason);
  const p2 = addChildMove(doc.moveTree.root, p1.node.id, { color: 'white', pass: true });
  ok(p2.ok, p2.reason);
  const board = rebuildBoardState(doc.moveTree.root, p2.node.id);
  eq(board.turn, 'black');
});

test('D0 pass: pass sonrası taş yerleşmez', () => {
  const doc = createDocument({ id: 'pass-no-stone', title: 'Pass NoStone',
    board: { size: 9, turn: 'black', ko: null, stones: [], markers: [], regions: [], viewport: null } });
  const r = addChildMove(doc.moveTree.root, 'root', { color: 'black', pass: true });
  ok(r.ok, r.reason);
  const board = rebuildBoardState(doc.moveTree.root, r.node.id);
  for (let x = 0; x < 9; x++) {
    for (let y = 0; y < 9; y++) {
      eq(board.colorAt(x, y), null, `(${x},${y}) boş değil`);
    }
  }
});

test('D0 pass: ko pass sonrası temizlenir', () => {
  const doc = createDocument({ id: 'pass-ko', title: 'Pass Ko',
    board: { size: 9, turn: 'white', ko: { x: 4, y: 4 }, stones: [
      { x: 3, y: 4, color: 'black' }, { x: 5, y: 4, color: 'black' },
    ], markers: [], regions: [], viewport: null } });
  const r = addPassMove(doc.moveTree.root, 'root', 'white');
  ok(r.ok, r.reason);
  const board = rebuildBoardState(doc.moveTree.root, r.node.id);
  eq(board.koPoint, null, 'ko pass sonrası temizlenmedi');
});

test('D0 pass: varyant içi pass bağımsız çalışır', () => {
  const doc = createDocument({ id: 'pass-variant', title: 'Pass Variant',
    board: { size: 9, turn: 'black', ko: null, stones: [], markers: [], regions: [], viewport: null } });
  const rootNode = doc.moveTree.root;
  const m1 = addChildMove(rootNode, 'root', { color: 'black', x: 4, y: 4 });
  const p1 = addChildMove(rootNode, 'root', { color: 'black', pass: true });
  ok(m1.ok && p1.ok);
  eq(rootNode.children.length, 2);
  const mainBoard = rebuildBoardState(rootNode, m1.node.id);
  eq(mainBoard.colorAt(4, 4), 'black');
  const variantBoard = rebuildBoardState(rootNode, p1.node.id);
  eq(variantBoard.colorAt(4, 4), null, 'varyant tahtası yanlış');
  eq(variantBoard.turn, 'white');
});

test('D0 pass: serializeMainlineMoves pass hamlesi içeriyor', () => {
  const doc = createDocument({ id: 'pass-serial', title: 'Pass Serial',
    board: { size: 9, turn: 'black', ko: null, stones: [], markers: [], regions: [], viewport: null } });
  const m1 = addChildMove(doc.moveTree.root, 'root', { color: 'black', x: 4, y: 4 });
  const p1 = addChildMove(doc.moveTree.root, m1.node.id, { color: 'white', pass: true });
  const m3 = addChildMove(doc.moveTree.root, p1.node.id, { color: 'black', x: 3, y: 3 });
  ok(m1.ok && p1.ok && m3.ok);
  const moves = serializeMainlineMoves(doc.moveTree.root);
  eq(moves.length, 3);
  eq(moves[1].pass, true);
  ok(!('x' in moves[1]));
});

test('D0 pass: kaydet-aç çevriminde pass korunur', async () => {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'agstudio-pass-'));
  const doc = createDocument({ id: 'pass-rt', title: 'Pass RT', slug: 'pass-rt',
    board: { size: 9, turn: 'black', ko: null, stones: [], markers: [], regions: [], viewport: null } });
  const p1 = addPassMove(doc.moveTree.root, 'root', 'black');
  ok(p1.ok, p1.reason);
  const filePath = path.join(tmpDir, 'pass-rt.agstudio');
  await writeAgstudioDocument(filePath, doc);
  const loaded = await readAgstudioDocument(filePath);
  const loadedPass = loaded.moveTree.root.children[0];
  eq(loadedPass?.move?.pass, true);
  eq(loadedPass?.move?.color, 'black');
});

// ── D0 rawProperties ─────────────────────────────────────────────────

test('D0 rawProps: createMoveNode varsayılan boş nesne', () => {
  const doc = createDocument({ id: 'raw-def', title: 'Raw Def',
    board: { size: 9, turn: 'black', ko: null, stones: [], markers: [], regions: [], viewport: null } });
  const rp = doc.moveTree.root.rawProperties;
  ok(rp && typeof rp === 'object' && !Array.isArray(rp));
  eq(Object.keys(rp).length, 0);
});

test('D0 rawProps: addChildMove rawProperties ile düğüm oluşturur', () => {
  const doc = createDocument({ id: 'raw-add', title: 'Raw Add',
    board: { size: 9, turn: 'black', ko: null, stones: [], markers: [], regions: [], viewport: null } });
  const result = addChildMove(doc.moveTree.root, 'root', { color: 'black', x: 4, y: 4 }, {
    rawProperties: { AB: ['dd'], PM: ['2'] },
  });
  ok(result.ok, result.reason);
  assert.deepEqual(result.node.rawProperties.AB, ['dd']);
  assert.deepEqual(result.node.rawProperties.PM, ['2']);
});

test('D0 rawProps: setMoveNodeRawProperties doğrulayarak atar', () => {
  const doc = createDocument({ id: 'raw-set', title: 'Raw Set',
    board: { size: 9, turn: 'black', ko: null, stones: [], markers: [], regions: [], viewport: null } });
  const ok_result = setMoveNodeRawProperties(doc.moveTree.root, 'root', { GB: ['2'] });
  ok(ok_result);
  assert.deepEqual(doc.moveTree.root.rawProperties.GB, ['2']);
});

test('D0 rawProps: root ve node düzeyi kaydet-aç çevriminde korunur', async () => {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'agstudio-raw-'));
  const doc = createDocument({ id: 'raw-rt', title: 'Raw RT', slug: 'raw-rt',
    board: { size: 9, turn: 'black', ko: null, stones: [], markers: [], regions: [], viewport: null } });
  setMoveNodeRawProperties(doc.moveTree.root, 'root', { GM: ['1'], KM: ['6.5'] });
  const m = addChildMove(doc.moveTree.root, 'root', { color: 'black', x: 4, y: 4 }, {
    rawProperties: { BM: ['2'] },
  });
  ok(m.ok, m.reason);
  const filePath = path.join(tmpDir, 'raw-rt.agstudio');
  await writeAgstudioDocument(filePath, doc);
  const loaded = await readAgstudioDocument(filePath);
  assert.deepEqual(loaded.moveTree.root.rawProperties.GM, ['1']);
  assert.deepEqual(loaded.moveTree.root.children[0].rawProperties.BM, ['2']);
});

// ── D0 validateRawProperties ─────────────────────────────────────────

test('D0 rawProps val: geçerli SGF anahtarı kabul edilir', () => {
  const r = validateRawProperties({ AB: ['dd', 'ee'], KM: ['6.5'] });
  ok(r.valid, r.reason);
});

test('D0 rawProps val: _LEGACY_ANNOTATIONS allowlist dahili anahtar kabul edilir', () => {
  const r = validateRawProperties({ _LEGACY_ANNOTATIONS: ['eski-metin'] });
  ok(r.valid, r.reason);
});

test('D0 rawProps val: allowlist dışı _ anahtarı reddedilir', () => {
  for (const key of ['_UNKNOWN_INTERNAL', '_ANYTHING', '_XYZABC', '_']) {
    const raw = {};
    raw[key] = ['değer'];
    const r = validateRawProperties(raw);
    eq(r.valid, false, `${key} kabul edildi`);
    ok(r.reason.startsWith('UNKNOWN_INTERNAL_KEY'), `${key} reason: ${r.reason}`);
  }
});

test('D0 rawProps val: dahili değer array değilse reddedilir', () => {
  const r = validateRawProperties({ _LEGACY_ANNOTATIONS: 'dizi-değil' });
  eq(r.valid, false);
  ok(r.reason.startsWith('RAW_PROP_VALUES_NOT_ARRAY'));
});

test('D0 rawProps val: dahili değer string değilse reddedilir', () => {
  const r = validateRawProperties({ _LEGACY_ANNOTATIONS: [42] });
  eq(r.valid, false);
  ok(r.reason.startsWith('RAW_PROP_VALUE_NOT_STRING'));
});

test('D0 rawProps val: dahili değer adet limiti uygulanır', () => {
  const { maxValues } = INTERNAL_RAW_PROP_ALLOWLIST.get('_LEGACY_ANNOTATIONS');
  const tooMany = new Array(maxValues + 1).fill('metin');
  const r = validateRawProperties({ _LEGACY_ANNOTATIONS: tooMany });
  eq(r.valid, false);
  ok(r.reason.startsWith('TOO_MANY_RAW_PROP_VALUES'));
});

test('D0 rawProps val: dahili değer uzunluk limiti uygulanır', () => {
  const { maxValueLength } = INTERNAL_RAW_PROP_ALLOWLIST.get('_LEGACY_ANNOTATIONS');
  const r = validateRawProperties({ _LEGACY_ANNOTATIONS: ['x'.repeat(maxValueLength + 1)] });
  eq(r.valid, false);
  ok(r.reason.startsWith('RAW_PROP_VALUE_TOO_LONG'));
});

test('D0 rawProps val: __proto__ saldırısı reddedilir', () => {
  // { '__proto__': ... } literal JS'de prototype setter'dır; JSON.parse own property oluşturur
  const raw = JSON.parse('{"__proto__": ["kötü"]}');
  const r = validateRawProperties(raw);
  eq(r.valid, false);
  ok(r.reason.startsWith('DANGEROUS_PROPERTY_KEY'));
});

test('D0 rawProps val: constructor saldırısı reddedilir', () => {
  const r = validateRawProperties({ 'constructor': ['kötü'] });
  eq(r.valid, false);
  ok(r.reason.startsWith('DANGEROUS_PROPERTY_KEY'));
});

test('D0 rawProps val: prototype saldırısı reddedilir', () => {
  // 'prototype' own property olarak set edilebilir — JSON.parse gerekmez
  const r = validateRawProperties({ 'prototype': ['kötü'] });
  eq(r.valid, false);
  ok(r.reason.startsWith('DANGEROUS_PROPERTY_KEY'));
});

test('D0 rawProps val: küçük harf anahtar reddedilir', () => {
  const r = validateRawProperties({ ab: ['değer'] });
  eq(r.valid, false);
  ok(r.reason.startsWith('INVALID_RAW_PROP_KEY'));
});

test('D0 rawProps val: string olmayan değer reddedilir', () => {
  const r = validateRawProperties({ AB: [42] });
  eq(r.valid, false);
  ok(r.reason.startsWith('RAW_PROP_VALUE_NOT_STRING'));
});

test('D0 rawProps val: değer dizi olmayınca reddedilir', () => {
  const r = validateRawProperties({ AB: 'değer' });
  eq(r.valid, false);
  ok(r.reason.startsWith('RAW_PROP_VALUES_NOT_ARRAY'));
});

test('D0 rawProps val: çok uzun değer reddedilir', () => {
  const r = validateRawProperties({ AB: ['x'.repeat(MAX_RAW_PROP_VALUE_LENGTH + 1)] });
  eq(r.valid, false);
  ok(r.reason.startsWith('RAW_PROP_VALUE_TOO_LONG'));
});

test('D0 rawProps val: çok fazla property reddedilir', () => {
  const tooMany = {};
  for (let i = 0; i <= MAX_RAW_PROPERTIES_PER_NODE; i++) {
    const key = `P${String.fromCharCode(65 + (i % 26))}${String(i).padStart(2, '0')}`;
    tooMany[key.substring(0, 8)] = ['v'];
  }
  const r = validateRawProperties(tooMany);
  eq(r.valid, false);
  ok(
    r.reason === 'TOO_MANY_RAW_PROPERTIES' || r.reason.startsWith('INVALID_RAW_PROP_KEY'),
    `beklenmeyen reason: ${r.reason}`
  );
});

test('D0 rawProps val: setMoveNodeRawProperties tehlikeli anahtar reddeder', () => {
  const doc = createDocument({ id: 'raw-danger', title: 'Raw Danger',
    board: { size: 9, turn: 'black', ko: null, stones: [], markers: [], regions: [], viewport: null } });
  // JSON.parse ile own property olarak __proto__ oluştur (literal değil)
  const raw = JSON.parse('{"__proto__": ["kötü"]}');
  const result = setMoveNodeRawProperties(doc.moveTree.root, 'root', raw);
  eq(result, false);
});

// ── D0 Legacy annotation migrasyonu ──────────────────────────────────

test("D0 legacy: createMoveNode string annotation rawProperties._LEGACY_ANNOTATIONS'a taşır", () => {
  const node = createMoveNode({ annotations: ['eski-string', 'bir-daha'] });
  eq(node.annotations.length, 0, 'string annotation typed listede kalmamalı');
  assert.deepEqual(node.rawProperties._LEGACY_ANNOTATIONS, ['eski-string', 'bir-daha']);
});

test('D0 legacy: createMoveNode karışık annotation (string+typed) doğru ayırır', () => {
  const node = createMoveNode({
    annotations: ['string1', { id: 'a1', type: 'triangle', point: { x: 0, y: 0 } }, 'string2'],
  });
  eq(node.annotations.length, 1);
  eq(node.annotations[0].type, 'triangle');
  assert.deepEqual(node.rawProperties._LEGACY_ANNOTATIONS, ['string1', 'string2']);
});

test('D0 legacy: ensureMoveTreeDocument string annotation göç eder — veri kaybı yok', () => {
  const doc = ensureMoveTreeDocument({
    studioVersion: '1.0.0',
    id: 'legacy-ens',
    status: 'draft',
    title: 'Legacy Ensure',
    slug: 'legacy-ens',
    summary: '',
    board: { size: 9, turn: 'black', ko: null, stones: [], markers: [], regions: [], viewport: null },
    moveTree: {
      root: {
        id: 'root', parentId: null, move: null,
        children: [{
          id: 'c1', parentId: 'root',
          move: { color: 'black', x: 4, y: 4 },
          children: [],
          comment: '',
          annotations: ['eski-1', 'eski-2'],
          preferredChildId: null,
          formation: null,
        }],
        comment: '',
        annotations: ['root-string'],
        preferredChildId: 'c1',
        formation: null,
      },
      activeNodeId: 'c1',
      preferredChildId: 'c1',
    },
  });
  eq(doc.moveTree.root.annotations.length, 0);
  assert.deepEqual(doc.moveTree.root.rawProperties._LEGACY_ANNOTATIONS, ['root-string']);
  const child = doc.moveTree.root.children[0];
  eq(child.annotations.length, 0);
  assert.deepEqual(child.rawProperties._LEGACY_ANNOTATIONS, ['eski-1', 'eski-2']);
});

test('D0 legacy: fixture v1.0.0 string-annotation migrasyonu', () => {
  const fixturePath = path.join(FIXTURES, 'legacy-v1.0-with-string-annotations.agstudio');
  const raw = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  const doc = migrateDocument(raw);
  const root_ = doc.moveTree.root;
  eq(root_.annotations.length, 0);
  ok(Array.isArray(root_.rawProperties._LEGACY_ANNOTATIONS));
  ok(root_.rawProperties._LEGACY_ANNOTATIONS.includes('root-level-string'));
  const child = root_.children[0];
  ok(Array.isArray(child.rawProperties._LEGACY_ANNOTATIONS));
  eq(child.annotations.length, 0);
});

test('D0 legacy: fixture v1.0.0 pass move migrasyonu', () => {
  const fixturePath = path.join(FIXTURES, 'legacy-v1.0-with-pass.agstudio');
  const raw = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  const doc = migrateDocument(raw);
  const moves = serializeMainlineMoves(doc.moveTree.root);
  eq(moves.length, 3);
  eq(moves[1].pass, true);
  eq(moves[1].color, 'white');
});

test('D0 legacy: fixture v1.0.0 moves[] doğru göç eder', () => {
  const fixturePath = path.join(FIXTURES, 'legacy-v1.0-with-moves.agstudio');
  const raw = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  const doc = migrateDocument(raw);
  const moves = serializeMainlineMoves(doc.moveTree.root);
  eq(moves.length, 3);
  eq(moves[0].color, 'black');
  eq(moves[0].x, 4);
  eq(moves[0].y, 4);
});

// ── D0 İdempotency ────────────────────────────────────────────────────

test('D0 idempotency: ensureMoveTreeDocument iki kez aynı sonuç', () => {
  const doc = createDocument({ id: 'idem-1', title: 'Idempotency 1',
    board: { size: 9, turn: 'black', ko: null, stones: [], markers: [], regions: [], viewport: null } });
  const snap1 = JSON.stringify(doc);
  ensureMoveTreeDocument(doc);
  const snap2 = JSON.stringify(doc);
  eq(snap1, snap2, 'ensureMoveTreeDocument idempotent değil');
});

test('D0 idempotency: migrateDocument v1.1.0 aynı belgeyi döndürür', () => {
  const doc = createDocument({ id: 'idem-2', title: 'Idempotency 2' });
  const snap1 = JSON.stringify(doc);
  const migrated = migrateDocument(JSON.parse(snap1));
  const snap2 = JSON.stringify(migrated);
  eq(snap1, snap2, 'migrateDocument idempotent değil');
});

test('D0 idempotency: migrateDocument iki kez çağrılınca aynı sonuç', () => {
  const raw = {
    studioVersion: '1.0.0',
    id: 'idem-3', status: 'draft', title: 'T', slug: 'idem-3', summary: '',
    board: { size: 9, turn: 'black', ko: null, stones: [], markers: [], regions: [], viewport: null },
    moves: [{ color: 'black', x: 4, y: 4 }],
    curriculum: { section: 'B1', lesson: 'l1', step: '', objectives: [], skills: [], prerequisites: [] },
    classification: { problemType: 'tsumego', subtype: '', difficulty: 'beginner', playerToMove: 'black', goal: 'best-move' },
    solution: { sequences: [], acceptedFirstMoves: [], wrongMoves: [], hint: '', explanation: '' },
    timeline: { durationMs: 0, events: [] }, sources: [],
    outputs: { problemBank: true, lesson3d: false, sgf: false, motion: false, obsidian: false, image: false },
    audit: { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', author: '', reviewedAt: null },
    extensions: {},
  };
  const first = migrateDocument(JSON.parse(JSON.stringify(raw)));
  const second = migrateDocument(JSON.parse(JSON.stringify(first)));
  eq(JSON.stringify(first), JSON.stringify(second), 'iki göç sonucu farklı');
});

// ── D0 Ağaç limitleri ────────────────────────────────────────────────

test('D0 tree: MAX_TREE_NODES sabiti pozitif', () => {
  ok(MAX_TREE_NODES > 0, 'MAX_TREE_NODES pozitif olmalı');
  const doc = createDocument({ id: 'tree-limit', title: 'Tree Limit',
    board: { size: 9, turn: 'black', ko: null, stones: [], markers: [], regions: [], viewport: null } });
  const root_ = doc.moveTree.root;
  eq(countTreeNodes(root_), 1, 'başlangıçta 1 düğüm olmalı');
  const m1 = addChildMove(root_, 'root', { color: 'black', x: 0, y: 0 });
  ok(m1.ok, m1.reason);
  eq(countTreeNodes(root_), 2);
});

test('D0 tree: addChildMove reason string tanımlı', () => {
  const reasons = ['TREE_NODE_LIMIT_EXCEEDED', 'TREE_DEPTH_LIMIT_EXCEEDED', 'OCCUPIED', 'SUICIDE', 'KO'];
  for (const reason of reasons) {
    ok(typeof reason === 'string' && reason.length > 0);
  }
});

test('D0 tree: findMoveNode büyük ağaçta yığın taşması olmaz (iteratif)', () => {
  const doc = createDocument({ id: 'deep-tree', title: 'Deep Tree',
    board: { size: 19, turn: 'black', ko: null, stones: [], markers: [], regions: [], viewport: null } });
  const root_ = doc.moveTree.root;
  let cursor = 'root';
  let x = 0, y = 0;
  for (let i = 0; i < 50; i++) {
    const color = i % 2 === 0 ? 'black' : 'white';
    const r = addChildMove(root_, cursor, { color, x, y });
    if (!r.ok) break;
    cursor = r.node.id;
    x = (x + 1) % 19;
    if (x === 0) y = (y + 1) % 19;
  }
  const p = getMovePath(root_, cursor);
  ok(p.length > 1, 'derin yol oluşturulmalı');
  const found = findMoveNode(root_, cursor);
  ok(found, 'derin düğüm bulunamadı');
  eq(found.id, cursor);
});

// ── D0 SGF export sözleşmesi ─────────────────────────────────────────

test('D0 sgf: isExportableSgfProperty geçerli SGF anahtar kabul eder', () => {
  for (const key of ['AB', 'KM', 'GM', 'W', 'AW', 'TR', 'SQ', 'ABCDEFGH']) {
    ok(isExportableSgfProperty(key), `${key} reddedildi`);
  }
});

test('D0 sgf: isExportableSgfProperty _LEGACY_ANNOTATIONS ve dahili anahtar reddeder', () => {
  ok(!isExportableSgfProperty('_LEGACY_ANNOTATIONS'), '_LEGACY_ANNOTATIONS export edilebilir görünüyor');
  ok(!isExportableSgfProperty('_INTERNAL'), '_INTERNAL export edilebilir görünüyor');
  ok(!isExportableSgfProperty('_'), '_ export edilebilir görünüyor');
});

test('D0 sgf: isExportableSgfProperty tehlikeli anahtar reddeder', () => {
  ok(!isExportableSgfProperty('__proto__'));
  ok(!isExportableSgfProperty('constructor'));
  ok(!isExportableSgfProperty('prototype'));
});

test('D0 sgf: isExportableSgfProperty geçersiz format ve tip reddeder', () => {
  ok(!isExportableSgfProperty('ab'));        // küçük harf
  ok(!isExportableSgfProperty(''));          // boş
  ok(!isExportableSgfProperty('ABCDEFGHI')); // 9 karakter (max 8)
  ok(!isExportableSgfProperty(null));        // null
  ok(!isExportableSgfProperty(42));          // sayı
});

test('D0 sgf: rawProperties her anahtarı isExportableSgfProperty filtresi ile export dışı bırakılabilir', () => {
  // Gelecekteki serializeSgf() için sözleşme testi:
  // Sadece isExportableSgfProperty true dönen anahtarlar yazılmalı.
  const raw = {
    AB: ['dd'],
    KM: ['6.5'],
    _LEGACY_ANNOTATIONS: ['eski-metin'],
  };
  const exportable = Object.keys(raw).filter(k => isExportableSgfProperty(k));
  assert.deepEqual(exportable, ['AB', 'KM']);
  ok(!exportable.includes('_LEGACY_ANNOTATIONS'), '_LEGACY_ANNOTATIONS export listesine girdi');
});

// ── D0 Schema sürümü ─────────────────────────────────────────────────

test('D0 schema: STUDIO_VERSION 1.1.0', () => {
  eq(STUDIO_VERSION, '1.1.0');
});

test('D0 schema: yeni belge studioVersion 1.1.0 içeriyor', () => {
  const doc = createDocument({ id: 'ver-check', title: 'Version Check' });
  eq(doc.studioVersion, '1.1.0');
});

test('D0 schema: v1.0.0 belgesi migrasyondan sonra 1.1.0 olur', () => {
  const raw = {
    studioVersion: '1.0.0', id: 'migrate-ver', status: 'draft', title: 'T', slug: 'x', summary: '',
    board: { size: 9, turn: 'black', ko: null, stones: [], markers: [], regions: [], viewport: null },
    moves: [],
    curriculum: { section: 'B1', lesson: 'l1', step: '', objectives: [], skills: [], prerequisites: [] },
    classification: { problemType: 'tsumego', subtype: '', difficulty: 'beginner', playerToMove: 'black', goal: 'best-move' },
    solution: { sequences: [], acceptedFirstMoves: [], wrongMoves: [], hint: '', explanation: '' },
    timeline: { durationMs: 0, events: [] }, sources: [],
    outputs: { problemBank: true, lesson3d: false, sgf: false, motion: false, obsidian: false, image: false },
    audit: { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', author: '', reviewedAt: null },
    extensions: {},
  };
  const doc = migrateDocument(raw);
  eq(doc.studioVersion, '1.1.0');
});

// ── Test koşucusu ────────────────────────────────────────────────────

async function runTests() {
  for (const { name, fn } of TESTS) {
    try {
      await fn();
      PASS.push(name);
      console.log('  ✓', name);
    } catch (error) {
      FAIL.push(name);
      console.error('  ✗', name, '-', error.message);
    }
  }
  console.log(`\nToplam: ${PASS.length + FAIL.length}  ✓ ${PASS.length}  ✗ ${FAIL.length}`);
  if (FAIL.length) process.exit(1);
}

runTests();
