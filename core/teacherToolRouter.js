/**
 * core/teacherToolRouter.js
 *
 * Teacher Tools v0.4 — LLM'nin "tool" talebini (yalnızca bir isim, ör.
 * "show_liberties") deterministik olarak doğrular ve — izin varsa —
 * MEVCUT effects[] sözleşmesine (bkz. core/actionHandler.js) çevirir.
 *
 * Kritik ayrım: LLM board koordinatlarının KAYNAĞI DEĞİLDİR. Bu modül,
 * "hangi taş/grup hedef" sorusunu core/teacherPanelBridge.js'in v0.2'de
 * kurduğu SAF atari tespitine (primaryAtariGroup → getGroup/getLiberties)
 * sorar; LLM'in response'undaki hiçbir alan (zaten şema seviyesinde
 * reddediliyor — bkz. teacherResponseSchema.js FORBIDDEN_COORDINATE_FIELDS)
 * hedef/koordinat belirlemede KULLANILMAZ.
 *
 * Saf: DOM yok, provider yok, API yok, HTML yok.
 */

import { stepRequiresAnswer } from './lessonEngine.js';
import { primaryAtariGroup } from './teacherPanelBridge.js';

/** Bu milestone'da yönlendirme/permission gerektiren TEK tool. */
const ROUTED_TOOLS = new Set(['show_liberties']);
/** say/give_hint mevcut v0.3 davranışı — router'a gerek duymaz, her zaman izinli. */
const MESSAGE_ONLY_TOOLS = new Set(['say', 'give_hint']);

/**
 * @param {object} params
 * @param {{action:string,message:string,hintLevel:number|null}} params.toolResponse — parseTeacherResponse'un ÜRETTİĞİ, zaten doğrulanmış değer
 * @param {import('./lessonEngine.js').LessonEngine} params.lessonEngine
 * @param {import('./boardState.js').BoardState} [params.boardState] — hedef gözlemi için kullanılacak board (genelde boardBefore)
 * @returns {{allowed:boolean, tool:string|null, effects:Array<object>, reason:string|null, targetCount:number|null}}
 */
export function routeTeacherTool({ toolResponse, lessonEngine, boardState = null }) {
  const tool = toolResponse?.action ?? null;

  if (tool && MESSAGE_ONLY_TOOLS.has(tool)) {
    return { allowed: true, tool, effects: [], reason: null, targetCount: null };
  }

  if (!tool || !ROUTED_TOOLS.has(tool)) {
    return { allowed: false, tool, effects: [], reason: 'unsupported_tool', targetCount: null };
  }

  // ── show_liberties ──────────────────────────────────────────────
  const step = lessonEngine?.currentStep?.() ?? null;
  if (!boardState || !lessonEngine || !step) {
    return { allowed: false, tool, effects: [], reason: 'invalid_context', targetCount: null };
  }
  if (!stepRequiresAnswer(step)) {
    return { allowed: false, tool, effects: [], reason: 'not_allowed_for_step', targetCount: null };
  }

  const atariGroup = primaryAtariGroup(boardState, step);
  if (!atariGroup) {
    return { allowed: false, tool, effects: [], reason: 'no_target_group', targetCount: null };
  }

  // Mevcut SHOW_LIBERTY_HIGHLIGHTS effect'i AYNEN yeniden kullanılır —
  // yeni bir effect tipi icat edilmiyor (bkz. actionHandler.js
  // _showLibertiesRequest ve pedagogyEngine.js highlight kullanımı).
  const points = atariGroup.liberties.map(p => ({ ...p }));
  return {
    allowed: true,
    tool,
    effects: [{ type: 'SHOW_LIBERTY_HIGHLIGHTS', points }],
    reason: null,
    targetCount: points.length,
  };
}
