/**
 * core/teacherPanelBridge.js
 *
 * ActionHandler action/result çiftini Teacher Panel view-model'ine ve
 * normalize edilmiş event tanımlarına çevirir. Saf — DOM yok, localStorage
 * yok. Event'leri KENDİSİ persist etmez; yalnızca core/eventLog.js'in
 * `append()`'ine geçirilecek düz nesneler üretir.
 *
 * v0.2: atari/capture gözlemi core/captureObservation.js'in saf
 * getGroup/getLiberties tabanlı analiziyle, gerçek capture ise
 * result.effects'teki REMOVE_STONES ile (curriculum verisinden DEĞİL)
 * türetilir — bkz. dosya içi notlar.
 *
 * v0.3: primaryAtariGroup / removeStonesEffectOf / studentActionOf artık
 * export edilir — core/teacherContext.js aynı atari/capture tespitini
 * TEKRAR YAZMAK yerine buradan içe aktarır.
 *
 * v0.5: resolveActiveConcept() eklendi — Student Model'in (core/studentModel.js)
 * "bu etkileşim hangi kavrama ait" sorusunun TEK kaynağı. answer_evaluated
 * event'inin payload'ına eklenir; core/teacherAssistant.js da (hint/tool
 * assist event'leri için) modelin currentConcept'i üzerinden aynı kovaya
 * yazar — ayrıca hesaplamaz.
 */

import { stripMarkup, responseTypeOf } from './learningContext.js';
import { stepRequiresAnswer } from './lessonEngine.js';
import { findAtariGroups } from './captureObservation.js';
import { defaultConceptForLesson } from './conceptMap.js';

// ── Beklenen cevap (yalnızca öğretmen/debug amaçlı) ──────────────────

function expectedAnswerOf(step) {
  if (!step) return null;
  if (step.goalZone) return { type: 'goalZone', value: step.goalZone };
  if (step.goalAdjacent) return { type: 'goalAdjacent', value: step.goalAdjacent };
  if (step.answers === 'any') return { type: 'any', value: null };
  if (Array.isArray(step.answers)) return { type: 'points', value: step.answers };
  if (step.answer) return { type: 'point', value: step.answer };
  return null;
}

export function studentActionOf(action) {
  if (!action) return null;
  if (action.type === 'BOARD_TAP') return { type: 'board_tap', x: action.payload?.x, y: action.payload?.y };
  if (action.type === 'HINT_REQUEST') return { type: 'hint_request' };
  if (action.type === 'SHOW_LIBERTIES_REQUEST') return { type: 'show_liberties_request' };
  return { type: action.type.toLowerCase() };
}

// ── Atari/hedef grup gözlemi ─────────────────────────────────────────
// learningContext.js'in stepRequiresAnswer'ı ile aynı "bu adım gerçekten
// cevap bekliyor mu" kontrolüne bağlı — auto/gözlem adımlarında atari
// bilgisi Teacher Panel'i gürültüyle doldurmasın diye raporlanmaz.

export function primaryAtariGroup(board, step) {
  if (!board || !step || !stepRequiresAnswer(step)) return null;
  const groups = findAtariGroups(board);
  if (!groups.length) return null;
  // Bu mikro-müfredatta (nefes noktası → atari → taş alma) bir adımda
  // pedagojik olarak tek bir hedef grup beklenir; birden fazlası nadir
  // olsa da ilkini hedef alıyoruz — sessizce yok saymak yerine en azından
  // görünür kılıyoruz.
  return groups[0];
}

export function removeStonesEffectOf(result) {
  return (result?.effects ?? []).find(e => e.type === 'REMOVE_STONES') ?? null;
}

/**
 * v0.5 — Bir etkileşimin (BOARD_TAP sonucu) ait olduğu Student Model
 * kavramını GERÇEK board transition'ından belirler: capture gerçekleştiyse
 * 'capture', atari mevcutsa (henüz yakalanmamış) 'atari', hiçbiri değilse
 * dersin varsayılan kavramı (bkz. core/conceptMap.js). Curriculum'un
 * "beklenen cevabından" değil, buildPanelSnapshot'ın activeConcept'iyle
 * AYNI mantıktan türer — burada tek, paylaşılan kaynak olarak toplanmıştır.
 *
 * @param {object} params
 * @param {string|null} params.lessonId
 * @param {import('./boardState.js').BoardState|null} params.boardState — genelde boardBefore
 * @param {object|null} params.step
 * @param {object|null} params.result — ActionHandler.handle() sonucu
 * @returns {string}
 */
export function resolveActiveConcept({ lessonId, boardState = null, step = null, result = null }) {
  const removeEffect = removeStonesEffectOf(result);
  if (removeEffect && removeEffect.points.length > 0) return 'capture';
  const atariGroup = primaryAtariGroup(boardState, step);
  if (atariGroup) return 'atari';
  return defaultConceptForLesson(lessonId);
}

/**
 * Teacher Panel'in salt-okunur gösterdiği tam durum anlık görüntüsü.
 *
 * @param {object} params
 * @param {import('./lessonEngine.js').LessonEngine} params.lessonEngine
 * @param {import('./boardState.js').BoardState} [params.boardState]
 * @param {{type:string,payload?:object}} [params.action] — son dispatch edilen action
 * @param {object} [params.result] — ActionHandler.handle() sonucu
 */
export function buildPanelSnapshot({ lessonEngine, boardState = null, action = null, result = null }) {
  const lesson = lessonEngine?.curLesson ?? null;
  const step = lessonEngine?.currentStep?.() ?? null;
  const atariGroup = primaryAtariGroup(boardState, step);

  const wasBoardTap = action?.type === 'BOARD_TAP';
  const removeEffect = wasBoardTap ? removeStonesEffectOf(result) : null;
  const capturedCount = removeEffect ? removeEffect.points.length : 0;
  const moveResult = wasBoardTap && result
    ? { legal: result.legal !== false, capturedCount }
    : null;
  const capturedStones = removeEffect
    ? removeEffect.points.map(p => ({ x: p.x, y: p.y }))
    : null;

  const activeConcept = capturedCount > 0 ? 'capture' : (atariGroup ? 'atari' : null);

  return {
    lesson: lesson ? { id: lesson.id, title: lesson.title } : null,
    stepIndex: lessonEngine?.curStepIdx ?? null,
    totalSteps: lessonEngine?.totalSteps?.() ?? 0,
    teacherMessage: step ? stripMarkup(step.text) : '',
    interactionType: step ? responseTypeOf(step) : 'passive',
    board: boardState ? {
      size: boardState.size,
      turn: boardState.turn,
      koPoint: boardState.koPoint ? { ...boardState.koPoint } : null,
      stones: boardState.stones.map(s => ({ ...s })),
    } : null,
    expectedAnswer: expectedAnswerOf(step),
    studentAction: studentActionOf(action),
    evaluation: result?.feedback?.type ?? null,
    lastFeedback: result?.feedback?.text ?? null,

    // v0.2 — atari/capture gözlemi
    activeConcept,
    atari: !!atariGroup,
    targetGroup: atariGroup ? {
      color: atariGroup.color,
      points: atariGroup.points,
      liberties: atariGroup.liberties,
      stoneCount: atariGroup.points.length,
    } : null,
    moveResult,
    capturedStones,
  };
}

// ── Event türetme ─────────────────────────────────────────────────────

function hasCompletionEffect(result) {
  return (result?.effects ?? []).some(e => e.type === 'SHOW_COMPLETION');
}

function currentStepId(lessonEngine) {
  const lesson = lessonEngine?.curLesson;
  if (!lesson) return null;
  return `${lesson.id}:${lessonEngine.curStepIdx}`;
}

/**
 * Bir action/result çiftinden event günlüğüne eklenecek normalize
 * event taslaklarını (henüz ts/sessionId'siz) üretir. `core/eventLog.js`'in
 * `EventLog.append()`'ine doğrudan verilebilir.
 *
 * @param {object} params
 * @param {{type:string,payload?:object}} params.action
 * @param {object} params.result — ActionHandler.handle() sonucu
 * @param {import('./lessonEngine.js').LessonEngine} params.lessonEngine
 * @param {import('./boardState.js').BoardState} [params.boardState] — action SONRASI (canlı) board
 * @param {import('./boardState.js').BoardState} [params.boardBefore] — yalnız BOARD_TAP için:
 *   hamle uygulanmadan HEMEN ÖNCE alınmış bağımsız bir BoardState kopyası
 *   (ör. boardSt.clone()). Verilmezse atari/capture_attempt semantik
 *   event'leri sessizce üretilmez — ham event'ler (student_board_tap,
 *   answer_evaluated) yine de korunur.
 * @returns {Array<{type:string, lessonId:?string, stepId:?string, payload:object}>}
 */
export function deriveEvents({ action, result, lessonEngine, boardState = null, boardBefore = null }) {
  if (!action) return [];
  const lessonId = lessonEngine?.curLesson?.id ?? null;
  const stepId = currentStepId(lessonEngine);
  const step = lessonEngine?.currentStep?.() ?? null;
  const events = [];

  switch (action.type) {
    case 'LESSON_SELECT':
      events.push({ type: 'lesson_started', lessonId: action.payload?.lessonId ?? lessonId, stepId, payload: {} });
      break;

    case 'STEP_NEXT':
    case 'STEP_PREV':
    case 'STEP_GOTO': {
      events.push({
        type: hasCompletionEffect(result) ? 'lesson_step_completed' : 'lesson_step_loaded',
        lessonId, stepId, payload: {},
      });
      // Yeni yüklenen pozisyonda (bu adım cevap gerektiriyorsa) atari
      // varsa gözlemi kaydet — curriculum'un "atari" demesine değil,
      // gerçek board durumuna dayanır.
      const atari = primaryAtariGroup(boardState, step);
      if (atari) {
        events.push({
          type: 'atari_detected', lessonId, stepId,
          payload: {
            targetColor: atari.color,
            targetPoints: atari.points,
            remainingLiberties: atari.liberties,
            stoneCount: atari.points.length,
          },
        });
      }
      break;
    }

    case 'BOARD_TAP': {
      events.push({ type: 'student_board_tap', lessonId, stepId, payload: { x: action.payload?.x, y: action.payload?.y } });
      const evalType = result?.feedback?.type;
      if (evalType === 'correct' || evalType === 'wrong') {
        // v0.5: concept — Student Model'in bu etkileşimi hangi kovaya
        // yazacağı. boardBefore verilmemişse (bu case'te nadir) resolveActiveConcept
        // yine de dersin varsayılan kavramına güvenle düşer.
        const concept = resolveActiveConcept({ lessonId, boardState: boardBefore || boardState, step, result });
        events.push({ type: 'answer_evaluated', lessonId, stepId, payload: { result: evalType === 'correct' ? 'correct' : 'incorrect', concept } });
      }

      // Yalnız GERÇEK bir değerlendirme üretmiş tıklamalar için (dolu
      // nokta / adım zaten bitmiş gibi no-op'lar hariç) semantik capture
      // event'lerini değerlendir — "her board tap'i capture attempt
      // sayma" ilkesi.
      if (result?.feedback && boardBefore) {
        const atariBefore = primaryAtariGroup(boardBefore, step);
        if (atariBefore) {
          events.push({
            type: 'capture_attempt', lessonId, stepId,
            payload: {
              playedAt: { x: action.payload?.x, y: action.payload?.y },
              targetColor: atariBefore.color,
              expectedCaptureCount: atariBefore.points.length,
            },
          });
        }

        const removeEffect = removeStonesEffectOf(result);
        if (removeEffect && removeEffect.points.length > 0) {
          // capturedColor gerçek ÖNCEKİ board durumundan okunur —
          // curriculum'un/atari tahmininin rengini varsaymıyoruz.
          const first = removeEffect.points[0];
          const capturedColor = boardBefore.colorAt(first.x, first.y);
          events.push({
            type: 'capture_completed', lessonId, stepId,
            payload: {
              playedAt: { x: action.payload?.x, y: action.payload?.y },
              capturedColor,
              capturedCount: removeEffect.points.length,
              capturedPoints: removeEffect.points.map(p => ({ x: p.x, y: p.y })),
            },
          });
        }
      }
      break;
    }

    case 'HINT_REQUEST':
      events.push({ type: 'teacher_hint_requested', lessonId, stepId, payload: {} });
      break;

    case 'SHOW_LIBERTIES_REQUEST':
      events.push({ type: 'teacher_show_liberties_requested', lessonId, stepId, payload: {} });
      break;

    case 'BOARD_SIZE_SET':
      events.push({ type: 'teacher_board_cleared', lessonId, stepId, payload: { size: action.payload?.size ?? null } });
      break;

    default:
      break;
  }

  return events;
}
