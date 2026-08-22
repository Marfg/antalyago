/**
 * scenes/groupLibertyPolicy.js
 *
 * Sahne #4 ("Grubun Nefesi") için saf, DOM'suz hedef/başarı politikası.
 * core/curriculum.js'in l2.steps[2] (kullanıcıya görünen "3. adım") üç
 * taşlı doğrusal grup örneğini TEK kaynaktan okur — scenes/
 * scene04GroupLiberties.js VE teacher-studio.html Diagnostics AYNI bu
 * modülü kullanır, hiçbiri koordinatları kendi başına ikinci kez
 * sabitlemez (bkz. görev talimatı: "Teacher Studio içine sahne
 * mantığının ikinci kopyasını hard-code etme").
 *
 * canvas/DOM/renderer bilmez — yalnız {row,col} koordinat verisiyle
 * çalışır, unit test edilebilir.
 */

import { CURRICULUM } from '../core/curriculum.js';

const LESSON_ID = 'l2';
const STEP_INDEX = 2;

/**
 * curriculum'un l2.steps[2] board seed'ini {row,col} listesine çevirir
 * (SGF/curriculum kuralı: x=col, y=row — bkz. proje CLAUDE.md "SGF
 * Koordinat Çevirisi"). Seed sırası curriculum'daki tanım sırasıdır:
 * ilk taş çapa, kalan taşlar sıralı bağlantı hedefleridir.
 * @returns {Array<{row:number, col:number}>}
 */
export function getCurriculumGroupSeed() {
  const lesson = CURRICULUM.flatMap(chapter => chapter.lessons).find(l => l.id === LESSON_ID);
  const step = lesson?.steps?.[STEP_INDEX];
  const board = step?.board ?? [];
  return board.map(({ x, y }) => ({ row: y, col: x }));
}

/** Çapa taş (seed'in ilk noktası). */
export function getAnchor() {
  return getCurriculumGroupSeed()[0] ?? null;
}

/** Sıralı bağlantı hedefleri (çapadan SONRAKİ seed noktaları, sırayla). */
export function getConnectionTargets() {
  return getCurriculumGroupSeed().slice(1);
}

/** Tamamlanması gereken toplam bağlantı sayısı (bu örnekte 2). */
export function totalConnectionsRequired() {
  return getConnectionTargets().length;
}

/**
 * `connectionsMade` (0..N) tamamlanan bağlantı sayısına göre bir SONRAKİ
 * beklenen hedef nokta — kalan hedef yoksa null.
 * @param {number} connectionsMade
 * @returns {{row:number,col:number}|null}
 */
export function getNextTarget(connectionsMade) {
  return getConnectionTargets()[connectionsMade] ?? null;
}

/** @param {number} connectionsMade */
export function isSequenceComplete(connectionsMade) {
  return connectionsMade >= totalConnectionsRequired();
}

/**
 * Verilen bir noktanın, `connectionsMade` durumunda kabul edilecek TEK
 * doğru sonraki hedefle eşleşip eşleşmediğini doğrular — sahne bu
 * fonksiyonu KULLANARAK "yasal ama hedef dışı" (ör. L-biçimi oluşturacak)
 * hamleleri reddeder (bkz. görev talimatı "Neden tam doğrusal örnek
 * gerekli?").
 * @param {number} connectionsMade
 * @param {{row:number,col:number}} point
 */
export function isExpectedNextTarget(connectionsMade, point) {
  const target = getNextTarget(connectionsMade);
  return !!target && !!point && target.row === point.row && target.col === point.col;
}

/**
 * Nihai (tüm bağlantılar tamamlanmış) yerleştirilmiş taş listesinin
 * curriculum seed'iyle BİREBİR (sıra bağımsız küme) eşleştiğini doğrular
 * — yalnız `groupSize===3` yeterli değildir (L-biçimi de 3 taşlık tek
 * grup olabilir ama farklı bir liberty sonucu üretir), bu yüzden nihai
 * KONUM curriculum'un doğrusal örneğiyle AYNI olmalı.
 * @param {Array<{row:number,col:number}>} placedPoints
 */
export function matchesCurriculumSeed(placedPoints) {
  const seed = getCurriculumGroupSeed();
  if (!Array.isArray(placedPoints) || placedPoints.length !== seed.length) return false;
  const key = (p) => `${p.row},${p.col}`;
  const seedKeys = seed.map(key).sort();
  const placedKeys = placedPoints.map(key).sort();
  return seedKeys.every((k, i) => k === placedKeys[i]);
}
