/**
 * scenes/groupLibertyPolicy.js
 *
 * Sahne #4 ("Grubun Nefesi") için saf, DOM'suz grup/nefes-noktası
 * politikası. v0.17 — kök neden düzeltmesi (bkz. görev talimatı): önceki
 * sürüm curriculum'un l2.steps[2] üç-taşlı DOĞRUSAL örneğini SIRALI,
 * ZORUNLU bir hedef listesine çeviriyordu (`getConnectionTargets`,
 * `isExpectedNextTarget`, `matchesCurriculumSeed` completion şartı) —
 * kullanıcı yalnız (4,4) sonra (4,5)'e tıklayabiliyordu, L/T/dallanan
 * şekiller REDDEDİLİYORDU. Artık bu modül SERBEST bağlı-grup keşfini
 * destekler: kullanıcı çapadan başlayıp grubun GERÇEK nefes
 * noktalarından herhangi birine (sırayla veya karışık) tıklayarak 3-7
 * taşlık İSTEDİĞİ bağlı şekli kurabilir.
 *
 * scenes/scene04GroupLiberties.js VE teacher-studio.html Diagnostics
 * AYNI bu modülü kullanır — sahne mantığının ikinci bir kopyası hard-code
 * edilmez.
 *
 * canvas/DOM/renderer/sahne global state BİLMEZ — yalnız {row,col}
 * koordinat verisiyle çalışır, core/boardState.js ve core/ruleEngine.js
 * (ikisi de saf) üzerinden hesaplar, unit test edilebilir.
 */

import { CURRICULUM } from '../core/curriculum.js?v=2026-08-29.1';
import { BoardState } from '../core/boardState.js?v=2026-08-29.1';
import { getGroup, getLiberties } from '../core/ruleEngine.js?v=2026-08-29.1';

const LESSON_ID = 'l2';
const STEP_INDEX = 2;
const BOARD_SIZE = 9;

export const MIN_GROUP_SIZE = 3;
export const MAX_GROUP_SIZE = 7;

/**
 * Serbest keşfin başlangıç çapası — curriculum'un tarihsel örneğiyle AYNI
 * konum (row:4,col:3), her yöne büyümeye yetecek iç alanı var (9×9'da
 * kenara en az 3 kesişim mesafede). Artık kullanıcı akışını KISITLAMAZ,
 * yalnız başlangıç noktasıdır.
 */
export const ANCHOR = { row: 4, col: 3 };
/** @returns {{row:number,col:number}} */
export function getAnchor() { return { ...ANCHOR }; }

/**
 * curriculum'un l2.steps[2] TARİHSEL üç-taşlı DOĞRUSAL örneği — yalnız
 * Diagnostics/test çapraz-doğrulaması için okunur, sahne akışını ARTIK
 * GATE ETMEZ (bkz. dosya başı notu).
 * @returns {Array<{row:number,col:number}>}
 */
export function getCurriculumGroupSeed() {
  const lesson = CURRICULUM.flatMap(chapter => chapter.lessons).find(l => l.id === LESSON_ID);
  const step = lesson?.steps?.[STEP_INDEX];
  const board = step?.board ?? [];
  return board.map(({ x, y }) => ({ row: y, col: x }));
}

function keyOf(p) { return `${p.row},${p.col}`; }
function inBounds(p, size) { return p.row >= 0 && p.row < size && p.col >= 0 && p.col < size; }

/** Noktaları tekilleştirip deterministik (satır,sütun) sırasına dizer. */
export function normalizeGroup(points) {
  const seen = new Map();
  for (const p of points ?? []) { if (p) seen.set(keyOf(p), { row: p.row, col: p.col }); }
  return [...seen.values()].sort((a, b) => a.row - b.row || a.col - b.col);
}

/** Deterministik, sıra-bağımsız şekil kimliği — event payload'ında sabit
    bir "shape label" yerine güvenli bir imza olarak kullanılabilir. */
export function shapeSignature(points) {
  return normalizeGroup(points).map(keyOf).join('|');
}

/** Duplicate koordinatlar TEKİLLEŞTİRİLDİKTEN sonraki gerçek taş sayısı. */
export function getGroupSize(points) {
  return normalizeGroup(points).length;
}

/**
 * Verilen noktaların GERÇEKTEN tek bağlı (yatay/dikey) grup oluşturup
 * oluşturmadığını core/ruleEngine.js (getGroup — flood-fill) üzerinden
 * doğrular. Tahta dışı koordinat veya kopuk taş kümesi GEÇMEZ (false).
 * @param {Array<{row:number,col:number}>} points
 * @param {number} [size]
 */
export function isConnectedSingleGroup(points, size = BOARD_SIZE) {
  const norm = normalizeGroup(points);
  if (norm.length === 0) return false;
  if (!norm.every(p => inBounds(p, size))) return false;
  const board = new BoardState(size);
  for (const p of norm) board.placeStone(p.col, p.row, 'black');
  const group = getGroup(board, norm[0].col, norm[0].row);
  return group.size === norm.length;
}

/**
 * (GEÇERLİ, tek bağlı) bir grubun GERÇEK ortak nefes noktalarını
 * core/ruleEngine.js üzerinden hesaplar — saf, adaptör/DOM'suz referans
 * hesabı. Canlı sahne AYNI sonucu adapters/sceneBoardAdapter.js'in
 * getLibertiesAt()'ı üzerinden alır; bu fonksiyon test/Diagnostics
 * için BAĞIMSIZ bir ikinci kanıttır.
 * @param {Array<{row:number,col:number}>} points
 * @param {number} [size]
 * @returns {Array<{row:number,col:number}>}
 */
export function computeGroupLiberties(points, size = BOARD_SIZE) {
  const norm = normalizeGroup(points);
  if (!isConnectedSingleGroup(norm, size)) return [];
  const board = new BoardState(size);
  for (const p of norm) board.placeStone(p.col, p.row, 'black');
  const group = getGroup(board, norm[0].col, norm[0].row);
  const libs = getLiberties(board, group);
  return [...libs].map(k => { const [x, y] = k.split(',').map(Number); return { row: y, col: x }; });
}

/** `point`, mevcut (geçerli, tek bağlı) grubun GERÇEK bir nefes noktası mı?
    Boş + tahta-içi + gruba (yatay/dikey) bitişik olma koşulunu TEK YERDEN
    kapsar — ayrı "occupied/out-of-bounds/disconnected" kontrolü GEREKMEZ
    (nefes noktası tanımı zaten bunları dışlar). */
export function isSelectableLibertyPoint(points, point, size = BOARD_SIZE) {
  if (!point) return false;
  return computeGroupLiberties(points, size).some(l => l.row === point.row && l.col === point.col);
}

/** Yeni bir taş EKLENEBİLİR mi — 7 sınırı + gerçek nefes koşulu birlikte. */
export function canAddStone(points, point, size = BOARD_SIZE) {
  if (getGroupSize(points) >= MAX_GROUP_SIZE) return false;
  return isSelectableLibertyPoint(points, point, size);
}

/** Grup 7 taşlık üst sınıra ulaştı mı (sekizinci taş HİÇBİR KOŞULDA eklenmez). */
export function isAtMax(points) { return getGroupSize(points) >= MAX_GROUP_SIZE; }

/** Completion uygunluğu: 3 ≤ grup boyutu ≤ 7 VE gerçekten tek bağlı grup. */
export function isCompletable(points, size = BOARD_SIZE) {
  const n = getGroupSize(points);
  return n >= MIN_GROUP_SIZE && n <= MAX_GROUP_SIZE && isConnectedSingleGroup(points, size);
}
