/**
 * core/contentValidation.js
 *
 * RAG v0.6 — yerel öğretim notu (content/teacher-notes/*.js) entry'lerini
 * doğrular. Geçersiz bir entry sessizce sistemi BOZMAMALI — bkz.
 * core/contentStore.js'in bunu nasıl kullandığı (geçersizler filtrelenir,
 * ayrı bir diagnostic listesine düşer).
 *
 * Saf: DOM yok, network yok, yan etkisi yok.
 */

import { KNOWN_CONCEPTS } from './conceptMap.js';

export const CONTENT_PURPOSES = ['explain', 'hint', 'reinforce', 'confirm'];

// Student Model'in status enum'uyla AYNI (core/studentModel.js) — burada
// tekrar tanımlanıyor çünkü studentModel.js bunu ayrı bir sabit olarak
// export etmiyor; iki dosyanın da kaynağı aynı 4 durumdur.
export const CONTENT_STUDENT_STATUSES = ['not_started', 'learning', 'provisional', 'mastered'];

// core/learningContext.js'in classifyCurriculumStep()'inin ürettiği stage
// değerleriyle AYNI (orada ayrı bir sabit olarak export edilmiyor, bu
// yüzden burada mirror'lanıyor — bkz. dosya başı notu).
export const CONTENT_STAGES = [
  'instruction', 'guided_practice', 'variable_practice',
  'worked_example', 'assessment', 'assessment_explanation',
];

const MAX_TEXT_LENGTH = 400;

/**
 * @param {*} entry
 * @returns {{valid:true}|{valid:false, reason:string}}
 */
export function validateContentEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return { valid: false, reason: 'NOT_AN_OBJECT' };
  }
  if (typeof entry.id !== 'string' || !entry.id.trim()) {
    return { valid: false, reason: 'MISSING_ID' };
  }
  if (!KNOWN_CONCEPTS.includes(entry.concept)) {
    return { valid: false, reason: 'INVALID_CONCEPT' };
  }
  if (!CONTENT_STAGES.includes(entry.stage)) {
    return { valid: false, reason: 'INVALID_STAGE' };
  }
  if (!CONTENT_PURPOSES.includes(entry.purpose)) {
    return { valid: false, reason: 'INVALID_PURPOSE' };
  }
  if (typeof entry.text !== 'string' || !entry.text.trim()) {
    return { valid: false, reason: 'EMPTY_TEXT' };
  }
  if (entry.text.length > MAX_TEXT_LENGTH) {
    return { valid: false, reason: 'TEXT_TOO_LONG' };
  }
  if (entry.studentStatus !== undefined) {
    if (!Array.isArray(entry.studentStatus) || entry.studentStatus.length === 0
      || !entry.studentStatus.every(s => CONTENT_STUDENT_STATUSES.includes(s))) {
      return { valid: false, reason: 'INVALID_STUDENT_STATUS' };
    }
  }
  if (entry.priority !== undefined && typeof entry.priority !== 'number') {
    return { valid: false, reason: 'INVALID_PRIORITY' };
  }
  return { valid: true };
}

/**
 * Bir içerik dizisini doğrular; geçerli entry'leri, geçersizleri (id+neden)
 * ve tekrar eden id'leri ayrı ayrı döndürür. HİÇBİR entry burada throw
 * ETMEZ — çağıran taraf (core/contentStore.js) yalnızca `valid`i kullanır.
 *
 * @param {Array<object>} entries
 * @returns {{valid:Array<object>, invalid:Array<{id:*,reason:string}>, duplicateIds:Array<string>}}
 */
export function validateContentSet(entries) {
  const valid = [];
  const invalid = [];
  const seenIds = new Set();
  const duplicateIds = new Set();

  for (const entry of Array.isArray(entries) ? entries : []) {
    const result = validateContentEntry(entry);
    if (!result.valid) {
      invalid.push({ id: entry?.id ?? null, reason: result.reason });
      continue;
    }
    if (seenIds.has(entry.id)) {
      duplicateIds.add(entry.id);
      invalid.push({ id: entry.id, reason: 'DUPLICATE_ID' });
      continue;
    }
    seenIds.add(entry.id);
    valid.push(entry);
  }

  return { valid, invalid, duplicateIds: [...duplicateIds] };
}
