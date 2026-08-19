/**
 * tests/contentRetriever.test.js
 * node tests/contentRetriever.test.js
 *
 * core/contentRetriever.js — deterministik, embedding'siz içerik alma.
 * Bu testlerin asıl amacı: retrieval'in ASLA farklı bir concept'e
 * düşmediğini, controlled fallback'in beklenen sırayla çalıştığını ve
 * MAX_RETRIEVAL_ITEMS'in korunduğunu kanıtlamak.
 */

import { retrieveContent, buildRetrievalQuery, resolvePurpose, MAX_RETRIEVAL_ITEMS } from '../core/contentRetriever.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓', name); passed++; }
  catch (e) { console.error('  ✗', name, '-', e.message); failed++; }
}
function ok(value, message = 'assertion failed') { if (!value) throw new Error(message); }
function equal(actual, expected, message) {
  if (actual !== expected) throw new Error(message || `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function entry(overrides = {}) {
  return { id: 'x', concept: 'liberty', stage: 'guided_practice', purpose: 'hint', text: 'metin', ...overrides };
}

const FIXTURE_ENTRIES = [
  entry({ id: 'liberty-explain-01', concept: 'liberty', stage: 'instruction', purpose: 'explain' }),
  entry({ id: 'liberty-hint-01', concept: 'liberty', stage: 'guided_practice', purpose: 'hint', studentStatus: ['learning', 'not_started'] }),
  entry({ id: 'liberty-reinforce-01', concept: 'liberty', stage: 'guided_practice', purpose: 'reinforce', studentStatus: ['provisional', 'mastered'] }),
  entry({ id: 'liberty-confirm-01', concept: 'liberty', stage: 'guided_practice', purpose: 'confirm' }),
  entry({ id: 'atari-hint-01', concept: 'atari', stage: 'guided_practice', purpose: 'hint', studentStatus: ['learning'] }),
  entry({ id: 'capture-hint-01', concept: 'capture', stage: 'guided_practice', purpose: 'hint', studentStatus: ['learning'] }),
];

// ── resolvePurpose ────────────────────────────────────────────────────

test('resolvePurpose: instruction stage → explain (evaluation ne olursa olsun)', () => {
  equal(resolvePurpose({ stage: 'instruction', evaluationResult: 'incorrect', studentStatus: 'learning' }), 'explain');
});

test('resolvePurpose: correct → confirm', () => {
  equal(resolvePurpose({ stage: 'guided_practice', evaluationResult: 'correct' }), 'confirm');
});

test('resolvePurpose: incorrect + learning → hint', () => {
  equal(resolvePurpose({ stage: 'guided_practice', evaluationResult: 'incorrect', studentStatus: 'learning' }), 'hint');
});

test('resolvePurpose: incorrect + not_started/bilinmiyor → hint', () => {
  equal(resolvePurpose({ stage: 'guided_practice', evaluationResult: 'incorrect', studentStatus: 'not_started' }), 'hint');
  equal(resolvePurpose({ stage: 'guided_practice', evaluationResult: 'incorrect', studentStatus: null }), 'hint');
});

test('resolvePurpose: incorrect + provisional/mastered → reinforce', () => {
  equal(resolvePurpose({ stage: 'guided_practice', evaluationResult: 'incorrect', studentStatus: 'provisional' }), 'reinforce');
  equal(resolvePurpose({ stage: 'guided_practice', evaluationResult: 'incorrect', studentStatus: 'mastered' }), 'reinforce');
});

test('resolvePurpose: değerlendirme yoksa (henüz cevap yok) → explain', () => {
  equal(resolvePurpose({ stage: 'guided_practice', evaluationResult: null }), 'explain');
});

// ── buildRetrievalQuery ─────────────────────────────────────────────

test('buildRetrievalQuery: deterministik sistemden query üretir, LLM\'den değil', () => {
  const q = buildRetrievalQuery({ concept: 'capture', stage: 'guided_practice', studentStatus: 'learning', evaluationResult: 'incorrect' });
  equal(q.concept, 'capture');
  equal(q.stage, 'guided_practice');
  equal(q.studentStatus, 'learning');
  equal(q.evaluation, 'incorrect');
  equal(q.purpose, 'hint');
});

// ── retrieveContent: temel eşleşme ───────────────────────────────────

test('concept birebir eşleşir', () => {
  const query = buildRetrievalQuery({ concept: 'liberty', stage: 'guided_practice', studentStatus: 'learning', evaluationResult: 'incorrect' });
  const result = retrieveContent({ query, entries: FIXTURE_ENTRIES });
  ok(result.matched);
  equal(result.items[0].id, 'liberty-hint-01');
});

test('farklı concept\'e AİT içerik asla dönmez', () => {
  const query = buildRetrievalQuery({ concept: 'liberty', stage: 'guided_practice', studentStatus: 'learning', evaluationResult: 'incorrect' });
  const result = retrieveContent({ query, entries: FIXTURE_ENTRIES });
  ok(result.items.every(i => !i.id.startsWith('atari') && !i.id.startsWith('capture')));
});

test('purpose eşleşir: correct → confirm içeriği seçilir', () => {
  const query = buildRetrievalQuery({ concept: 'liberty', stage: 'guided_practice', studentStatus: 'learning', evaluationResult: 'correct' });
  const result = retrieveContent({ query, entries: FIXTURE_ENTRIES });
  equal(result.items[0].id, 'liberty-confirm-01');
});

test('stage eşleşir: instruction aşamasında explain içeriği seçilir', () => {
  const query = buildRetrievalQuery({ concept: 'liberty', stage: 'instruction', studentStatus: null, evaluationResult: null });
  const result = retrieveContent({ query, entries: FIXTURE_ENTRIES });
  equal(result.items[0].id, 'liberty-explain-01');
});

test('studentStatus eşleşir: provisional/mastered → reinforce, learning → hint (aynı incorrect değerlendirmede FARKLI içerik)', () => {
  const queryLearning = buildRetrievalQuery({ concept: 'liberty', stage: 'guided_practice', studentStatus: 'learning', evaluationResult: 'incorrect' });
  const queryProvisional = buildRetrievalQuery({ concept: 'liberty', stage: 'guided_practice', studentStatus: 'provisional', evaluationResult: 'incorrect' });
  equal(retrieveContent({ query: queryLearning, entries: FIXTURE_ENTRIES }).items[0].id, 'liberty-hint-01');
  equal(retrieveContent({ query: queryProvisional, entries: FIXTURE_ENTRIES }).items[0].id, 'liberty-reinforce-01');
});

// ── Controlled fallback ──────────────────────────────────────────────

test('exact eşleşme yoksa concept+purpose+stage\'e düşer', () => {
  const entries = [entry({ id: 'liberty-hint-generic', concept: 'liberty', stage: 'guided_practice', purpose: 'hint' })]; // studentStatus YOK (wildcard)
  const query = buildRetrievalQuery({ concept: 'liberty', stage: 'guided_practice', studentStatus: 'mastered', evaluationResult: 'incorrect' }); // purpose=reinforce ister
  // reinforce içeriği yok, ama hint(purpose farklı) da yok bu fixture'da → concept-only'ye düşmeli
  const result = retrieveContent({ query, entries });
  ok(result.matched);
  equal(result.fallbackLevel, 'concept');
  equal(result.items[0].id, 'liberty-hint-generic');
});

test('concept+purpose+stage bulunamazsa concept+purpose\'a düşer (farklı stage kabul edilir)', () => {
  const entries = [entry({ id: 'liberty-hint-worked', concept: 'liberty', stage: 'worked_example', purpose: 'hint', studentStatus: ['learning'] })];
  const query = buildRetrievalQuery({ concept: 'liberty', stage: 'guided_practice', studentStatus: 'learning', evaluationResult: 'incorrect' });
  const result = retrieveContent({ query, entries });
  ok(result.matched);
  equal(result.fallbackLevel, 'concept+purpose');
  equal(result.items[0].id, 'liberty-hint-worked');
});

test('hiç eşleşme yoksa (concept dahi yok) matched:false, items:[]', () => {
  const query = buildRetrievalQuery({ concept: 'stone_placement', stage: 'guided_practice', studentStatus: 'learning', evaluationResult: 'incorrect' });
  const result = retrieveContent({ query, entries: FIXTURE_ENTRIES }); // fixture'da stone_placement yok
  equal(result.matched, false);
  equal(result.items.length, 0);
  equal(result.fallbackLevel, 'none');
});

test('entries boşsa güvenli boş sonuç', () => {
  const query = buildRetrievalQuery({ concept: 'liberty', stage: 'guided_practice', studentStatus: 'learning', evaluationResult: 'incorrect' });
  const result = retrieveContent({ query, entries: [] });
  equal(result.matched, false);
});

test('query.concept eksikse güvenli boş sonuç (asla rastgele içerik dönmez)', () => {
  const result = retrieveContent({ query: { concept: null, purpose: 'hint' }, entries: FIXTURE_ENTRIES });
  equal(result.matched, false);
});

// ── MAX_RETRIEVAL_ITEMS ──────────────────────────────────────────────

test('MAX_RETRIEVAL_ITEMS sınırı korunur (çok sayıda eşleşme olsa bile)', () => {
  const manyEntries = Array.from({ length: 10 }, (_, i) => entry({ id: `liberty-hint-${i}`, studentStatus: ['learning'] }));
  const query = buildRetrievalQuery({ concept: 'liberty', stage: 'guided_practice', studentStatus: 'learning', evaluationResult: 'incorrect' });
  const result = retrieveContent({ query, entries: manyEntries });
  equal(result.items.length, MAX_RETRIEVAL_ITEMS);
  ok(MAX_RETRIEVAL_ITEMS <= 3, 'spesifikasyon: en fazla 2-3 item');
});

// ── Priority / deterministik sıralama ────────────────────────────────

test('priority sıralaması deterministiktir (aynı çağrı aynı sonucu üretir)', () => {
  const entries = [
    entry({ id: 'liberty-hint-a', studentStatus: ['learning'], priority: 1 }),
    entry({ id: 'liberty-hint-b', studentStatus: ['learning'], priority: 10 }),
  ];
  const query = buildRetrievalQuery({ concept: 'liberty', stage: 'guided_practice', studentStatus: 'learning', evaluationResult: 'incorrect' });
  const r1 = retrieveContent({ query, entries });
  const r2 = retrieveContent({ query, entries });
  equal(JSON.stringify(r1), JSON.stringify(r2));
  equal(r1.items[0].id, 'liberty-hint-b', 'yüksek priority önce gelmeli');
});

test('reason alanı doğru işaretleniyor', () => {
  const query = buildRetrievalQuery({ concept: 'liberty', stage: 'guided_practice', studentStatus: 'learning', evaluationResult: 'incorrect' });
  const result = retrieveContent({ query, entries: FIXTURE_ENTRIES });
  const item = result.items[0];
  equal(item.reason.concept, true);
  equal(item.reason.purpose, true);
  equal(item.reason.stage, true);
  equal(item.reason.studentStatus, true);
});

console.log(`\nToplam: ${passed + failed}  ✓ ${passed}  ✗ ${failed}`);
if (failed) process.exit(1);
