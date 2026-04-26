/**
 * core/ruleEngine.js
 *
 * Go kural motoru. Pure fonksiyonlar — yan etki yok, DOM yok.
 * BoardState alır, yeni state veya hesaplama sonucu döndürür.
 */

import { BoardState } from './boardState.js';

// ── Grup / Liberty hesaplama ───────────────────────────────────────

/**
 * (x,y) noktasındaki taşın ait olduğu grubu flood-fill ile bulur.
 * @param {BoardState} board
 * @param {number} x
 * @param {number} y
 * @returns {Set<string>} "x,y" formatında string set
 */
export function getGroup(board, x, y) {
  const color = board.colorAt(x, y);
  if (!color) return new Set();

  const group = new Set();
  const queue = [{ x, y }];

  while (queue.length) {
    const cur = queue.pop();
    const key = `${cur.x},${cur.y}`;
    if (group.has(key)) continue;
    if (board.colorAt(cur.x, cur.y) !== color) continue;
    group.add(key);
    board.neighbors(cur.x, cur.y).forEach(n => {
      if (!group.has(`${n.x},${n.y}`)) queue.push(n);
    });
  }

  return group;
}

/**
 * Bir grubun nefes noktalarını (liberty) döndürür.
 * @param {BoardState} board
 * @param {Set<string>} group  — "x,y" string set
 * @returns {Set<string>}
 */
export function getLiberties(board, group) {
  const libs = new Set();
  for (const key of group) {
    const [x, y] = key.split(',').map(Number);
    board.neighbors(x, y).forEach(n => {
      if (board.isEmpty(n.x, n.y)) libs.add(`${n.x},${n.y}`);
    });
  }
  return libs;
}

/**
 * (x,y) noktasındaki taşın nefes sayısını döndürür.
 */
export function getLibertyCount(board, x, y) {
  const group = getGroup(board, x, y);
  return getLiberties(board, group).size;
}

// ── Yakalama hesaplama ─────────────────────────────────────────────

/**
 * (x,y) noktasına `color` renginde taş konulursa hangi taşlar yakalanır?
 * Simüle eder, board'u mutate etmez.
 *
 * @param {BoardState} board
 * @param {number} x
 * @param {number} y
 * @param {'black'|'white'} color
 * @returns {{x:number,y:number}[]}  yakalanacak taşların listesi
 */
export function computeCaptures(board, x, y, color) {
  const opponent = color === 'black' ? 'white' : 'black';
  const captured = [];

  // Hamleden sonra komşu rakip grupları kontrol et
  board.neighbors(x, y).forEach(n => {
    if (board.colorAt(n.x, n.y) !== opponent) return;
    const group = getGroup(board, n.x, n.y);

    // Bu grubun şu anki libertylerini hesapla.
    // Yeni taşın konulacağı (x,y) noktası artık boş değil — bunu çıkar.
    const libs = getLiberties(board, group);
    libs.delete(`${x},${y}`);

    if (libs.size === 0) {
      for (const key of group) {
        const [cx, cy] = key.split(',').map(Number);
        captured.push({ x: cx, y: cy });
      }
    }
  });

  return captured;
}

// ── Hamle geçerlilik kontrolü ──────────────────────────────────────

/**
 * @param {BoardState} board
 * @param {number} x
 * @param {number} y
 * @param {'black'|'white'} color
 * @returns {{ valid: boolean, reason?: string }}
 */
export function isValidMove(board, x, y, color) {
  if (!board.isInBounds(x, y)) {
    return { valid: false, reason: 'OUT_OF_BOUNDS' };
  }
  if (board.isOccupied(x, y)) {
    return { valid: false, reason: 'OCCUPIED' };
  }

  // Ko kontrolü
  if (board.koPoint && board.koPoint.x === x && board.koPoint.y === y) {
    return { valid: false, reason: 'KO' };
  }

  // İntihar kontrolü: taş konulunca herhangi bir yakalama olacak mı?
  const captures = computeCaptures(board, x, y, color);
  if (captures.length > 0) {
    // Yakalama yapılıyorsa geçerli (taşın nefesi yakalamadan gelecek)
    return { valid: true };
  }

  // Yakalama yoksa, konulan taşın kendisinin nefesi var mı kontrol et
  // Simüle et: geçici board klonu üzerinde bak
  const sim = board.clone();
  sim.placeStone(x, y, color);
  const group = getGroup(sim, x, y);
  const libs = getLiberties(sim, group);

  if (libs.size === 0) {
    return { valid: false, reason: 'SUICIDE' };
  }

  return { valid: true };
}

// ── Hamle uygulama ─────────────────────────────────────────────────

/**
 * Hamleyi uygular: taşı koyar, capture'ları kaldırır, ko noktasını belirler.
 * Yeni BoardState döndürür — orijinal mutate edilmez.
 *
 * @param {BoardState} board
 * @param {number} x
 * @param {number} y
 * @param {'black'|'white'} color
 * @returns {{ newState: BoardState, captured: {x,y}[], newKoPoint: {x,y}|null }}
 */
export function applyMove(board, x, y, color) {
  const newState = board.clone();
  const captured = computeCaptures(board, x, y, color);

  newState.placeStone(x, y, color);
  captured.forEach(c => newState.removeStone(c.x, c.y));
  newState.turn = color === 'black' ? 'white' : 'black';

  // Ko: tam olarak 1 taş yakalandıysa ve konulan taşın tek libertysi
  // yakalanan taşın noktasıysa → ko
  let newKoPoint = null;
  if (captured.length === 1) {
    const sim = newState.clone();
    const group = getGroup(sim, x, y);
    const libs = getLiberties(sim, group);
    if (libs.size === 1) {
      const [kx, ky] = [...libs][0].split(',').map(Number);
      newKoPoint = { x: kx, y: ky };
    }
  }
  newState.koPoint = newKoPoint;

  return { newState, captured, newKoPoint };
}
