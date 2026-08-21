/**
 * scenes/cornerMovePolicy.js
 *
 * Sahne #3'ün ("Nefes Noktaları — Konuma Göre") beyaz köşe hamlesi için
 * deterministik, tekrarlanabilir aday seçimi. scenes/turnPolicy.js İLE
 * AYNI ilke: Claude/LLM veya localhost proxy'ye BAĞLI DEĞİL, saf ve
 * DOM'suz — enjekte edilen bir `isLegalMove(row,col)` yüklemi üzerinden
 * karar verir.
 *
 * turnPolicy.js'den AYRI tutuldu: o genel "açık tahtada dengeli bir
 * nokta bul" politikasıdır, bu ise özellikle KÖŞE arayan, dar amaçlı bir
 * politikadır — ikisini birleştirmek turnPolicy.js'in mevcut testlerini
 * gereksiz yere riske atardı.
 */

// Sol-üst köşe tercih edilir: core/curriculum.js'in köşe-nefes dersinde
// (l1.steps[3]) CAM.corner_tl kamerasıyla AYNI bölgeye vurgu yapar —
// Sahne #3 aynı kamerayı kullanır (bkz. scene03LibertiesByPosition.js).
export const CORNER_CANDIDATE_ORDER = [
  { row: 0, col: 0 },
  { row: 0, col: 8 },
  { row: 8, col: 0 },
  { row: 8, col: 8 },
];

/**
 * @param {object} params
 * @param {(row:number, col:number) => boolean} params.isLegalMove
 * @param {number} [params.size]
 * @returns {{row:number,col:number}|null}
 */
export function pickDeterministicCornerMove({ isLegalMove, size = 9 }) {
  for (const candidate of CORNER_CANDIDATE_ORDER) {
    if (candidate.row >= size || candidate.col >= size) continue;
    if (isLegalMove(candidate.row, candidate.col)) return candidate;
  }
  // Güvenlik ağı: tercih edilen dört köşe de doluysa/yasal değilse tam
  // tarama — pratikte bu sahnede (tahtada tek bir taş varken) imkansız,
  // ama "seçilen köşe doluysa güvenli yedek sırası" gereksinimini karşılar.
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (isLegalMove(row, col)) return { row, col };
    }
  }
  return null;
}

/**
 * Teacher Studio Diagnostics'in "beyaz köşe adayları geçerli 9×9
 * koordinatları mı" kontrolü için.
 * @param {number} [size]
 * @returns {{valid:boolean, reasons:string[]}}
 */
export function validateCornerCandidateOrder(size = 9) {
  const reasons = [];
  CORNER_CANDIDATE_ORDER.forEach((c, i) => {
    if (!Number.isInteger(c.row) || c.row < 0 || c.row >= size) reasons.push(`INVALID_ROW_AT_${i}`);
    if (!Number.isInteger(c.col) || c.col < 0 || c.col >= size) reasons.push(`INVALID_COL_AT_${i}`);
  });
  return { valid: reasons.length === 0, reasons };
}
