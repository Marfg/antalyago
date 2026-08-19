/**
 * tests/mockTeacherProvider.test.js
 * node tests/mockTeacherProvider.test.js
 *
 * core/mockTeacherProvider.js — gerçek API çağrısı olmadan Teacher
 * Assistant hattının tamamının test edilmesini sağlayan deterministik
 * provider.
 */

import { createMockTeacherProvider } from '../core/mockTeacherProvider.js';
import { parseTeacherResponse } from '../core/teacherResponseSchema.js';

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); console.log('  ✓', name); passed++; }
  catch (e) { console.error('  ✗', name, '-', e.message); failed++; }
}
function ok(value, message = 'assertion failed') { if (!value) throw new Error(message); }
function equal(actual, expected, message) {
  if (actual !== expected) throw new Error(message || `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function atariContext({ attempt = 1, evaluationResult = 'incorrect', capturedCount = 0 } = {}) {
  return {
    lesson: { id: 'l3', stepId: 'l3:0', concept: 'capture', stage: 'guided_practice' },
    student: { attempt },
    task: { teacherMessage: 'Beyaz taşı yakala.', expectedInteraction: 'board_move' },
    action: { type: 'board_tap', point: 'A9' },
    evaluation: { result: evaluationResult, legal: true, capturedCount },
    boardObservation: { targetColor: 'white', targetStones: ['E5'], isAtari: true, remainingLiberties: ['E4'] },
  };
}

await test('deterministik: aynı context için aynı sonucu üretir (rastgelelik yok)', async () => {
  const provider = createMockTeacherProvider();
  const ctx = atariContext({ attempt: 1 });
  const r1 = await provider.generateTeacherResponse(ctx);
  const r2 = await provider.generateTeacherResponse(ctx);
  equal(r1.raw, r2.raw);
});

await test('TeacherAssistant.parseTeacherResponse ile mock çıktısı parse edilebilir', async () => {
  const provider = createMockTeacherProvider();
  const response = await provider.generateTeacherResponse(atariContext());
  ok(response.ok);
  const parsed = parseTeacherResponse(response.raw);
  ok(parsed.valid, 'mock cevabı şemaya uymalı: ' + response.raw);
});

await test('doğru cevap (evaluation.result="correct") → action:"say", mesaj başarıyı açıklar', async () => {
  const provider = createMockTeacherProvider();
  const response = await provider.generateTeacherResponse(atariContext({ evaluationResult: 'correct', capturedCount: 1 }));
  const parsed = parseTeacherResponse(response.raw);
  equal(parsed.value.action, 'say');
  ok(parsed.value.message.length > 0);
});

await test('yanlış + atari + attempt:1 → give_hint, hintLevel:1, koordinat VERİLMEZ', async () => {
  const provider = createMockTeacherProvider();
  const response = await provider.generateTeacherResponse(atariContext({ attempt: 1 }));
  const parsed = parseTeacherResponse(response.raw);
  equal(parsed.value.action, 'give_hint');
  equal(parsed.value.hintLevel, 1);
  ok(!parsed.value.message.includes('E4'), 'attempt 1\'de doğru koordinat verilmemeli');
});

await test('yanlış + atari + attempt:2 → hintLevel:2, hâlâ koordinat verilmez', async () => {
  const provider = createMockTeacherProvider();
  const response = await provider.generateTeacherResponse(atariContext({ attempt: 2 }));
  const parsed = parseTeacherResponse(response.raw);
  equal(parsed.value.hintLevel, 2);
  ok(!parsed.value.message.includes('E4'), 'attempt 2\'de hâlâ doğru koordinat verilmemeli');
});

// v0.4: attempt 3+'te artık metinde koordinat AÇIKLAMAK yerine
// "show_liberties" tool talebi üretilir — gerçek koordinatı
// core/teacherToolRouter.js, mock'un cevabından değil, deterministik
// board gözleminden bulur.
await test('yanlış + atari + attempt:3 → show_liberties tool talebi, mesajda koordinat YOK', async () => {
  const provider = createMockTeacherProvider();
  const response = await provider.generateTeacherResponse(atariContext({ attempt: 3 }));
  const parsed = parseTeacherResponse(response.raw);
  ok(parsed.valid, 'mock cevabı hâlâ şemaya uymalı: ' + response.raw);
  equal(parsed.value.action, 'show_liberties');
  ok(!parsed.value.message.includes('E4'), 'mock mesajında doğru koordinat asla geçmemeli');
});

await test('yanlış + atari + attempt:4+ → hâlâ show_liberties (escalation yukarı doğru sabitlenir)', async () => {
  const provider = createMockTeacherProvider();
  const response = await provider.generateTeacherResponse(atariContext({ attempt: 5 }));
  const parsed = parseTeacherResponse(response.raw);
  equal(parsed.value.action, 'show_liberties');
});

// ── v0.5: Student Model'in mock hint tonuna etkisi ───────────────────

await test('studentModel.status="learning" → normal (attempt bazlı) hint metni', async () => {
  const provider = createMockTeacherProvider();
  const ctx = atariContext({ attempt: 1 });
  ctx.studentModel = { currentConcept: 'capture', status: 'learning', attempts: 1, recentAccuracy: 0, independentCorrect: 0, hintsUsed: 0, toolAssists: 0 };
  const response = await provider.generateTeacherResponse(ctx);
  const parsed = parseTeacherResponse(response.raw);
  equal(parsed.value.message, 'Rakip taşın kalan nefes noktasını tekrar bulmaya çalış.');
});

await test('studentModel.status="mastered" → DAHA KISA/terse mesaj, attempt seviyesinden BAĞIMSIZ', async () => {
  const provider = createMockTeacherProvider();
  const ctx = atariContext({ attempt: 1 }); // attempt 1 olsa bile
  ctx.studentModel = { currentConcept: 'capture', status: 'mastered', attempts: 6, recentAccuracy: 0.9, independentCorrect: 5, hintsUsed: 0, toolAssists: 0 };
  const response = await provider.generateTeacherResponse(ctx);
  const parsed = parseTeacherResponse(response.raw);
  equal(parsed.value.action, 'give_hint');
  equal(parsed.value.message, 'Son nefes noktasını gözden kaçırdın. Tekrar dene.');
  ok(!parsed.value.message.includes('E4'), 'mastered mesajı da koordinat içermemeli');
});

await test('studentModel verilmezse (undefined) davranış v0.4 ile birebir aynı kalır', async () => {
  const provider = createMockTeacherProvider();
  const response = await provider.generateTeacherResponse(atariContext({ attempt: 1 }));
  const parsed = parseTeacherResponse(response.raw);
  equal(parsed.value.message, 'Rakip taşın kalan nefes noktasını tekrar bulmaya çalış.');
});

// ── v0.6: retrieval kullanımı ─────────────────────────────────────────

await test('context.retrieval.matched=true (attempt:1) → mesaj retrieval metnini kullanır', async () => {
  const provider = createMockTeacherProvider();
  const ctx = atariContext({ attempt: 1 });
  ctx.retrieval = {
    matched: true,
    query: { concept: 'atari', stage: 'guided_practice', studentStatus: 'learning', purpose: 'hint' },
    items: [{ id: 'atari-hint-01', text: 'Rakip taşın çevresindeki nefes noktalarını tek tek say.' }],
    fallbackLevel: 'exact',
  };
  const response = await provider.generateTeacherResponse(ctx);
  const parsed = parseTeacherResponse(response.raw);
  equal(parsed.value.action, 'give_hint');
  equal(parsed.value.message, 'Rakip taşın çevresindeki nefes noktalarını tek tek say.');
});

await test('context.retrieval yoksa (v0.5 context\'i) davranış AYNI kalır — retrieval sadece EK bir kaynak', async () => {
  const provider = createMockTeacherProvider();
  const response = await provider.generateTeacherResponse(atariContext({ attempt: 1 }));
  const parsed = parseTeacherResponse(response.raw);
  equal(parsed.value.message, 'Rakip taşın kalan nefes noktasını tekrar bulmaya çalış.');
});

await test('context.retrieval.matched=false → sabit kodlu mesaja düşer (retrieval engine\'e dönüşmedi)', async () => {
  const provider = createMockTeacherProvider();
  const ctx = atariContext({ attempt: 1 });
  ctx.retrieval = { matched: false, query: { concept: 'atari', purpose: 'hint' }, items: [], fallbackLevel: 'none' };
  const response = await provider.generateTeacherResponse(ctx);
  const parsed = parseTeacherResponse(response.raw);
  equal(parsed.value.message, 'Rakip taşın kalan nefes noktasını tekrar bulmaya çalış.');
});

await test('atari YOK ama yanlış cevap + retrieval eşleşti (ör. saf liberty adımı) → give_hint, retrieval metni kullanılır', async () => {
  const provider = createMockTeacherProvider();
  const ctx = atariContext({ attempt: 1 });
  ctx.boardObservation = null; // v0.5.1 liberty-only adımlarında atari YOK
  ctx.retrieval = {
    matched: true,
    query: { concept: 'liberty', purpose: 'hint' },
    items: [{ id: 'liberty-hint-01', text: 'Taşın yatay ve dikey komşularına odaklan.' }],
    fallbackLevel: 'exact',
  };
  const response = await provider.generateTeacherResponse(ctx);
  const parsed = parseTeacherResponse(response.raw);
  equal(parsed.value.action, 'give_hint');
  equal(parsed.value.message, 'Taşın yatay ve dikey komşularına odaklan.');
});

await test('atari YOK, retrieval de eşleşmedi → v0.5 ile aynı genel mesaj (regresyon)', async () => {
  const provider = createMockTeacherProvider();
  const ctx = atariContext({ attempt: 1 });
  ctx.boardObservation = null;
  const response = await provider.generateTeacherResponse(ctx);
  const parsed = parseTeacherResponse(response.raw);
  equal(parsed.value.action, 'say');
  equal(parsed.value.message, 'Tahtaya tekrar bak ve az önce anlatılanı uygulamaya çalış.');
});

await test('retrieval sadece hintLevel:1/"learning" dalında kullanılır — mastered dalı hâlâ sabit mesajını korur', async () => {
  const provider = createMockTeacherProvider();
  const ctx = atariContext({ attempt: 1 });
  ctx.studentModel = { currentConcept: 'atari', status: 'mastered', attempts: 6, recentAccuracy: 0.9, independentCorrect: 5, hintsUsed: 0, toolAssists: 0 };
  ctx.retrieval = { matched: true, query: {}, items: [{ id: 'atari-reinforce-01', text: 'Bu retrieval metni mastered dalında GÖRÜNMEMELİ.' }], fallbackLevel: 'exact' };
  const response = await provider.generateTeacherResponse(ctx);
  const parsed = parseTeacherResponse(response.raw);
  equal(parsed.value.message, 'Son nefes noktasını gözden kaçırdın. Tekrar dene.');
});

await test('atari yoksa (boardObservation null) genel bir "say" mesajı üretir', async () => {
  const provider = createMockTeacherProvider();
  const ctx = atariContext();
  ctx.boardObservation = null;
  const response = await provider.generateTeacherResponse(ctx);
  const parsed = parseTeacherResponse(response.raw);
  equal(parsed.value.action, 'say');
});

await test('provider adı "mock", latencyMs sayısal', async () => {
  const provider = createMockTeacherProvider();
  const response = await provider.generateTeacherResponse(atariContext());
  equal(provider.name, 'mock');
  equal(response.provider, 'mock');
  equal(typeof response.latencyMs, 'number');
});

console.log(`\nToplam: ${passed + failed}  ✓ ${passed}  ✗ ${failed}`);
if (failed) process.exit(1);
