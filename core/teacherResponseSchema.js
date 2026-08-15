/**
 * core/teacherResponseSchema.js
 *
 * LLM'den gelen ham cevabı doğrudan öğrenciye basmıyoruz. Bu modül
 * structured output'u ayrıştırır ve doğrular; geçersizse (bilinmeyen
 * action, boş/aşırı uzun mesaj, bozuk JSON) `valid:false` döner —
 * çağıran taraf (core/teacherAssistant.js) bunu deterministic fallback
 * sinyali olarak kullanır. Saf — DOM yok, provider/network yok.
 *
 * Beklenen şekil (bkz. spesifikasyon §8):
 *   { "action": "say" | "give_hint", "message": "...", "hintLevel"?: 1|2|3 }
 */

export const ALLOWED_TEACHER_ACTIONS = ['say', 'give_hint'];
const ALLOWED_ACTIONS = new Set(ALLOWED_TEACHER_ACTIONS);

// Türkçe, 1-2 kısa cümle hedefleyen bir öğretmen mesajı için üst sınır.
// Kesin bir kural değil — LLM'in uzun ders anlatımına kaçmasını
// engelleyen kaba bir güvenlik ağı.
const MAX_MESSAGE_LENGTH = 400;

/**
 * @param {*} raw — zaten parse edilmiş bir obje (JSON.parse çıktısı vb.)
 * @returns {{valid:true, value:{action:string,message:string,hintLevel:number|null}} | {valid:false, reason:string}}
 */
export function validateTeacherResponse(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { valid: false, reason: 'NOT_AN_OBJECT' };
  }
  if (typeof raw.action !== 'string' || !ALLOWED_ACTIONS.has(raw.action)) {
    return { valid: false, reason: 'INVALID_ACTION' };
  }
  if (typeof raw.message !== 'string') {
    return { valid: false, reason: 'MESSAGE_NOT_STRING' };
  }
  const message = raw.message.trim();
  if (!message) {
    return { valid: false, reason: 'EMPTY_MESSAGE' };
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return { valid: false, reason: 'MESSAGE_TOO_LONG' };
  }
  let hintLevel = null;
  if (raw.hintLevel !== undefined && raw.hintLevel !== null) {
    if (!Number.isInteger(raw.hintLevel) || raw.hintLevel < 1 || raw.hintLevel > 3) {
      return { valid: false, reason: 'INVALID_HINT_LEVEL' };
    }
    hintLevel = raw.hintLevel;
  }
  return { valid: true, value: { action: raw.action, message, hintLevel } };
}

// Gerçek Claude cevaplarıyla doğrulanan bir davranış: sistem promptu "yalnız
// JSON" dese de model bazen ```json ... ``` kod bloğuna sarıyor. Sıkı
// JSON.parse bunu reddeder — deterministic fallback'e düşmek TEKNİK OLARAK
// doğru davranıştır ama gereksizdir. Yaygın markdown kod-bloğu sarmalayıcısını
// soymak saf bir metin temizliğidir, yeni bir doğrulama kuralı değildir:
// hâlâ yalnızca STRICT JSON.parse başarılı olursa ve şemaya uyarsa kabul edilir.
function stripMarkdownFence(text) {
  const match = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1] : text;
}

/**
 * Ham metni (LLM'in döndürdüğü text) JSON olarak ayrıştırıp doğrular.
 * Zaten obje ise (ör. mock provider) doğrudan doğrulamaya geçer.
 * @param {string|object} text
 */
export function parseTeacherResponse(text) {
  let raw = text;
  if (typeof text === 'string') {
    try {
      raw = JSON.parse(stripMarkdownFence(text));
    } catch {
      return { valid: false, reason: 'INVALID_JSON' };
    }
  }
  return validateTeacherResponse(raw);
}
