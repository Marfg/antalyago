/**
 * core/pedagogyEngine.js
 *
 * Pattern analizi ve pedagojik geri bildirim üretimi.
 * Saf fonksiyonlar — yan etki yok, DOM yok.
 */

// ── Zone tespiti ───────────────────────────────────────────────────

export function getZone(x, y, size) {
  const onEdgeX = (x === 0 || x === size - 1);
  const onEdgeY = (y === 0 || y === size - 1);
  if (onEdgeX && onEdgeY) return 'corner';
  if (onEdgeX || onEdgeY) return 'edge';
  return 'center';
}

// ── Liberty hesabı (BoardState API üzerinden) ──────────────────────

/**
 * (x,y)'deki taşın grubunun liberty noktalarını döndürür.
 * @param {import('./boardState.js').BoardState} board
 */
export function getLibertyInfo(board, x, y) {
  const color = board.colorAt(x, y);
  if (!color) return { count: 0, points: [] };

  const group = new Set();
  const libs  = new Set();
  const stack = [{ x, y }];

  while (stack.length) {
    const { x: cx, y: cy } = stack.pop();
    const key = `${cx},${cy}`;
    if (group.has(key)) continue;
    if (board.colorAt(cx, cy) !== color) continue;
    group.add(key);
    board.neighbors(cx, cy).forEach(n => {
      const nk = `${n.x},${n.y}`;
      if (board.isEmpty(n.x, n.y)) {
        libs.add(nk);
      } else if (!group.has(nk)) {
        stack.push(n);
      }
    });
  }

  const points = [...libs].map(k => {
    const [lx, ly] = k.split(',').map(Number);
    return { x: lx, y: ly };
  });

  return { count: points.length, points };
}

// ── Pattern analizi ────────────────────────────────────────────────

/**
 * Hamle sonrası (x,y) taşını analiz eder.
 * board: taş zaten yerleştirilmiş BoardState
 */
export function analyzePattern(board, x, y) {
  const zone    = getZone(x, y, board.size);
  const libInfo = getLibertyInfo(board, x, y);

  // Yerleştirilen taşın ortogonal komşusunda başka taş var mı?
  const hasOrthContact = board.neighbors(x, y).some(n => !board.isEmpty(n.x, n.y));

  // Ortogonal temas yoksa çapraz temas?
  let hasDiagOnly = false;
  if (!hasOrthContact) {
    [[1,1],[1,-1],[-1,1],[-1,-1]].forEach(([dx, dy]) => {
      const nx = x + dx, ny = y + dy;
      if (board.isInBounds(nx, ny) && !board.isEmpty(nx, ny)) hasDiagOnly = true;
    });
  }

  // Bu adımdaki ilk siyah taş mı?
  const isFirstBlack = board.stones.filter(s => s.color === 'black').length === 1;

  return {
    x, y, zone,
    libertyCount:  libInfo.count,
    libertyPoints: libInfo.points,
    isFirstBlack,
    hasOrthContact,
    hasDiagOnly,
  };
}

// ── Türkçe geri bildirim ───────────────────────────────────────────

const ZONE_TR = { corner: 'köşeye', edge: 'kenara', center: 'ortaya' };
const ZONE_DE = { corner: 'köşede', edge: 'kenarda', center: 'ortada' };

export function buildFeedback(pattern) {
  const { zone, libertyCount, isFirstBlack, hasOrthContact, hasDiagOnly } = pattern;

  let msg;
  if (isFirstBlack) {
    msg = `Taşın tahtaya yerleşti! ${ZONE_TR[zone]} koydun — ${libertyCount} nefes noktası var.`;
  } else if (zone === 'corner') {
    msg = `Köşe taşı: yalnızca ${libertyCount} nefes noktası. Köşeler kırılgandır!`;
  } else if (zone === 'edge') {
    msg = `Kenar taşı: ${libertyCount} nefes noktası. Köşeden iyi, ortadan zayıf.`;
  } else {
    msg = `Merkez: ${libertyCount} nefes noktası — en fazla hareket özgürlüğü!`;
  }

  if (hasOrthContact) {
    msg += " Bu taş başka bir taşa yatay/dikey temas ediyor — Go'da bağlantı böyle kurulur!";
  } else if (hasDiagOnly) {
    msg += " Çapraz komşuluk var ama Go'da bu temas sayılmaz.";
  }

  return msg;
}

// ── Dinamik mini soru: nefes sayısı ───────────────────────────────

export function buildLibertyMiniQ(pattern) {
  const { libertyCount, zone } = pattern;
  const correct = String(libertyCount);
  const hint = zone === 'corner'
    ? 'Köşede yalnızca 2 yön açık.'
    : zone === 'edge' ? 'Kenarda 3 yön açık.'
    : 'Ortada 4 yön açık.';

  return {
    text: 'Bu taşın kaç nefes noktası var?',
    options: ['2', '3', '4'].map(n => ({
      text: n,
      correct: n === correct,
      feedback: n === correct
        ? `Evet! ${ZONE_DE[zone].charAt(0).toUpperCase() + ZONE_DE[zone].slice(1)} ${libertyCount} nefes noktası var.`
        : `Hayır, ${correct} tane var. ${hint}`,
    })),
  };
}

// ── Goal validation ────────────────────────────────────────────────

/**
 * goalZone veya goalAdjacent hedefini karşılıyor mu?
 */
export function meetsGoal(step, x, y) {
  if (step.goalZone) {
    return getZone(x, y, step.size || 9) === step.goalZone;
  }
  if (step.goalAdjacent) {
    const { x: tx, y: ty } = step.goalAdjacent;
    return Math.abs(x - tx) + Math.abs(y - ty) === 1;
  }
  return true;
}

export function wrongGoalMessage(step) {
  if (step.goalZone) {
    const tr = ZONE_TR[step.goalZone] || 'hedef bölgeye';
    return `Bu adımda ${tr} taş koymanı istiyorum. Tekrar dene.`;
  }
  if (step.goalAdjacent) {
    return "Hedef taşa yatay veya dikey olarak bitişik bir noktayı seç.";
  }
  return step.fb_err || 'Yanlış, tekrar dene.';
}
