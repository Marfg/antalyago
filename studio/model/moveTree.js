import { BoardState } from '../../core/boardState.js';
import { applyMove, isValidMove } from '../../core/ruleEngine.js';

let nodeCounter = 0;

function nextNodeId(prefix = 'node') {
  nodeCounter += 1;
  return `${prefix}-${nodeCounter}`;
}

function clone(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

export function cloneBoardSnapshot(board = {}) {
  const snapshot = clone(board) ?? {};
  snapshot.size = Number.isInteger(snapshot.size) ? snapshot.size : 9;
  snapshot.turn = snapshot.turn === 'white' ? 'white' : 'black';
  snapshot.ko = snapshot.ko ? { x: snapshot.ko.x, y: snapshot.ko.y } : null;
  snapshot.stones = Array.isArray(snapshot.stones) ? snapshot.stones.map(stone => ({ ...stone })) : [];
  snapshot.markers = Array.isArray(snapshot.markers) ? snapshot.markers.map(marker => ({ ...marker })) : [];
  snapshot.regions = Array.isArray(snapshot.regions) ? snapshot.regions.map(region => clone(region)) : [];
  snapshot.viewport = snapshot.viewport ? clone(snapshot.viewport) : null;
  return snapshot;
}

export function createMoveNode(overrides = {}) {
  return {
    id: overrides.id ?? nextNodeId(),
    parentId: overrides.parentId ?? null,
    move: overrides.move ? clone(overrides.move) : null,
    children: Array.isArray(overrides.children) ? overrides.children : [],
    comment: typeof overrides.comment === 'string' ? overrides.comment : '',
    annotations: Array.isArray(overrides.annotations) ? overrides.annotations.slice() : [],
    preferredChildId: overrides.preferredChildId ?? null,
    formation: overrides.formation ? cloneBoardSnapshot(overrides.formation) : null,
  };
}

export function createMoveTree(board = {}, legacyMoves = []) {
  const root = createMoveNode({
    id: 'root',
    parentId: null,
    move: null,
    comment: '',
    annotations: [],
    preferredChildId: null,
    formation: cloneBoardSnapshot(board),
  });

  let cursor = root;
  let state = createBoardStateFromSnapshot(root.formation);

  for (const legacyMove of Array.isArray(legacyMoves) ? legacyMoves : []) {
    if (!legacyMove || typeof legacyMove !== 'object') continue;
    if (!Number.isInteger(legacyMove.x) || !Number.isInteger(legacyMove.y)) continue;
    const color = legacyMove.color === 'white' ? 'white' : 'black';
    const move = { ...legacyMove, color };
    const result = applyMove(state, move.x, move.y, move.color);
    if (!result?.newState) continue;

    const child = createMoveNode({
      parentId: cursor.id,
      move,
      comment: typeof legacyMove.annotation === 'string' ? legacyMove.annotation : '',
      annotations: Array.isArray(legacyMove.annotations) ? legacyMove.annotations.slice() : [],
    });

    if (Array.isArray(result.captured) && result.captured.length && child.move && child.move.capture === undefined) {
      child.move.capture = result.captured.map(capture => ({ ...capture }));
    }

    cursor.children.push(child);
    if (!cursor.preferredChildId) {
      cursor.preferredChildId = child.id;
    }
    cursor = child;
    state = result.newState;
  }

  return {
    root,
    activeNodeId: cursor.id,
    preferredChildId: root.preferredChildId ?? null,
  };
}

export function ensureMoveTreeDocument(doc) {
  if (!doc || typeof doc !== 'object') return doc;

  const existingTree = doc.moveTree && typeof doc.moveTree === 'object' ? doc.moveTree : null;
  const generatedTree = createMoveTree(doc.board ?? {}, doc.moves ?? []);
  const root = existingTree?.root && typeof existingTree.root === 'object'
    ? existingTree.root
    : generatedTree.root;

  if (!root.formation) {
    root.formation = cloneBoardSnapshot(doc.board ?? {});
  }
  if (!Array.isArray(root.children)) {
    root.children = [];
  }
  if (root.comment === undefined) root.comment = '';
  if (!Array.isArray(root.annotations)) root.annotations = [];
  if (root.preferredChildId === undefined) root.preferredChildId = null;

  doc.moveTree = {
    root,
    activeNodeId: existingTree?.activeNodeId ?? generatedTree.activeNodeId ?? doc.activeNodeId ?? 'root',
    preferredChildId: existingTree?.preferredChildId ?? root.preferredChildId ?? generatedTree.preferredChildId ?? null,
  };
  doc.activeNodeId = doc.moveTree.activeNodeId;
  if (!Array.isArray(doc.moves)) {
    doc.moves = serializeMainlineMoves(doc.moveTree.root);
  }
  if (!doc.moves.length && Array.isArray(doc.moveTree.root.children)) {
    doc.moves = serializeMainlineMoves(doc.moveTree.root);
  }
  return doc;
}

export function findMoveNode(root, nodeId) {
  if (!root || !nodeId) return null;
  if (root.id === nodeId) return root;
  for (const child of root.children ?? []) {
    const found = findMoveNode(child, nodeId);
    if (found) return found;
  }
  return null;
}

export function findMoveParent(root, nodeId, parent = null) {
  if (!root || !nodeId) return null;
  if (root.id === nodeId) return parent;
  for (const child of root.children ?? []) {
    const found = findMoveParent(child, nodeId, root);
    if (found) return found;
  }
  return null;
}

export function getMovePath(root, nodeId) {
  const path = [];
  let current = findMoveNode(root, nodeId);
  while (current) {
    path.unshift(current);
    if (!current.parentId) break;
    current = findMoveParent(root, current.id);
  }
  return path;
}

export function createBoardStateFromSnapshot(board = {}) {
  const state = new BoardState(board.size ?? 9);
  state.reset(board.size ?? 9);
  state.turn = board.turn === 'white' ? 'white' : 'black';
  state.koPoint = board.ko ? { x: board.ko.x, y: board.ko.y } : null;
  for (const stone of Array.isArray(board.stones) ? board.stones : []) {
    state.placeStone(stone.x, stone.y, stone.color);
  }
  return state;
}

export function rebuildBoardState(root, nodeId) {
  if (!root) return createBoardStateFromSnapshot({});
  const path = getMovePath(root, nodeId ?? root.id);
  let state = createBoardStateFromSnapshot(root.formation ?? {});

  for (const node of path.slice(1)) {
    if (!node.move) continue;
    const move = node.move;
    const result = applyMove(state, move.x, move.y, move.color);
    state = result.newState;
  }

  return state;
}

export function serializeMainlineMoves(root) {
  const moves = [];
  let cursor = root;
  const seen = new Set(['root']);

  while (cursor?.children?.length) {
    const preferred = cursor.children.find(child => child.id === cursor.preferredChildId) ?? cursor.children[0];
    if (!preferred || seen.has(preferred.id)) break;
    seen.add(preferred.id);
    if (preferred.move) {
      const move = clone(preferred.move);
      if (preferred.comment && !move.annotation) {
        move.annotation = preferred.comment;
      }
      moves.push(move);
    }
    cursor = preferred;
  }

  return moves;
}

export function setMoveNodeComment(root, nodeId, comment) {
  const node = findMoveNode(root, nodeId);
  if (!node) return false;
  node.comment = String(comment ?? '');
  return true;
}

export function setMoveNodeAnnotations(root, nodeId, annotations) {
  const node = findMoveNode(root, nodeId);
  if (!node) return false;
  node.annotations = Array.isArray(annotations) ? annotations.filter(Boolean).map(value => String(value).trim()).filter(Boolean) : [];
  return true;
}

export function setPreferredChild(root, nodeId, childId) {
  const node = findMoveNode(root, nodeId);
  if (!node) return false;
  if (childId === null) {
    node.preferredChildId = null;
    return true;
  }
  const child = (node.children ?? []).find(entry => entry.id === childId);
  if (!child) return false;
  node.preferredChildId = childId;
  return true;
}

export function addChildMove(root, parentId, moveInput, { comment = '', annotations = [], preferred = false } = {}) {
  const parent = findMoveNode(root, parentId);
  if (!parent) {
    return { ok: false, reason: 'PARENT_NOT_FOUND' };
  }

  const move = {
    color: moveInput?.color === 'white' ? 'white' : 'black',
    x: Number(moveInput?.x),
    y: Number(moveInput?.y),
  };

  const boardState = rebuildBoardState(root, parent.id);
  const validation = isValidMove(boardState, move.x, move.y, move.color);
  if (!validation.valid) {
    return { ok: false, reason: validation.reason ?? 'INVALID_MOVE' };
  }

  const applied = applyMove(boardState, move.x, move.y, move.color);
  move.capture = Array.isArray(applied.captured) ? applied.captured.map(capture => ({ ...capture })) : [];

  const node = createMoveNode({
    parentId: parent.id,
    move,
    comment,
    annotations,
  });
  parent.children.push(node);
  if (preferred || !parent.preferredChildId) {
    parent.preferredChildId = node.id;
  }
  return { ok: true, node, boardState: applied.newState };
}

export function deleteMoveNode(root, nodeId) {
  if (!root || nodeId === root.id) {
    return { ok: false, reason: 'ROOT_NOT_DELETABLE' };
  }

  const parent = findMoveParent(root, nodeId);
  if (!parent) {
    return { ok: false, reason: 'NODE_NOT_FOUND' };
  }

  const index = parent.children.findIndex(child => child.id === nodeId);
  if (index === -1) {
    return { ok: false, reason: 'NODE_NOT_FOUND' };
  }

  parent.children.splice(index, 1);
  if (parent.preferredChildId === nodeId) {
    parent.preferredChildId = parent.children[0]?.id ?? null;
  }
  return { ok: true };
}
