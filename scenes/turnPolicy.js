/**
 * scenes/turnPolicy.js
 *
 * Sahne #2'nin "asistanı" Claude/LLM veya localhost proxy'ye BAĞLI
 * DEĞİLDİR (bkz. görev talimatı). Beyazın cevap hamlesi tamamen
 * deterministik, tekrarlanabilir, sabit öncelik sıralı bir aday
 * listesinden seçilir — amaç güçlü Go oynamak DEĞİL, sırayla oynamayı
 * göstermek.
 *
 * Saf: DOM/canvas/BoardState bilmez — yalnız enjekte edilen bir
 * `isLegalMove(row,col)` YÜKLEMİ üzerinden karar verir (adapters/
 * sceneBoardAdapter.js'in `isLegalMove()`'u ile kolayca beslenir).
 * Bu sayede Node'da DOM'suz, tamamen izole test edilebilir.
 */

// Tahta merkezine yakın, dengeli, yıldız noktalarına dayalı sabit
// öncelik sırası (9×9). Sıradaki aday dolu/yasal değilse bir sonrakine
// geçilir — kullanıcının siyah hamlelerinden bağımsız olarak GÜVENLİ.
export const WHITE_CANDIDATE_ORDER = [
  { row: 4, col: 4 },
  { row: 2, col: 2 }, { row: 2, col: 6 }, { row: 6, col: 2 }, { row: 6, col: 6 },
  { row: 4, col: 2 }, { row: 4, col: 6 }, { row: 2, col: 4 }, { row: 6, col: 4 },
  { row: 3, col: 3 }, { row: 3, col: 5 }, { row: 5, col: 3 }, { row: 5, col: 5 },
  { row: 1, col: 1 }, { row: 1, col: 7 }, { row: 7, col: 1 }, { row: 7, col: 7 },
  { row: 4, col: 1 }, { row: 4, col: 7 }, { row: 1, col: 4 }, { row: 7, col: 4 },
];

/**
 * @param {object} params
 * @param {(row:number, col:number) => boolean} params.isLegalMove
 * @param {number} [params.size] — aday koordinatlar bu sınırın dışına taşarsa atlanır
 * @returns {{row:number,col:number}|null} bulunan ilk yasal aday, hiçbiri yoksa null
 */
export function pickDeterministicWhiteMove({ isLegalMove, size = 9 }) {
  for (const candidate of WHITE_CANDIDATE_ORDER) {
    if (candidate.row >= size || candidate.col >= size) continue;
    if (isLegalMove(candidate.row, candidate.col)) return candidate;
  }
  // Güvenlik ağı: adaylar tükendiyse (pratikte 9×9'da 6 taşla imkansız)
  // satır-major tam tarama — board dolu olmadıkça HER ZAMAN bir sonuç bulur.
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (isLegalMove(row, col)) return { row, col };
    }
  }
  return null;
}

/**
 * Teacher Studio Diagnostics'in "deterministik cevap adayları geçerli
 * 9×9 koordinatları mı" kontrolü için — ikinci bir validation YAZILMADI,
 * yalnız aday listesinin şeklini doğrular.
 * @param {number} [size]
 * @returns {{valid:boolean, reasons:string[]}}
 */
export function validateCandidateOrder(size = 9) {
  const reasons = [];
  WHITE_CANDIDATE_ORDER.forEach((c, i) => {
    if (!Number.isInteger(c.row) || c.row < 0 || c.row >= size) reasons.push(`INVALID_ROW_AT_${i}`);
    if (!Number.isInteger(c.col) || c.col < 0 || c.col >= size) reasons.push(`INVALID_COL_AT_${i}`);
  });
  return { valid: reasons.length === 0, reasons };
}
