import { createBoardStateFromSnapshot, rebuildBoardState, serializeMainlineMoves } from '../../studio/model/moveTree.js';

export function createStudioBoardAdapter(BoardState) {
  if (typeof BoardState !== 'function') {
    throw new TypeError('BoardState constructor is required.');
  }

  function fromDocumentBoard(board = {}) {
    return createBoardStateFromSnapshot(board);
  }

  function toDocumentBoard(state) {
    return {
      size: state.size,
      turn: state.turn,
      ko: state.koPoint ? { ...state.koPoint } : null,
      stones: state.stones.map(stone => ({ ...stone })),
    };
  }

  function fromMoveTree(moveTree, nodeId = moveTree?.activeNodeId ?? moveTree?.root?.id ?? 'root') {
    if (!moveTree?.root) {
      return fromDocumentBoard({});
    }
    return rebuildBoardState(moveTree.root, nodeId);
  }

  function toMoveTreeMainline(moveTree) {
    if (!moveTree?.root) return [];
    return serializeMainlineMoves(moveTree.root);
  }

  return {
    fromDocumentBoard,
    fromMoveTree,
    toDocumentBoard,
    toMoveTreeMainline,
  };
}
