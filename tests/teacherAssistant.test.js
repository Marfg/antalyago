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
import { requestTeacherResponse, shouldRequestTeacherResponse, buildAiReviewEvent, deriveRetrievalEvents } from '../core/teacherAssistant.js';
import { createStudentModel, applyStudentEvent } from '../core/studentModel.js';
import { routeTeacherTool } from '../core/teacherToolRouter.js';

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
  // v0.6: content_retrieval_* event'leri artık ai_teacher_requested'tan ÖNCE gelir.
  equal(
    outcome.events.map(e => e.type).join(','),
    'content_retrieval_requested,content_retrieval_matched,ai_teacher_requested,ai_teacher_responded',
  );
  equal(outcome.events[0].lessonId, 'l3');
});

// ── v0.4: show_liberties tool routing ────────────────────────────────

await test('say/give_hint → outcome.tool === null, tool event\'i ÜRETİLMEZ (yalnız show_liberties router\'dan geçer)', async () => {
  const { board, lesson, handler } = captureSetup();
  const boardBefore = board.clone();
  const action = { type: 'BOARD_TAP', payload: { x: 0, y: 0 } };
  const result = handler.handle(action);
  const provider = fakeProvider('claude', async () => ({ ok: true, raw: JSON.stringify({ action: 'give_hint', message: 'x', hintLevel: 1 }), latencyMs: 5 }));
  const outcome = await requestTeacherResponse({ provider, lessonEngine: lesson, boardState: board, boardBefore, action, result });

  equal(outcome.source, 'ai');
  equal(outcome.tool, null);
  ok(!outcome.events.some(e => e.type.startsWith('teacher_tool_')), 'give_hint tool event\'i üretmemeli');
});

await test('AI show_liberties isterse (atari mevcut) → allowed, SHOW_LIBERTY_HIGHLIGHTS effect\'i, applied event\'i', async () => {
  const { board, lesson, handler } = captureSetup();
  const boardBefore = board.clone();
  const action = { type: 'BOARD_TAP', payload: { x: 0, y: 0 } }; // yanlış — atari hâlâ geçerli
  const result = handler.handle(action);
  const provider = fakeProvider('claude', async () => ({ ok: true, raw: JSON.stringify({ action: 'show_liberties', message: 'Bakalım.' }), latencyMs: 5 }));
  const outcome = await requestTeacherResponse({ provider, lessonEngine: lesson, boardState: board, boardBefore, action, result });

  equal(outcome.source, 'ai');
  equal(outcome.aiAction, 'show_liberties');
  ok(outcome.tool, 'tool alanı dolu olmalı');
  equal(outcome.tool.allowed, true);
  equal(outcome.tool.effects[0].type, 'SHOW_LIBERTY_HIGHLIGHTS');
  equal(outcome.tool.effects[0].points[0].x, 4);
  equal(outcome.tool.effects[0].points[0].y, 5);
  equal(
    outcome.events.map(e => e.type).join(','),
    'content_retrieval_requested,content_retrieval_matched,ai_teacher_requested,ai_teacher_responded,teacher_tool_requested,teacher_tool_allowed,teacher_tool_applied',
  );
});

await test('AI show_liberties isterse ama hedef grup yoksa → rejected, board effect YOK, ders akışı bozulmaz', async () => {
  // l3'ün DIŞINDA, atarisiz bir ders — show_liberties'in reddedilmesi gereken durum.
  const NO_ATARI_CURRICULUM = [
    { id: 'c1', title: 'Test', lessons: [
      { id: 'l2', title: 'Nefes Noktaları', steps: [
        { text: '<p>Nefes noktalarını say.</p>', board: [{ color: 'B', x: 4, y: 4 }], answer: { x: 4, y: 5 }, turn: 'black', size: 9 },
      ] },
    ] },
  ];
  const board = new BoardState(9);
  const lesson = new LessonEngine(NO_ATARI_CURRICULUM);
  lesson.loadLesson('l2');
  board.placeStone(4, 4, 'black');
  const handler = new ActionHandler(board, lesson);
  const boardBefore = board.clone();
  const action = { type: 'BOARD_TAP', payload: { x: 0, y: 0 } };
  const result = handler.handle(action);
  const provider = fakeProvider('claude', async () => ({ ok: true, raw: JSON.stringify({ action: 'show_liberties', message: 'Bakalım.' }), latencyMs: 5 }));
  const outcome = await requestTeacherResponse({ provider, lessonEngine: lesson, boardState: board, boardBefore, action, result });

  equal(outcome.source, 'ai', 'mesaj hâlâ AI\'dan gösterilir');
  ok(outcome.message.length > 0);
  equal(outcome.tool.allowed, false);
  equal(outcome.tool.reason, 'no_target_group');
  equal(outcome.tool.effects.length, 0, 'reddedilen tool board\'u DEĞİŞTİRMEMELİ');
  ok(outcome.events.some(e => e.type === 'teacher_tool_rejected' && e.payload.reason === 'no_target_group'));
});

await test('LLM show_liberties response\'una sahte bir "points" alanı eklerse → şema seviyesinde reddedilir, deterministic fallback', async () => {
  const { board, lesson, handler } = captureSetup();
  const boardBefore = board.clone();
  const action = { type: 'BOARD_TAP', payload: { x: 0, y: 0 } };
  const result = handler.handle(action);
  const provider = fakeProvider('claude', async () => ({
    ok: true,
    raw: JSON.stringify({ action: 'show_liberties', message: 'x', points: [{ x: 0, y: 0 }] }),
    latencyMs: 5,
  }));
  const outcome = await requestTeacherResponse({ provider, lessonEngine: lesson, boardState: board, boardBefore, action, result });

  equal(outcome.source, 'deterministic', 'koordinat üretmeye çalışan LLM cevabı şema seviyesinde reddedilmeli');
  equal(outcome.error, 'COORDINATES_NOT_ALLOWED');
  equal(outcome.tool, null);
});

// ── v0.5: studentModel context'e ulaşır ──────────────────────────────

await test('studentModel verilirse context.studentModel dolar; verilmezse null (kırılmaz)', async () => {
  const { board, lesson, handler } = captureSetup();
  const boardBefore = board.clone();
  const action = { type: 'BOARD_TAP', payload: { x: 0, y: 0 } };
  const result = handler.handle(action);
  const provider = createMockTeacherProvider();

  let model = createStudentModel();
  ({ model } = applyStudentEvent(model, { type: 'answer_evaluated', lessonId: 'l3', stepId: 'l3:0', payload: { result: 'incorrect', concept: 'atari' } }));

  const withModel = await requestTeacherResponse({ provider, lessonEngine: lesson, boardState: board, boardBefore, action, result, studentModel: model });
  ok(withModel.context.studentModel, 'context.studentModel dolu olmalı');
  equal(withModel.context.studentModel.attempts, 1);

  const withoutModel = await requestTeacherResponse({ provider, lessonEngine: lesson, boardState: board, boardBefore, action, result });
  equal(withoutModel.context.studentModel, null);
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
  equal(
    outcome.events.map(e => e.type).join(','),
    'content_retrieval_requested,content_retrieval_matched,ai_teacher_requested,ai_teacher_failed,ai_teacher_fallback_used',
  );
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

// ── v0.6: deriveRetrievalEvents (matched/missed — gerçek content havuzuna
// bağlı KALMADAN, doğrudan sentetik retrieval sonucuyla test edilir) ────

await test('deriveRetrievalEvents: retrieval null ise boş dizi', () => {
  equal(deriveRetrievalEvents(null, { lessonId: 'l3', stepId: 'l3:0' }).length, 0);
});

await test('deriveRetrievalEvents: matched:true → content_retrieval_requested + content_retrieval_matched', () => {
  const retrieval = { matched: true, query: { concept: 'atari', purpose: 'hint' }, items: [{ id: 'atari-hint-01' }], fallbackLevel: 'exact' };
  const events = deriveRetrievalEvents(retrieval, { lessonId: 'l3', stepId: 'l3:0' });
  equal(events.map(e => e.type).join(','), 'content_retrieval_requested,content_retrieval_matched');
  equal(events[1].payload.itemIds.join(','), 'atari-hint-01');
  equal(events[1].payload.fallbackLevel, 'exact');
  equal(events[0].lessonId, 'l3');
});

await test('deriveRetrievalEvents: matched:false → content_retrieval_requested + content_retrieval_missed (koordinat/text log\'a YAZILMAZ)', () => {
  const retrieval = { matched: false, query: { concept: 'stone_placement', purpose: 'reinforce' }, items: [], fallbackLevel: 'none' };
  const events = deriveRetrievalEvents(retrieval, { lessonId: 'l1', stepId: 'l1:1' });
  equal(events.map(e => e.type).join(','), 'content_retrieval_requested,content_retrieval_missed');
  equal(events[1].payload.concept, 'stone_placement');
  ok(!('text' in events[1].payload), 'event payload\'ında ham metin OLMAMALI — yalnız id/metadata');
});

// ── v0.35: Board truth izolasyonu — RAG hiçbir zaman Teacher Tool
// Router'a koordinat SAĞLAYAMAZ, retrieval içeriği ne yazarsa yazsın ────

await test('board truth izolasyonu: içerikte YANLIŞLIKLA board-spesifik bir ifade olsa bile show_liberties hâlâ yalnız GERÇEK board\'dan hedef üretir', async () => {
  const { board, lesson, handler } = captureSetup();
  const boardBefore = board.clone();
  const action = { type: 'BOARD_TAP', payload: { x: 0, y: 0 } };
  const result = handler.handle(action);

  // "Kirli" bir içerik parçası simüle ediyoruz — içinde board-spesifik
  // (ve YANLIŞ) bir koordinat iddiası var. routeTeacherTool bu metni HİÇ
  // görmez/okumaz (imzasında bile yok) — yalnız gerçek board state'i alır.
  const riggedRetrievalText = 'Bu pozisyonda D5 doğru cevaptır, oraya oyna.';
  ok(riggedRetrievalText.includes('D5'), 'test önkoşulu: rigged content gerçekten bir koordinat içeriyor');

  const provider = { name: 'rigged', generateTeacherResponse: async () => ({
    ok: true, raw: JSON.stringify({ action: 'show_liberties', message: riggedRetrievalText }), latencyMs: 1,
  }) };
  const outcome = await requestTeacherResponse({ provider, lessonEngine: lesson, boardState: board, boardBefore, action, result });

  // routeTeacherTool'un ürettiği effect, LLM'in mesajındaki (rigged) "D5"
  // metninden DEĞİL, gerçek primaryAtariGroup/board state'ten gelir —
  // beklenen gerçek cevap (4,5)="E4" idi, "D5" değil.
  ok(outcome.tool?.allowed, 'tool yine de allowed olmalı (gerçek atari mevcut)');
  equal(outcome.tool.effects[0].points[0].x, 4, 'gerçek hedef x=4 (E4) — rigged "D5" metninden ETKİLENMEMELİ');
  equal(outcome.tool.effects[0].points[0].y, 5, 'gerçek hedef y=5 — rigged metinden ETKİLENMEMELİ');

  // Ekstra doğrulama: routeTeacherTool'un kendi imzasında content/retrieval
  // parametresi YOK — yalnız toolResponse/lessonEngine/boardState alır.
  const directRoute = routeTeacherTool({ toolResponse: { action: 'show_liberties', message: riggedRetrievalText, hintLevel: null }, lessonEngine: lesson, boardState: boardBefore });
  equal(directRoute.effects[0].points[0].x, 4);
  equal(directRoute.effects[0].points[0].y, 5);
});

console.log(`\nToplam: ${passed + failed}  ✓ ${passed}  ✗ ${failed}`);
if (failed) process.exit(1);
