/**
 * tests/teacherContext.test.js
 * node tests/teacherContext.test.js
 *
 * core/teacherContext.js — deterministik motorun ürettiği gerçek
 * sonuçları LLM'ye verilecek "Structured Teacher Context" nesnesine
 * çevirir. Bu testler context'in curriculum'un "beklenen cevabından"
 * DEĞİL, gerçek board/ActionHandler sonucundan türediğini doğrular.
 */

globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
};

import { BoardState } from '../core/boardState.js';
import { LessonEngine } from '../core/lessonEngine.js';
import { ActionHandler } from '../core/actionHandler.js';
import { buildTeacherContext, coordLabel } from '../core/teacherContext.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓', name); passed++; }
  catch (e) { console.error('  ✗', name, '-', e.message); failed++; }
}
function ok(value, message = 'assertion failed') { if (!value) throw new Error(message); }
function equal(actual, expected, message) {
  if (actual !== expected) throw new Error(message || `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// tests/teacherPanelBridge.test.js'teki CAPTURE_CURRICULUM ile aynı desen —
// gerçek l3 (Taş Alma) davranışını birebir yansıtan izole bir kurgu.
const CAPTURE_CURRICULUM = [
  { id: 'c1', title: 'Test Bölümü', lessons: [
    { id: 'l3', title: 'Taş Alma', steps: [
      {
        text: '<p>Beyaz taşı yakala.</p>',
        board: [{ color: 'W', x: 4, y: 4 }, { color: 'B', x: 3, y: 4 }, { color: 'B', x: 4, y: 3 }, { color: 'B', x: 5, y: 4 }],
        answer: { x: 4, y: 5 }, turn: 'black', size: 9,
      },
    ] },
    { id: 'l2', title: 'Nefes Noktaları', steps: [
      { text: '<p>Bu taşın nefes noktalarına dokun.</p>', board: [{ color: 'B', x: 4, y: 4 }], answer: { x: 4, y: 5 }, turn: 'black', size: 9 },
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

// ── coordLabel ──────────────────────────────────────────────────────

test('coordLabel: board etiket kuralıyla tutarlı (I harfi atlanır, satır alttan sayılır)', () => {
  equal(coordLabel(4, 4, 9), 'E5');
  equal(coordLabel(0, 0, 9), 'A9');
  equal(coordLabel(8, 8, 9), 'J1'); // 8. indeks 'I' değil 'J' (I atlanır)
});

// ── Yanlış capture attempt ────────────────────────────────────────────

test('yanlış capture attempt → doğru context üretir (incorrect, legal:true, capturedCount:0, isAtari:true)', () => {
  const { board, lesson, handler } = captureSetup();
  const boardBefore = board.clone();
  const action = { type: 'BOARD_TAP', payload: { x: 0, y: 0 } }; // atariyle ilgisiz, yanlış nokta
  const result = handler.handle(action);
  equal(result.ok, false);

  const ctx = buildTeacherContext({ lessonEngine: lesson, boardState: board, boardBefore, action, result });
  equal(ctx.lesson.id, 'l3');
  equal(ctx.lesson.concept, 'capture');
  equal(ctx.evaluation.result, 'incorrect');
  equal(ctx.evaluation.legal, true, 'kural ihlali yok — yalnız ders cevabı yanlış');
  equal(ctx.evaluation.capturedCount, 0);
  equal(ctx.action.type, 'board_tap');
  equal(ctx.action.point, 'A9');
  ok(ctx.boardObservation, 'atari gözlemi mevcut olmalı');
  equal(ctx.boardObservation.isAtari, true);
  equal(ctx.boardObservation.targetColor, 'white');
  equal(ctx.student.attempt, 1, 'ilk yanlış deneme');
});

test('ikinci yanlış deneme → attempt:2', () => {
  const { board, lesson, handler } = captureSetup();
  handler.handle({ type: 'BOARD_TAP', payload: { x: 0, y: 0 } }); // 1. yanlış
  const boardBefore = board.clone();
  const action = { type: 'BOARD_TAP', payload: { x: 1, y: 1 } }; // 2. yanlış
  const result = handler.handle(action);
  const ctx = buildTeacherContext({ lessonEngine: lesson, boardState: board, boardBefore, action, result });
  equal(ctx.student.attempt, 2);
  equal(ctx.evaluation.result, 'incorrect');
});

// ── Doğru capture ─────────────────────────────────────────────────────

test('doğru capture context capturedCount bilgisini taşır', () => {
  const { board, lesson, handler } = captureSetup();
  const boardBefore = board.clone();
  const action = { type: 'BOARD_TAP', payload: { x: 4, y: 5 } };
  const result = handler.handle(action);
  ok(result.ok, 'doğru hamle kabul edilmeli');

  const ctx = buildTeacherContext({ lessonEngine: lesson, boardState: board, boardBefore, action, result });
  equal(ctx.evaluation.result, 'correct');
  equal(ctx.evaluation.legal, true);
  equal(ctx.evaluation.capturedCount, 1);
  equal(ctx.action.point, 'E4');
});

test('doğru cevapta attempt: önceki yanlışlar + bu doğru deneme', () => {
  const { board, lesson, handler } = captureSetup();
  handler.handle({ type: 'BOARD_TAP', payload: { x: 0, y: 0 } }); // 1. yanlış
  const boardBefore = board.clone();
  const action = { type: 'BOARD_TAP', payload: { x: 4, y: 5 } }; // doğru — 2. deneme
  const result = handler.handle(action);
  const ctx = buildTeacherContext({ lessonEngine: lesson, boardState: board, boardBefore, action, result });
  equal(ctx.evaluation.result, 'correct');
  equal(ctx.student.attempt, 2, '1 yanlış + bu doğru deneme = 2');
});

// ── Atari bilgisi ──────────────────────────────────────────────────────

test('atari bilgisi doğru aktarılır: targetStones ve remainingLiberties Go notasyonunda', () => {
  const { board, lesson } = captureSetup();
  const ctx = buildTeacherContext({ lessonEngine: lesson, boardState: board });
  ok(ctx.boardObservation);
  equal(ctx.boardObservation.targetStones.join(','), 'E5');
  equal(ctx.boardObservation.remainingLiberties.join(','), 'E4');
});

// ── l2 (nefes noktaları) ────────────────────────────────────────────────

test('l2 dersinde concept "liberty", atari yoksa boardObservation null', () => {
  const board = new BoardState(9);
  const lesson = new LessonEngine(CAPTURE_CURRICULUM);
  lesson.loadLesson('l2');
  board.placeStone(4, 4, 'black');
  const ctx = buildTeacherContext({ lessonEngine: lesson, boardState: board });
  equal(ctx.lesson.concept, 'liberty');
  equal(ctx.boardObservation, null, 'tek serbest taş atari değildir');
});

// ── Kenar durumlar ──────────────────────────────────────────────────────

test('ders yüklü değilse null döner', () => {
  const lesson = new LessonEngine(CAPTURE_CURRICULUM);
  const ctx = buildTeacherContext({ lessonEngine: lesson });
  equal(ctx, null);
});

test('action verilmezse action alanı null, evaluation.result null', () => {
  const { board, lesson } = captureSetup();
  const ctx = buildTeacherContext({ lessonEngine: lesson, boardState: board });
  equal(ctx.action, null);
  equal(ctx.evaluation.result, null);
});

test('task.teacherMessage HTML\'den arındırılmış, expectedInteraction doğru', () => {
  const { board, lesson } = captureSetup();
  const ctx = buildTeacherContext({ lessonEngine: lesson, boardState: board });
  ok(!ctx.task.teacherMessage.includes('<'));
  equal(ctx.task.expectedInteraction, 'board_move');
});

console.log(`\nToplam: ${passed + failed}  ✓ ${passed}  ✗ ${failed}`);
if (failed) process.exit(1);
