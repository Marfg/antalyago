import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BoardState } from '../core/boardState.js';
import { createStudioBoardAdapter } from '../desktop/ipc/studioBoardAdapter.js';
import { createDocument, migrateDocument } from '../studio/model/studioDocument.js';
import {
  addChildMove,
  deleteMoveNode,
  ensureMoveTreeDocument,
  findMoveNode,
  getMovePath,
  rebuildBoardState,
  serializeMainlineMoves,
} from '../studio/model/moveTree.js';
import fileHandlersModule from '../desktop/ipc/fileHandlers.cjs';

const { readAgstudioDocument, writeAgstudioDocument } = fileHandlersModule;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const PASS = [];
const FAIL = [];

function test(name, fn) {
  try {
    fn();
    PASS.push(name);
    console.log('  ✓', name);
  } catch (error) {
    FAIL.push(name);
    console.error('  ✗', name, '-', error.message);
  }
}

function ok(value, message = 'assertion failed') {
  assert.ok(value, message);
}

function eq(actual, expected, message) {
  assert.equal(actual, expected, message);
}

const mojibakePatterns = [/Ã/, /Ä/, /Å/, /Â/];

console.log('\n─── studio-text-tree.test.js ───\n');

test('masaüstü metinleri UTF-8 ve mojibake içermiyor', () => {
  const indexHtml = fs.readFileSync(path.join(root, 'desktop', 'index.html'), 'utf8');
  const appText = fs.readFileSync(path.join(root, 'desktop', 'renderer', 'app.mjs'), 'utf8');
  const mainText = fs.readFileSync(path.join(root, 'desktop', 'ipc', 'fileHandlers.cjs'), 'utf8');

  ok(indexHtml.includes('<meta charset="UTF-8">'), 'charset UTF-8 eksik');
  ok(indexHtml.includes('Hamle Ağacı'), 'Hamle Ağacı metni eksik');
  ok(appText.includes('Hamle ağacı'), 'renderer hamle ağacı metni eksik');
  ok(appText.includes('İçerik Üretici modu'), 'temiz Türkçe metin eksik');
  ok(mainText.includes('Geçersiz .agstudio yolu.'), 'ana süreçte UTF-8 metni eksik');

  for (const text of [indexHtml, appText, mainText]) {
    ok(!mojibakePatterns.some(pattern => pattern.test(text)), 'mojibake bulundu');
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
  eq(doc.moveTree.activeNodeId, doc.moveTree.root.children[0].children[0].id);
  eq(serializeMainlineMoves(doc.moveTree.root).length, 2);
  eq(doc.moves.length, 2);
});

test('ana dal ve varyant oluşturma çalışır', () => {
  const doc = createDocument({
    id: 'variant-tree',
    title: 'Variant Tree',
    board: {
      size: 9,
      turn: 'black',
      ko: null,
      stones: [],
      markers: [],
      regions: [],
      viewport: null,
    },
  });

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
  const doc = createDocument({
    id: 'rebuild-tree',
    title: 'Rebuild Tree',
    board: {
      size: 9,
      turn: 'black',
      ko: null,
      stones: [],
      markers: [],
      regions: [],
      viewport: null,
    },
  });
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
  const doc = createDocument({
    id: 'capture-tree',
    title: 'Capture Tree',
    board: {
      size: 9,
      turn: 'black',
      ko: null,
      stones: [
        { x: 0, y: 1, color: 'black' },
        { x: 2, y: 1, color: 'black' },
        { x: 1, y: 2, color: 'black' },
        { x: 1, y: 1, color: 'white' },
      ],
      markers: [],
      regions: [],
      viewport: null,
    },
  });
  const rootNode = doc.moveTree.root;
  const placed = addChildMove(rootNode, 'root', { color: 'black', x: 1, y: 0 });
  assert.ok(placed.ok, placed.reason);
  const board = rebuildBoardState(rootNode, placed.node.id);
  eq(board.colorAt(1, 0), 'black');
  eq(board.colorAt(1, 1), null);
  eq(board.colorAt(0, 1), 'black');
  eq(board.colorAt(2, 1), 'black');
  eq(board.colorAt(1, 2), 'black');
});

test('yasadışı hamle reddedilir', () => {
  const doc = createDocument({
    id: 'illegal-tree',
    title: 'Illegal Tree',
    board: {
      size: 9,
      turn: 'black',
      ko: null,
      stones: [{ x: 4, y: 4, color: 'black' }],
      markers: [],
      regions: [],
      viewport: null,
    },
  });
  const result = addChildMove(doc.moveTree.root, 'root', { color: 'white', x: 4, y: 4 });
  eq(result.ok, false);
  ok(result.reason === 'OCCUPIED' || result.reason === 'SUICIDE');
});

test('varyant silme onaylı akışla temsil edilir', () => {
  const doc = createDocument({
    id: 'delete-tree',
    title: 'Delete Tree',
    board: { size: 9, turn: 'black', ko: null, stones: [], markers: [], regions: [], viewport: null },
  });
  const rootNode = doc.moveTree.root;
  const first = addChildMove(rootNode, 'root', { color: 'black', x: 4, y: 4 });
  const second = addChildMove(rootNode, 'root', { color: 'black', x: 3, y: 3 });
  assert.ok(first.ok && second.ok);
  const deleted = deleteMoveNode(rootNode, second.node.id);
  eq(deleted.ok, true);
  eq(rootNode.children.length, 1);
});

test('kaydet-aç çevriminde ağaç korunur', async () => {
  const base = await fsp.mkdtemp(path.join(os.tmpdir(), 'agstudio-tree-'));
  const workspace = path.join(base, 'workspace');
  const doc = createDocument({
    id: 'roundtrip-tree',
    title: 'Roundtrip Tree',
    slug: 'roundtrip-tree',
    board: { size: 9, turn: 'black', ko: null, stones: [], markers: [], regions: [], viewport: null },
  });
  const rootNode = doc.moveTree.root;
  const first = addChildMove(rootNode, 'root', { color: 'black', x: 4, y: 4 });
  assert.ok(first.ok, first.reason);
  doc.moveTree.activeNodeId = first.node.id;
  doc.activeNodeId = first.node.id;
  const filePath = path.join(workspace, 'roundtrip-tree.agstudio');

  await writeAgstudioDocument(filePath, doc);
  const loaded = await readAgstudioDocument(filePath);
  eq(loaded.moveTree.root.children.length, 1);
  eq(loaded.activeNodeId, first.node.id);
  eq(loaded.moves.length, 1);
});

test('StudioBoardAdapter moveTree üzerinden tahtayı yeniden kurar', () => {
  const adapter = createStudioBoardAdapter(BoardState);
  const doc = createDocument({
    id: 'adapter-tree',
    title: 'Adapter Tree',
    board: { size: 9, turn: 'black', ko: null, stones: [], markers: [], regions: [], viewport: null },
  });
  const rootNode = doc.moveTree.root;
  const first = addChildMove(rootNode, 'root', { color: 'black', x: 4, y: 4 });
  assert.ok(first.ok, first.reason);
  const state = adapter.fromMoveTree(doc.moveTree, first.node.id);
  eq(state.colorAt(4, 4), 'black');
});

console.log(`\nToplam: ${PASS.length + FAIL.length}  ✓ ${PASS.length}  ✗ ${FAIL.length}`);
if (FAIL.length) process.exit(1);
