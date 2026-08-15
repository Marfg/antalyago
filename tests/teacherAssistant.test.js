/**
 * tests/teacherAssistant.test.js
 * node tests/teacherAssistant.test.js
 *
 * core/teacherAssistant.js — provider-bağımsız orkestrasyon:
 * AI kapalıysa (provider yok) veya AI hata verirse/geçersiz cevap
 * dönerse sistem HER ZAMAN deterministic feedback'e düşer. Bu dosyanın
 * asıl amacı bu "güvenlik ağını" ve AI çağrı kapısını (§13) doğrulamak.
 */

globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
};

import { BoardState } from '../core/boardState.js';
import { LessonEngine } from '../core/lessonEngine.js';
import { ActionHandler } from '../core/actionHandler.js';
import { createMockTeacherProvider } from '../core/mockTeacherProvider.js';
import { requestTeacherResponse, shouldRequestTeacherResponse, buildAiReviewEvent } from '../core/teacherAssistant.js';

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); console.log('  ✓', name); passed++; }
  catch (e) { console.error('  ✗', name, '-', e.message); failed++; }
}
function ok(value, message = 'assertion failed') { if (!value) throw new Error(message); }
function equal(actual, expected, message) {
  if (actual !== expected) throw new Error(message || `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const CAPTURE_CURRICULUM = [
  { id: 'c1', title: 'Test Bölümü', lessons: [
    { id: 'l3', title: 'Taş Alma', steps: [
      {
        text: '<p>Beyaz taşı yakala.</p>',
        board: [{ color: 'W', x: 4, y: 4 }, { color: 'B', x: 3, y: 4 }, { color: 'B', x: 4, y: 3 }, { color: 'B', x: 5, y: 4 }],
        answer: { x: 4, y: 5 }, turn: 'black', size: 9,
      },
    ] },
  ] },
];

function captureSetup() {
  const board = new BoardState(9);
  const lesson = new LessonEngine(CAPTURE_CURRICULUM);
  lesson.loadLesson('l3');
  const step = lesson.currentStep();
  for (const s of step.board) board.placeStone(s.x, s.y, s.color === 'B' ? 'black' : 'white');
  const handler = new ActionHandler(board, lesson);
  return { board, lesson, handler };
}

function fakeProvider(name, impl) {
  return { name, generateTeacherResponse: impl };
}

// ── shouldRequestTeacherResponse (§13 — AI ne zaman çağrılacak) ─────────

await test('shouldRequestTeacherResponse: BOARD_TAP + wrong feedback → true', () => {
  const result = { feedback: { type: 'wrong', text: 'x' } };
  equal(shouldRequestTeacherResponse({ type: 'BOARD_TAP' }, result), true);
});

await test('shouldRequestTeacherResponse: BOARD_TAP + correct feedback → true', () => {
  const result = { feedback: { type: 'correct', text: 'x' } };
  equal(shouldRequestTeacherResponse({ type: 'BOARD_TAP' }, result), true);
});

await test('shouldRequestTeacherResponse: no-op BOARD_TAP (feedback null) → false', () => {
  const result = { feedback: null };
  equal(shouldRequestTeacherResponse({ type: 'BOARD_TAP' }, result), false);
});

await test('shouldRequestTeacherResponse: navigasyon action\'ları (STEP_NEXT vb.) → false', () => {
  equal(shouldRequestTeacherResponse({ type: 'STEP_NEXT' }, { feedback: { type: 'info', text: 'x' } }), false);
  equal(shouldRequestTeacherResponse({ type: 'HINT_REQUEST' }, { feedback: { type: 'info', text: 'x' } }), false);
});

await test('shouldRequestTeacherResponse: action/result yoksa → false', () => {
  equal(shouldRequestTeacherResponse(null, null), false);
});

// ── AI kapalı (provider yok) → sistem AI'a bağımlı değil ────────────────

await test('provider verilmezse: her zaman deterministic feedback, hiç event yok', async () => {
  const { board, lesson, handler } = captureSetup();
  const boardBefore = board.clone();
  const action = { type: 'BOARD_TAP', payload: { x: 0, y: 0 } };
  const result = handler.handle(action);
  const outcome = await requestTeacherResponse({ provider: null, lessonEngine: lesson, boardState: board, boardBefore, action, result });
  equal(outcome.source, 'deterministic');
  equal(outcome.message, result.feedback.text);
  equal(outcome.events.length, 0);
});

// ── Mock provider ile başarılı akış ─────────────────────────────────────

await test('mock provider + yanlış capture attempt → source:"ai", ai_teacher_requested + ai_teacher_responded event\'leri', async () => {
  const { board, lesson, handler } = captureSetup();
  const boardBefore = board.clone();
  const action = { type: 'BOARD_TAP', payload: { x: 0, y: 0 } };
  const result = handler.handle(action);
  const provider = createMockTeacherProvider();
  const outcome = await requestTeacherResponse({ provider, lessonEngine: lesson, boardState: board, boardBefore, action, result });

  equal(outcome.source, 'ai');
  equal(outcome.provider, 'mock');
  ok(outcome.message.length > 0);
  equal(outcome.events.map(e => e.type).join(','), 'ai_teacher_requested,ai_teacher_responded');
  equal(outcome.events[0].lessonId, 'l3');
});

// ── Fallback: provider hata fırlatırsa ───────────────────────────────

await test('provider exception fırlatırsa → deterministic fallback + ai_teacher_failed + ai_teacher_fallback_used', async () => {
  const { board, lesson, handler } = captureSetup();
  const boardBefore = board.clone();
  const action = { type: 'BOARD_TAP', payload: { x: 0, y: 0 } };
  const result = handler.handle(action);
  const provider = fakeProvider('broken', async () => { throw new Error('network down'); });
  const outcome = await requestTeacherResponse({ provider, lessonEngine: lesson, boardState: board, boardBefore, action, result });

  equal(outcome.source, 'deterministic');
  equal(outcome.message, result.feedback.text, 'öğrenci deterministic feedback\'i almalı');
  equal(outcome.error, 'network down');
  equal(outcome.events.map(e => e.type).join(','), 'ai_teacher_requested,ai_teacher_failed,ai_teacher_fallback_used');
});

// ── Fallback: provider ok:false dönerse (API hatası) ───────────────────

await test('provider ok:false dönerse (API hatası) → deterministic fallback', async () => {
  const { board, lesson, handler } = captureSetup();
  const boardBefore = board.clone();
  const action = { type: 'BOARD_TAP', payload: { x: 0, y: 0 } };
  const result = handler.handle(action);
  const provider = fakeProvider('down', async () => ({ ok: false, raw: null, error: 'HTTP_500', latencyMs: 12 }));
  const outcome = await requestTeacherResponse({ provider, lessonEngine: lesson, boardState: board, boardBefore, action, result });

  equal(outcome.source, 'deterministic');
  equal(outcome.error, 'HTTP_500');
  ok(outcome.events.some(e => e.type === 'ai_teacher_fallback_used'));
});

// ── Fallback: bozuk JSON / geçersiz şema ────────────────────────────────

await test('provider bozuk JSON dönerse → parse hatası fallback oluşturur', async () => {
  const { board, lesson, handler } = captureSetup();
  const boardBefore = board.clone();
  const action = { type: 'BOARD_TAP', payload: { x: 0, y: 0 } };
  const result = handler.handle(action);
  const provider = fakeProvider('claude', async () => ({ ok: true, raw: 'not json {{', latencyMs: 5 }));
  const outcome = await requestTeacherResponse({ provider, lessonEngine: lesson, boardState: board, boardBefore, action, result });

  equal(outcome.source, 'deterministic');
  equal(outcome.error, 'INVALID_JSON');
  equal(outcome.message, result.feedback.text);
});

await test('provider şema dışı action dönerse → fallback (INVALID_ACTION)', async () => {
  const { board, lesson, handler } = captureSetup();
  const boardBefore = board.clone();
  const action = { type: 'BOARD_TAP', payload: { x: 0, y: 0 } };
  const result = handler.handle(action);
  const provider = fakeProvider('claude', async () => ({ ok: true, raw: JSON.stringify({ action: 'move_stone', message: 'x' }), latencyMs: 5 }));
  const outcome = await requestTeacherResponse({ provider, lessonEngine: lesson, boardState: board, boardBefore, action, result });

  equal(outcome.source, 'deterministic');
  equal(outcome.error, 'INVALID_ACTION');
});

// ── Context üretilemiyorsa (ders yüklü değil) ───────────────────────────

await test('context üretilemiyorsa (ders yok) provider hiç çağrılmadan deterministic döner', async () => {
  const lesson = new LessonEngine(CAPTURE_CURRICULUM); // loadLesson çağrılmadı
  let called = false;
  const provider = fakeProvider('claude', async () => { called = true; return { ok: true, raw: '{}' }; });
  const outcome = await requestTeacherResponse({ provider, lessonEngine: lesson });
  equal(outcome.source, 'deterministic');
  equal(called, false, 'provider çağrılmamalı — context yok');
});

// ── Manuel inceleme event'i ─────────────────────────────────────────────

await test('buildAiReviewEvent: onay/red kararı doğru event şekli üretir', () => {
  const { lesson } = captureSetup();
  const approved = buildAiReviewEvent('approved', { lessonEngine: lesson });
  equal(approved.type, 'ai_teacher_response_reviewed');
  equal(approved.payload.decision, 'approved');
  equal(approved.lessonId, 'l3');
});

console.log(`\nToplam: ${passed + failed}  ✓ ${passed}  ✗ ${failed}`);
if (failed) process.exit(1);
