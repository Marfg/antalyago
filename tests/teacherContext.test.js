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
import { createStudentModel, applyStudentEvent } from '../core/studentModel.js';
import { mergeContentOverrides } from '../core/contentOverrides.js';
import { TEACHING_NOTES } from '../core/contentStore.js';

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

// ══════════════════════════════════════════════════════════════════════
// v0.5 — Student Model entegrasyonu
// ══════════════════════════════════════════════════════════════════════

test('studentModel verilmezse context.studentModel null — context KIRILMAZ', () => {
  const { board, lesson } = captureSetup();
  const ctx = buildTeacherContext({ lessonEngine: lesson, boardState: board });
  equal(ctx.studentModel, null);
});

test('studentModel verilir ama bu kavramda henüz veri yoksa null (not_started veri taşımaz)', () => {
  const { board, lesson } = captureSetup();
  const model = createStudentModel();
  const ctx = buildTeacherContext({ lessonEngine: lesson, boardState: board, studentModel: model });
  // capture kavramı henüz hiç güncellenmedi → getConceptState yine de bir
  // obje döner (not_started), bu yüzden studentModel dolu ama status not_started olmalı.
  ok(ctx.studentModel, 'not_started durumu da bir obje olarak taşınmalı');
  equal(ctx.studentModel.status, 'not_started');
  equal(ctx.studentModel.attempts, 0);
});

test('aktif concept Student Model özeti doğru eklenir (atari/capture ayrımına saygılı)', () => {
  const { board, lesson, handler } = captureSetup();
  let model = createStudentModel();
  ({ model } = applyStudentEvent(model, { type: 'answer_evaluated', lessonId: 'l3', stepId: 'l3:0', payload: { result: 'incorrect', concept: 'atari' } }));
  ({ model } = applyStudentEvent(model, { type: 'answer_evaluated', lessonId: 'l3', stepId: 'l3:0', payload: { result: 'incorrect', concept: 'atari' } }));

  const boardBefore = board.clone();
  const action = { type: 'BOARD_TAP', payload: { x: 0, y: 0 } }; // yanlış — atari hâlâ aktif
  const result = handler.handle(action);
  const ctx = buildTeacherContext({ lessonEngine: lesson, boardState: board, boardBefore, action, result, studentModel: model });

  equal(ctx.studentModel.currentConcept, 'atari');
  equal(ctx.studentModel.attempts, 2);
  equal(ctx.studentModel.status, 'learning');
});

// ══════════════════════════════════════════════════════════════════════
// v0.6 — RAG / content retrieval entegrasyonu
// ══════════════════════════════════════════════════════════════════════

test('retrieval her zaman dolu bir nesne döner (matched:false olsa bile null DEĞİL)', () => {
  const { board, lesson } = captureSetup();
  const ctx = buildTeacherContext({ lessonEngine: lesson, boardState: board });
  ok(ctx.retrieval, 'context.retrieval bir obje olmalı, context kırılmamalı');
  ok(typeof ctx.retrieval.matched === 'boolean');
  ok(Array.isArray(ctx.retrieval.items));
});

test('retrieval query context\'in kendi concept/stage bilgisiyle TUTARLI', () => {
  const { board, lesson } = captureSetup(); // l3 step0 — atari mevcut, henüz cevap yok
  const ctx = buildTeacherContext({ lessonEngine: lesson, boardState: board });
  equal(ctx.retrieval.query.concept, 'atari', 'context.boardObservation.isAtari ile aynı aktif kavram');
});

test('yanlış capture attempt (atari + incorrect) → gerçek "atari-hint" içeriği eşleşir', () => {
  const { board, lesson, handler } = captureSetup();
  const boardBefore = board.clone();
  const action = { type: 'BOARD_TAP', payload: { x: 0, y: 0 } };
  const result = handler.handle(action);
  const ctx = buildTeacherContext({ lessonEngine: lesson, boardState: board, boardBefore, action, result });

  equal(ctx.retrieval.query.concept, 'atari');
  equal(ctx.retrieval.query.purpose, 'hint');
  ok(ctx.retrieval.matched, 'gerçek content havuzunda atari+hint içeriği olmalı: ' + JSON.stringify(ctx.retrieval));
  ok(ctx.retrieval.items.length > 0);
  ok(ctx.retrieval.items.length <= 2, 'MAX_RETRIEVAL_ITEMS aşılmamalı');
  ok(ctx.retrieval.items[0].text.length > 0);
});

test('doğru capture cevabı (correct) → "confirm" amaçlı içerik eşleşir', () => {
  const { board, lesson, handler } = captureSetup();
  const boardBefore = board.clone();
  const action = { type: 'BOARD_TAP', payload: { x: 4, y: 5 } };
  const result = handler.handle(action);
  ok(result.ok);
  const ctx = buildTeacherContext({ lessonEngine: lesson, boardState: board, boardBefore, action, result });

  equal(ctx.retrieval.query.purpose, 'confirm');
  ok(ctx.retrieval.matched);
});

test('items yalnız {id,text} taşır — score/reason gibi iç alanlar LLM context\'ine SIZMAZ', () => {
  const { board, lesson, handler } = captureSetup();
  const boardBefore = board.clone();
  const action = { type: 'BOARD_TAP', payload: { x: 0, y: 0 } };
  const result = handler.handle(action);
  const ctx = buildTeacherContext({ lessonEngine: lesson, boardState: board, boardBefore, action, result });

  for (const item of ctx.retrieval.items) {
    equal(Object.keys(item).sort().join(','), 'id,text');
  }
});

test('mevcut v0.3/v0.4/v0.5 alanları (boardObservation, studentModel, evaluation, action) retrieval eklenince DEĞİŞMEDİ', () => {
  const { board, lesson, handler } = captureSetup();
  const boardBefore = board.clone();
  const action = { type: 'BOARD_TAP', payload: { x: 4, y: 5 } };
  const result = handler.handle(action);
  const ctx = buildTeacherContext({ lessonEngine: lesson, boardState: board, boardBefore, action, result });

  equal(ctx.evaluation.result, 'correct');
  equal(ctx.evaluation.capturedCount, 1);
  equal(ctx.action.point, 'E4');
  equal(ctx.studentModel, null); // studentModel verilmedi — v0.5 davranışı aynen korunuyor
  ok('boardObservation' in ctx);
});

// ══════════════════════════════════════════════════════════════════════
// v0.7 — Teacher Studio local content override entegrasyonu
// ══════════════════════════════════════════════════════════════════════

test('teachingNotes verilmezse davranış BASE içerikle v0.6 ile birebir aynı (overrideIds boş)', () => {
  const { board, lesson, handler } = captureSetup();
  const boardBefore = board.clone();
  const action = { type: 'BOARD_TAP', payload: { x: 0, y: 0 } };
  const result = handler.handle(action);
  const ctx = buildTeacherContext({ lessonEngine: lesson, boardState: board, boardBefore, action, result });
  ok(ctx.retrieval.matched);
  equal(ctx.retrieval.overrideIds.length, 0);
});

test('local override VERİLDİĞİNDE retrieval effective (override edilmiş) metni seçer', () => {
  const { board, lesson, handler } = captureSetup();
  const boardBefore = board.clone();
  const action = { type: 'BOARD_TAP', payload: { x: 0, y: 0 } };
  const result = handler.handle(action);

  // Önce override'sız context ile hangi item'in seçildiğini öğren.
  const before = buildTeacherContext({ lessonEngine: lesson, boardState: board, boardBefore, action, result });
  ok(before.retrieval.matched);
  const selectedId = before.retrieval.items[0].id;

  // O ID'ye bir local override uygula (core/contentStore.js'in GERÇEK BASE'i üzerinden).
  const effective = mergeContentOverrides(TEACHING_NOTES, { [selectedId]: { text: 'TEACHER STUDIO ÖZEL METNİ' } });

  const after = buildTeacherContext({ lessonEngine: lesson, boardState: board, boardBefore, action, result, teachingNotes: effective });
  equal(after.retrieval.items[0].id, selectedId, 'aynı content ID hâlâ seçilmeli (concept/purpose değişmedi)');
  equal(after.retrieval.items[0].text, 'TEACHER STUDIO ÖZEL METNİ', 'context artık OVERRIDE EDİLMİŞ metni taşımalı');
  ok(after.retrieval.overrideIds.includes(selectedId), 'overrideIds seçili item\'i işaretlemeli');
});

test('override başka content ID\'yi ETKİLEMEZ — ilgisiz bir override retrieval sonucunu değiştirmez', () => {
  const { board, lesson, handler } = captureSetup();
  const boardBefore = board.clone();
  const action = { type: 'BOARD_TAP', payload: { x: 0, y: 0 } };
  const result = handler.handle(action);

  const effective = mergeContentOverrides(TEACHING_NOTES, { 'stone_placement-explain-01': { text: 'İLGİSİZ DEĞİŞİKLİK' } });

  const ctx = buildTeacherContext({ lessonEngine: lesson, boardState: board, boardBefore, action, result, teachingNotes: effective });
  ok(!ctx.retrieval.items.some(i => i.text === 'İLGİSİZ DEĞİŞİKLİK'));
  equal(ctx.retrieval.overrideIds.length, 0, 'seçilen item override edilmediği için overrideIds boş kalmalı');
});

console.log(`\nToplam: ${passed + failed}  ✓ ${passed}  ✗ ${failed}`);
if (failed) process.exit(1);
