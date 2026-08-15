/**
 * core/captureObservation.js
 *
 * Mevcut tahta durumu üzerinden ATARI GÖZLEMİ. Yeni bir capture motoru
 * DEĞİL — core/ruleEngine.js'in zaten var olan getGroup/getLiberties
 * primitifleri üzerine kurulu, saf, salt-okunur bir analiz katmanı.
 * Board'u hiç mutate etmez, yeni bir kural/hesaplama icat etmez.
 */

import { getGroup, getLiberties } from './ruleEngine.js';

function keyToPoint(key) {
  const [x, y] = key.split(',').map(Number);
  return { x, y };
}

/**
 * Tahtadaki tüm bağlı grupları (taş + nefes noktası bilgisiyle) döndürür.
 * @param {import('./boardState.js').BoardState} board
 * @returns {{color:string, points:{x,y}[], liberties:{x,y}[]}[]}
 */
export function findAllGroups(board) {
  const seen = new Set();
  const groups = [];
  for (const stone of board.stones) {
    const key = `${stone.x},${stone.y}`;
    if (seen.has(key)) continue;
    const group = getGroup(board, stone.x, stone.y);
    group.forEach(k => seen.add(k));
    const liberties = getLiberties(board, group);
    groups.push({
      color: stone.color,
      points: [...group].map(keyToPoint),
      liberties: [...liberties].map(keyToPoint),
    });
  }
  return groups;
}

/**
 * Tam olarak 1 nefes noktası kalan (atari'deki) grupları döndürür.
 * @param {import('./boardState.js').BoardState} board
 */
export function findAtariGroups(board) {
  return findAllGroups(board).filter(g => g.liberties.length === 1);
}

/**
 * Bir noktanın ait olduğu grubun atari'de olup olmadığını bildirir.
 * @param {import('./boardState.js').BoardState} board
 */
export function isPointInAtari(board, x, y) {
  if (!board.colorAt(x, y)) return false;
  const group = getGroup(board, x, y);
  return getLiberties(board, group).size === 1;
}
