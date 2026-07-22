// AG-STUDIO S10B+ — SGF exporter dış dünya smoke doğrulaması.
//
// Bu dosya studio-sgf-adapter.test.js'in birim testlerini TEKRARLAMAZ.
// Amaç: formatSGF() çıktısının genel SGF sözdizimine (parantez/köşeli
// parantez dengesi, escape kuralları) uyduğunu ve gerçek proje formation
// SGF dosyalarıyla aynı stilistik kalıpları (AB/AW/B/W ayrımı, düz mainline,
// varyasyon parantezleri) izlediğini bağımsız bir sözdizimi tarayıcısıyla
// doğrulamak. Mevcut sgf-parser.js kasıtlı olarak KULLANILMIYOR — o parser
// problem-bank'e özel, kayıplı ve düz `{board,solution,wrong}` formatına
// indirgiyor; bu dosyanın amacına (genel SGF sözdizimi doğrulaması) uymuyor.

import assert from 'node:assert/strict';

import { formatSGF } from '../studio/adapters/sgfAdapter.js';
import { createDocument } from '../studio/model/studioDocument.js';
import {
  addChildMove,
  addPassMove,
  setMoveNodeAnnotations,
  setMoveNodeComment,
  setMoveNodeRawProperties,
} from '../studio/model/moveTree.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓', name); passed++; }
  catch (e) { console.error('  ✗', name, '-', e.message); failed++; }
}
function ok(val, msg = 'assertion failed') { if (!val) throw new Error(msg); }
function eq(a, b, msg) { if (a !== b) throw new Error(msg ?? `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }

console.log('\n─── studio-sgf-smoke.test.js ───\n');

// ── Bağımsız sözdizimi tarayıcısı ──────────────────────────────────────
//
// Tam bir SGF parser değil — yalnızca temel iyi-biçimlilik (well-formedness)
// kontrolü: parantez dengesi, köşeli parantez içeriğinin escape kurallarına
// göre doğru kapandığı, ve üst seviye property listesi çıkarımı.

function assertWellFormedSgf(sgf) {
  ok(sgf.startsWith('('), 'SGF "(" ile başlamalı');
  ok(sgf.endsWith(')'), 'SGF ")" ile bitmeli');

  let depth = 0;
  let i = 0;
  const n = sgf.length;

  while (i < n) {
    const ch = sgf[i];
    if (ch === '(') { depth++; i++; continue; }
    if (ch === ')') {
      depth--;
      if (depth < 0) throw new Error(`Dengesiz parantez: pozisyon ${i}'de fazladan ")"`);
      i++;
      continue;
    }
    if (ch === '[') {
      i++;
      while (i < n && sgf[i] !== ']') {
        if (sgf[i] === '\\') i++; // escape edilmiş karakteri atla (\\ veya \])
        i++;
      }
      if (i >= n) throw new Error('Kapanmayan "[" değeri (eşleşen "]" bulunamadı)');
      i++; // kapanan ]
      continue;
    }
    if (ch === ']') {
      throw new Error(`Beklenmeyen kapanan "]" (pozisyon ${i}, eşleşen "[" yok)`);
    }
    i++;
  }

  if (depth !== 0) throw new Error(`Dengesiz parantez: ${depth} adet kapanmamış "("`);
}

/** Üst seviye (ilk) düğümün property→değerler haritasını çıkarır. */
function extractFirstNodeProps(sgf) {
  const m = sgf.match(/^\(;(.*)/s);
  ok(m, 'SGF ilk düğüm ";" ile başlamalı');
  const rest = m[1];
  const props = new Map();
  const re = /([A-Z]{1,8})((?:\[(?:[^\]\\]|\\.)*\])+)/g;
  let match;
  // Yalnızca ilk düğümün property'lerini almak için ilk ";" veya "(" öncesine kadar tara
  const boundary = Math.min(
    ...['(', ';'].map(c => { const idx = rest.indexOf(c); return idx === -1 ? Infinity : idx; }),
  );
  const nodeStr = Number.isFinite(boundary) ? rest.slice(0, boundary) : rest;
  while ((match = re.exec(nodeStr)) !== null) {
    const key = match[1];
    const vals = [...match[2].matchAll(/\[((?:[^\]\\]|\\.)*)\]/g)].map(v => v[1]);
    props.set(key, vals);
  }
  return props;
}

// ── 1. Empty board ──────────────────────────────────────────────────────

test('empty board: sözdizimi geçerli, beklenen header kalıbını içerir', () => {
  const doc = createDocument({ id: 'sm-empty', title: '', slug: 'sm-empty' });
  const { sgf, warnings } = formatSGF(doc);
  assertWellFormedSgf(sgf);
  ok(/^\(;GM\[1\]FF\[4\]CA\[UTF-8\]AP\[[^\]]*\]SZ\[9\]/.test(sgf), sgf);
  eq(warnings.length, 0);
});

// ── 2. Formation-only ────────────────────────────────────────────────────

test('formation-only: AB/AW var, B/W hamle property yok, PL doğru', () => {
  const doc = createDocument({ id: 'sm-formation', title: '', slug: 'sm-formation' });
  const root = doc.moveTree.root;
  root.formation.stones.push({ x: 2, y: 3, color: 'black' });
  root.formation.stones.push({ x: 4, y: 5, color: 'white' });
  root.formation.turn = 'white';
  const { sgf } = formatSGF(doc);
  assertWellFormedSgf(sgf);

  const props = extractFirstNodeProps(sgf);
  ok(props.has('AB'), sgf);
  ok(props.has('AW'), sgf);
  ok(!props.has('B'), 'setup taşı B hamlesi gibi görünüyor: ' + sgf);
  ok(!props.has('W'), 'setup taşı W hamlesi gibi görünüyor: ' + sgf);
  eq(props.get('PL')[0], 'W');
});

// ── 3. Mainline ───────────────────────────────────────────────────────

test('mainline: birden fazla B/W hamlesi düz sırayla, gereksiz parantez yok', () => {
  const doc = createDocument({ id: 'sm-mainline', title: 'Mainline', slug: 'sm-mainline' });
  const root = doc.moveTree.root;
  const b1 = addChildMove(root, 'root', { color: 'black', x: 2, y: 2 });
  const w1 = addChildMove(root, b1.node.id, { color: 'white', x: 6, y: 2 });
  addChildMove(root, w1.node.id, { color: 'black', x: 2, y: 6 });
  const { sgf } = formatSGF(doc);
  assertWellFormedSgf(sgf);
  ok(sgf.includes(';B[cc];W[gc];B[cg]'), sgf);
  // Dallanma yok → mainline içinde ekstra "(" olmamalı (tek dış parantez hariç)
  eq((sgf.match(/\(/g) ?? []).length, 1, `beklenmeyen ekstra parantez: ${sgf}`);
});

// ── 4. Variation ──────────────────────────────────────────────────────

test('variation: preferredChildId önce, sibling ayrı parantezle', () => {
  const doc = createDocument({ id: 'sm-variation', title: '', slug: 'sm-variation' });
  const root = doc.moveTree.root;
  const main = addChildMove(root, 'root', { color: 'black', x: 2, y: 2 });
  addChildMove(root, 'root', { color: 'black', x: 6, y: 6 });
  const { sgf } = formatSGF(doc);
  assertWellFormedSgf(sgf);
  eq(root.preferredChildId, main.node.id);
  const mainIdx = sgf.indexOf('(;B[cc])');
  const varIdx = sgf.indexOf('(;B[gg])');
  ok(mainIdx !== -1 && varIdx !== -1, sgf);
  ok(mainIdx < varIdx, sgf);
  // 1 dış + 2 varyasyon parantezi = 3 açan, 3 kapanan
  eq((sgf.match(/\(/g) ?? []).length, 3, sgf);
  eq((sgf.match(/\)/g) ?? []).length, 3, sgf);
});

// ── 5. Markup ─────────────────────────────────────────────────────────

test('markup: TR/SQ/CR/MA/SL/LB/AR/LN hepsi çıkışta ve sözdizimi geçerli', () => {
  const doc = createDocument({ id: 'sm-markup', title: '', slug: 'sm-markup' });
  const root = doc.moveTree.root;
  setMoveNodeAnnotations(root, 'root', [
    { type: 'triangle', point: { x: 0, y: 0 } },
    { type: 'square', point: { x: 1, y: 1 } },
    { type: 'circle', point: { x: 2, y: 2 } },
    { type: 'cross', point: { x: 3, y: 3 } },
    { type: 'selected', point: { x: 4, y: 4 } },
    { type: 'label', point: { x: 5, y: 5 }, text: 'A' },
    { type: 'arrow', from: { x: 0, y: 1 }, to: { x: 1, y: 0 } },
    { type: 'line', from: { x: 2, y: 3 }, to: { x: 3, y: 2 } },
  ], 9);
  const { sgf } = formatSGF(doc);
  assertWellFormedSgf(sgf);
  const props = extractFirstNodeProps(sgf);
  for (const key of ['TR', 'SQ', 'CR', 'MA', 'SL', 'LB', 'AR', 'LN']) {
    ok(props.has(key), `${key} eksik: ${sgf}`);
  }
});

test('markup: Türkçe yorum + \\ ve ] escape sonrası sözdizimi hâlâ geçerli', () => {
  const doc = createDocument({ id: 'sm-comment', title: '', slug: 'sm-comment' });
  const root = doc.moveTree.root;
  const raw = 'Türkçe açıklama: ığüşöç ÇĞÜŞÖİ ve özel karakter \\ ] test';
  setMoveNodeComment(root, 'root', raw);
  const { sgf } = formatSGF(doc);
  assertWellFormedSgf(sgf); // en kritik kontrol: kaçırılmamış ] tüm parser'ı bozar
  const props = extractFirstNodeProps(sgf);
  const decoded = props.get('C')[0].replace(/\\(.)/g, '$1'); // basit unescape
  eq(decoded, raw, 'Türkçe metin round-trip sonrası bozulmamalı');
});

// ── 6. Pass ───────────────────────────────────────────────────────────

test('pass: B[] veya W[] boş değerle, sözdizimi geçerli', () => {
  const doc = createDocument({ id: 'sm-pass', title: '', slug: 'sm-pass' });
  const root = doc.moveTree.root;
  const b = addChildMove(root, 'root', { color: 'black', x: 3, y: 3 });
  addPassMove(root, b.node.id, 'white');
  const { sgf } = formatSGF(doc);
  assertWellFormedSgf(sgf);
  ok(sgf.includes(';B[dd];W[]'), sgf);
});

// ── 7. Region warning ─────────────────────────────────────────────────

test('region warning: SGF geçerli üretilir, warning node id/type içerir', () => {
  const doc = createDocument({ id: 'sm-region', title: '', slug: 'sm-region' });
  const root = doc.moveTree.root;
  setMoveNodeAnnotations(root, 'root', [
    { type: 'region', points: [{ x: 0, y: 0 }, { x: 2, y: 2 }] },
    { type: 'triangle', point: { x: 5, y: 5 } },
  ], 9);
  const { sgf, warnings } = formatSGF(doc);
  assertWellFormedSgf(sgf); // region atlanmış olsa da geri kalan SGF geçerli olmalı
  ok(sgf.includes('TR[ff]'), sgf);
  ok(!sgf.toLowerCase().includes('region'), sgf);
  eq(warnings.length, 1);
  ok(warnings[0].includes('root'), warnings[0]);
  ok(warnings[0].includes('region'), warnings[0]);
});

// ── 8. rawProperties / internal filtreleme ─────────────────────────────
//
// _LEGACY_ANNOTATIONS gerçek kamu API'si (setMoveNodeRawProperties) üzerinden
// geçerli bir dahili anahtar olarak SAKLANABİLİR (INTERNAL_RAW_PROP_ALLOWLIST,
// bkz. moveTree.js) — ama isExportableSgfProperty() bunu export sırasında
// filtreler (RAW_PROP_KEY_RE alt çizgiyle başlayan anahtarı reddeder). Bu,
// diskten yüklenen gerçek bir belgenin dahili muhasebe verisini taşıması ve
// exporter'ın bunu hiçbir zaman dışarı sızdırmaması gereken gerçekçi senaryo.

test('rawProperties: allowlist\'teki dahili anahtar (_LEGACY_ANNOTATIONS) SGF metnine hiç sızmaz, geçerli anahtar (KM) bozulmadan yazılır', () => {
  const doc = createDocument({ id: 'sm-rawprops', title: '', slug: 'sm-rawprops' });
  const root = doc.moveTree.root;
  const stored = setMoveNodeRawProperties(root, 'root', {
    KM: ['6.5'],
    _LEGACY_ANNOTATIONS: ['eski dahili veri, dışa aktarılmamalı'],
  });
  ok(stored, 'setMoveNodeRawProperties (allowlist\'teki dahili anahtarla) başarısız olmamalı');

  const { sgf, warnings } = formatSGF(doc);
  assertWellFormedSgf(sgf);

  const props = extractFirstNodeProps(sgf);
  ok(props.has('KM'), sgf);
  eq(props.get('KM')[0], '6.5', sgf);
  ok(!props.has('_LEGACY_ANNOTATIONS'), 'dahili anahtar bir property olarak sızdı: ' + sgf);
  ok(!sgf.includes('_LEGACY_ANNOTATIONS'), 'dahili anahtar adı ham metinde geçmemeli: ' + sgf);
  ok(!sgf.includes('eski dahili veri'), 'dahili anahtarın değeri ham metinde geçmemeli: ' + sgf);
  eq(warnings.length, 0, 'sessizce atlanmalı, ekstra warning üretmemeli: ' + JSON.stringify(warnings));
});

// ── Gerçek formation SGF stil karşılaştırması ──────────────────────────
//
// formations/b1-temel-kurallar/l4-yasak-hamleler/2. adım.sgf ve
// l5-ko-kurali/1. adım.sgf dosyaları (proje içi, telif sorunu yok — bkz.
// S10A raporu, joseki.sgf'nin aksine) referans alınıyor. Bu dosyalar
// DEĞİŞTİRİLMİYOR, yalnızca stil karşılaştırması için okunuyor.

test('stil karşılaştırması: property sırası gerçek formation dosyalarıyla aynı aile', () => {
  // Gerçek dosya: (;GM[1]FF[4]CA[UTF-8]AP[CGoban:3]ST[2]\nRU[...]SZ[9]...)
  // Bizim çıktı:  (;GM[1]FF[4]CA[UTF-8]AP[AgStudio:1.1]SZ[9]...)
  // GM→FF→CA→AP sırası birebir aynı; SZ aynı grupta. Property SIRASI SGF'de
  // anlamsız (bkz. S10A §8.4 "semantik eşdeğerlik vs byte-for-byte") ama
  // aynı ailede olmak okunabilirlik/tanıdıklık için önemli — bu smoke testte
  // doğrulanıyor.
  const doc = createDocument({ id: 'sm-style', title: '', slug: 'sm-style' });
  const { sgf } = formatSGF(doc);
  const headerOrder = sgf.match(/^\(;([A-Z]{1,8})\[[^\]]*\]([A-Z]{1,8})\[[^\]]*\]([A-Z]{1,8})\[[^\]]*\]([A-Z]{1,8})\[[^\]]*\]([A-Z]{1,8})\[/);
  ok(headerOrder, sgf);
  eq(headerOrder[1], 'GM');
  eq(headerOrder[2], 'FF');
  eq(headerOrder[3], 'CA');
  eq(headerOrder[4], 'AP');
  eq(headerOrder[5], 'SZ');
});

test('stil karşılaştırması: gerçek dosyada olduğu gibi tek-child mainline parantezsiz düz yazılır', () => {
  // formations/.../l4-yasak-hamleler/2. adım.sgf: ";B[ea]\n;W[ei])" — parantezsiz.
  // formations/.../l5-ko-kurali/1. adım.sgf: "...AB[...]\n;B[ef]SQ[ee])" — aynı desen.
  const doc = createDocument({ id: 'sm-style2', title: '', slug: 'sm-style2' });
  const root = doc.moveTree.root;
  const b = addChildMove(root, 'root', { color: 'black', x: 4, y: 0 });
  addChildMove(root, b.node.id, { color: 'white', x: 4, y: 8 });
  const { sgf } = formatSGF(doc);
  ok(sgf.includes(';B[ea];W[ei])'), sgf);
});

console.log(`\nToplam: ${passed + failed}  ✓ ${passed}  ✗ ${failed}`);
if (failed) process.exit(1);
