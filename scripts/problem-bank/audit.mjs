import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateProblem, problemToLessonStep, canonicalProblemStatus } from '../../core/problemBank.js';
import { BoardState } from '../../core/boardState.js';
import { applyMove, isValidMove } from '../../core/ruleEngine.js';
import { CURRICULUM } from '../../core/curriculum.js';
import { auditCurriculum } from '../../core/learningContext.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const DEFAULT_INDEX = 'content/problem-bank/index.json';
const DEFAULT_PROBLEM_DIR = 'content/problem-bank/problems';
const CHOICE_TYPES = new Set(['binary_judgement', 'choice_on_board', 'numeric_count']);
const COORD_RE = /\b([A-T](?:1[0-9]|[1-9]))\b|\(\s*\d+\s*,\s*\d+\s*\)/i;

const curriculumAudit = auditCurriculum(CURRICULUM);
const CONTROLLED_SKILLS = new Set(
  curriculumAudit.items.flatMap(item => item.concepts || []).filter(concept => concept && concept !== 'general_go'),
);

function countMapFrom(entries, keyOf) {
  const map = new Map();
  for (const entry of entries) {
    const key = keyOf(entry);
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()].sort(([a], [b]) => String(a).localeCompare(String(b), 'tr'));
}

function normalizeText(value) {
  return String(value ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function canonicalStatusOf(value) {
  return canonicalProblemStatus(value);
}

function issue(severity, code, problem, message, details = {}) {
  return {
    severity,
    code,
    problemId: problem?.id || null,
    file: problem?.file || null,
    field: details.field || null,
    message,
    details,
  };
}

function boardStateFromProblem(problem) {
  const board = new BoardState(problem.board.size);
  board.turn = problem.board.toPlay === 'B' ? 'black' : 'white';
  for (const stone of problem.board.stones || []) {
    board.placeStone(stone.x, stone.y, stone.color === 'B' ? 'black' : 'white');
  }
  return board;
}

function pointKey(point) {
  return point ? `${point.x},${point.y}` : null;
}

function solutionShape(problem) {
  if (problem?.solution?.tree) return 'variant_tree';
  if (Array.isArray(problem?.solution?.sequence) && problem.solution.sequence.length) return 'linear_sequence';
  if (Array.isArray(problem?.solution?.acceptedMoves) && problem.solution.acceptedMoves.length > 1) return 'multi_solution';
  if (Array.isArray(problem?.solution?.acceptedMoves) && problem.solution.acceptedMoves.length === 1) return 'single_solution';
  return 'non_actionable';
}

function collectVisiblePromptText(problem) {
  const fields = [
    problem?.question?.prompt,
    problem?.feedback?.initial,
    ...(Array.isArray(problem?.hints) ? problem.hints.flatMap(h => [h?.text, h?.note]) : []),
  ];
  return fields.map(normalizeText).filter(Boolean);
}

function detectPreAnswerReference(problem) {
  const visible = collectVisiblePromptText(problem);
  const responseType = problem?.interactionType;
  const choiceLike = CHOICE_TYPES.has(responseType) || (Array.isArray(problem?.question?.options) && problem.question.options.length > 0);
  const guidanceLevel = String(problem?.guidanceLevel || '').toLowerCase();
  const intentionalScaffold = !choiceLike && ['direct', 'constrained'].includes(guidanceLevel);
  const hits = visible.filter(text => COORD_RE.test(text));
  if (!hits.length) return null;
  if (intentionalScaffold) return { type: 'intentional_scaffold', severity: 'info', hits };
  if (choiceLike) return { type: 'coordinate_reference', severity: 'info', hits };
  return { type: 'answer_leak', severity: 'warning', hits };
}

function validateQuestionContent(problem, issues) {
  const prompt = normalizeText(problem?.question?.prompt);
  const leak = detectPreAnswerReference(problem);
  if (leak) {
    issues.push(issue(
      leak.severity,
      leak.type,
      problem,
      leak.type === 'answer_leak'
        ? 'Pre-answer metinde cevap koordinatÃƒÆ’Ã¢â‚¬ÂÃƒâ€šÃ‚Â± veya doÃƒÆ’Ã¢â‚¬ÂÃƒâ€¦Ã‚Â¸rudan yÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¶nlendirme var.'
        : leak.type === 'intentional_scaffold'
          ? 'Pre-answer koordinat referansÃƒÆ’Ã¢â‚¬ÂÃƒâ€šÃ‚Â± aÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§ÃƒÆ’Ã¢â‚¬ÂÃƒâ€šÃ‚Â±k scaffolding olarak iÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€¦Ã‚Â¸aretlendi.'
          : 'Pre-answer koordinat referansÃƒÆ’Ã¢â‚¬ÂÃƒâ€šÃ‚Â± var; soru tipi bunu answer leak yerine referans olarak sÃƒÆ’Ã¢â‚¬ÂÃƒâ€šÃ‚Â±nÃƒÆ’Ã¢â‚¬ÂÃƒâ€šÃ‚Â±flandÃƒÆ’Ã¢â‚¬ÂÃƒâ€šÃ‚Â±rÃƒÆ’Ã¢â‚¬ÂÃƒâ€šÃ‚Â±yor.',
      { field: 'question.prompt', hits: leak.hits, prompt },
    ));
  }

  const options = Array.isArray(problem?.question?.options) ? problem.question.options : [];
  if (problem?.interactionType === 'numeric_count' && options.length && !options.some(option => option.correct)) {
    issues.push(issue('error', 'QUESTION_OPTION_MISSING_CORRECT', problem, 'Numeric count sorusunda doÃƒÆ’Ã¢â‚¬ÂÃƒâ€¦Ã‚Â¸ru seÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§enek yok.', { field: 'question.options' }));
  }
}

function validateBoard(problem, issues) {
  const seen = new Set();
  for (const stone of problem.board?.stones || []) {
    const key = pointKey(stone);
    if (seen.has(key)) {
      issues.push(issue('error', 'STONE_OVERLAP', problem, `AynÃƒÆ’Ã¢â‚¬ÂÃƒâ€šÃ‚Â± konuma birden fazla taÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€¦Ã‚Â¸ yerleÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€¦Ã‚Â¸tirilmiÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€¦Ã‚Â¸: ${key}.`, { field: 'board.stones', coordinate: key }));
    }
    seen.add(key);
  }
}

function validateSolution(problem, issues) {
  const board = boardStateFromProblem(problem);
  const acceptedMoves = Array.isArray(problem?.solution?.acceptedMoves) ? problem.solution.acceptedMoves : [];
  const sequence = Array.isArray(problem?.solution?.sequence) ? problem.solution.sequence : [];
  const goal = problem?.goal || null;

  if (acceptedMoves.length) {
    let state = board;
    let captured = [];
    for (const [index, move] of acceptedMoves.entries()) {
      const color = state.turn;
      if (move?.pass) {
        issues.push(issue('warning', 'PASS_NOT_SUPPORTED', problem, 'pass biÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§imi kabul edildi ama bu kayÃƒÆ’Ã¢â‚¬ÂÃƒâ€šÃ‚Â±t iÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§in kullanÃƒÆ’Ã¢â‚¬ÂÃƒâ€šÃ‚Â±lmÃƒÆ’Ã¢â‚¬ÂÃƒâ€šÃ‚Â±yor.', { field: `solution.acceptedMoves[${index}]` }));
        continue;
      }
      const validity = isValidMove(state, move.x, move.y, color);
      if (!validity.valid) {
        issues.push(issue('error', 'ILLEGAL_SOLUTION_MOVE', problem, `ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¶zÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¼m hamlesi yasadÃƒÆ’Ã¢â‚¬ÂÃƒâ€šÃ‚Â±ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€¦Ã‚Â¸ÃƒÆ’Ã¢â‚¬ÂÃƒâ€šÃ‚Â±: ${move.x},${move.y} (${validity.reason || 'UNKNOWN'}).`, { field: `solution.acceptedMoves[${index}]`, reason: validity.reason }));
        return;
      }
      const result = applyMove(state, move.x, move.y, color);
      state = result.newState;
      captured = result.captured;
    }
    if (problem.interactionType === 'capture_goal' && goal?.targetGroup?.length) {
      const target = goal.targetGroup.map(pointKey);
      const remaining = target.filter(key => {
        const [x, y] = key.split(',').map(Number);
        return state.colorAt(x, y) !== null;
      });
      if (remaining.length) {
        issues.push(issue('error', 'CAPTURE_GOAL_NOT_SATISFIED', problem, 'ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¶zÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¼m hedef grubu tahtadan kaldÃƒÆ’Ã¢â‚¬ÂÃƒâ€šÃ‚Â±rmÃƒÆ’Ã¢â‚¬ÂÃƒâ€šÃ‚Â±yor.', { field: 'solution.acceptedMoves', remaining }));
      }
      if (!captured.length) {
        issues.push(issue('error', 'CAPTURE_NOT_PRODUCED', problem, 'ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¶zÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¼m hamlesi hiÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§ taÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€¦Ã‚Â¸ yakalamÃƒÆ’Ã¢â‚¬ÂÃƒâ€šÃ‚Â±yor.', { field: 'solution.acceptedMoves' }));
      }
    }
  }

  if (sequence.length) {
    let state = board;
    const seenCoords = new Set();
    for (const [index, node] of sequence.entries()) {
      const move = node?.move || null;
      const color = node?.color === 'W' ? 'white' : 'black';
      if (!move) {
        issues.push(issue('error', 'SEQUENCE_MOVE_MISSING', problem, 'ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¶zÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¼m dizisinde hamle dÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¼ÃƒÆ’Ã¢â‚¬ÂÃƒâ€¦Ã‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¼mÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¼ eksik.', { field: `solution.sequence[${index}]` }));
        continue;
      }
      const key = pointKey(move);
      if (seenCoords.has(key)) {
        issues.push(issue('warning', 'DUPLICATE_SOLUTION_COORDINATE', problem, `ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¶zÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¼m dizisinde aynÃƒÆ’Ã¢â‚¬ÂÃƒâ€šÃ‚Â± koordinat tekrar ediyor: ${key}.`, { field: `solution.sequence[${index}]`, coordinate: key }));
      }
      seenCoords.add(key);
      if (move.pass) {
        issues.push(issue('warning', 'PASS_NOT_SUPPORTED', problem, 'Sequence iÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§indeki pass bu fazda beklenmiyor.', { field: `solution.sequence[${index}]` }));
        continue;
      }
      const validity = isValidMove(state, move.x, move.y, color);
      if (!validity.valid) {
        issues.push(issue('error', 'ILLEGAL_SOLUTION_MOVE', problem, `Sequence hamlesi yasadÃƒÆ’Ã¢â‚¬ÂÃƒâ€šÃ‚Â±ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€¦Ã‚Â¸ÃƒÆ’Ã¢â‚¬ÂÃƒâ€šÃ‚Â±: ${move.x},${move.y} (${validity.reason || 'UNKNOWN'}).`, { field: `solution.sequence[${index}].move`, reason: validity.reason }));
        return;
      }
      const result = applyMove(state, move.x, move.y, color);
      state = result.newState;
    }
  }
}

function validateCanonicalMetadata(problem, entry, issues) {
  const canonicalStatus = canonicalStatusOf(entry?.status || problem?.status || null);
  if (!problem?.status) {
    issues.push(issue('info', 'FILE_STATUS_MISSING', problem, 'Problem dosyasÃƒÆ’Ã¢â‚¬ÂÃƒâ€šÃ‚Â±nda kanonik status alanÃƒÆ’Ã¢â‚¬ÂÃƒâ€šÃ‚Â± yok; durum index.json ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¼zerinden geliyor.', { field: 'status', legacyStatus: entry?.status || null, canonicalStatus }));
  }
  if (!problem?.revision) {
    issues.push(issue('info', 'REVISION_MISSING', problem, 'revision alanÃƒÆ’Ã¢â‚¬ÂÃƒâ€šÃ‚Â± henÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¼z yok; migration sonrasÃƒÆ’Ã¢â‚¬ÂÃƒâ€šÃ‚Â±nda eklenecek.', { field: 'revision', canonicalStatus }));
  }

  const source = problem?.source || {};
  const missingSourceFields = [];
  for (const key of ['type', 'name', 'author', 'publication', 'problemNumber', 'fileRef', 'importedAt', 'license', 'hash', 'editorialNote']) {
    if (source[key] == null || source[key] === '') missingSourceFields.push(key);
  }

  if (!source.documentId || !source.page || !source.usage) {
    issues.push(issue('warning', 'SOURCE_TRACE_INCOMPLETE', problem, 'Kaynak izi var ama asgari provenance alanlarÃƒÆ’Ã¢â‚¬ÂÃƒâ€šÃ‚Â± eksik.', { field: 'source', missing: ['documentId', 'page', 'usage'].filter(key => source[key] == null || source[key] === '') }));
  } else {
    issues.push(issue('info', 'SOURCE_PROVENANCE_PARTIAL', problem, 'Kaynak izi mevcut; canonical provenance alanlarÃƒÆ’Ã¢â‚¬ÂÃƒâ€šÃ‚Â± henÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¼z doldurulmamÃƒÆ’Ã¢â‚¬ÂÃƒâ€šÃ‚Â±ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€¦Ã‚Â¸.', { field: 'source', missing: missingSourceFields, canonicalStatus }));
  }

  if (canonicalStatus === 'published') {
    const publishedMissing = ['revision', 'status', 'source.hash', 'source.author', 'source.publication', 'source.fileRef', 'source.importedAt'];
    if (!problem?.revision || !problem?.status || missingSourceFields.length) {
      issues.push(issue('warning', 'PUBLISHED_METADATA_INCOMPLETE', problem, 'Published kayÃƒÆ’Ã¢â‚¬ÂÃƒâ€šÃ‚Â±t iÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§in beklenen alanlarÃƒÆ’Ã¢â‚¬ÂÃƒâ€šÃ‚Â±n tamamÃƒÆ’Ã¢â‚¬ÂÃƒâ€šÃ‚Â± yok.', { field: 'canonical', missing: publishedMissing.filter(item => {
        if (item === 'revision') return !problem?.revision;
        if (item === 'status') return !problem?.status;
        const key = item.split('.')[1];
        return source[key] == null || source[key] === '';
      }) }));
    }
  }
}

function analyzeProblem(problem, entry) {
  const issues = [];
  const validation = validateProblem(problem);
  if (!validation.valid) {
    issues.push(issue('error', 'SCHEMA_INVALID', problem, validation.errors.join(' | '), { field: 'schema', errors: validation.errors }));
  }

  if (problem.id !== entry.id) {
    issues.push(issue('error', 'INDEX_ID_MISMATCH', problem, `Index id (${entry.id}) ile dosya id (${problem.id}) farklÃƒÆ’Ã¢â‚¬ÂÃƒâ€šÃ‚Â±.`, { field: 'id', indexId: entry.id, fileId: problem.id }));
  }
  if ((problem.curriculum?.chapter || null) !== (entry.curriculum?.chapter || null) || (problem.curriculum?.lesson || null) !== (entry.curriculum?.lesson || null)) {
    issues.push(issue('warning', 'CURRICULUM_MISMATCH', problem, 'Index ve dosya mÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¼fredat eÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€¦Ã‚Â¸leÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€¦Ã‚Â¸mesi farklÃƒÆ’Ã¢â‚¬ÂÃƒâ€šÃ‚Â±.', { field: 'curriculum', index: entry.curriculum, file: problem.curriculum }));
  }
  if ((problem.stage || null) !== (entry.stage || null)) {
    issues.push(issue('warning', 'STAGE_MISMATCH', problem, 'Index ve dosya stage deÃƒÆ’Ã¢â‚¬ÂÃƒâ€¦Ã‚Â¸eri farklÃƒÆ’Ã¢â‚¬ÂÃƒâ€šÃ‚Â±.', { field: 'stage', index: entry.stage, file: problem.stage }));
  }
  if ((problem.interactionType || null) !== (entry.interactionType || null)) {
    issues.push(issue('warning', 'INTERACTION_MISMATCH', problem, 'Index ve dosya interactionType deÃƒÆ’Ã¢â‚¬ÂÃƒâ€¦Ã‚Â¸eri farklÃƒÆ’Ã¢â‚¬ÂÃƒâ€šÃ‚Â±.', { field: 'interactionType', index: entry.interactionType, file: problem.interactionType }));
  }
  if (JSON.stringify(problem.concepts || []) !== JSON.stringify(entry.concepts || [])) {
    issues.push(issue('warning', 'CONCEPT_MISMATCH', problem, 'Index ve dosya concept dizisi bire bir aynÃƒÆ’Ã¢â‚¬ÂÃƒâ€šÃ‚Â± deÃƒÆ’Ã¢â‚¬ÂÃƒâ€¦Ã‚Â¸il.', { field: 'concepts', index: entry.concepts || [], file: problem.concepts || [] }));
  }
  if (problem.difficulty?.authorLevel != null && entry.difficulty != null) {
    const authorLevel = problem.difficulty.authorLevel;
    const normalized = Math.max(1, Math.min(4, authorLevel));
    if (normalized !== authorLevel) {
      issues.push(issue('warning', 'DIFFICULTY_NORMALIZED', problem, 'Yazar zorluk seviyesi 1-4 aralÃƒÆ’Ã¢â‚¬ÂÃƒâ€šÃ‚Â±ÃƒÆ’Ã¢â‚¬ÂÃƒâ€¦Ã‚Â¸ÃƒÆ’Ã¢â‚¬ÂÃƒâ€šÃ‚Â±na indirgeniyor.', { field: 'difficulty.authorLevel', value: authorLevel }));
    }
  }

  validateCanonicalMetadata(problem, entry, issues);
  validateQuestionContent(problem, issues);
  validateBoard(problem, issues);
  validateSolution(problem, issues);

  let rendererCompatible = false;
  try {
    problemToLessonStep(problem);
    rendererCompatible = true;
  } catch (error) {
    issues.push(issue('error', 'RENDERER_CONVERSION_FAILED', problem, error.message, { field: 'problemToLessonStep' }));
  }

  const skillRefs = Array.isArray(problem.concepts) ? problem.concepts : [];
  const controlled = skillRefs.filter(concept => CONTROLLED_SKILLS.has(concept));
  const freeTags = skillRefs.filter(concept => !CONTROLLED_SKILLS.has(concept));

  return {
    problem,
    issues,
    valid: !issues.some(item => item.severity === 'error'),
    metrics: {
      chapter: problem.curriculum?.chapter || null,
      lesson: problem.curriculum?.lesson || null,
      stage: problem.stage || null,
      interactionType: problem.interactionType || null,
      boardSize: problem.board?.size || null,
      sourcePresent: !!problem.source,
      sourceTypePresent: !!problem.source?.type,
      sourceTracePresent: !!(problem.source?.documentId && problem.source?.page && problem.source?.usage),
      canonicalStatus: canonicalStatusOf(entry?.status || problem?.status || null),
      rendererCompatible,
      solutionShape: solutionShape(problem),
      controlledSkills: controlled,
      freeTags,
      hasSolutionTree: !!problem.solution?.tree,
      hasAnswerLeak: issues.some(item => item.code === 'ANSWER_LEAK'),
      hasCoordinateReference: issues.some(item => item.code === 'COORDINATE_REFERENCE'),
      hasIntentionalScaffold: issues.some(item => item.code === 'INTENTIONAL_SCAFFOLD'),
    },
  };
}

function sortIssues(issues) {
  const severityOrder = new Map([['error', 0], ['warning', 1], ['info', 2]]);
  return [...issues].sort((a, b) => {
    const s = (severityOrder.get(a.severity) || 9) - (severityOrder.get(b.severity) || 9);
    if (s) return s;
    const p = String(a.problemId || '').localeCompare(String(b.problemId || ''), 'tr');
    if (p) return p;
    const c = String(a.code || '').localeCompare(String(b.code || ''), 'tr');
    if (c) return c;
    return String(a.message || '').localeCompare(String(b.message || ''), 'tr');
  });
}

function summarize(records, issues, taxonomy) {
  const metrics = records.map(record => record.metrics).filter(Boolean);
  const chapterCounts = countMapFrom(metrics, row => row.chapter || 'unknown');
  const lessonCounts = countMapFrom(metrics, row => `${row.chapter || 'unknown'}/${row.lesson || 'unknown'}`);
  const stageCounts = countMapFrom(metrics, row => row.stage || 'unknown');
  const questionTypeCounts = countMapFrom(metrics, row => row.interactionType || 'unknown');
  const boardCounts = countMapFrom(metrics, row => String(row.boardSize || 'unknown'));
  const solutionShapeCounts = countMapFrom(metrics, row => row.solutionShape || 'unknown');
  const controlledSkillCounts = countMapFrom(records.flatMap(record => (record.metrics?.controlledSkills || []).map(skill => ({ skill }))), row => row.skill);
  const freeTagCounts = countMapFrom(records.flatMap(record => (record.metrics?.freeTags || []).map(tag => ({ tag }))), row => row.tag);

  return {
    totalProblems: records.length,
    validProblems: records.filter(record => record.valid).length,
    errorCount: issues.filter(issue => issue.severity === 'error').length,
    warningCount: issues.filter(issue => issue.severity === 'warning').length,
    infoCount: issues.filter(issue => issue.severity === 'info').length,
    chapterCounts,
    lessonCounts,
    stageCounts,
    questionTypeCounts,
    boardCounts,
    solutionShapeCounts,
    controlledSkillCounts,
    freeTagCounts,
    sourcePresentCount: records.filter(record => record.metrics?.sourcePresent).length,
    sourceTraceCount: records.filter(record => record.metrics?.sourceTracePresent).length,
    sourceTypeExplicitCount: records.filter(record => record.metrics?.sourceTypePresent).length,
    rendererCompatibleCount: records.filter(record => record.metrics?.rendererCompatible).length,
    answerLeakCount: records.filter(record => record.metrics?.hasAnswerLeak).length,
    coordinateReferenceCount: records.filter(record => record.metrics?.hasCoordinateReference).length,
    intentionalScaffoldCount: records.filter(record => record.metrics?.hasIntentionalScaffold).length,
    taxonomy,
  };
}

export function buildTaxonomy({ curriculum = CURRICULUM, problems = [] } = {}) {
  const chapters = curriculum.map(chapter => ({
    id: chapter.id,
    title: chapter.title,
    lessonIds: (chapter.lessons || []).map(lesson => lesson.id),
  }));
  const lessons = curriculum.flatMap(chapter => (chapter.lessons || []).map(lesson => ({
    chapterId: chapter.id,
    lessonId: lesson.id,
    title: lesson.title,
    nodeIds: [...new Set((lesson.steps || []).map(step => step?.type || step?.node || step?.stage || 'step'))],
  })));
  const questionTypes = [...new Set([
    ...problems.map(problem => problem.interactionType),
    'point_select', 'multi_point_select', 'stone_select', 'binary_judgement', 'choice_on_board', 'numeric_count', 'sequence', 'construct_shape', 'capture_goal', 'save_goal',
  ])].filter(Boolean).sort((a, b) => a.localeCompare(b, 'tr'));
  const difficultyLevels = [...new Set([
    ...problems.map(problem => problem?.difficulty?.authorLevel).filter(Number.isFinite),
    1, 2, 3, 4, 5,
  ])].filter(Number.isFinite).sort((a, b) => a - b);
  const freeTags = [...new Set(problems.flatMap(problem => (problem.concepts || []).filter(concept => !CONTROLLED_SKILLS.has(concept))))].sort((a, b) => a.localeCompare(b, 'tr'));
  return {
    chapters,
    lessons,
    skills: [...CONTROLLED_SKILLS].sort((a, b) => a.localeCompare(b, 'tr')),
    freeTags,
    questionTypes,
    difficultyLevels,
    sourceTypes: ['pdf', 'sgf', 'studio', 'manual', 'web'],
    publicationStatuses: ['draft', 'review', 'approved', 'published', 'retired'],
    rendererCapabilities: ['web-renderer', 'three-d-board', 'motion-ready', 'ag-studio-export'],
    conceptCoverage: Object.fromEntries([...CONTROLLED_SKILLS].sort().map(skill => [skill, problems.reduce((sum, problem) => sum + ((problem.concepts || []).includes(skill) ? 1 : 0), 0)])),
  };
}

export async function auditProblemBank({ rootDir = ROOT, indexPath = DEFAULT_INDEX, problemDir = DEFAULT_PROBLEM_DIR } = {}) {
  const resolvedIndex = path.resolve(rootDir, indexPath);
  const index = JSON.parse(await fs.readFile(resolvedIndex, 'utf8'));
  const records = [];
  const issues = [];
  const seenIds = new Map();
  const seenPaths = new Set();

  for (const [indexPosition, entry] of (index.problems || []).entries()) {
    const relPath = entry.path || path.posix.join(problemDir.replaceAll('\\', '/'), `${entry.id}.json`);
    const file = path.resolve(path.dirname(resolvedIndex), relPath);
    let parsed;
    try {
      parsed = JSON.parse(await fs.readFile(file, 'utf8'));
    } catch (error) {
      issues.push(issue('error', 'PROBLEM_FILE_READ_FAILED', { id: entry.id, file: relPath }, `Problem dosyasÃƒÆ’Ã¢â‚¬ÂÃƒâ€šÃ‚Â± okunamadÃƒÆ’Ã¢â‚¬ÂÃƒâ€šÃ‚Â±: ${relPath}.`, { field: 'file', path: relPath, cause: String(error.message || error) }));
      continue;
    }
    const problem = { ...parsed, file: relPath };

    if (seenIds.has(entry.id)) {
      issues.push(issue('error', 'DUPLICATE_INDEX_ID', problem, `Index iÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§inde yinelenen problem id: ${entry.id}.`, { field: 'index.problems', indexPosition }));
    }
    seenIds.set(entry.id, relPath);
    if (seenPaths.has(relPath)) {
      issues.push(issue('error', 'DUPLICATE_INDEX_PATH', problem, `Index iÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§inde yinelenen problem path: ${relPath}.`, { field: 'index.problems', indexPosition }));
    }
    seenPaths.add(relPath);

    const record = analyzeProblem(problem, entry);
    records.push(record);
    issues.push(...record.issues);
  }

  const taxonomy = buildTaxonomy({ curriculum: CURRICULUM, problems: records.map(record => record.problem) });
  const summary = summarize(records, issues, taxonomy);
  return {
    generatedAt: new Date().toISOString(),
    rootDir,
    indexPath: resolvedIndex,
    taxonomy,
    summary,
    issues: sortIssues(issues),
    problems: records.map(record => {
      const metrics = record.metrics || {};
      return {
        id: record.problem.id,
        file: record.problem.file,
        chapter: metrics.chapter || null,
        lesson: metrics.lesson || null,
        stage: metrics.stage || null,
        interactionType: metrics.interactionType || null,
        canonicalStatus: metrics.canonicalStatus || null,
        boardSize: metrics.boardSize || null,
        rendererCompatible: !!metrics.rendererCompatible,
        solutionShape: metrics.solutionShape || null,
        sourcePresent: !!metrics.sourcePresent,
        sourceTracePresent: !!metrics.sourceTracePresent,
        sourceTypePresent: !!metrics.sourceTypePresent,
        controlledSkills: metrics.controlledSkills || [],
        freeTags: metrics.freeTags || [],
        issueCount: record.issues.length,
        errorCount: record.issues.filter(item => item.severity === 'error').length,
        warningCount: record.issues.filter(item => item.severity === 'warning').length,
        infoCount: record.issues.filter(item => item.severity === 'info').length,
      };
    }),
    migration: {
      currentSchemaVersion: '1.0.0',
      proposedSchemaVersion: '1.1.0',
      compatibility: 'backward-compatible additive migration',
      steps: [
        'legacy index.json ve problem JSON birlikte okunur',
        'canonical status iÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§in legacy index status alanÃƒÆ’Ã¢â‚¬ÂÃƒâ€šÃ‚Â± kÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¶prÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¼lÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¼r',
        'revision ve provenance alanlarÃƒÆ’Ã¢â‚¬ÂÃƒâ€šÃ‚Â± eklenmeden eski kayÃƒÆ’Ã¢â‚¬ÂÃƒâ€šÃ‚Â±tlar kabul edilir',
        'Problem Bank ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ .agstudio ve .agstudio ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€Â¢ Problem Bank adaptÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¶rleri yalnÃƒÆ’Ã¢â‚¬ÂÃƒâ€šÃ‚Â±z sÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¶zleÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€¦Ã‚Â¸me olarak tanÃƒÆ’Ã¢â‚¬ÂÃƒâ€šÃ‚Â±mlanÃƒÆ’Ã¢â‚¬ÂÃƒâ€šÃ‚Â±r',
        'dry-run denetimi yeni alanlarÃƒÆ’Ã¢â‚¬ÂÃƒâ€šÃ‚Â± raporlar ama dosyalarÃƒÆ’Ã¢â‚¬ÂÃƒâ€šÃ‚Â± yazmaz',
      ],
      reversible: true,
      idempotent: true,
      dataLossRisk: 'low if legacy fields are preserved; medium if future migration drops index-only state',
    },
  };
}

function renderTextReport(report) {
  const lines = [];
  const push = (...parts) => lines.push(parts.join(''));
  push('AG-BANK Problem Audit');
  push('Root: ', report.rootDir);
  push('Index: ', report.indexPath);
  push('Generated: ', report.generatedAt);
  push('');
  push('Summary');
  push('  Problems: ', report.summary.totalProblems);
  push('  Valid: ', report.summary.validProblems);
  push('  Errors: ', report.summary.errorCount);
  push('  Warnings: ', report.summary.warningCount);
  push('  Info: ', report.summary.infoCount);
  push('  Source present: ', report.summary.sourcePresentCount, '/', report.summary.totalProblems);
  push('  Source trace present: ', report.summary.sourceTraceCount, '/', report.summary.totalProblems);
  push('  Explicit source type: ', report.summary.sourceTypeExplicitCount, '/', report.summary.totalProblems);
  push('  Renderer compatible: ', report.summary.rendererCompatibleCount, '/', report.summary.totalProblems);
  push('  Answer leak: ', report.summary.answerLeakCount);
  push('  Coordinate reference: ', report.summary.coordinateReferenceCount);
  push('  Intentional scaffold: ', report.summary.intentionalScaffoldCount);
  push('');
  push('Chapter distribution');
  for (const [name, count] of report.summary.chapterCounts) push('  ', name, ': ', count);
  push('');
  push('Lesson distribution');
  for (const [name, count] of report.summary.lessonCounts) push('  ', name, ': ', count);
  push('');
  push('Stage distribution');
  for (const [name, count] of report.summary.stageCounts) push('  ', name, ': ', count);
  push('');
  push('Question types');
  for (const [name, count] of report.summary.questionTypeCounts) push('  ', name, ': ', count);
  push('');
  push('Board sizes');
  for (const [name, count] of report.summary.boardCounts) push('  ', name, ': ', count);
  push('');
  push('Solution shapes');
  for (const [name, count] of report.summary.solutionShapeCounts) push('  ', name, ': ', count);
  push('');
  push('Controlled skills');
  for (const [name, count] of report.summary.controlledSkillCounts) push('  ', name, ': ', count);
  push('');
  push('Free tags');
  for (const [name, count] of report.summary.freeTagCounts) push('  ', name, ': ', count);
  push('');
  push('Issues');
  if (!report.issues.length) {
    push('  (none)');
  } else {
    for (const item of report.issues) {
      push('  [', item.severity.toUpperCase(), '] ', item.code, ' ', item.problemId || '(index)', ' ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ', item.message);
    }
  }
  push('');
  push('Migration plan');
  push('  Current schema: ', report.migration.currentSchemaVersion);
  push('  Proposed schema: ', report.migration.proposedSchemaVersion);
  for (const step of report.migration.steps) push('  - ', step);
  return lines.join('\n');
}

export async function main(argv = process.argv.slice(2)) {
  const rootArg = argv.find(arg => arg.startsWith('--root='));
  const json = argv.includes('--json') || argv.includes('--format=json');
  const rootDir = rootArg ? path.resolve(process.cwd(), rootArg.slice('--root='.length)) : ROOT;
  const report = await auditProblemBank({ rootDir });
  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(renderTextReport(report));
  }
  const errorCount = report.issues.filter(issue => issue.severity === 'error').length;
  if (errorCount) process.exitCode = 1;
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
