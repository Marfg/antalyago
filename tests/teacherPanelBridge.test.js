/**
 * tests/teacherPanelBridge.test.js
 * node tests/teacherPanelBridge.test.js
 *
 * core/teacherPanelBridge.js — ActionHandler action/result çiftinden saf
 * Teacher Panel view-model'i ve normalize event taslakları üretir.
 */

globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
};

import { BoardState } from '../core/boardState.js';
import { LessonEngine } from '../core/lessonEngine.js';
import { ActionHandler } from '../core/actionHandler.js';
import { buildPanelSnapshot, deriveEvents, resolveActiveConcept } from '../core/teacherPanelBridge.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓', name); passed++; }
  catch (e) { console.error('  ✗', name, '-', e.message); failed++; }
}
function ok(value, message = 'assertion failed') { if (!value) throw new Error(message); }
function equal(actual, expected, message) {
  if (actual !== expected) throw new Error(message || `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const MINI_CURRICULUM = [
  { id: 'c1', title: 'Test Bölümü', lessons: [
    { id: 'l1', title: 'Nefes Testi', steps: [
      { text: '<p>Bu taşın <strong>nefes noktalarına</strong> dokun.</p>', board: [{ color: 'B', x: 4, y: 4 }], answer: { x: 4, y: 5 }, turn: 'black', size: 9 },
      { text: '<p>İkinci adım — auto.</p>', board: [], auto: true, size: 9 },
    ] },
  ] },
];

function freshSetup() {
  const board = new BoardState(9);
  const lesson = new LessonEngine(MINI_CURRICULUM);
  lesson.loadLesson('l1');
  board.placeStone(4, 4, 'black');
  const handler = new ActionHandler(board, lesson);
  return { board, lesson, handler };
}

// ── buildPanelSnapshot ──────────────────────────────────────────────

test('buildPanelSnapshot: ders/step/mesaj/interaction/board/beklenen cevap alanları doğru', () => {
  const { board, lesson } = freshSetup();
  const snap = buildPanelSnapshot({ lessonEngine: lesson, boardState: board });

  equal(snap.lesson.id, 'l1');
  equal(snap.stepIndex, 0);
  equal(snap.totalSteps, 2);
  ok(!snap.teacherMessage.includes('<'), 'teacherMessage HTML\'den arındırılmış: ' + snap.teacherMessage);
  ok(snap.teacherMessage.includes('nefes noktalarına'), 'düz metin içeriği korunmuş');
  equal(snap.interactionType, 'board_move');
  equal(snap.board.size, 9);
  equal(snap.board.stones.length, 1);
  equal(snap.expectedAnswer.type, 'point');
  equal(snap.expectedAnswer.value.x, 4);
  equal(snap.expectedAnswer.value.y, 5);
});

test('buildPanelSnapshot: action/result verilmezse studentAction/evaluation/lastFeedback null', () => {
  const { lesson } = freshSetup();
  const snap = buildPanelSnapshot({ lessonEngine: lesson });
  equal(snap.studentAction, null);
  equal(snap.evaluation, null);
  equal(snap.lastFeedback, null);
  equal(snap.board, null, 'boardState verilmezse null');
});

test('buildPanelSnapshot: BOARD_TAP action + doğru sonuç → studentAction/evaluation/lastFeedback dolu', () => {
  const { board, lesson, handler } = freshSetup();
  const action = { type: 'BOARD_TAP', payload: { x: 4, y: 5 } };
  const result = handler.handle(action);
  const snap = buildPanelSnapshot({ lessonEngine: lesson, boardState: board, action, result });

  equal(snap.studentAction.type, 'board_tap');
  equal(snap.studentAction.x, 4);
  equal(snap.studentAction.y, 5);
  equal(snap.evaluation, 'correct');
  ok(typeof snap.lastFeedback === 'string' && snap.lastFeedback.length > 0);
});

test('buildPanelSnapshot: auto adımda expectedAnswer null (cevap gerekmiyor)', () => {
  const { board, lesson, handler } = freshSetup();
  handler.handle({ type: 'BOARD_TAP', payload: { x: 4, y: 5 } }); // adım 0'ı bitir
  handler.handle({ type: 'STEP_NEXT' }); // adım 1: auto
  const snap = buildPanelSnapshot({ lessonEngine: lesson, boardState: board });
  equal(snap.expectedAnswer, null);
});

// ── deriveEvents ──────────────────────────────────────────────────────

test('deriveEvents: action yoksa boş dizi', () => {
  equal(deriveEvents({ action: null, result: null, lessonEngine: null }).length, 0);
});

test('deriveEvents: LESSON_SELECT → lesson_started', () => {
  const { lesson } = freshSetup();
  const events = deriveEvents({ action: { type: 'LESSON_SELECT', payload: { lessonId: 'l1' } }, result: {}, lessonEngine: lesson });
  equal(events.length, 1);
  equal(events[0].type, 'lesson_started');
  equal(events[0].lessonId, 'l1');
});

test('deriveEvents: BOARD_TAP doğru cevap → student_board_tap + answer_evaluated(correct)', () => {
  const { lesson, handler } = freshSetup();
  const action = { type: 'BOARD_TAP', payload: { x: 4, y: 5 } };
  const result = handler.handle(action);
  const events = deriveEvents({ action, result, lessonEngine: lesson });
  equal(events.length, 2);
  equal(events[0].type, 'student_board_tap');
  equal(events[0].payload.x, 4);
  equal(events[1].type, 'answer_evaluated');
  equal(events[1].payload.result, 'correct');
});

test('deriveEvents: BOARD_TAP yanlış cevap → answer_evaluated(incorrect)', () => {
  const { lesson, handler } = freshSetup();
  const action = { type: 'BOARD_TAP', payload: { x: 0, y: 0 } };
  const result = handler.handle(action);
  const events = deriveEvents({ action, result, lessonEngine: lesson });
  equal(events[1].type, 'answer_evaluated');
  equal(events[1].payload.result, 'incorrect');
});

test('deriveEvents: geçersiz/no-op BOARD_TAP (adım zaten bitmiş) → yalnız student_board_tap, answer_evaluated yok', () => {
  const { lesson, handler } = freshSetup();
  handler.handle({ type: 'BOARD_TAP', payload: { x: 4, y: 5 } }); // doğru, adım bitti
  const action = { type: 'BOARD_TAP', payload: { x: 1, y: 1 } };
  const result = handler.handle(action); // stepDone → ok:false, feedback:null
  const events = deriveEvents({ action, result, lessonEngine: lesson });
  equal(events.length, 1, 'feedback yoksa değerlendirme event\'i üretilmemeli');
  equal(events[0].type, 'student_board_tap');
});

test('deriveEvents: HINT_REQUEST → teacher_hint_requested', () => {
  const { lesson } = freshSetup();
  const events = deriveEvents({ action: { type: 'HINT_REQUEST' }, result: {}, lessonEngine: lesson });
  equal(events[0].type, 'teacher_hint_requested');
});

test('deriveEvents: SHOW_LIBERTIES_REQUEST → teacher_show_liberties_requested', () => {
  const { lesson } = freshSetup();
  const events = deriveEvents({ action: { type: 'SHOW_LIBERTIES_REQUEST' }, result: {}, lessonEngine: lesson });
  equal(events[0].type, 'teacher_show_liberties_requested');
});

test('deriveEvents: STEP_NEXT normal geçiş → lesson_step_loaded', () => {
  const { lesson, handler } = freshSetup();
  handler.handle({ type: 'BOARD_TAP', payload: { x: 4, y: 5 } });
  const action = { type: 'STEP_NEXT' };
  const result = handler.handle(action);
  const events = deriveEvents({ action, result, lessonEngine: lesson });
  equal(events[0].type, 'lesson_step_loaded');
});

test('deriveEvents: STEP_NEXT ders tamamlanınca (SHOW_COMPLETION) → lesson_step_completed', () => {
  const { lesson, handler } = freshSetup();
  handler.handle({ type: 'BOARD_TAP', payload: { x: 4, y: 5 } });
  handler.handle({ type: 'STEP_NEXT' }); // adım 1 (auto, son adım)
  const action = { type: 'STEP_NEXT' };
  const result = handler.handle(action); // ders bitti → SHOW_COMPLETION
  ok(result.effects.some(e => e.type === 'SHOW_COMPLETION'), 'ön koşul: ders tamamlandı');
  const events = deriveEvents({ action, result, lessonEngine: lesson });
  equal(events[0].type, 'lesson_step_completed');
});

test('deriveEvents: stepId doğru formatta (lessonId:stepIndex)', () => {
  const { lesson } = freshSetup();
  const events = deriveEvents({ action: { type: 'HINT_REQUEST' }, result: {}, lessonEngine: lesson });
  equal(events[0].stepId, 'l1:0');
});

// ══════════════════════════════════════════════════════════════════════
// v0.2 — Atari / Taş Alma gözlemi (Teacher Lab v0.2)
// ══════════════════════════════════════════════════════════════════════

// l3'ün gerçek "tek taş" ve "grup" atari/capture desenlerini birebir
// yansıtan izole kurgular — gerçek ActionHandler + ruleEngine üzerinden.
const CAPTURE_CURRICULUM = [
  { id: 'c1', title: 'Test Bölümü', lessons: [
    { id: 'l3', title: 'Taş Alma Testi', steps: [
      // Tek taş: beyaz (4,4), üç yönü siyah — tek nefes (4,5)
      {
        text: '<p>Beyaz taşı yakala.</p>',
        board: [{ color: 'W', x: 4, y: 4 }, { color: 'B', x: 3, y: 4 }, { color: 'B', x: 4, y: 3 }, { color: 'B', x: 5, y: 4 }],
        answer: { x: 4, y: 5 }, turn: 'black', size: 9,
      },
      // Grup: beyaz (4,4)-(4,5) bağlı, tek ortak nefes (4,6)
      {
        text: '<p>Beyaz grubu yakala.</p>',
        board: [
          { color: 'W', x: 4, y: 4 }, { color: 'W', x: 4, y: 5 },
          { color: 'B', x: 3, y: 4 }, { color: 'B', x: 5, y: 4 }, { color: 'B', x: 4, y: 3 },
          { color: 'B', x: 3, y: 5 }, { color: 'B', x: 5, y: 5 },
        ],
        answer: { x: 4, y: 6 }, turn: 'black', size: 9,
      },
    ] },
  ] },
];

function captureSetup(stepIdx = 0) {
  const board = new BoardState(9);
  const lesson = new LessonEngine(CAPTURE_CURRICULUM);
  lesson.loadLesson('l3');
  if (stepIdx > 0) lesson.loadStep(stepIdx);
  const step = lesson.currentStep();
  for (const s of step.board) board.placeStone(s.x, s.y, s.color === 'B' ? 'black' : 'white');
  const handler = new ActionHandler(board, lesson);
  return { board, lesson, handler };
}

// ── Tek taş ───────────────────────────────────────────────────────────

test('buildPanelSnapshot: tek taş atari doğru tespit edilir (atari:true, targetGroup)', () => {
  const { board, lesson } = captureSetup(0);
  const snap = buildPanelSnapshot({ lessonEngine: lesson, boardState: board });
  equal(snap.atari, true);
  equal(snap.activeConcept, 'atari');
  equal(snap.targetGroup.color, 'white');
  equal(snap.targetGroup.stoneCount, 1);
  equal(snap.targetGroup.liberties.length, 1);
  equal(snap.targetGroup.liberties[0].x, 4);
  equal(snap.targetGroup.liberties[0].y, 5);
});

test('tek taş: doğru son nefes noktasına oynanınca capture_completed üretilir, capturedCount=1', () => {
  const { board, lesson, handler } = captureSetup(0);
  const boardBefore = board.clone();
  const action = { type: 'BOARD_TAP', payload: { x: 4, y: 5 } };
  const result = handler.handle(action);
  ok(result.ok, 'hamle doğru kabul edilmeli');

  const events = deriveEvents({ action, result, lessonEngine: lesson, boardState: board, boardBefore });
  const completed = events.find(e => e.type === 'capture_completed');
  ok(completed, 'capture_completed üretilmeli: ' + JSON.stringify(events));
  equal(completed.payload.capturedCount, 1);
  equal(completed.payload.capturedColor, 'white');
  equal(completed.payload.capturedPoints.length, 1);
  equal(completed.payload.capturedPoints[0].x, 4);
  equal(completed.payload.capturedPoints[0].y, 4);

  const attempt = events.find(e => e.type === 'capture_attempt');
  ok(attempt, 'capture_attempt da üretilmeli (atari mevcuttu)');
  equal(attempt.payload.expectedCaptureCount, 1);

  const snap = buildPanelSnapshot({ lessonEngine: lesson, boardState: board, action, result });
  equal(snap.moveResult.legal, true);
  equal(snap.moveResult.capturedCount, 1);
  equal(snap.capturedStones.length, 1);
  equal(snap.activeConcept, 'capture');
});

// ── Grup ──────────────────────────────────────────────────────────────

test('buildPanelSnapshot: bağlı grup atari doğru tespit edilir (2 taş, tek ortak nefes)', () => {
  const { board, lesson } = captureSetup(1);
  const snap = buildPanelSnapshot({ lessonEngine: lesson, boardState: board });
  equal(snap.atari, true);
  equal(snap.targetGroup.stoneCount, 2);
  equal(snap.targetGroup.liberties.length, 1);
});

test('grup: doğru hamlede grubun TAMAMI kaldırılır, capturedCount>1', () => {
  const { board, lesson, handler } = captureSetup(1);
  const boardBefore = board.clone();
  const action = { type: 'BOARD_TAP', payload: { x: 4, y: 6 } };
  const result = handler.handle(action);
  ok(result.ok);

  const events = deriveEvents({ action, result, lessonEngine: lesson, boardState: board, boardBefore });
  const completed = events.find(e => e.type === 'capture_completed');
  ok(completed);
  equal(completed.payload.capturedCount, 2);
  ok(completed.payload.capturedCount > 1, 'grup yakalamada capturedCount 1\'den büyük olmalı');
  const keys = completed.payload.capturedPoints.map(p => `${p.x},${p.y}`).sort().join('|');
  equal(keys, '4,4|4,5');

  const snap = buildPanelSnapshot({ lessonEngine: lesson, boardState: board, action, result });
  equal(snap.moveResult.capturedCount, 2);
  equal(snap.capturedStones.length, 2);
});

// ── Yanlış hamle ──────────────────────────────────────────────────────

test('yanlış hamle: capture hedefli step\'te yanlış kesişime oynanınca capture_completed ÜRETİLMEZ', () => {
  const { board, lesson, handler } = captureSetup(0);
  const boardBefore = board.clone();
  const action = { type: 'BOARD_TAP', payload: { x: 0, y: 0 } }; // atari'yle ilgisiz, yanlış nokta
  const result = handler.handle(action);
  equal(result.ok, false);
  equal(result.legal, true, 'kural olarak geçerli ama ders cevabı değil');

  const events = deriveEvents({ action, result, lessonEngine: lesson, boardState: board, boardBefore });
  ok(!events.some(e => e.type === 'capture_completed'), 'yanlış hamlede capture_completed olmamalı: ' + JSON.stringify(events));
  // capture_attempt yine de üretilir (atari mevcuttu, gerçek bir deneme yapıldı) — yalnız sonucu başarısız.
  ok(events.some(e => e.type === 'capture_attempt'), 'atari varken denenen her gerçek tıklama attempt sayılır');
  ok(events.some(e => e.type === 'answer_evaluated' && e.payload.result === 'incorrect'));

  const snap = buildPanelSnapshot({ lessonEngine: lesson, boardState: board, action, result });
  equal(snap.moveResult.capturedCount, 0);
  equal(snap.capturedStones, null);
  equal(board.stones.length, 4, 'yanlış hamlede board hiç değişmemeli (4 taş aynen duruyor)');
});

test('dolu noktaya/no-op tıklamada capture_attempt de capture_completed de üretilmez', () => {
  const { board, lesson, handler } = captureSetup(0);
  const boardBefore = board.clone();
  const action = { type: 'BOARD_TAP', payload: { x: 4, y: 4 } }; // dolu (beyaz taş orada)
  const result = handler.handle(action);
  equal(result.feedback, null, 'dolu noktada feedback yok (no-op)');

  const events = deriveEvents({ action, result, lessonEngine: lesson, boardState: board, boardBefore });
  equal(events.length, 1, 'yalnız student_board_tap — no-op tıklama attempt sayılmaz');
  equal(events[0].type, 'student_board_tap');
});

test('boardBefore verilmezse semantik event\'ler sessizce üretilmez, ham event\'ler korunur', () => {
  const { board, lesson, handler } = captureSetup(0);
  const action = { type: 'BOARD_TAP', payload: { x: 4, y: 5 } };
  const result = handler.handle(action);
  const events = deriveEvents({ action, result, lessonEngine: lesson, boardState: board }); // boardBefore YOK
  ok(!events.some(e => e.type === 'capture_attempt' || e.type === 'capture_completed'));
  ok(events.some(e => e.type === 'student_board_tap'));
  ok(events.some(e => e.type === 'answer_evaluated'));
});

// ── Adım yüklenince atari_detected ───────────────────────────────────

test('STEP_GOTO ile atari içeren pozisyon yüklenince atari_detected üretilir', () => {
  const board = new BoardState(9);
  const lesson = new LessonEngine(CAPTURE_CURRICULUM);
  lesson.loadLesson('l3');
  const handler = new ActionHandler(board, lesson);
  const step0 = lesson.currentStep();
  for (const s of step0.board) board.placeStone(s.x, s.y, s.color === 'B' ? 'black' : 'white');

  const action = { type: 'STEP_GOTO', payload: { idx: 0 } };
  const result = handler.handle(action);
  const events = deriveEvents({ action, result, lessonEngine: lesson, boardState: board });
  const detected = events.find(e => e.type === 'atari_detected');
  ok(detected, 'atari_detected üretilmeli: ' + JSON.stringify(events));
  equal(detected.payload.targetColor, 'white');
  equal(detected.payload.stoneCount, 1);
});

// ══════════════════════════════════════════════════════════════════════
// v0.5 — Student Model concept kaynağı (resolveActiveConcept)
// ══════════════════════════════════════════════════════════════════════

test('resolveActiveConcept: capture gerçekleştiyse "capture" döner', () => {
  const { board, lesson, handler } = captureSetup(0);
  const boardBefore = board.clone();
  const action = { type: 'BOARD_TAP', payload: { x: 4, y: 5 } };
  const result = handler.handle(action);
  const step = lesson.currentStep();
  const concept = resolveActiveConcept({ lessonId: 'l3', boardState: boardBefore, step, result });
  equal(concept, 'capture');
});

test('resolveActiveConcept: atari mevcut ama henüz yakalanmadıysa "atari" döner', () => {
  const { board, lesson, handler } = captureSetup(0);
  const boardBefore = board.clone();
  const action = { type: 'BOARD_TAP', payload: { x: 0, y: 0 } }; // yanlış — capture yok
  const result = handler.handle(action);
  const step = lesson.currentStep();
  const concept = resolveActiveConcept({ lessonId: 'l3', boardState: boardBefore, step, result });
  equal(concept, 'atari');
});

test('resolveActiveConcept: ne atari ne capture varsa dersin varsayılan kavramına düşer', () => {
  const concept = resolveActiveConcept({ lessonId: 'l2', boardState: null, step: null, result: null });
  equal(concept, 'liberty');
});

test('deriveEvents: answer_evaluated payload\'ı artık concept alanı taşır', () => {
  const { board, lesson, handler } = captureSetup(0);
  const boardBefore = board.clone();
  const action = { type: 'BOARD_TAP', payload: { x: 0, y: 0 } };
  const result = handler.handle(action);
  const events = deriveEvents({ action, result, lessonEngine: lesson, boardState: board, boardBefore });
  const evaluated = events.find(e => e.type === 'answer_evaluated');
  ok(evaluated, 'answer_evaluated üretilmeli');
  equal(evaluated.payload.concept, 'atari');
});

console.log(`\nToplam: ${passed + failed}  ✓ ${passed}  ✗ ${failed}`);
if (failed) process.exit(1);
