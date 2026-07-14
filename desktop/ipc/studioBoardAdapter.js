import { createBoardStateFromSnapshot, rebuildBoardState, serializeMainlineMoves } from '../../studio/model/moveTree.js';

function cloneBoardValue(value) {
  if (Array.isArray(value)) {
    return value.map(cloneBoardValue);
  }
  if (value && typeof value === 'object') {
    const cloned = {};
    for (const [key, entry] of Object.entries(value)) {
      cloned[key] = cloneBoardValue(entry);
    }
    return cloned;
  }
  return value;
}

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

  function mergeDocumentBoard(existingBoard = {}, runtimeBoard = {}) {
    const merged = cloneBoardValue(existingBoard ?? {});
    for (const [key, value] of Object.entries(runtimeBoard ?? {})) {
      if (value !== undefined) {
        merged[key] = cloneBoardValue(value);
      }
    }
    return merged;
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
    mergeDocumentBoard,
    toMoveTreeMainline,
  };
}
