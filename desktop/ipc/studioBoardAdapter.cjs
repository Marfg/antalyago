function createStudioBoardAdapter(BoardState) {
  if (typeof BoardState !== 'function') {
    throw new TypeError('BoardState constructor is required.');
  }

  function fromDocumentBoard(board = {}) {
    const state = new BoardState(board.size ?? 9);
    state.reset(board.size ?? 9);
    state.turn = board.turn ?? 'black';
    state.koPoint = board.ko ? { x: board.ko.x, y: board.ko.y } : null;

    for (const stone of Array.isArray(board.stones) ? board.stones : []) {
      state.placeStone(stone.x, stone.y, stone.color);
    }

    return state;
  }

  function toDocumentBoard(state) {
    return {
      size: state.size,
      turn: state.turn,
      ko: state.koPoint ? { ...state.koPoint } : null,
      stones: state.stones.map(stone => ({ ...stone })),
    };
  }

  return {
    fromDocumentBoard,
    toDocumentBoard,
  };
}

module.exports = { createStudioBoardAdapter };
