import {
  STUDIO_VERSION,
  SAFE_ID_RE,
  VALID_STATUSES,
  VALID_BOARD_SIZES,
  VALID_PLAYER_COLORS,
  VALID_SECTIONS,
  VALID_OUTPUTS,
} from './studioDocument.js';

import {
  validateAnnotation,
  validateRawProperties,
  MAX_ANNOTATIONS_PER_NODE,
} from './moveTree.js';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

function isInt(v) { return Number.isInteger(v); }
function inBounds(x, y, size) {
  return isInt(x) && isInt(y) && x >= 0 && y >= 0 && x < size && y < size;
}

export function validateDocument(doc) {
  const errors = [];
  const warnings = [];

  if (!doc || typeof doc !== 'object') {
    return { valid: false, errors: ['Belge nesnesi yok.'], warnings: [] };
  }

  if (doc.studioVersion !== STUDIO_VERSION) {
    errors.push(`studioVersion "${doc.studioVersion}" desteklenmiyor; beklenen "${STUDIO_VERSION}".`);
  }

  if (!doc.id || typeof doc.id !== 'string') {
    errors.push('id zorunlu.');
  } else if (!SAFE_ID_RE.test(doc.id)) {
    errors.push('id: yalnızca küçük harf, rakam ve tek tire; baş ve son karakter tire olamaz.');
  }

  if (!doc.title || typeof doc.title !== 'string' || !doc.title.trim()) {
    errors.push('title zorunlu.');
  }

  if (!VALID_STATUSES.includes(doc.status)) {
    errors.push(`status geçersiz: "${doc.status}". Kabul edilenler: ${VALID_STATUSES.join(', ')}.`);
  }

  // board
  const board = doc.board;
  if (!board || typeof board !== 'object') {
    errors.push('board zorunlu.');
  } else {
    if (!VALID_BOARD_SIZES.includes(board.size)) {
      errors.push(`board.size geçersiz: ${board.size}. 9, 13 veya 19 olmalı.`);
    }
    if (!VALID_PLAYER_COLORS.includes(board.turn)) {
      errors.push(`board.turn geçersiz: "${board.turn}". "black" veya "white" olmalı.`);
    }

    const size = VALID_BOARD_SIZES.includes(board.size) ? board.size : 19;

    if (!Array.isArray(board.stones)) {
      errors.push('board.stones dizi olmalı.');
    } else {
      const occupied = new Map();
      board.stones.forEach((s, i) => {
        if (!VALID_PLAYER_COLORS.includes(s?.color)) {
          errors.push(`board.stones[${i}].color geçersiz: "${s?.color}".`);
        }
        if (!inBounds(s?.x, s?.y, size)) {
          errors.push(`board.stones[${i}] koordinatı tahta dışında: (${s?.x}, ${s?.y}).`);
        } else {
          const k = `${s.x},${s.y}`;
          if (occupied.has(k)) {
            errors.push(`board.stones: aynı noktada iki taş: (${s.x}, ${s.y}).`);
          } else {
            occupied.set(k, s.color);
          }
        }
      });

      if (board.ko !== null && board.ko !== undefined) {
        if (!inBounds(board.ko?.x, board.ko?.y, size)) {
          errors.push('board.ko koordinatı tahta dışında.');
        } else {
          const k = `${board.ko.x},${board.ko.y}`;
          if (occupied.has(k)) {
            errors.push('board.ko noktası dolu; ko boş bir nokta olmalı.');
          }
        }
      }
    }

    if (board.markers !== undefined && !Array.isArray(board.markers)) {
      errors.push('board.markers dizi olmalı.');
    } else if (Array.isArray(board.markers)) {
      board.markers.forEach((m, i) => {
        if (!inBounds(m?.x, m?.y, size)) {
          errors.push(`board.markers[${i}] koordinatı tahta dışında: (${m?.x}, ${m?.y}).`);
        }
      });
    }
  }

  if (doc.timeline !== undefined) {
    if (typeof doc.timeline?.durationMs === 'number' && doc.timeline.durationMs < 0) {
      errors.push('timeline.durationMs negatif olamaz.');
    }
  }

  if (doc.outputs !== undefined && typeof doc.outputs === 'object' && !Array.isArray(doc.outputs)) {
    for (const key of Object.keys(doc.outputs)) {
      if (!VALID_OUTPUTS.includes(key)) {
        warnings.push(`outputs.${key} tanınmayan çıktı türü.`);
      }
    }
  }

  if (doc.audit) {
    for (const field of ['createdAt', 'updatedAt']) {
      const val = doc.audit[field];
      if (val && typeof val === 'string' && !ISO_DATE_RE.test(val)) {
        errors.push(`audit.${field} geçerli ISO 8601 tarihi değil: "${val}".`);
      }
    }
    if (doc.audit.reviewedAt !== null && doc.audit.reviewedAt !== undefined) {
      if (typeof doc.audit.reviewedAt !== 'string' || !ISO_DATE_RE.test(doc.audit.reviewedAt)) {
        errors.push('audit.reviewedAt geçerli ISO 8601 tarihi değil.');
      }
    }
  }

  if (doc.curriculum?.section && !VALID_SECTIONS.includes(doc.curriculum.section)) {
    errors.push(`curriculum.section geçersiz: "${doc.curriculum.section}".`);
  }

  // moveTree annotation ve rawProperties doğrulaması
  if (doc.moveTree?.root) {
    const boardSize = VALID_BOARD_SIZES.includes(board?.size) ? board.size : 19;
    const treeErrors = _validateMoveTreeAnnotations(doc.moveTree.root, boardSize);
    for (const err of treeErrors) errors.push(err);
  }

  if (['draft', 'review'].includes(doc.status)) {
    if (!doc.curriculum?.section) warnings.push('curriculum.section belirtilmedi.');
    if (!doc.curriculum?.lesson) warnings.push('curriculum.lesson belirtilmedi.');
  }

  if (
    doc.board?.turn &&
    doc.classification?.playerToMove &&
    doc.board.turn !== doc.classification.playerToMove
  ) {
    warnings.push('board.turn ve classification.playerToMove farklı; ikisi eşleşmeli.');
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function canSaveDraft(result) {
  return result.errors.length === 0;
}

/**
 * Tüm moveTree düğümlerinin annotation ve rawProperties alanlarını doğrular.
 * Iteratif — kontrolsüz recursion içermez.
 */
function _validateMoveTreeAnnotations(root, boardSize) {
  const errors = [];
  const stack = [{ node: root, path: 'root' }];

  while (stack.length > 0) {
    const { node, path } = stack.pop();

    if (Array.isArray(node.annotations)) {
      if (node.annotations.length > MAX_ANNOTATIONS_PER_NODE) {
        errors.push(`${path}.annotations: ${node.annotations.length} annotation MAX_ANNOTATIONS_PER_NODE=${MAX_ANNOTATIONS_PER_NODE} sınırını aşıyor.`);
      }
      const ids = new Set();
      node.annotations.forEach((ann, i) => {
        const result = validateAnnotation(ann, boardSize);
        if (!result.valid) {
          errors.push(`${path}.annotations[${i}]: ${result.reason}`);
        } else if (ids.has(ann.id)) {
          errors.push(`${path}.annotations: id "${ann.id}" tekrar ediyor.`);
        } else {
          ids.add(ann.id);
        }
      });
    }

    if (node.rawProperties !== undefined) {
      const result = validateRawProperties(node.rawProperties);
      if (!result.valid) {
        errors.push(`${path}.rawProperties: ${result.reason}`);
      }
    }

    if (Array.isArray(node.children)) {
      for (let i = 0; i < node.children.length; i++) {
        stack.push({ node: node.children[i], path: `${path}.children[${i}]` });
      }
    }
  }

  return errors;
}
