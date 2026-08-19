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
 *
 * v0.5: opsiyonel `studentModel` parametresi verilirse, aktif kavrama ait
 * KÜÇÜK bir Student Model özeti context'e eklenir (bkz. core/studentModel.js).
 * Bu modül Student Model'i asla YAZMAZ — yalnızca core/studentModel.js'in
 * `getConceptState()`'iyle salt-okunur okur.
 *
 * v0.6: aktif concept/stage/Student Model status'undan deterministik bir
 * retrieval query'si üretilip core/contentRetriever.js'e verilir; sonuç
 * (varsa) küçük bir `context.retrieval` özeti olarak eklenir. RAG hiçbir
 * zaman Go gerçeğinin kaynağı DEĞİLDİR — yalnızca pedagojik referans metni
 * taşır (bkz. core/teacherSystemPrompt.js'teki sınır).
 *
 * v0.7: opsiyonel `teachingNotes` parametresi verilirse retrieval BUNU
 * kullanır (varsayılan: core/contentStore.js'in BASE `TEACHING_NOTES`'u).
 * Bu, Teacher Studio'nun local override'larını (bkz. core/contentOverrides.js
 * `mergeContentOverrides()`) retrieval'e ULAŞTIRMANIN TEK yoludur — bu
 * modül hâlâ localStorage'ı hiç bilmez, yalnızca enjekte edilen veriyi okur.
 */

import { classifyCurriculumStep, responseTypeOf, stripMarkup } from './learningContext.js';
import { primaryAtariGroup, removeStonesEffectOf, studentActionOf, resolveActiveConcept } from './teacherPanelBridge.js';
import { getConceptState } from './studentModel.js';
import { buildRetrievalQuery, retrieveContent } from './contentRetriever.js';
import { TEACHING_NOTES } from './contentStore.js';

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
 * @param {object} [params.studentModel] — core/studentModel.js'in modeli (v0.5, opsiyonel)
 * @param {Array<object>} [params.teachingNotes] — retrieval'in kullanacağı içerik havuzu (v0.7, opsiyonel; varsayılan: BASE TEACHING_NOTES — override edilmemiş)
 * @returns {object|null} lessonEngine'de yüklü bir adım yoksa null
 */
export function buildTeacherContext({ lessonEngine, boardState = null, boardBefore = null, action = null, result = null, studentModel = null, teachingNotes = TEACHING_NOTES }) {
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

  // v0.5 — Student Model özeti. resolveActiveConcept, Student Model'in
  // KENDİSİNİN izlediği aynı ince-taneli kavramı (atari'yi capture'dan
  // AYRI) hesaplar — böylece LLM'e gösterilen "currentConcept",
  // Student Model'in stats'ını okuduğu kovayla her zaman TUTARLIDIR.
  const activeConcept = resolveActiveConcept({ lessonId: lesson.id, boardState: boardBefore || boardState, step, result });
  const conceptStats = studentModel ? getConceptState(studentModel, activeConcept) : null;

  // v0.6 — RAG: query TAMAMEN deterministik sistemden türer (concept,
  // stage, Student Model status, evaluation) — LLM bu query'yi asla üretmez.
  const retrievalQuery = buildRetrievalQuery({
    concept: activeConcept,
    stage: classification.stage,
    studentStatus: conceptStats?.status ?? null,
    evaluationResult: evaluation,
  });
  const retrievalResult = retrieveContent({ query: retrievalQuery, entries: teachingNotes });
  // v0.7 — hangi SEÇİLMİŞ item'lerin bir local override'dan geldiğini
  // işaretler (bkz. spesifikasyon §38 "Source: Base / Local Override").
  // LLM'e gönderilen items[] bilinçli olarak {id,text} ile sınırlı kalır
  // (v0.6 sözleşmesi bozulmaz) — bu yalnızca Teacher Panel/Studio içindir.
  const overrideIds = retrievalResult.items
    .map(i => teachingNotes.find(e => e.id === i.id))
    .filter(e => e?.source === 'override')
    .map(e => e.id);

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
    // v0.5 — yalnızca aktif kavramın küçük bir özeti; öğrencinin TÜM
    // geçmişi gönderilmez (bkz. spesifikasyon §13). studentModel
    // verilmemişse veya bu kavram için henüz veri yoksa null.
    studentModel: conceptStats ? {
      currentConcept: activeConcept,
      status: conceptStats.status,
      attempts: conceptStats.attempts,
      recentAccuracy: conceptStats.recentAccuracy,
      independentCorrect: conceptStats.independentCorrect,
      hintsUsed: conceptStats.hintsUsed,
      toolAssists: conceptStats.toolAssists,
    } : null,
    // v0.6 — yalnızca kısa, ilgili öğretim notları (en fazla
    // MAX_RETRIEVAL_ITEMS); score/reason gibi iç diagnostic alanlar LLM'e
    // gönderilmez (yalnız core/contentRetriever.js'in kendi testlerinde
    // ve Teacher Panel'in ihtiyacı için kullanılır — panel bu alanı
    // context'ten okur, ayrı bir çağrı yapmaz).
    retrieval: {
      matched: retrievalResult.matched,
      query: retrievalQuery,
      items: retrievalResult.items.map(i => ({ id: i.id, text: i.text })),
      fallbackLevel: retrievalResult.fallbackLevel,
      overrideIds,
    },
  };
}
