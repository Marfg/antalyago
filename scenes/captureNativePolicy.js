/** LS-owned positions. No lesson/page content is read here. */
import { BoardState } from '../core/boardState.js?v=2026-09-20.capture-native1';
import { applyMove, isValidMove, getGroup, getLiberties } from '../core/ruleEngine.js?v=2026-09-20.capture-native1';

const stone = (x, y, color) => ({ x, y, color });
export const CAPTURE_SCENARIOS = [
  {
    key: 'capture_01_last_liberty', title: 'Son nokta',
    prompt: 'Beyaz taşı tahtadan kaldırabilir misin?',
    board: [stone(2, 2, 'white'), stone(2, 1, 'black'), stone(1, 2, 'black'), stone(3, 2, 'black')],
    consequence: 'Son nefes noktası kapandı.',
    conceptText: 'Nefes noktası kalmayan taş tahtadan kaldırılır.',
    hints: ['Beyaz taşın yatay ve dikey komşularına bak.', 'Açık kalan nefes noktası işaretlendi.', 'Siyah taşı işaretli nefes noktasına koy.'],
  },
  {
    key: 'capture_02_edge', title: 'Tahta kenarı',
    prompt: 'Kenardaki beyaz taşı tahtadan kaldırabilir misin?',
    board: [stone(0, 2, 'white'), stone(0, 1, 'black'), stone(1, 2, 'black')],
    consequence: 'Kenardaki taşın son nefes noktası kapandı.',
    conceptText: 'Kenarın dışında nefes noktası yoktur. Kenardaki tek taşın en fazla üç nefes noktası vardır.',
    hints: ['Tahta kenarının dışında bir kesişim var mı?', 'Kenarda açık kalan nefes noktası işaretlendi.', 'İşaretli nefes noktasını kapat.'],
  },
  {
    key: 'capture_03_group', title: 'Birlikte duran taşlar',
    prompt: 'Birbirine bağlı iki beyaz taşı tek hamlede kaldırabilir misin?',
    board: [stone(2, 2, 'white'), stone(3, 2, 'white'), stone(2, 1, 'black'), stone(3, 1, 'black'), stone(1, 2, 'black'), stone(4, 2, 'black'), stone(3, 3, 'black')],
    consequence: 'Ortak son nefes noktası kapandı; iki taş birlikte kalktı.',
    conceptText: 'Bağlı taşlar nefes noktalarını paylaşır. Grubun nefes noktası kalmayınca bütün grup kaldırılır.',
    hints: ['İki beyaz taşı tek bir grup olarak düşün.', 'Grubun ortak son nefes noktası işaretlendi.', 'Bu noktayı kapatınca iki taşın da nefes noktası kalmaz.'],
  },
].map(scenario => ({ ...scenario,
  // Renderer numbers rows from size down to 1; authored diagrams start at 1.
  board: scenario.board.map(s => ({ ...s, y: 4 - s.y })),
}));

export function createCaptureBoard(scenario = { board: [] }) {
  const board = new BoardState(5);
  scenario.board.forEach(s => board.placeStone(s.x, s.y, s.color));
  return board;
}

export function targetLiberties(board, scenario) {
  const target = scenario.board.find(s => s.color === 'white');
  return [...getLiberties(board, getGroup(board, target.x, target.y))].map(key => {
    const [col, row] = key.split(',').map(Number);
    return { row, col };
  });
}

export function evaluateCaptureMove(board, point, color = board.turn) {
  const check = isValidMove(board, point.col, point.row, color);
  if (!check.valid) return { ok: false, reason: check.reason };
  const result = applyMove(board, point.col, point.row, color);
  return { ok: true, ...result, capturedCount: result.captured.length };
}

/** Small, deterministic opponent: capture, protect threatened groups, approach. */
export function chooseCaptureReply(board) {
  let best = null;
  for (let row = 0; row < board.size; row++) for (let col = 0; col < board.size; col++) {
    const result = evaluateCaptureMove(board, { row, col }, 'white');
    if (!result.ok) continue;
    const ownLiberties = getLiberties(result.newState, getGroup(result.newState, col, row)).size;
    const threatened = result.newState.stones.filter(s => s.color === 'white' && getLiberties(result.newState, getGroup(result.newState, s.x, s.y)).size === 1).length;
    const pressure = result.newState.stones.filter(s => s.color === 'black' && getLiberties(result.newState, getGroup(result.newState, s.x, s.y)).size === 1).length;
    const adjacent = board.neighbors(col, row).filter(p => board.isOccupied(p.x, p.y)).length;
    const score = result.capturedCount * 1000 - threatened * 30 + pressure * 12 + adjacent * 3 + Math.min(ownLiberties, 3) - (Math.abs(col - 2) + Math.abs(row - 2)) * .1;
    if (!best || score > best.score) best = { row, col, score };
  }
  return best && { row: best.row, col: best.col };
}
