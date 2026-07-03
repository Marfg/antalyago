export const STUDIO_VERSION = '1.0.0';

export const VALID_STATUSES = ['draft', 'review', 'approved', 'published', 'archived'];
export const DRAFT_UI_STATUSES = ['draft', 'review']; // Faz A arayüzünde seçilebilir
export const VALID_BOARD_SIZES = [9, 13, 19];
export const VALID_PLAYER_COLORS = ['black', 'white'];
export const VALID_SECTIONS = ['B1', 'B2', 'B3', 'EXTRA'];
export const VALID_PROBLEM_TYPES = ['tsumego', 'sequence', 'judgment', 'count', 'construct', 'save'];
export const VALID_DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];
export const VALID_GOALS = ['best-move', 'capture', 'save', 'count', 'judge'];
export const VALID_OUTPUTS = ['problemBank', 'lesson3d', 'sgf', 'motion', 'obsidian', 'image'];

export const SAFE_ID_RE = /^[a-z0-9](?:[a-z0-9]*(?:-[a-z0-9]+)*)?$/;

export function slugify(title) {
  if (!title || typeof title !== 'string') return '';
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ğ]/g, 'g')
    .replace(/[üü]/g, 'u')
    .replace(/[şş]/g, 's')
    .replace(/[ıi]/g, 'i')
    .replace(/[öo]/g, 'o')
    .replace(/[çc]/g, 'c')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-') || '';
}

export function createDocument(overrides = {}, { now = new Date() } = {}) {
  const ts = now instanceof Date ? now.toISOString() : String(now);
  const base = {
    studioVersion: STUDIO_VERSION,
    id: '',
    status: 'draft',
    title: '',
    slug: '',
    summary: '',
    curriculum: {
      section: null,
      lesson: '',
      step: '',
      objectives: [],
      skills: [],
      prerequisites: [],
    },
    classification: {
      problemType: 'tsumego',
      subtype: '',
      difficulty: 'beginner',
      playerToMove: 'black',
      goal: 'best-move',
    },
    board: {
      size: 9,
      turn: 'black',
      ko: null,
      stones: [],
      markers: [],
      regions: [],
      viewport: null,
    },
    solution: {
      sequences: [],
      acceptedFirstMoves: [],
      wrongMoves: [],
      hint: '',
      explanation: '',
    },
    timeline: {
      durationMs: 0,
      events: [],
    },
    sources: [],
    outputs: {
      problemBank: true,
      lesson3d: false,
      sgf: false,
      motion: false,
      obsidian: false,
      image: false,
    },
    audit: {
      createdAt: ts,
      updatedAt: ts,
      author: '',
      reviewedAt: null,
    },
    extensions: {},
  };

  const doc = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof base[key] === 'object' &&
      base[key] !== null &&
      !Array.isArray(base[key])
    ) {
      doc[key] = { ...base[key], ...value };
    } else {
      doc[key] = value;
    }
  }

  return doc;
}

export function touchUpdatedAt(doc, { now = new Date() } = {}) {
  const ts = now instanceof Date ? now.toISOString() : String(now);
  return { ...doc, audit: { ...doc.audit, updatedAt: ts } };
}

export function migrateDocument(doc) {
  if (!doc || typeof doc !== 'object') return doc;
  if (doc.studioVersion === STUDIO_VERSION) return doc;
  // Future: migration steps keyed by version
  return doc;
}
