/**
 * core/studentModel.js
 *
 * Student Model v0.5 — kavram bazlı, tamamen deterministik öğrenme özeti.
 *
 * Bu modül:
 * - LLM tarafından hesaplanmaz, LLM yalnızca OKUR (bkz. core/teacherContext.js,
 *   core/teacherSystemPrompt.js).
 * - tahmini psikolojik profil ÜRETMEZ — yalnızca sayaçlar ve eşik bazlı
 *   bir "mastery status" hesaplar.
 * - Go motorunun yerine GEÇMEZ — Go gerçeğiyle hiç ilgilenmez, yalnızca
 *   zaten üretilmiş SEMANTİK EVENT'leri (core/teacherPanelBridge.js'in
 *   `answer_evaluated`, `ai_teacher_responded`, `teacher_tool_applied`,
 *   `lesson_step_loaded` vb. event'leri) girdi olarak alır.
 *
 * Akış:
 *   Semantic Events → applyStudentEvent (bu dosya) → Concept Stats →
 *   Deterministic Mastery Status → (core/teacherContext.js) → AI Teacher
 *
 * Saf: DOM yok, localStorage yok, provider/LLM yok. Persistence tamamen
 * ayrı bir katmanın (ogren-3d.html'deki storage adapter) sorumluluğudur —
 * bkz. core/eventLog.js ile AYNI ayrım deseni.
 */

import { KNOWN_CONCEPTS } from './conceptMap.js';

export const STUDENT_MODEL_VERSION = 1;

// Yakın dönem başarı oranı için pencere genişliği — tek yerde, kolay
// değiştirilebilir (bkz. spesifikasyon §7).
export const RECENT_WINDOW = 5;

// Mastery eşikleri — TEK yerde tutulur, reducer içine magic number
// dağıtılmaz (bkz. spesifikasyon §6). Ürün kuralları değildir; ilk
// prototipin amacı durumun deterministik biçimde üretilebildiğini
// göstermektir.
export const MASTERY_THRESHOLDS = {
  provisionalMinIndependentCorrect: 2,
  provisionalMinRecentAccuracy: 0.60,
  masteredMinIndependentCorrect: 4,
  masteredMinRecentAccuracy: 0.80,
  // hintsUsed+toolAssists oranı attempts'e bölündüğünde bu eşiğin ALTINDA
  // kalmalı — "yardım oranı düşükse mastered" (spesifikasyon §6).
  masteredMaxAssistRatio: 0.34,
};

function emptyConceptStats(concept) {
  return {
    concept,
    attempts: 0,
    correct: 0,
    incorrect: 0,
    hintsUsed: 0,
    toolAssists: 0,
    independentCorrect: 0,
    recentResults: [], // ['correct'|'incorrect', ...] — en fazla RECENT_WINDOW eleman
    recentAccuracy: 0,
    status: 'not_started',
  };
}

/** @returns {object} yeni, boş bir Student Model. */
export function createStudentModel() {
  const concepts = {};
  for (const concept of KNOWN_CONCEPTS) concepts[concept] = emptyConceptStats(concept);
  return {
    version: STUDENT_MODEL_VERSION,
    currentConcept: null,
    concepts,
    // Yalnızca mevcut adım/step için — PERSIST EDİLMEZ (bkz. storage
    // adapter'ın save() fonksiyonu). lesson_step_loaded/completed'de
    // sıfırlanır (spesifikasyon §24).
    session: { hintUsed: false, toolAssistUsed: false },
  };
}

function computeRecentAccuracy(recentResults) {
  if (!recentResults.length) return 0;
  const correct = recentResults.filter(r => r === 'correct').length;
  return Math.round((correct / recentResults.length) * 100) / 100;
}

/**
 * Mastery status'u ham sayaçlardan DETERMİNİSTİK olarak hesaplar. Status
 * hiçbir yerde ayrıca "hatırlanmaz" — her güncellemede bu fonksiyonla
 * yeniden üretilir, bu yüzden gerektiğinde geri düşebilir (spesifikasyon
 * §25 seçenek A).
 */
export function computeStatus(stats) {
  if (stats.attempts === 0) return 'not_started';
  const assistRatio = stats.attempts > 0 ? (stats.hintsUsed + stats.toolAssists) / stats.attempts : 0;

  const isMastered = stats.independentCorrect >= MASTERY_THRESHOLDS.masteredMinIndependentCorrect
    && stats.recentAccuracy >= MASTERY_THRESHOLDS.masteredMinRecentAccuracy
    && assistRatio <= MASTERY_THRESHOLDS.masteredMaxAssistRatio;
  if (isMastered) return 'mastered';

  const isProvisional = stats.independentCorrect >= MASTERY_THRESHOLDS.provisionalMinIndependentCorrect
    && stats.recentAccuracy >= MASTERY_THRESHOLDS.provisionalMinRecentAccuracy;
  if (isProvisional) return 'provisional';

  return 'learning';
}

function withRecomputedStatus(stats) {
  const recentAccuracy = computeRecentAccuracy(stats.recentResults);
  const next = { ...stats, recentAccuracy };
  next.status = computeStatus(next);
  return next;
}

function updateConcept(model, concept, updater) {
  if (!concept || !model.concepts[concept]) return model;
  const updatedRaw = updater(model.concepts[concept]);
  const updatedStats = withRecomputedStatus(updatedRaw);
  return { ...model, concepts: { ...model.concepts, [concept]: updatedStats } };
}

/**
 * Tek bir semantic event'i modele uygular. Saf — yeni bir model nesnesi
 * döndürür, girdiyi mutate etmez.
 *
 * Dinlediği event tipleri (mevcut event zincirinden, bkz. spesifikasyon §8):
 *   - answer_evaluated        {result, concept}  → attempts/correct/incorrect/independentCorrect
 *   - ai_teacher_responded    {action:'give_hint'} → hintsUsed (step başına BİR kez)
 *   - teacher_tool_applied    {}                  → toolAssists (step başına BİR kez;
 *                               yalnızca AI-tetiklemeli — manuel Teacher Panel
 *                               "Nefes noktalarını göster" ayrı bir event tipi
 *                               (teacher_show_liberties_requested) ürettiği için
 *                               zaten hiç dinlenmez — bkz. spesifikasyon §22)
 *   - lesson_step_loaded/completed/lesson_started → session sıfırlama
 * Diğer tüm event tipleri sessizce yok sayılır (model değişmeden döner).
 *
 * @param {object} model
 * @param {{type:string, lessonId?:string|null, stepId?:string|null, payload?:object}} event
 * @returns {{model:object, derivedEvents:Array<{type:string,lessonId:?string,stepId:?string,payload:object}>}}
 */
export function applyStudentEvent(model, event) {
  if (!model || !event?.type) return { model, derivedEvents: [] };
  const derivedEvents = [];

  function withStatusChangeEvent(nextModel, concept, prevStatus) {
    const newStatus = nextModel.concepts[concept]?.status;
    if (newStatus && newStatus !== prevStatus) {
      derivedEvents.push({
        type: 'concept_status_changed',
        lessonId: event.lessonId ?? null,
        stepId: event.stepId ?? null,
        payload: { concept, from: prevStatus, to: newStatus },
      });
    }
    return nextModel;
  }

  switch (event.type) {
    case 'answer_evaluated': {
      const concept = event.payload?.concept;
      if (!concept || !model.concepts[concept]) return { model, derivedEvents };
      const isCorrect = event.payload?.result === 'correct';
      const prevStatus = model.concepts[concept].status;
      // "Bağımsız" doğru cevap: bu step içinde HENÜZ hint/tool assist
      // uygulanmadıysa (spesifikasyon §4). Bu kontrol güncellemeden ÖNCEKİ
      // session durumuna bakar — bir önceki yanlış denemede alınan yardım
      // hâlâ geçerlidir.
      const independentEligible = !model.session.hintUsed && !model.session.toolAssistUsed;

      let nextModel = updateConcept(model, concept, (stats) => {
        const recentResults = [...stats.recentResults, isCorrect ? 'correct' : 'incorrect'].slice(-RECENT_WINDOW);
        return {
          ...stats,
          attempts: stats.attempts + 1,
          correct: stats.correct + (isCorrect ? 1 : 0),
          incorrect: stats.incorrect + (isCorrect ? 0 : 1),
          independentCorrect: stats.independentCorrect + (isCorrect && independentEligible ? 1 : 0),
          recentResults,
        };
      });
      nextModel = { ...nextModel, currentConcept: concept };
      nextModel = withStatusChangeEvent(nextModel, concept, prevStatus);
      return { model: nextModel, derivedEvents };
    }

    case 'ai_teacher_responded': {
      if (event.payload?.action !== 'give_hint') return { model, derivedEvents };
      const concept = model.currentConcept;
      // Aynı step içinde tekrar tekrar hint uygulansa bile BİR kez say
      // (spesifikasyon §5 — "step başına bir kez" tercih edildi).
      if (!concept || model.session.hintUsed) return { model, derivedEvents };
      const prevStatus = model.concepts[concept]?.status;
      let nextModel = updateConcept(model, concept, (stats) => ({ ...stats, hintsUsed: stats.hintsUsed + 1 }));
      nextModel = { ...nextModel, session: { ...nextModel.session, hintUsed: true } };
      nextModel = withStatusChangeEvent(nextModel, concept, prevStatus);
      return { model: nextModel, derivedEvents };
    }

    case 'teacher_tool_applied': {
      // Bu event TİPİ zaten yalnızca core/teacherAssistant.js'in AI tool
      // routing hattından gelir (bkz. dosya başı notu) — manuel debug
      // aracı ayrı bir event tipi ürettiği için burada hiç görünmez.
      const concept = model.currentConcept;
      if (!concept || model.session.toolAssistUsed) return { model, derivedEvents };
      const prevStatus = model.concepts[concept]?.status;
      let nextModel = updateConcept(model, concept, (stats) => ({ ...stats, toolAssists: stats.toolAssists + 1 }));
      nextModel = { ...nextModel, session: { ...nextModel.session, toolAssistUsed: true } };
      nextModel = withStatusChangeEvent(nextModel, concept, prevStatus);
      return { model: nextModel, derivedEvents };
    }

    case 'lesson_step_loaded':
    case 'lesson_step_completed':
    case 'lesson_started': {
      if (!model.session.hintUsed && !model.session.toolAssistUsed) return { model, derivedEvents };
      return { model: { ...model, session: { hintUsed: false, toolAssistUsed: false } }, derivedEvents };
    }

    default:
      return { model, derivedEvents };
  }
}

/** @returns {object|null} bir kavramın güncel istatistikleri (zaten taze — ayrıca yeniden hesaplama gerekmez). */
export function getConceptState(model, concept) {
  return model?.concepts?.[concept] ?? null;
}

/**
 * Persist edilmiş (localStorage'dan gelen) ham veriyi güvenle bir Student
 * Model'e çevirir. Şekil/versiyon uyuşmuyorsa GÜVENLİ FALLBACK: yeni boş
 * model (spesifikasyon §21) — migration framework'ü YOK, buna gerek de yok.
 * `session` hiçbir zaman persist edilmiş veriden okunmaz — her hydrate
 * temiz bir session ile başlar.
 *
 * @param {*} raw — JSON.parse çıktısı (veya null/geçersiz)
 * @returns {object} her zaman geçerli bir Student Model
 */
export function hydrateStudentModel(raw) {
  if (!raw || typeof raw !== 'object' || raw.version !== STUDENT_MODEL_VERSION || !raw.concepts || typeof raw.concepts !== 'object') {
    return createStudentModel();
  }
  const concepts = {};
  for (const concept of KNOWN_CONCEPTS) {
    const stats = raw.concepts[concept];
    concepts[concept] = (stats && typeof stats === 'object')
      ? withRecomputedStatus({ ...emptyConceptStats(concept), ...stats, concept })
      : emptyConceptStats(concept);
  }
  return {
    version: STUDENT_MODEL_VERSION,
    currentConcept: KNOWN_CONCEPTS.includes(raw.currentConcept) ? raw.currentConcept : null,
    concepts,
    session: { hintUsed: false, toolAssistUsed: false },
  };
}
