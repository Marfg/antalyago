/**
 * core/teacherAssistant.js
 *
 * Teacher Assistant orkestratörü:
 *
 *   Action result → deterministic feedback hazır
 *         ↓
 *   AI mode açık mı? (provider verildi mi)
 *      ├── hayır → deterministic feedback
 *      └── evet → provider.generateTeacherResponse(context)
 *                    ↓
 *                 valid response?
 *                  ├── hayır → deterministic feedback (fallback)
 *                  └── evet → AI mesajı
 *                       + (v0.4) action==="show_liberties" ise
 *                         core/teacherToolRouter.js'ten geçer:
 *                         permission/target doğrulaması + MEVCUT
 *                         effects[] sözleşmesine (SHOW_LIBERTY_HIGHLIGHTS)
 *                         çevirme. LLM burada da hiçbir koordinat üretmez —
 *                         router hedefi deterministik motordan bulur.
 *
 * "provider" enjekte edilir (core/mockTeacherProvider.js veya
 * core/claudeTeacherProvider.js) — bu modül HANGİ LLM'in kullanıldığını
 * bilmez, yalnızca ortak sözleşmeyi ({name, generateTeacherResponse})
 * çağırır.
 *
 * Saf DEĞİL (provider çağrısı async/network olabilir) ama DOM/localStorage
 * bilmez; context inşası core/teacherContext.js'e, doğrulama
 * core/teacherResponseSchema.js'e, tool yönlendirmesi
 * core/teacherToolRouter.js'e devredilmiştir.
 */

import { buildTeacherContext } from './teacherContext.js';
import { parseTeacherResponse } from './teacherResponseSchema.js';
import { routeTeacherTool } from './teacherToolRouter.js';

/**
 * AI her board tap'inde OTOMATİK çağrılmaz — yalnızca gerçek bir
 * değerlendirme (doğru/yanlış) üretildiğinde. Manuel "AI'dan cevap üret"
 * tetiklemesi bu kapıyı hiç kullanmaz, ayrı bir çağrı yoluyla her zaman
 * requestTeacherResponse()'u çağırabilir.
 */
export function shouldRequestTeacherResponse(action, result) {
  if (!action || !result || action.type !== 'BOARD_TAP') return false;
  return result.feedback?.type === 'correct' || result.feedback?.type === 'wrong';
}

function stepIdOf(context, lessonEngine) {
  if (context?.lesson?.stepId) return context.lesson.stepId;
  if (!lessonEngine?.curLesson) return null;
  return `${lessonEngine.curLesson.id}:${lessonEngine.curStepIdx}`;
}

/**
 * @param {object} params
 * @param {{name:string, generateTeacherResponse: (context:object) => Promise<object>}|null} params.provider — null/undefined → AI kapalı
 * @param {import('./lessonEngine.js').LessonEngine} params.lessonEngine
 * @param {import('./boardState.js').BoardState} [params.boardState]
 * @param {import('./boardState.js').BoardState} [params.boardBefore]
 * @param {{type:string,payload?:object}} [params.action]
 * @param {object} [params.result] — ActionHandler.handle() sonucu
 * @param {object} [params.studentModel] — core/studentModel.js'in modeli (v0.5, opsiyonel; salt-okunur, buradan asla yazılmaz)
 * @returns {Promise<{
 *   source: 'ai'|'deterministic', message: string|null, hintLevel: number|null,
 *   aiAction: string|null, provider: string|null, context: object|null,
 *   rawResponse: *, error: string|null, latencyMs: number|null,
 *   events: Array<{type:string,lessonId:?string,stepId:?string,payload:object}>,
 *   tool: {allowed:boolean, tool:string, effects:Array<object>, reason:string|null, targetCount:number|null} | null,
 * }>}
 */
export async function requestTeacherResponse({ provider, lessonEngine, boardState = null, boardBefore = null, action = null, result = null, studentModel = null }) {
  const deterministicMessage = result?.feedback?.text ?? null;
  const context = buildTeacherContext({ lessonEngine, boardState, boardBefore, action, result, studentModel });
  const lessonId = lessonEngine?.curLesson?.id ?? null;
  const stepId = stepIdOf(context, lessonEngine);
  const events = [];

  const deterministicResult = () => ({
    source: 'deterministic', message: deterministicMessage, hintLevel: null, aiAction: null,
    provider: provider?.name ?? null, context, rawResponse: null, error: null, latencyMs: null, events, tool: null,
  });

  // AI kapalı VEYA bu adımda context üretilemiyor (ör. ders yüklü değil)
  // → sistem AI'ya hiç bağımlı değil, deterministic feedback her zaman çalışır.
  if (!provider || !context) return deterministicResult();

  events.push({
    type: 'ai_teacher_requested', lessonId, stepId,
    payload: { provider: provider.name, concept: context.lesson.concept, attempt: context.student.attempt },
  });

  let response;
  try {
    response = await provider.generateTeacherResponse(context);
  } catch (err) {
    response = { ok: false, raw: null, error: err?.message || 'PROVIDER_THREW', latencyMs: null };
  }

  if (!response?.ok) {
    const error = response?.error || 'PROVIDER_ERROR';
    events.push({ type: 'ai_teacher_failed', lessonId, stepId, payload: { provider: provider.name, error, latencyMs: response?.latencyMs ?? null } });
    events.push({ type: 'ai_teacher_fallback_used', lessonId, stepId, payload: { reason: error } });
    return {
      source: 'deterministic', message: deterministicMessage, hintLevel: null, aiAction: null,
      provider: provider.name, context, rawResponse: response?.raw ?? null, error,
      latencyMs: response?.latencyMs ?? null, events, tool: null,
    };
  }

  const parsed = parseTeacherResponse(response.raw);
  if (!parsed.valid) {
    events.push({ type: 'ai_teacher_failed', lessonId, stepId, payload: { provider: provider.name, error: parsed.reason, latencyMs: response.latencyMs ?? null } });
    events.push({ type: 'ai_teacher_fallback_used', lessonId, stepId, payload: { reason: parsed.reason } });
    return {
      source: 'deterministic', message: deterministicMessage, hintLevel: null, aiAction: null,
      provider: provider.name, context, rawResponse: response.raw, error: parsed.reason,
      latencyMs: response.latencyMs ?? null, events, tool: null,
    };
  }

  events.push({
    type: 'ai_teacher_responded', lessonId, stepId,
    payload: { provider: provider.name, action: parsed.value.action, hintLevel: parsed.value.hintLevel, latencyMs: response.latencyMs ?? null },
  });

  // v0.4 — yalnız "show_liberties" router'dan geçer (permission + hedef
  // gözlemi + mevcut effects[] sözleşmesi). say/give_hint mesaj-yalnız
  // kalır; ai_teacher_responded event'i onlar için zaten yeterli, ayrıca
  // "tool" event'i eklemek (her zaman "allowed" olacağından) gürültü olurdu.
  let tool = null;
  if (parsed.value.action === 'show_liberties') {
    events.push({ type: 'teacher_tool_requested', lessonId, stepId, payload: { tool: 'show_liberties', source: 'ai' } });
    tool = routeTeacherTool({ toolResponse: parsed.value, lessonEngine, boardState: boardBefore || boardState });
    if (tool.allowed) {
      events.push({ type: 'teacher_tool_allowed', lessonId, stepId, payload: { tool: 'show_liberties' } });
      if (tool.effects.length) {
        events.push({
          type: 'teacher_tool_applied', lessonId, stepId,
          payload: { tool: 'show_liberties', effect: tool.effects[0].type, targetCount: tool.targetCount },
        });
      }
    } else {
      events.push({ type: 'teacher_tool_rejected', lessonId, stepId, payload: { tool: 'show_liberties', reason: tool.reason } });
    }
  }

  return {
    source: 'ai', message: parsed.value.message, hintLevel: parsed.value.hintLevel, aiAction: parsed.value.action,
    provider: provider.name, context, rawResponse: response.raw, error: null,
    latencyMs: response.latencyMs ?? null, events, tool,
  };
}

/**
 * Manuel denetim (Teacher Panel "Onayla"/"Reddet" — bkz. spesifikasyon §11).
 * Bu milestone'da yalnız event log'a kaydedilir, fine-tuning dataset'i
 * üretilmez.
 */
export function buildAiReviewEvent(decision, { lessonEngine } = {}) {
  const lessonId = lessonEngine?.curLesson?.id ?? null;
  const stepId = lessonId ? `${lessonId}:${lessonEngine.curStepIdx}` : null;
  return { type: 'ai_teacher_response_reviewed', lessonId, stepId, payload: { decision } };
}
