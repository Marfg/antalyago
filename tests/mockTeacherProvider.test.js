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

await test('yanlış + atari + attempt:3 → hintLevel:3, doğrudanlaştırılmış (koordinat) yönlendirme', async () => {
  const provider = createMockTeacherProvider();
  const response = await provider.generateTeacherResponse(atariContext({ attempt: 3 }));
  const parsed = parseTeacherResponse(response.raw);
  equal(parsed.value.hintLevel, 3);
  ok(parsed.value.message.includes('E4'), 'attempt 3+\'te doğrudan yönlendirme kabul edilir');
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
