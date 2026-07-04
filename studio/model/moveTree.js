import { BoardState } from '../../core/boardState.js';
import { applyMove, isValidMove } from '../../core/ruleEngine.js';

// ── Sabitler ──────────────────────────────────────────────────────────

export const ANNOTATION_TYPES = Object.freeze([
  'triangle', 'square', 'circle', 'cross', 'selected',
  'label', 'arrow', 'line', 'region',
]);

export const POINT_ANNOTATION_TYPES = Object.freeze([
  'triangle', 'square', 'circle', 'cross', 'selected',
]);

export const EDGE_ANNOTATION_TYPES = Object.freeze(['arrow', 'line']);

// SGF eşlemeleri: triangle→TR, square→SQ, circle→CR, cross→MA,
// selected→SL, label→LB, arrow→AR, line→LN

export const ANNOTATION_LABEL_MAX_LENGTH = 64;
export const MAX_ANNOTATIONS_PER_NODE = 100;
export const MAX_TREE_NODES = 2000;
export const MAX_TREE_DEPTH = 500;
export const MAX_RAW_PROPERTIES_PER_NODE = 50;
export const MAX_RAW_PROP_VALUES = 200;
export const MAX_RAW_PROP_VALUE_LENGTH = 4096;

// SGF property key: UcLetter { UcLetter } — 1-8 büyük harf/rakam
const RAW_PROP_KEY_RE = /^[A-Z][A-Z0-9]{0,7}$/;

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

// Dahili (underscore-önekli) rawProperties allowlist.
// Bu anahtarlar SGF formatına uymaz ve hiçbir zaman SGF'ye export edilmez.
// Yeni dahili anahtarlar buraya açıkça eklenmeli — serbestçe kabul etme.
export const INTERNAL_RAW_PROP_ALLOWLIST = Object.freeze(new Map([
  ['_LEGACY_ANNOTATIONS', { maxValues: 500, maxValueLength: 1024 }],
]));

// Her tip için izin verilen alan kümesi (strict field validation)
const _ANNOTATION_ALLOWED_FIELDS = {
  triangle: new Set(['id', 'type', 'point']),
  square:   new Set(['id', 'type', 'point']),
  circle:   new Set(['id', 'type', 'point']),
  cross:    new Set(['id', 'type', 'point']),
  selected: new Set(['id', 'type', 'point']),
  label:    new Set(['id', 'type', 'point', 'text']),
  arrow:    new Set(['id', 'type', 'from', 'to']),
  line:     new Set(['id', 'type', 'from', 'to']),
  region:   new Set(['id', 'type', 'points']),
};

// ── ID üreticiler ─────────────────────────────────────────────────────

let nodeCounter = 0;
let annotationCounter = 0;

function nextNodeId() {
  nodeCounter += 1;
  return `node-${nodeCounter}`;
}

function nextAnnotationId() {
  annotationCounter += 1;
  return `ann-${annotationCounter}`;
}

// ── Yardımcılar ───────────────────────────────────────────────────────

function clone(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

function isValidPoint(p, size) {
  return (
    p !== null &&
    p !== undefined &&
    typeof p === 'object' &&
    Number.isInteger(p.x) &&
    Number.isInteger(p.y) &&
    p.x >= 0 &&
    p.y >= 0 &&
    p.x < size &&
    p.y < size
  );
}

// ── rawProperties doğrulama ──────────────────────────────────────────

/**
 * rawProperties nesnesini doğrular.
 *
 * Anahtar kuralları:
 *   '_' önekli → yalnız INTERNAL_RAW_PROP_ALLOWLIST'te tanımlı isimler kabul
 *                edilir; bilinmeyen dahili anahtarlar UNKNOWN_INTERNAL_KEY hatası verir.
 *   Diğerleri  → SGF identifier: [A-Z][A-Z0-9]{0,7}
 *
 * Tüm anahtarlar (dahili dahil) için değerler string[] olarak doğrulanır.
 * Prototip zehirleme vektörleri reddedilir.
 *
 * 'rawProperties' adı seçildi (sgfProperties yerine): bu alan yalnızca
 * SGF'ye değil, gelecekteki harici formatlara da hizmet edebilir.
 *
 * @param {object} raw
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validateRawProperties(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { valid: false, reason: 'RAW_PROPS_NOT_OBJECT' };
  }

  const keys = Object.keys(raw);

  if (keys.length > MAX_RAW_PROPERTIES_PER_NODE) {
    return { valid: false, reason: 'TOO_MANY_RAW_PROPERTIES' };
  }

  for (const key of keys) {
    if (DANGEROUS_KEYS.has(key)) {
      return { valid: false, reason: `DANGEROUS_PROPERTY_KEY:${key}` };
    }

    if (key.startsWith('_')) {
      // Allowlist dışı dahili anahtar → reddet
      if (!INTERNAL_RAW_PROP_ALLOWLIST.has(key)) {
        return { valid: false, reason: `UNKNOWN_INTERNAL_KEY:${key}` };
      }
      // Dahili anahtarlar da string[] olarak doğrulanır (tip+limit)
      const limits = INTERNAL_RAW_PROP_ALLOWLIST.get(key);
      const vals = raw[key];
      if (!Array.isArray(vals)) {
        return { valid: false, reason: `RAW_PROP_VALUES_NOT_ARRAY:${key}` };
      }
      if (vals.length > limits.maxValues) {
        return { valid: false, reason: `TOO_MANY_RAW_PROP_VALUES:${key}` };
      }
      for (const v of vals) {
        if (typeof v !== 'string') {
          return { valid: false, reason: `RAW_PROP_VALUE_NOT_STRING:${key}` };
        }
        if (v.length > limits.maxValueLength) {
          return { valid: false, reason: `RAW_PROP_VALUE_TOO_LONG:${key}` };
        }
      }
      continue;
    }

    if (!RAW_PROP_KEY_RE.test(key)) {
      return { valid: false, reason: `INVALID_RAW_PROP_KEY:${key}` };
    }

    const values = raw[key];

    if (!Array.isArray(values)) {
      return { valid: false, reason: `RAW_PROP_VALUES_NOT_ARRAY:${key}` };
    }

    if (values.length > MAX_RAW_PROP_VALUES) {
      return { valid: false, reason: `TOO_MANY_RAW_PROP_VALUES:${key}` };
    }

    for (const value of values) {
      if (typeof value !== 'string') {
        return { valid: false, reason: `RAW_PROP_VALUE_NOT_STRING:${key}` };
      }
      if (value.length > MAX_RAW_PROP_VALUE_LENGTH) {
        return { valid: false, reason: `RAW_PROP_VALUE_TOO_LONG:${key}` };
      }
    }
  }

  return { valid: true };
}

/**
 * SGF exporter sözleşmesi: verilen rawProperties anahtarının SGF dosyasına
 * yazılıp yazılmaması gerektiğini döner.
 *
 * Kural:
 *   true  → geçerli SGF identifier ([A-Z][A-Z0-9]{0,7}) — export edilir
 *   false → dahili anahtar ('_' öneki), tehlikeli anahtar veya geçersiz format
 *
 * Gelecekteki serializeSgf() her rawProperties anahtarını bu fonksiyondan
 * geçirmeli; false dönen anahtarları çıktıya yazmamalıdır.
 *
 * @param {string} key
 * @returns {boolean}
 */
export function isExportableSgfProperty(key) {
  if (typeof key !== 'string') return false;
  if (DANGEROUS_KEYS.has(key)) return false;
  return RAW_PROP_KEY_RE.test(key);
}

// ── Annotation doğrulama ─────────────────────────────────────────────

/**
 * Typed annotation nesnesini doğrular.
 *
 * Zorunlu: id (string, boş olmayan), type (ANNOTATION_TYPES içinde).
 * Tipe özgü olmayan ekstra alanlar reddedilir (strict).
 *
 * @param {object} ann
 * @param {number} boardSize  — 9 | 13 | 19
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validateAnnotation(ann, boardSize = 19) {
  if (!ann || typeof ann !== 'object') {
    return { valid: false, reason: 'ANNOTATION_NOT_OBJECT' };
  }

  if (typeof ann.id !== 'string' || !ann.id.trim()) {
    return { valid: false, reason: 'ANNOTATION_ID_MISSING' };
  }

  const { type } = ann;

  if (!ANNOTATION_TYPES.includes(type)) {
    return { valid: false, reason: `UNKNOWN_ANNOTATION_TYPE:${type}` };
  }

  // Ekstra alan kontrolü
  const allowed = _ANNOTATION_ALLOWED_FIELDS[type];
  for (const key of Object.keys(ann)) {
    if (!allowed.has(key)) {
      return { valid: false, reason: `UNEXPECTED_FIELD:${key}` };
    }
  }

  if (POINT_ANNOTATION_TYPES.includes(type)) {
    if (!isValidPoint(ann.point, boardSize)) {
      return { valid: false, reason: 'INVALID_POINT' };
    }
    return { valid: true };
  }

  if (type === 'label') {
    if (!isValidPoint(ann.point, boardSize)) {
      return { valid: false, reason: 'INVALID_POINT' };
    }
    if (typeof ann.text !== 'string' || !ann.text.trim()) {
      return { valid: false, reason: 'EMPTY_LABEL_TEXT' };
    }
    if (ann.text.length > ANNOTATION_LABEL_MAX_LENGTH) {
      return { valid: false, reason: 'LABEL_TOO_LONG' };
    }
    return { valid: true };
  }

  if (type === 'arrow' || type === 'line') {
    if (!isValidPoint(ann.from, boardSize)) {
      return { valid: false, reason: 'INVALID_FROM_POINT' };
    }
    if (!isValidPoint(ann.to, boardSize)) {
      return { valid: false, reason: 'INVALID_TO_POINT' };
    }
    if (ann.from.x === ann.to.x && ann.from.y === ann.to.y) {
      return { valid: false, reason: 'EDGE_SAME_START_END' };
    }
    return { valid: true };
  }

  if (type === 'region') {
    if (!Array.isArray(ann.points) || ann.points.length === 0) {
      return { valid: false, reason: 'REGION_NO_POINTS' };
    }
    for (const p of ann.points) {
      if (!isValidPoint(p, boardSize)) {
        return { valid: false, reason: 'REGION_INVALID_POINT' };
      }
    }
    return { valid: true };
  }

  return { valid: false, reason: `UNHANDLED_TYPE:${type}` };
}

/**
 * Annotation nesnesi üretir; `id` yoksa otomatik atanır.
 * Doğrulama YAPMAZ — `validateAnnotation` çağıran sorumluluğundadır.
 */
export function createAnnotation(overrides = {}) {
  const ann = clone(overrides) ?? {};
  if (!ann.id) ann.id = nextAnnotationId();
  return ann;
}

// ── Board snapshot ────────────────────────────────────────────────────

export function cloneBoardSnapshot(board = {}) {
  const snapshot = clone(board) ?? {};
  snapshot.size = Number.isInteger(snapshot.size) ? snapshot.size : 9;
  snapshot.turn = snapshot.turn === 'white' ? 'white' : 'black';
  snapshot.ko = snapshot.ko ? { x: snapshot.ko.x, y: snapshot.ko.y } : null;
  snapshot.stones = Array.isArray(snapshot.stones) ? snapshot.stones.map(s => ({ ...s })) : [];
  snapshot.markers = Array.isArray(snapshot.markers) ? snapshot.markers.map(m => ({ ...m })) : [];
  snapshot.regions = Array.isArray(snapshot.regions) ? snapshot.regions.map(r => clone(r)) : [];
  snapshot.viewport = snapshot.viewport ? clone(snapshot.viewport) : null;
  return snapshot;
}

// ── Düğüm normalizasyon ───────────────────────────────────────────────

/**
 * Tek düğümü normalize eder.
 * String annotation'lar rawProperties._LEGACY_ANNOTATIONS'a taşınır.
 * Veri kaybı olmaz. Çocukları işlemez.
 */
function _ensureNodeDefaults(node) {
  if (!node || typeof node !== 'object') return;

  if (!Array.isArray(node.children)) node.children = [];
  if (node.comment === undefined) node.comment = '';
  if (node.preferredChildId === undefined) node.preferredChildId = null;

  if (!node.rawProperties || typeof node.rawProperties !== 'object' || Array.isArray(node.rawProperties)) {
    node.rawProperties = {};
  }

  if (!Array.isArray(node.annotations)) {
    node.annotations = [];
  } else {
    const typed = [];
    const legacyStrings = [];
    for (const ann of node.annotations) {
      if (typeof ann === 'string') {
        if (ann.trim()) legacyStrings.push(ann.trim());
      } else if (ann && typeof ann === 'object') {
        if (!ann.id) {
          annotationCounter++;
          ann.id = `ann-${annotationCounter}`;
        }
        typed.push(ann);
      }
    }
    node.annotations = typed;
    if (legacyStrings.length > 0) {
      const existing = Array.isArray(node.rawProperties._LEGACY_ANNOTATIONS)
        ? node.rawProperties._LEGACY_ANNOTATIONS
        : [];
      node.rawProperties._LEGACY_ANNOTATIONS = [...existing, ...legacyStrings];
    }
  }
}

// ── Düğüm fabrikası ───────────────────────────────────────────────────

/**
 * MoveNode üretir.
 *
 * move canonical biçimleri:
 *   Normal hamle: { color, x, y, capture? }
 *   Pass hamlesi: { color, pass: true }
 *   Kök düğüm:   null
 *
 * rawProperties: harici format property'lerini kayıpsız korur.
 */
export function createMoveNode(overrides = {}) {
  const typedAnnotations = [];
  const legacyStrings = [];
  for (const ann of Array.isArray(overrides.annotations) ? overrides.annotations : []) {
    if (typeof ann === 'string') {
      if (ann.trim()) legacyStrings.push(ann.trim());
    } else if (ann && typeof ann === 'object') {
      typedAnnotations.push(clone(ann));
    }
  }

  const rawProps = overrides.rawProperties &&
    typeof overrides.rawProperties === 'object' &&
    !Array.isArray(overrides.rawProperties)
    ? clone(overrides.rawProperties)
    : {};

  if (legacyStrings.length > 0) {
    const existing = Array.isArray(rawProps._LEGACY_ANNOTATIONS) ? rawProps._LEGACY_ANNOTATIONS : [];
    rawProps._LEGACY_ANNOTATIONS = [...existing, ...legacyStrings];
  }

  return {
    id: overrides.id ?? nextNodeId(),
    parentId: overrides.parentId ?? null,
    move: overrides.move ? clone(overrides.move) : null,
    children: Array.isArray(overrides.children) ? overrides.children : [],
    comment: typeof overrides.comment === 'string' ? overrides.comment : '',
    annotations: typedAnnotations,
    rawProperties: rawProps,
    preferredChildId: overrides.preferredChildId ?? null,
    formation: overrides.formation ? cloneBoardSnapshot(overrides.formation) : null,
  };
}

// ── Ağaç kurucusu ─────────────────────────────────────────────────────

export function createMoveTree(board = {}, legacyMoves = []) {
  const root = createMoveNode({
    id: 'root',
    parentId: null,
    move: null,
    comment: '',
    annotations: [],
    rawProperties: {},
    preferredChildId: null,
    formation: cloneBoardSnapshot(board),
  });

  let cursor = root;
  let state = createBoardStateFromSnapshot(root.formation);

  for (const legacyMove of Array.isArray(legacyMoves) ? legacyMoves : []) {
    if (!legacyMove || typeof legacyMove !== 'object') continue;

    const isPass = legacyMove.pass === true;
    if (!isPass && (!Number.isInteger(legacyMove.x) || !Number.isInteger(legacyMove.y))) continue;

    const color = legacyMove.color === 'white' ? 'white' : 'black';

    if (isPass) {
      const move = { color, pass: true };
      const child = createMoveNode({
        parentId: cursor.id,
        move,
        comment: typeof legacyMove.annotation === 'string' ? legacyMove.annotation : '',
        annotations: Array.isArray(legacyMove.annotations) ? legacyMove.annotations.slice() : [],
        rawProperties: legacyMove.rawProperties ?? {},
      });
      cursor.children.push(child);
      if (!cursor.preferredChildId) cursor.preferredChildId = child.id;
      cursor = child;
      const next = state.clone();
      next.turn = state.turn === 'black' ? 'white' : 'black';
      next.koPoint = null;
      state = next;
    } else {
      const move = { ...legacyMove, color };
      const result = applyMove(state, move.x, move.y, move.color);
      if (!result?.newState) continue;

      const child = createMoveNode({
        parentId: cursor.id,
        move,
        comment: typeof legacyMove.annotation === 'string' ? legacyMove.annotation : '',
        annotations: Array.isArray(legacyMove.annotations) ? legacyMove.annotations.slice() : [],
        rawProperties: legacyMove.rawProperties ?? {},
      });

      if (Array.isArray(result.captured) && result.captured.length && child.move && child.move.capture === undefined) {
        child.move.capture = result.captured.map(c => ({ ...c }));
      }

      cursor.children.push(child);
      if (!cursor.preferredChildId) cursor.preferredChildId = child.id;
      cursor = child;
      state = result.newState;
    }
  }

  return {
    root,
    activeNodeId: cursor.id,
    preferredChildId: root.preferredChildId ?? null,
  };
}

// ── Belge geçiş ───────────────────────────────────────────────────────

export function ensureMoveTreeDocument(doc) {
  if (!doc || typeof doc !== 'object') return doc;

  const existingTree = doc.moveTree && typeof doc.moveTree === 'object' ? doc.moveTree : null;
  const generatedTree = createMoveTree(doc.board ?? {}, doc.moves ?? []);
  const root = existingTree?.root && typeof existingTree.root === 'object'
    ? existingTree.root
    : generatedTree.root;

  // Tüm düğümleri iteratif normalize et (kontrolsüz recursion yok)
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    _ensureNodeDefaults(node);
    if (Array.isArray(node.children)) {
      for (const child of node.children) stack.push(child);
    }
  }

  if (!root.formation) {
    root.formation = cloneBoardSnapshot(doc.board ?? {});
  }

  doc.moveTree = {
    root,
    activeNodeId: existingTree?.activeNodeId ?? generatedTree.activeNodeId ?? doc.activeNodeId ?? 'root',
    preferredChildId: existingTree?.preferredChildId ?? root.preferredChildId ?? generatedTree.preferredChildId ?? null,
  };
  doc.activeNodeId = doc.moveTree.activeNodeId;

  if (!Array.isArray(doc.moves) || doc.moves.length === 0) {
    doc.moves = serializeMainlineMoves(doc.moveTree.root);
  }

  return doc;
}

// ── Ağaç gezinme — iteratif ───────────────────────────────────────────

export function findMoveNode(root, nodeId) {
  if (!root || !nodeId) return null;
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node.id === nodeId) return node;
    if (Array.isArray(node.children)) {
      for (let i = node.children.length - 1; i >= 0; i--) {
        stack.push(node.children[i]);
      }
    }
  }
  return null;
}

export function findMoveParent(root, nodeId) {
  if (!root || !nodeId || nodeId === root.id) return null;
  const stack = [{ node: root, parent: null }];
  while (stack.length > 0) {
    const { node, parent } = stack.pop();
    if (node.id === nodeId) return parent;
    if (Array.isArray(node.children)) {
      for (let i = node.children.length - 1; i >= 0; i--) {
        stack.push({ node: node.children[i], parent: node });
      }
    }
  }
  return null;
}

/**
 * Kökten verilen düğüme yolu döndürür.
 * Düğüm haritası ile O(n) — recursion içermez.
 */
export function getMovePath(root, nodeId) {
  if (!root || !nodeId) return [];

  const nodeMap = new Map();
  const buildStack = [root];
  while (buildStack.length > 0) {
    const node = buildStack.pop();
    nodeMap.set(node.id, node);
    if (Array.isArray(node.children)) {
      for (const child of node.children) buildStack.push(child);
    }
  }

  const path = [];
  let current = nodeMap.get(nodeId);
  const seen = new Set();
  while (current) {
    if (seen.has(current.id)) break;
    seen.add(current.id);
    path.unshift(current);
    if (!current.parentId) break;
    current = nodeMap.get(current.parentId);
  }

  return path;
}

/** Toplam düğüm sayısı — iteratif. */
export function countTreeNodes(root) {
  if (!root) return 0;
  let count = 0;
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    count++;
    if (Array.isArray(node.children)) {
      for (const child of node.children) stack.push(child);
    }
  }
  return count;
}

// ── Tahta yeniden kurma ───────────────────────────────────────────────

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
    if (move.pass) {
      const next = state.clone();
      next.turn = state.turn === 'black' ? 'white' : 'black';
      next.koPoint = null;
      state = next;
    } else {
      const result = applyMove(state, move.x, move.y, move.color);
      state = result.newState;
    }
  }

  return state;
}

// ── Ana hat serileştirme ──────────────────────────────────────────────

export function serializeMainlineMoves(root) {
  const moves = [];
  let cursor = root;
  const seen = new Set(['root']);

  while (cursor?.children?.length) {
    const preferred = cursor.children.find(c => c.id === cursor.preferredChildId) ?? cursor.children[0];
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

// ── Düğüm güncelleme ─────────────────────────────────────────────────

export function setMoveNodeComment(root, nodeId, comment) {
  const node = findMoveNode(root, nodeId);
  if (!node) return false;
  node.comment = String(comment ?? '');
  return true;
}

/**
 * Düğümün annotation listesini değiştirir.
 *
 * Sözleşme:
 *   - String annotation'lar kabul edilmez → false döner.
 *     (Göç: ensureMoveTreeDocument string'leri rawProperties._LEGACY_ANNOTATIONS'a taşır.)
 *   - id zorunlu; eksikse otomatik atanır.
 *   - Düğüm içinde id benzersiz olmalı.
 *   - Tipe özgü olmayan ekstra alanlar validateAnnotation tarafından reddedilir.
 *   - MAX_ANNOTATIONS_PER_NODE aşılırsa false döner.
 *
 * @returns {boolean}
 */
export function setMoveNodeAnnotations(root, nodeId, annotations, boardSize = 19) {
  const node = findMoveNode(root, nodeId);
  if (!node) return false;

  if (!Array.isArray(annotations)) {
    node.annotations = [];
    return true;
  }

  if (annotations.some(ann => typeof ann === 'string')) {
    return false; // LEGACY_STRING_ANNOTATION
  }

  if (annotations.length > MAX_ANNOTATIONS_PER_NODE) {
    return false;
  }

  const typed = [];
  const ids = new Set();

  for (const raw of annotations) {
    if (!raw || typeof raw !== 'object') return false;

    const ann = raw.id ? raw : { ...raw, id: nextAnnotationId() };

    const result = validateAnnotation(ann, boardSize);
    if (!result.valid) return false;

    if (ids.has(ann.id)) return false; // benzersizlik ihlali
    ids.add(ann.id);

    typed.push(clone(ann));
  }

  node.annotations = typed;
  return true;
}

/**
 * Düğümün rawProperties alanını doğrulayarak günceller.
 *
 * @returns {boolean}
 */
export function setMoveNodeRawProperties(root, nodeId, rawProperties) {
  const node = findMoveNode(root, nodeId);
  if (!node) return false;
  if (!rawProperties || typeof rawProperties !== 'object' || Array.isArray(rawProperties)) return false;

  const validation = validateRawProperties(rawProperties);
  if (!validation.valid) return false;

  node.rawProperties = clone(rawProperties);
  return true;
}

export function setPreferredChild(root, nodeId, childId) {
  const node = findMoveNode(root, nodeId);
  if (!node) return false;
  if (childId === null) {
    node.preferredChildId = null;
    return true;
  }
  const child = (node.children ?? []).find(e => e.id === childId);
  if (!child) return false;
  node.preferredChildId = childId;
  return true;
}

// ── Hamle ekleme ─────────────────────────────────────────────────────

/**
 * Parent düğüme yeni hamle ekler.
 *
 * moveInput:
 *   Normal:  { color, x, y }
 *   Pass:    { color, pass: true }
 *
 * Limitler: MAX_TREE_NODES, MAX_TREE_DEPTH
 *
 * @returns {{ ok, reason?, node?, boardState? }}
 */
export function addChildMove(root, parentId, moveInput, {
  comment = '',
  annotations = [],
  rawProperties = {},
  preferred = false,
  boardSize = 19,
} = {}) {
  const parent = findMoveNode(root, parentId);
  if (!parent) {
    return { ok: false, reason: 'PARENT_NOT_FOUND' };
  }

  if (countTreeNodes(root) >= MAX_TREE_NODES) {
    return { ok: false, reason: 'TREE_NODE_LIMIT_EXCEEDED' };
  }

  const path = getMovePath(root, parentId);
  if (path.length >= MAX_TREE_DEPTH) {
    return { ok: false, reason: 'TREE_DEPTH_LIMIT_EXCEEDED' };
  }

  const color = moveInput?.color === 'white' ? 'white' : 'black';

  // ── Pass ─────────────────────────────────────────────────────────
  if (moveInput?.pass === true) {
    const passMove = { color, pass: true };
    const node = createMoveNode({ parentId: parent.id, move: passMove, comment, annotations, rawProperties });
    parent.children.push(node);
    if (preferred || !parent.preferredChildId) parent.preferredChildId = node.id;
    const currentState = rebuildBoardState(root, parent.id);
    const nextState = currentState.clone();
    nextState.turn = currentState.turn === 'black' ? 'white' : 'black';
    nextState.koPoint = null;
    return { ok: true, node, boardState: nextState };
  }

  // ── Normal ───────────────────────────────────────────────────────
  const move = { color, x: Number(moveInput?.x), y: Number(moveInput?.y) };
  const boardState = rebuildBoardState(root, parent.id);
  const validation = isValidMove(boardState, move.x, move.y, move.color);
  if (!validation.valid) {
    return { ok: false, reason: validation.reason ?? 'INVALID_MOVE' };
  }

  const applied = applyMove(boardState, move.x, move.y, move.color);
  move.capture = Array.isArray(applied.captured) ? applied.captured.map(c => ({ ...c })) : [];

  const node = createMoveNode({ parentId: parent.id, move, comment, annotations, rawProperties });
  parent.children.push(node);
  if (preferred || !parent.preferredChildId) parent.preferredChildId = node.id;
  return { ok: true, node, boardState: applied.newState };
}

/**
 * Pass hamlesi ekleme kolaylık fonksiyonu.
 */
export function addPassMove(root, parentId, color, options = {}) {
  return addChildMove(root, parentId, { color, pass: true }, options);
}

// ── Düğüm silme ───────────────────────────────────────────────────────

export function deleteMoveNode(root, nodeId) {
  if (!root || nodeId === root.id) {
    return { ok: false, reason: 'ROOT_NOT_DELETABLE' };
  }

  const parent = findMoveParent(root, nodeId);
  if (!parent) {
    return { ok: false, reason: 'NODE_NOT_FOUND' };
  }

  const index = parent.children.findIndex(c => c.id === nodeId);
  if (index === -1) {
    return { ok: false, reason: 'NODE_NOT_FOUND' };
  }

  parent.children.splice(index, 1);
  if (parent.preferredChildId === nodeId) {
    parent.preferredChildId = parent.children[0]?.id ?? null;
  }
  return { ok: true };
}
