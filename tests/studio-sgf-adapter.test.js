import assert from 'node:assert/strict';

import { formatSGF } from '../studio/adapters/sgfAdapter.js';
import { createDocument } from '../studio/model/studioDocument.js';
import {
  addChildMove,
  addPassMove,
  setMoveNodeComment,
  setMoveNodeAnnotations,
  setMoveNodeRawProperties,
} from '../studio/model/moveTree.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓', name); passed++; }
  catch (e) { console.error('  ✗', name, '-', e.message); failed++; }
}
function ok(val, msg = 'assertion failed') { if (!val) throw new Error(msg); }
function eq(a, b, msg) { if (a !== b) throw new Error(msg ?? `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }

console.log('\n─── studio-sgf-adapter.test.js ───\n');

// ── 1. formation-only ────────────────────────────────────────────────

test('formation-only: SZ doğru yazılır', () => {
  const doc = createDocument({ id: 'f1', title: '', slug: 'f1' });
  const { sgf } = formatSGF(doc);
  ok(sgf.includes('SZ[9]'), sgf);
});

test('formation-only: AB/AW kurulum taşları doğru yazılır', () => {
  const doc = createDocument({ id: 'f2', title: '', slug: 'f2' });
  doc.moveTree.root.formation.stones.push({ x: 3, y: 3, color: 'black' });
  doc.moveTree.root.formation.stones.push({ x: 5, y: 5, color: 'white' });
  const { sgf } = formatSGF(doc);
  ok(sgf.includes('AB[dd]'), sgf);
  ok(sgf.includes('AW[ff]'), sgf);
});

test('formation-only: setup taşları hamle olarak yazılmaz (B/W property yok)', () => {
  const doc = createDocument({ id: 'f3', title: '', slug: 'f3' });
  doc.moveTree.root.formation.stones.push({ x: 3, y: 3, color: 'black' });
  const { sgf } = formatSGF(doc);
  ok(!/;B\[/.test(sgf), `beklenmeyen hamle property: ${sgf}`);
  ok(!/;W\[/.test(sgf), `beklenmeyen hamle property: ${sgf}`);
});

test('formation-only: beyaz sıradaysa PL[W] yazılır, siyahsa PL yazılmaz', () => {
  const white = createDocument({ id: 'f4w', title: '', slug: 'f4w' });
  white.moveTree.root.formation.turn = 'white';
  const { sgf: sgfWhite } = formatSGF(white);
  ok(sgfWhite.includes('PL[W]'), sgfWhite);

  const black = createDocument({ id: 'f4b', title: '', slug: 'f4b' });
  const { sgf: sgfBlack } = formatSGF(black);
  ok(!sgfBlack.includes('PL['), sgfBlack);
});

// ── 2. simple mainline ───────────────────────────────────────────────

test('simple mainline: B[xy]W[xy] sırayla yazılır, düz devam eder', () => {
  const doc = createDocument({ id: 'm1', title: '', slug: 'm1' });
  const root = doc.moveTree.root;
  const b = addChildMove(root, 'root', { color: 'black', x: 4, y: 4 });
  addChildMove(root, b.node.id, { color: 'white', x: 4, y: 5 });
  const { sgf } = formatSGF(doc);
  ok(sgf.includes(';B[ee];W[ef]'), sgf);
  ok(!sgf.includes('('.repeat(2)), 'dallanma olmayan mainline gereksiz parantez içermemeli');
});

test('simple mainline: x=0,y=0 → aa, x=3,y=3 → dd (I harfi atlama yok)', () => {
  const doc = createDocument({ id: 'm2', title: '', slug: 'm2' });
  const root = doc.moveTree.root;
  addChildMove(root, 'root', { color: 'black', x: 0, y: 0 });
  const { sgf } = formatSGF(doc);
  ok(sgf.includes(';B[aa]'), sgf);

  const doc2 = createDocument({ id: 'm3', title: '', slug: 'm3' });
  const root2 = doc2.moveTree.root;
  addChildMove(root2, 'root', { color: 'black', x: 3, y: 3 });
  const { sgf: sgf2 } = formatSGF(doc2);
  ok(sgf2.includes(';B[dd]'), sgf2);
});

// ── 3. pass ───────────────────────────────────────────────────────────

test('pass: B[] / W[] boş değerle yazılır', () => {
  const doc = createDocument({ id: 'p1', title: '', slug: 'p1' });
  const root = doc.moveTree.root;
  const b = addPassMove(root, 'root', 'black');
  addPassMove(root, b.node.id, 'white');
  const { sgf } = formatSGF(doc);
  ok(sgf.includes(';B[];W[]'), sgf);
});

// ── 4. variations ─────────────────────────────────────────────────────

test('variations: preferredChildId önce, sibling parantezle ayrılır', () => {
  const doc = createDocument({ id: 'v1', title: '', slug: 'v1' });
  const root = doc.moveTree.root;
  const main = addChildMove(root, 'root', { color: 'black', x: 4, y: 4 });
  const variant = addChildMove(root, 'root', { color: 'black', x: 6, y: 6 });
  eq(root.preferredChildId, main.node.id, 'ön koşul: ilk eklenen hamle preferred olmalı');

  const { sgf } = formatSGF(doc);
  // preferred (ee) önce parantez içinde, sonra variant (gg) kendi parantezinde
  const mainIdx = sgf.indexOf('(;B[ee]');
  const variantIdx = sgf.indexOf('(;B[gg]');
  ok(mainIdx !== -1 && variantIdx !== -1, sgf);
  ok(mainIdx < variantIdx, `preferred dal önce yazılmalı: ${sgf}`);
});

test('variations: varyant sırası preferredChild değişince değişir', () => {
  const doc = createDocument({ id: 'v2', title: '', slug: 'v2' });
  const root = doc.moveTree.root;
  addChildMove(root, 'root', { color: 'black', x: 4, y: 4 });
  const second = addChildMove(root, 'root', { color: 'black', x: 6, y: 6 });
  root.preferredChildId = second.node.id; // ikinci hamleyi ana dal yap

  const { sgf } = formatSGF(doc);
  const mainIdx = sgf.indexOf('(;B[gg]');
  const variantIdx = sgf.indexOf('(;B[ee]');
  ok(mainIdx < variantIdx, `yeni preferred dal önce yazılmalı: ${sgf}`);
});

test('variations: derin tek-dal zincir parantezsiz düz ilerler', () => {
  const doc = createDocument({ id: 'v3', title: '', slug: 'v3' });
  const root = doc.moveTree.root;
  let cursor = root;
  const coords = [[2, 2], [3, 3], [4, 4]];
  for (const [x, y] of coords) {
    const result = addChildMove(root, cursor.id, { color: x % 2 === 0 ? 'black' : 'white', x, y });
    cursor = result.node;
  }
  const { sgf } = formatSGF(doc);
  ok(sgf.includes(';B[cc];W[dd];B[ee]'), sgf);
});

// ── 5. annotations ────────────────────────────────────────────────────

test('annotations: TR/SQ/CR/MA/SL/LB/AR/LN doğru property üretir', () => {
  const doc = createDocument({ id: 'a1', title: '', slug: 'a1' });
  const root = doc.moveTree.root;
  const result = setMoveNodeAnnotations(root, 'root', [
    { type: 'triangle', point: { x: 0, y: 0 } },
    { type: 'square', point: { x: 1, y: 1 } },
    { type: 'circle', point: { x: 2, y: 2 } },
    { type: 'cross', point: { x: 3, y: 3 } },
    { type: 'selected', point: { x: 4, y: 4 } },
    { type: 'label', point: { x: 5, y: 5 }, text: 'A' },
    { type: 'arrow', from: { x: 0, y: 1 }, to: { x: 1, y: 0 } },
    { type: 'line', from: { x: 2, y: 3 }, to: { x: 3, y: 2 } },
  ], 9);
  ok(result, 'setMoveNodeAnnotations başarısız oldu');

  const { sgf } = formatSGF(doc);
  ok(sgf.includes('TR[aa]'), sgf);
  ok(sgf.includes('SQ[bb]'), sgf);
  ok(sgf.includes('CR[cc]'), sgf);
  ok(sgf.includes('MA[dd]'), sgf);
  ok(sgf.includes('SL[ee]'), sgf);
  ok(sgf.includes('LB[ff:A]'), sgf);
  ok(sgf.includes('AR[ab:ba]'), sgf);
  ok(sgf.includes('LN[cd:dc]'), sgf);
});

test('annotations: aynı tip birden fazla değer tek property altında birleşir', () => {
  const doc = createDocument({ id: 'a2', title: '', slug: 'a2' });
  const root = doc.moveTree.root;
  setMoveNodeAnnotations(root, 'root', [
    { type: 'triangle', point: { x: 0, y: 0 } },
    { type: 'triangle', point: { x: 1, y: 1 } },
    { type: 'label', point: { x: 2, y: 2 }, text: 'A' },
    { type: 'label', point: { x: 3, y: 3 }, text: 'B' },
  ], 9);
  const { sgf } = formatSGF(doc);
  ok(sgf.includes('TR[aa][bb]'), sgf);
  ok(sgf.includes('LB[cc:A][dd:B]'), sgf);
  // tek TR / tek LB property'si olmalı, tekrar etmemeli
  eq((sgf.match(/TR\[/g) ?? []).length, 1, sgf);
  eq((sgf.match(/LB\[/g) ?? []).length, 1, sgf);
});

// ── 6. region warning ────────────────────────────────────────────────

test('region: SGF\'e yazılmaz, warnings içine node id/type ile kaydedilir', () => {
  const doc = createDocument({ id: 'r1', title: '', slug: 'r1' });
  const root = doc.moveTree.root;
  setMoveNodeAnnotations(root, 'root', [
    { type: 'region', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
  ], 9);
  const { sgf, warnings } = formatSGF(doc);
  ok(!sgf.includes('region'), sgf);
  eq(warnings.length, 1, JSON.stringify(warnings));
  ok(warnings[0].includes('root'), warnings[0]);
  ok(warnings[0].includes('region'), warnings[0]);
});

// ── 7. rawProperties ─────────────────────────────────────────────────

test('rawProperties: exportable anahtar yazılır', () => {
  const doc = createDocument({ id: 'rp1', title: '', slug: 'rp1' });
  const root = doc.moveTree.root;
  ok(setMoveNodeRawProperties(root, 'root', { KM: ['6.5'], RU: ['Japanese'] }), 'setMoveNodeRawProperties başarısız');
  const { sgf } = formatSGF(doc);
  ok(sgf.includes('KM[6.5]'), sgf);
  ok(sgf.includes('RU[Japanese]'), sgf);
});

test('rawProperties: _LEGACY_ANNOTATIONS yazılmaz', () => {
  const doc = createDocument({ id: 'rp2', title: '', slug: 'rp2' });
  const root = doc.moveTree.root;
  // _LEGACY_ANNOTATIONS allowlist'te dahili bir anahtar — doğrudan node üzerinde simüle ediyoruz
  root.rawProperties._LEGACY_ANNOTATIONS = ['eski metin'];
  const { sgf, warnings } = formatSGF(doc);
  ok(!sgf.includes('_LEGACY_ANNOTATIONS'), sgf);
  ok(!sgf.includes('eski metin'), sgf);
  ok(!warnings.some(w => w.includes('_LEGACY_ANNOTATIONS')), 'internal alan sessizce atlanmalı, ekstra warning üretmemeli');
});

test('rawProperties: internal/geçersiz anahtar yazılmaz', () => {
  const doc = createDocument({ id: 'rp3', title: '', slug: 'rp3' });
  const root = doc.moveTree.root;
  root.rawProperties._INTERNAL = ['x'];
  root.rawProperties.lowercase = ['y'];
  const { sgf } = formatSGF(doc);
  ok(!sgf.includes('_INTERNAL'), sgf);
  ok(!sgf.includes('lowercase'), sgf);
});

test('rawProperties: exporter zorunlu property ile çakışma → rawProperties yok sayılır, warning kaydedilir', () => {
  const doc = createDocument({ id: 'rp4', title: 'Başlık', slug: 'rp4' });
  const root = doc.moveTree.root;
  ok(setMoveNodeRawProperties(root, 'root', { SZ: ['99'], KM: ['6.5'] }));
  const { sgf, warnings } = formatSGF(doc);
  ok(sgf.includes('SZ[9]'), 'exporter\'ın kendi SZ değeri korunmalı: ' + sgf);
  ok(!sgf.includes('SZ[99]'), 'rawProperties SZ değeri yazılmamalı: ' + sgf);
  ok(sgf.includes('KM[6.5]'), 'çakışmayan anahtar normal yazılmalı: ' + sgf);
  ok(warnings.some(w => w.includes('SZ')), JSON.stringify(warnings));
});

// ── 8. comments ───────────────────────────────────────────────────────

test('comments: Türkçe metin bozulmadan C[] içine yazılır', () => {
  const doc = createDocument({ id: 'c1', title: '', slug: 'c1' });
  const root = doc.moveTree.root;
  setMoveNodeComment(root, 'root', 'Öğrenci ığüşöç ÇĞÜŞÖİ testi');
  const { sgf } = formatSGF(doc);
  ok(sgf.includes('C[Öğrenci ığüşöç ÇĞÜŞÖİ testi]'), sgf);
});

test('comments: ] ve \\ karakterleri escape edilir', () => {
  const doc = createDocument({ id: 'c2', title: '', slug: 'c2' });
  const root = doc.moveTree.root;
  setMoveNodeComment(root, 'root', String.raw`köşeli ] ve ters eğik \ karakter`);
  const { sgf } = formatSGF(doc);
  ok(sgf.includes(String.raw`köşeli \] ve ters eğik \\ karakter`), sgf);
});

// ── 9. board size ─────────────────────────────────────────────────────

test('board size: 19x19 → SZ[19]', () => {
  const doc = createDocument({
    id: 'sz1', title: '', slug: 'sz1',
    board: { size: 19, turn: 'black', ko: null, stones: [], markers: [], regions: [], viewport: null },
  });
  const { sgf } = formatSGF(doc);
  ok(sgf.includes('SZ[19]'), sgf);
});

test('board size: board.size eksikse 9 varsayılan kullanılır', () => {
  const doc = createDocument({ id: 'sz2', title: '', slug: 'sz2' });
  delete doc.board.size;
  const { sgf } = formatSGF(doc);
  ok(sgf.includes('SZ[9]'), sgf);
});

test('board size: sınır dışı formation taşı hata fırlatır (sessiz kırpma yok)', () => {
  const doc = createDocument({ id: 'sz3', title: '', slug: 'sz3' });
  doc.moveTree.root.formation.stones.push({ x: 20, y: 20, color: 'black' });
  assert.throws(() => formatSGF(doc), /SGF_EXPORT_OUT_OF_BOUNDS/);
});

test('board size: sınır dışı hamle koordinatı hata fırlatır', () => {
  const doc = createDocument({ id: 'sz4', title: '', slug: 'sz4' });
  const root = doc.moveTree.root;
  // Doğrudan ağaca geçersiz koordinatlı düğüm ekliyoruz (addChildMove kendi
  // sınır kontrolünü zaten yapar; burada exporter'ın kendi kontrolünü test ediyoruz)
  root.children.push({
    id: 'bad-node', parentId: 'root', move: { color: 'black', x: 25, y: 25 },
    children: [], comment: '', annotations: [], rawProperties: {}, preferredChildId: null, formation: null,
  });
  root.preferredChildId = 'bad-node';
  assert.throws(() => formatSGF(doc), /SGF_EXPORT_OUT_OF_BOUNDS/);
});

test('board size: sınır dışı annotation koordinatı hata fırlatır', () => {
  const doc = createDocument({ id: 'sz5', title: '', slug: 'sz5' });
  const root = doc.moveTree.root;
  root.annotations.push({ id: 'ann-oob', type: 'triangle', point: { x: 30, y: 30 } });
  assert.throws(() => formatSGF(doc), /SGF_EXPORT_OUT_OF_BOUNDS/);
});

// ── 10. safety ────────────────────────────────────────────────────────

test('safety: move.capture export edilmez', () => {
  const doc = createDocument({ id: 's1', title: '', slug: 's1' });
  const root = doc.moveTree.root;
  const node = addChildMove(root, 'root', { color: 'black', x: 4, y: 4 });
  node.node.move.capture = [{ x: 1, y: 1, color: 'white' }];
  const { sgf } = formatSGF(doc);
  ok(!sgf.includes('capture'), sgf);
  // capture koordinatı (1,1)='bb' herhangi bir property olarak sızmamalı
  ok(!/\[bb\]/.test(sgf), sgf);
});

test('safety: doc/moveTree eksikse açık hata fırlatılır', () => {
  assert.throws(() => formatSGF(null), /SGF_EXPORT_INVALID_DOCUMENT/);
  assert.throws(() => formatSGF({}), /SGF_EXPORT_NO_MOVETREE/);
});

console.log(`\nToplam: ${passed + failed}  ✓ ${passed}  ✗ ${failed}`);
if (failed) process.exit(1);
