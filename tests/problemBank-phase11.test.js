import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import { BoardState } from '../core/boardState.js';
import { applyMove, getGroup, getLiberties, isValidMove } from '../core/ruleEngine.js';
import { validateCandidate } from '../scripts/problem-bank/candidates.mjs';
import { buildCandidateReviewCatalog } from '../scripts/problem-bank/candidate-review-gate.mjs';
import { buildStudioDocument, exportCandidateStudioPreview } from '../scripts/problem-bank/candidate-studio-adapter.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const CATALOG_PATH = 'content/problem-bank/sources/catalog.json';
const NEW_FILES = [
  'content/problem-bank/candidates/items/candidate-fib-b2-forcing-chase-first-follow-0008.json',
  'content/problem-bank/candidates/items/candidate-fib-b2-forcing-chase-escape-line-0009.json',
];
const BASE_0008 = [
  { color: 'white', x: 4, y: 4 },
  { color: 'black', x: 3, y: 4 },
  { color: 'black', x: 4, y: 5 },
  { color: 'black', x: 6, y: 4 },
  { color: 'black', x: 5, y: 5 },
];
const BASE_0009 = [
  { color: 'white', x: 4, y: 4 },
  { color: 'black', x: 3, y: 4 },
  { color: 'black', x: 4, y: 5 },
  { color: 'black', x: 6, y: 4 },
  { color: 'black', x: 5, y: 5 },
  { color: 'black', x: 6, y: 5 },
];
const NO_MOJI_REGEX = /[\uFFFD\u00c3\u00c4\u00c5\u00d0]/;

function makeBoard(stones) {
  const board = new BoardState(9);
  for (const stone of stones) board.placeStone(stone.x, stone.y, stone.color);
  return board;
}

function groupLiberties(board, x, y) {
  const group = getGroup(board, x, y);
  return [...getLiberties(board, group)].sort();
}

async function readJson(relativePath) {
  const raw = await fs.readFile(path.join(ROOT, relativePath), 'utf8');
  return JSON.parse(raw.replace(/^\uFEFF/, ''));
}

function assertNoMojibake(candidate) {
  const text = [
    candidate.extraction?.notes,
    candidate.task?.prompt,
    candidate.task?.solution,
  ].join(' ');
  assert.equal(NO_MOJI_REGEX.test(text), false, `${candidate.candidateId} mojibake`);
  assert.equal(candidate.task.prompt.includes('ladder'), false, `${candidate.candidateId} prompt ladder leak`);
  assert.equal(candidate.task.prompt.includes('merdiven'), false, `${candidate.candidateId} prompt merdiven leak`);
}

function assertCommonCandidateShape(candidate) {
  assert.equal(candidate.status, 'needs-review');
  assert.equal(candidate.source.sourceId, 'falling-in-love-with-baduk');
  assert.equal(candidate.source.locator.type, 'pdf-page');
  assert.equal(candidate.source.locator.value, 22);
  assert.equal(candidate.source.usage, 'concept_reference');
  assert.equal(candidate.board.size, 9);
  assert.equal(candidate.rights.canPublish, false);
  assert.equal(candidate.rights.needsRightsReview, true);
  assert.ok(candidate.extraction.notes.trim().length > 0);
  assert.ok(candidate.task.prompt.trim().length > 0);
  assert.ok(candidate.task.solution.trim().length > 0);
  assert.ok(candidate.review.required === true);
  assert.ok(Array.isArray(candidate.review.checklist));
  assert.equal(candidate.curriculum.skill, 'forcing-chase');
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.error(`  ✗ ${name} — ${error.message}`);
    throw error;
  }
}

await test('0008 and 0009 validate, stay review-only, and match the forcing-chase brief', async () => {
  const catalog = JSON.parse(await fs.readFile(path.join(ROOT, CATALOG_PATH), 'utf8'));
  const reviewCatalog = await buildCandidateReviewCatalog({ rootDir: ROOT });
  for (const file of NEW_FILES) {
    const candidate = await readJson(file);
    const validation = validateCandidate(candidate, catalog);
    assert.ok(validation.valid, validation.issues.map(issue => issue.code).join(', '));
    assertCommonCandidateShape(candidate);
    assertNoMojibake(candidate);
    assert.equal(candidate.pedagogy.useCase === 'guided-practice' || candidate.pedagogy.useCase === 'drill', true);
    assert.equal(candidate.pedagogy.reviewDecision, 'keep');
    assert.ok(candidate.pedagogy.reviewNotes.trim().length > 0);
    assert.ok(reviewCatalog.reports.some(report => report.candidateId === candidate.candidateId), `${candidate.candidateId} missing from review catalog`);
  }
});

await test('0008 first follow move is legal and narrows the target group', async () => {
  const board = makeBoard(BASE_0008);
  assert.deepEqual(groupLiberties(board, 4, 4), ['4,3', '5,4']);
  assert.deepEqual(isValidMove(board, 4, 3, 'black'), { valid: true });
  const result = applyMove(board, 4, 3, 'black');
  assert.equal(result.captured.length, 0);
  assert.deepEqual(groupLiberties(result.newState, 4, 4), ['5,4']);
});

await test('0009 escape-line judgment previews safely and the follow-up line still narrows', async () => {
  const candidate = await readJson(NEW_FILES[1]);
  const doc = buildStudioDocument(candidate);
  assert.equal(doc.studioVersion, '1.1.0');
  assert.equal(doc.status, 'review');
  assert.deepEqual(Object.keys(doc.sources[0]).sort(), ['locator', 'sourceId', 'usage']);
  const preview = await exportCandidateStudioPreview({ candidateId: candidate.candidateId, rootDir: ROOT });
  assert.equal(preview.valid, true);
  assert.equal(preview.outputPath, null);
  const board = makeBoard(BASE_0009);
  const result = applyMove(board, 4, 3, 'black');
  assert.equal(result.captured.length, 0);
  assert.deepEqual(groupLiberties(result.newState, 4, 4), ['5,4']);
  assert.equal(candidate.task.expectedAnswer, true);
  assert.equal(candidate.task.answer, true);
});

await test('0006 redesign-needed stays untouched and 0007 is no longer expected', async () => {
  const c0006 = await readJson('content/problem-bank/candidates/items/candidate-fib-b2-ladder-intro-0006.json');
  let c0007Exists = true;
  try {
    await fs.access(path.join(ROOT, 'content/problem-bank/candidates/items/candidate-fib-b2-ladder-intro-0007.json'));
  } catch {
    c0007Exists = false;
  }

  assert.equal(c0006.pedagogy.reviewDecision, 'redesign');
  assert.equal(c0006.status, 'needs-review');
  assert.equal(c0007Exists, false);
});
