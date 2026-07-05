/** AntalyaGo Problem Bank -> 3D LessonEngine adapter. */
export const LEGACY_PROBLEM_SCHEMA_VERSION = '1.0.0';
export const PROBLEM_SCHEMA_VERSION = '1.1.0';
export const SUPPORTED_PROBLEM_SCHEMA_VERSIONS = Object.freeze([
  LEGACY_PROBLEM_SCHEMA_VERSION,
  PROBLEM_SCHEMA_VERSION,
]);

export const INTERACTION_TYPES = Object.freeze([
  'point_select',
  'multi_point_select',
  'stone_select',
  'binary_judgement',
  'choice_on_board',
  'numeric_count',
  'sequence',
  'construct_shape',
  'capture_goal',
  'save_goal',
]);

export const LEGACY_STATUS_VALUES = Object.freeze([
  'raw',
  'analyzed',
  'mapped',
  'sgf_ready',
  'verified',
  'published',
  'rejected',
]);

export const CANONICAL_STATUS_VALUES = Object.freeze([
  'draft',
  'review',
  'approved',
  'published',
  'retired',
]);

export const LEGACY_TO_CANONICAL_STATUS = Object.freeze({
  raw: 'draft',
  analyzed: 'review',
  mapped: 'review',
  sgf_ready: 'approved',
  verified: 'review',
  published: 'published',
  rejected: 'retired',
});

const SIZES = new Set([9, 13, 19]);
const STAGES = new Set(['guided_practice', 'variable_practice', 'assessment', 'diagnostic']);
const COLORS = new Set(['B', 'W']);
const CANONICAL_SOURCE_TYPES = new Set(['pdf', 'sgf', 'studio', 'manual', 'web']);

const copy = value => (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)));
const isPoint = (point, size) => Boolean(point) && Number.isInteger(point.x) && Number.isInteger(point.y) && point.x >= 0 && point.y >= 0 && point.x < size && point.y < size;
const hasValue = value => value !== undefined && value !== null && String(value).trim() !== '';

function sourceIdentifier(problem) {
  const source = problem?.source || {};
  return hasValue(source.name) || hasValue(source.documentId);
}

export function canonicalProblemStatus(status) {
  if (!status) return null;
  if (CANONICAL_STATUS_VALUES.includes(status)) return status;
  return LEGACY_TO_CANONICAL_STATUS[status] || null;
}

export function provenancePolicyForStatus(status) {
  const canonical = canonicalProblemStatus(status) || status || 'draft';
  switch (canonical) {
    case 'draft':
      return {
        status: 'draft',
        require: ['source.type', 'source.identifier'],
        soft: ['source.page', 'source.usage', 'source.importedAt', 'source.hash', 'source.license', 'source.author', 'source.publication', 'source.fileRef', 'source.editorialNote', 'source.derivedFrom'],
        importedAtRequired: false,
      };
    case 'review':
      return {
        status: 'review',
        require: ['source.identifier', 'source.page'],
        soft: ['source.type', 'source.usage', 'source.importedAt', 'source.hash', 'source.license', 'source.author', 'source.publication', 'source.fileRef', 'source.editorialNote', 'source.derivedFrom'],
        importedAtRequired: false,
      };
    case 'approved':
    case 'published':
    case 'retired':
      return {
        status: canonical,
        require: ['source.type', 'source.identifier', 'source.page', 'source.usage', 'source.hash', 'source.importedAt', 'source.license'],
        soft: ['source.author', 'source.publication', 'source.fileRef', 'source.editorialNote', 'source.derivedFrom'],
        importedAtRequired: true,
      };
    default:
      return {
        status: canonical,
        require: ['source.type', 'source.identifier'],
        soft: ['source.page', 'source.usage', 'source.importedAt', 'source.hash', 'source.license', 'source.author', 'source.publication', 'source.fileRef', 'source.editorialNote', 'source.derivedFrom'],
        importedAtRequired: false,
      };
  }
}

function validateBaseProblem(problem, errors) {
  if (!problem || typeof problem !== 'object') {
    errors.push('Problem nesnesi yok.');
    return;
  }

  if (!SUPPORTED_PROBLEM_SCHEMA_VERSIONS.includes(problem.schemaVersion)) {
    errors.push(`schemaVersion ${PROBLEM_SCHEMA_VERSION} veya ${LEGACY_PROBLEM_SCHEMA_VERSION} olmalı.`);
  }

  if (!/^[a-z0-9][a-z0-9-]+$/.test(problem.id || '')) {
    errors.push('id kebab-case olmalı.');
  }

  if (!problem.title?.trim()) {
    errors.push('title zorunlu.');
  }

  if (!problem.curriculum?.chapter || !problem.curriculum?.lesson) {
    errors.push('Müfredat eşlemesi zorunlu.');
  }

  if (!STAGES.has(problem.stage)) {
    errors.push('stage geçersiz.');
  }

  if (!INTERACTION_TYPES.includes(problem.interactionType)) {
    errors.push('interactionType geçersiz.');
  }

  if (!SIZES.has(problem.board?.size)) {
    errors.push('board.size 9, 13 veya 19 olmalı.');
  }

  if (!COLORS.has(problem.board?.toPlay)) {
    errors.push('board.toPlay B veya W olmalı.');
  }

  if (!Array.isArray(problem.board?.stones)) {
    errors.push('board.stones dizi olmalı.');
  }

  const size = problem.board?.size;
  const occupied = new Set();
  for (const stone of problem.board?.stones || []) {
    if (!isPoint(stone, size)) {
      errors.push('Taş koordinatı tahta dışında.');
    }
    if (!COLORS.has(stone.color)) {
      errors.push('Taş rengi geçersiz.');
    }
    const key = `${stone.x},${stone.y}`;
    if (occupied.has(key)) {
      errors.push(`Çakışan taş: ${key}.`);
    }
    occupied.add(key);
  }

  const points = [
    ...(problem.board?.markers || []),
    ...(problem.solution?.acceptedMoves || []),
    ...(problem.goal?.targetPoints || []),
    ...(problem.goal?.targetGroup || []),
  ];
  for (const point of points) {
    if (!isPoint(point, size)) {
      errors.push('Koordinat tahta dışında.');
    }
  }

  if (!problem.solution) {
    errors.push('solution zorunlu.');
  }

  if (['point_select', 'capture_goal', 'save_goal', 'construct_shape'].includes(problem.interactionType) && !problem.solution?.acceptedMoves?.length) {
    errors.push('acceptedMoves zorunlu.');
  }

  if (problem.interactionType === 'sequence' && !problem.solution?.sequence?.length) {
    errors.push('sequence zorunlu.');
  }

  if (['binary_judgement', 'choice_on_board', 'numeric_count'].includes(problem.interactionType) && !problem.question?.options?.length) {
    errors.push('question.options zorunlu.');
  }

  if (!problem.rights?.status) {
    errors.push('rights.status zorunlu.');
  }
}

function validateLegacyProblem(problem, errors) {
  if (problem.status && !LEGACY_STATUS_VALUES.includes(problem.status)) {
    errors.push('status legacy sözleşmede geçersiz.');
  }
}

function validateCurrentProblem(problem, errors) {
  if (!Number.isInteger(problem.revision) || problem.revision < 1) {
    errors.push('revision 1.1.0 kayıtlarında zorunlu ve pozitif tam sayı olmalı.');
  }

  if (!CANONICAL_STATUS_VALUES.includes(problem.status)) {
    errors.push('status 1.1.0 kayıtlarında draft/review/approved/published/retired olmalı.');
  }

  const source = problem.source;
  if (!source || typeof source !== 'object') {
    errors.push('source 1.1.0 kayıtlarında zorunlu.');
    return;
  }

  const policy = provenancePolicyForStatus(problem.status);
  if (policy.require.includes('source.type') && !CANONICAL_SOURCE_TYPES.has(source.type)) {
    errors.push('source.type 1.1.0 kayıtlarında pdf/sgf/studio/manual/web olmalı.');
  }
  if (!sourceIdentifier(problem)) {
    errors.push('source.name veya source.documentId zorunlu.');
  }
  if (policy.require.includes('source.page') && !Number.isInteger(source.page) && !Number.isInteger(source.page)) {
    errors.push('source.page 1.1.0 kayıtlarında pozitif tam sayı olmalı.');
  }
  if (policy.require.includes('source.page') && (!Number.isInteger(source.page) || source.page < 1)) {
    errors.push('source.page 1.1.0 kayıtlarında pozitif tam sayı olmalı.');
  }
  if (policy.require.includes('source.usage') && !source.usage) {
    errors.push('source.usage 1.1.0 kayıtlarında zorunlu.');
  }
  if (policy.require.includes('source.hash') && !hasValue(source.hash)) {
    errors.push('source.hash 1.1.0 kayıtlarında zorunlu.');
  }
  if (policy.require.includes('source.importedAt') && !hasValue(source.importedAt)) {
    errors.push('source.importedAt 1.1.0 kayıtlarında zorunlu.');
  }
  if (policy.require.includes('source.license') && !hasValue(source.license)) {
    errors.push('source.license 1.1.0 kayıtlarında zorunlu.');
  }
}

export function validateProblem(problem) {
  const errors = [];
  validateBaseProblem(problem, errors);
  if (errors.length) return { valid: false, errors };
  if (problem.schemaVersion === LEGACY_PROBLEM_SCHEMA_VERSION) {
    validateLegacyProblem(problem, errors);
  } else if (problem.schemaVersion === PROBLEM_SCHEMA_VERSION) {
    validateCurrentProblem(problem, errors);
  }
  return { valid: !errors.length, errors };
}

function point(pointValue, size, transform) {
  let { x, y } = pointValue;
  const rotation = (((transform.rotate || 0) % 360) + 360) % 360;
  if (rotation === 90) [x, y] = [size - 1 - y, x];
  else if (rotation === 180) [x, y] = [size - 1 - x, size - 1 - y];
  else if (rotation === 270) [x, y] = [y, size - 1 - x];
  if (transform.mirrorX) x = size - 1 - x;
  if (transform.mirrorY) y = size - 1 - y;
  x += transform.translateX || 0;
  y += transform.translateY || 0;
  return { ...pointValue, x, y };
}

function mapFields(problem, fn) {
  const mapArray = array => (Array.isArray(array) ? array.map(fn) : array);
  problem.board.stones = mapArray(problem.board.stones);
  problem.board.markers = mapArray(problem.board.markers);
  problem.solution.acceptedMoves = mapArray(problem.solution.acceptedMoves);
  if (problem.solution.sequence) {
    problem.solution.sequence = problem.solution.sequence.map(node => ({ ...node, move: fn(node.move) }));
  }
  if (problem.goal?.targetPoints) problem.goal.targetPoints = mapArray(problem.goal.targetPoints);
  if (problem.goal?.targetGroup) problem.goal.targetGroup = mapArray(problem.goal.targetGroup);
}

export function createProblemVariant(source, transform = {}) {
  const problem = copy(source);
  const size = problem.board.size;
  mapFields(problem, value => point(value, size, transform));
  if (transform.swapColors) {
    problem.board.toPlay = problem.board.toPlay === 'B' ? 'W' : 'B';
    problem.board.stones.forEach(stone => {
      stone.color = stone.color === 'B' ? 'W' : 'B';
    });
  }
  const check = validateProblem(problem);
  if (!check.valid) throw new Error(check.errors.join(' | '));
  problem.variant = { canonicalId: source.id, ...transform };
  return problem;
}

function miniQuestion(problem) {
  return {
    text: problem.question.prompt,
    options: problem.question.options.map(option => ({
      text: option.text,
      correct: !!option.correct,
      feedback: option.feedback || (option.correct ? 'Doğru!' : 'Tekrar düşün.'),
    })),
  };
}

function sourceFromLegacy(problem, context = {}) {
  const source = copy(problem.source || {});
  const importedAt = hasValue(context.importedAt) ? context.importedAt : source.importedAt || null;
  return {
    ...source,
    type: source.type || null,
    name: source.name || source.documentId || problem.title || problem.id,
    page: Number.isInteger(source.page) ? source.page : context.page ?? null,
    importedAt,
    hash: source.hash || context.sourceHash || null,
    license: source.license || context.license || null,
  };
}

export function migrateProblemRecord(problem, context = {}) {
  const targetSchemaVersion = context.targetSchemaVersion || PROBLEM_SCHEMA_VERSION;
  const migrated = copy(problem);
  if (targetSchemaVersion === LEGACY_PROBLEM_SCHEMA_VERSION) return migrated;
  if (targetSchemaVersion !== PROBLEM_SCHEMA_VERSION) {
    throw new Error(`Desteklenmeyen schemaVersion hedefi: ${targetSchemaVersion}`);
  }
  if (migrated.schemaVersion === PROBLEM_SCHEMA_VERSION) return migrated;
  migrated.schemaVersion = PROBLEM_SCHEMA_VERSION;
  migrated.revision = Number.isInteger(migrated.revision) && migrated.revision > 0 ? migrated.revision : 1;
  migrated.status = canonicalProblemStatus(migrated.status) || 'draft';
  migrated.source = sourceFromLegacy(problem, context);
  migrated.migration = {
    ...(migrated.migration && typeof migrated.migration === 'object' ? migrated.migration : {}),
    legacyStatus: problem?.status || null,
    recordHash: hasValue(context.recordHash) ? context.recordHash : null,
  };
  return migrated;
}

export function buildProblemMigrationPlan(problem, context = {}) {
  const targetSchemaVersion = context.targetSchemaVersion || PROBLEM_SCHEMA_VERSION;
  const currentVersion = problem?.schemaVersion || null;
  const migrated = migrateProblemRecord(problem, { ...context, targetSchemaVersion });
  const validation = validateProblem(migrated);
  const policy = provenancePolicyForStatus(migrated.status);
  const source = migrated.source || {};
  const missingSourceFields = [];
  const advisorySourceFields = [];

  if (policy.require.includes('source.type') && !hasValue(source.type)) missingSourceFields.push('source.type');
  if (policy.require.includes('source.identifier') && !sourceIdentifier(migrated)) missingSourceFields.push('source.identifier');
  if (policy.require.includes('source.page') && (!Number.isInteger(source.page) || source.page < 1)) missingSourceFields.push('source.page');
  if (policy.require.includes('source.usage') && !hasValue(source.usage)) missingSourceFields.push('source.usage');
  if (policy.require.includes('source.hash') && !hasValue(source.hash)) missingSourceFields.push('source.hash');
  if (policy.require.includes('source.importedAt') && !hasValue(source.importedAt)) missingSourceFields.push('source.importedAt');
  if (policy.require.includes('source.license') && !hasValue(source.license)) missingSourceFields.push('source.license');

  if (policy.status === 'review') {
    if (!hasValue(source.type)) advisorySourceFields.push('source.type');
    if (!hasValue(source.importedAt)) advisorySourceFields.push('source.importedAt');
    if (!hasValue(source.license)) advisorySourceFields.push('source.license');
  } else if (policy.status === 'draft') {
    if (!hasValue(source.importedAt)) advisorySourceFields.push('source.importedAt');
    if (!hasValue(source.license)) advisorySourceFields.push('source.license');
  }

  const incompleteProvenance = !validation.valid && missingSourceFields.length > 0;
  const changes = [];
  if (currentVersion !== targetSchemaVersion) changes.push(`schemaVersion: ${currentVersion || 'none'} → ${targetSchemaVersion}`);
  if (!problem?.revision) changes.push('revision: eklenecek');
  const canonicalStatus = canonicalProblemStatus(problem?.status) || migrated.status;
  if (canonicalStatus && canonicalStatus !== problem?.status) changes.push(`status: ${problem.status} → ${canonicalStatus}`);
  if (missingSourceFields.length) changes.push(`source: ${missingSourceFields.join(', ')}`);
  if (advisorySourceFields.length) changes.push(`provenance-note: ${advisorySourceFields.join(', ')}`);

  return {
    problemId: problem?.id || null,
    currentVersion,
    targetVersion: targetSchemaVersion,
    canonicalStatus,
    policyStatus: migrated.status,
    legacyStatus: problem?.status || null,
    recordHash: hasValue(context.recordHash) ? context.recordHash : null,
    changes,
    missingSourceFields,
    advisorySourceFields,
    incompleteProvenance,
    migratedValid: validation.valid,
    migratedErrors: validation.errors,
    requiresHumanReview: !validation.valid,
  };
}

function stepFromProblem(problem) {
  const acceptedMoves = problem.solution.acceptedMoves || [];
  const sequence = problem.solution.sequence || [];
  const step = {
    text: `<p><strong>${problem.title}</strong></p><p>${problem.question.prompt}</p>`,
    board: problem.board.stones.map(stone => ({ color: stone.color, x: stone.x, y: stone.y })),
    markers: (problem.board.markers || []).map(pointValue => ({ ...pointValue })),
    turn: problem.board.toPlay === 'B' ? 'black' : 'white',
    size: problem.board.size,
    camera: problem.presentation?.camera,
    fb: {
      t: problem.feedback?.initial || problem.question.prompt,
      c: 'info',
    },
    fb_ok: problem.feedback?.correct || 'Doğru!',
    fb_err: problem.feedback?.incorrect || 'Bu hamle hedefi karşılamıyor.',
    problemMeta: {
      id: problem.id,
      canonicalId: problem.variant?.canonicalId || problem.id,
      schemaVersion: problem.schemaVersion,
      revision: problem.revision ?? null,
      status: problem.status ?? null,
      concepts: problem.concepts,
      curriculum: problem.curriculum,
      stage: problem.stage,
      interactionType: problem.interactionType,
      difficulty: problem.difficulty,
      source: problem.source,
      solutionTree: problem.solution.tree || null,
      terminalChecks: problem.solution.terminalChecks || [],
      hints: problem.hints || [],
    },
  };

  if (['binary_judgement', 'choice_on_board', 'numeric_count'].includes(problem.interactionType)) {
    step.auto = true;
    step.miniQuestion = miniQuestion(problem);
  } else if (problem.interactionType === 'sequence') {
    if (sequence[0]?.move) step.answer = sequence[0].move;
    step.movesAfterAnswer = sequence.slice(1).map(node => ({ color: node.color, ...node.move }));
  } else if (acceptedMoves.length === 1) {
    step.answer = acceptedMoves[0];
  } else if (acceptedMoves.length > 1) {
    step.answers = acceptedMoves;
  }

  return step;
}

export function problemToLessonStep(source, { transform = null, revealHints = false } = {}) {
  const problem = transform ? createProblemVariant(source, transform) : copy(source);
  const check = validateProblem(problem);
  if (!check.valid) {
    throw new Error(`Geçersiz problem ${problem.id}: ${check.errors.join(' | ')}`);
  }
  const step = stepFromProblem(problem);
  if (!revealHints) {
    step.problemMeta.hints = [];
  }
  return step;
}

export const buildLessonFromProblems = (problems, { id, title }) => ({
  id,
  title,
  steps: problems.map(problem => problemToLessonStep(problem)),
});

export function selectProblemEntries(index, filters = {}) {
  return (index.problems || []).filter(entry =>
    (!filters.chapter || entry.curriculum?.chapter === filters.chapter)
    && (!filters.lesson || entry.curriculum?.lesson === filters.lesson)
    && (!filters.stage || entry.stage === filters.stage)
    && (!filters.status || entry.status === filters.status)
    && (!filters.concept || (entry.concepts || []).includes(filters.concept)),
  );
}

export async function loadProblemBank(indexUrl = './content/problem-bank/index.json', fetchImpl = globalThis.fetch) {
  if (!fetchImpl) throw new Error('fetch bulunamadı.');
  const indexResponse = await fetchImpl(indexUrl);
  if (!indexResponse.ok) throw new Error(`İndeks yüklenemedi: ${indexResponse.status}`);
  const index = await indexResponse.json();
  const base = new URL(indexUrl, globalThis.location?.href || 'http://localhost/');
  const problems = [];
  for (const entry of index.problems || []) {
    const response = await fetchImpl(new URL(entry.path, base));
    if (!response.ok) throw new Error(`Problem yüklenemedi: ${entry.path}`);
    const problem = await response.json();
    const validation = validateProblem(problem);
    if (!validation.valid) throw new Error(validation.errors.join(' | '));
    problems.push(problem);
  }
  return { index, problems };
}
