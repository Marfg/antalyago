/**
 * core/teacherContext.js
 *
 * "Structured Teacher Context" builder — Teacher Assistant v0.3.
 *
 * Go ile ilgili GERÇEĞİN tek kaynağı deterministik motordur (boardState,
 * ruleEngine, actionHandler, captureObservation, lessonEngine). Bu modül
 * yalnızca o motorun ÜRETTİĞİ gerçek sonuçları LLM'nin okuyabileceği sade
 * bir JSON-benzeri nesneye çevirir — kendi başına hiçbir Go kuralı
 * hesaplamaz, hiçbir varsayım üretmez.
 *
 * Saf: DOM yok, API/provider yok, localStorage yok. Atari/capture tespiti
 * için core/teacherPanelBridge.js'in (v0.2'de kurulmuş) primaryAtariGroup
 * ve removeStonesEffectOf fonksiyonlarını yeniden kullanır — aynı mantığı
 * ikinci kez yazmaz.
 */

import { classifyCurriculumStep, responseTypeOf, stripMarkup } from './learningContext.js';
import { primaryAtariGroup, removeStonesEffectOf, studentActionOf } from './teacherPanelBridge.js';

// ── Koordinat etiketi ─────────────────────────────────────────────────
// ogren-3d.html'in kendi tahta etiketleriyle (LTRS_ALL, I harfi atlanır)
// AYNI kural — bkz. o dosyadaki tpCoordLabel. Teacher Panel'de ve AI
// context'inde görülen koordinatlar böylece her zaman birbiriyle tutarlı.
const LTRS = 'ABCDEFGHJKLMNOPQRST';
export function coordLabel(x, y, size) {
  return `${LTRS[x] ?? '?'}${size - y}`;
}

// Bu milestone yalnızca l2 (nefes noktaları) ve l3 (taş alma/atari) ile
// çalışıyor (bkz. spesifikasyon §2). classifyCurriculumStep()'in genel
// amaçlı concepts[] listesi bir adım metninde hem "nefes" hem "yakala"
// geçtiğinde İLK EŞLEŞEN kuralı (liberty) döndürür — bu iki ders için
// yanlış olurdu (l3'te "concept" her zaman "capture" olmalı). Bilinen iki
// ders için doğrudan eşleme kullanıyoruz; kapsam dışı derslerde genel
// sınıflandırıcıya (concepts[0]) düşer.
const LESSON_CONCEPT = { l2: 'liberty', l3: 'capture' };

function attemptCountOf(lessonEngine, evaluationResult) {
  const mistakes = lessonEngine?.mistakeCount ?? 0;
  // BOARD_TAP zaten değerlendirilmiş: yanlışsa mistakeCount BU denemeyi
  // içerir; doğruysa mistakeCount önceki yanlışları taşır, +1 bu deneme.
  return evaluationResult === 'correct' ? mistakes + 1 : Math.max(1, mistakes);
}

/**
 * @param {object} params
 * @param {import('./lessonEngine.js').LessonEngine} params.lessonEngine
 * @param {import('./boardState.js').BoardState} [params.boardState] — action SONRASI (canlı) board
 * @param {import('./boardState.js').BoardState} [params.boardBefore] — BOARD_TAP'ten hemen ÖNCE alınmış kopya (varsa atari gözlemi bunu kullanır — hedef, hamleden ÖNCEKİ gerçek durumdur)
 * @param {{type:string,payload?:object}} [params.action]
 * @param {object} [params.result] — ActionHandler.handle() sonucu
 * @returns {object|null} lessonEngine'de yüklü bir adım yoksa null
 */
export function buildTeacherContext({ lessonEngine, boardState = null, boardBefore = null, action = null, result = null }) {
  const lesson = lessonEngine?.curLesson ?? null;
  const step = lessonEngine?.currentStep?.() ?? null;
  if (!lesson || !step) return null;

  const chapter = lessonEngine.currentChapter?.() ?? null;
  const classification = classifyCurriculumStep({ chapter, lesson, step, stepIndex: lessonEngine.curStepIdx });
  const size = boardState?.size ?? step.size ?? 9;

  const evaluation = result?.feedback?.type === 'correct' ? 'correct'
    : result?.feedback?.type === 'wrong' ? 'incorrect' : null;

  const removeEffect = removeStonesEffectOf(result);
  const capturedCount = removeEffect ? removeEffect.points.length : 0;

  // Atari hedefi hamleden ÖNCEKİ board durumuna göre değerlendirilir —
  // boardBefore verilmemişse (adım geçişi gibi BOARD_TAP-dışı durumlar)
  // mevcut canlı board kullanılır.
  const atariGroup = primaryAtariGroup(boardBefore || boardState, step);

  const studentAction = studentActionOf(action);
  const actionPoint = studentAction?.type === 'board_tap'
    ? coordLabel(studentAction.x, studentAction.y, size)
    : null;

  return {
    lesson: {
      id: lesson.id,
      stepId: classification.id,
      concept: LESSON_CONCEPT[lesson.id] ?? classification.concepts[0] ?? null,
      stage: classification.stage,
    },
    student: {
      attempt: attemptCountOf(lessonEngine, evaluation),
    },
    task: {
      teacherMessage: stripMarkup(step.text),
      expectedInteraction: responseTypeOf(step),
    },
    action: studentAction ? { type: studentAction.type, point: actionPoint } : null,
    evaluation: {
      result: evaluation,
      legal: result?.legal ?? null,
      capturedCount,
    },
    boardObservation: atariGroup ? {
      targetColor: atariGroup.color,
      targetStones: atariGroup.points.map(p => coordLabel(p.x, p.y, size)),
      isAtari: true,
      remainingLiberties: atariGroup.liberties.map(p => coordLabel(p.x, p.y, size)),
    } : null,
  };
}
