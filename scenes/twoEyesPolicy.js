import { CURRICULUM } from '../core/curriculum.js?v=2026-09-12.2';
import { BoardState } from '../core/boardState.js?v=2026-09-12.2';
import { isValidMove, applyMove } from '../core/ruleEngine.js?v=2026-09-12.2';
export const CONCEPT = 'life_and_death';
export function getTwoEyesMoments() {
  const lesson = CURRICULUM.flatMap(c => c.lessons).find(l => l.id === 'l7');
  return lesson.steps.flatMap((step, stepIndex) => (step.examples || [step]).map((s, exampleIndex) => ({
    ...s, curriculumStepIndex: stepIndex, exampleIndex,
    exampleCount: step.examples?.length || 1,
  })));
}
export function buildTwoEyesBoard(moment) {
  const board = new BoardState(moment.size);
  for (const stone of moment.board) board.placeStone(stone.x, stone.y, stone.color === 'B' ? 'black' : 'white');
  return board;
}
export function evaluateTwoEyesTap(board, moment, { row, col }) {
  const target = moment.targets.some(([x, y]) => x === col && y === row);
  const legality = isValidMove(board, col, row, moment.turn);
  if (!target) return { correct: false, legal: legality.valid, feedback: board.isOccupied(col, row) ? 'Bu noktada taş var; boş bir noktayı dene.' : 'Bu nokta hedefi karşılamıyor; iç boşlukları incele.' };
  if (moment.kind === 'observe') return { correct: !legality.valid && legality.reason === 'SUICIDE', legal: legality.valid, feedback: 'Beyaz burada nefessiz kalır: intihar hamlesi.' };
  if (!legality.valid) return { correct: false, legal: false, feedback: 'Bu hamle kural gereği geçersiz.' };
  return { correct: true, legal: true, ...applyMove(board, col, row, moment.turn), feedback: moment.success };
}
