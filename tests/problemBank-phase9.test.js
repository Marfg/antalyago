import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { auditCandidateCatalog, validateCandidate } from '../scripts/problem-bank/candidates.mjs';
import { buildCandidateReviewCatalog, buildCandidatePromotionReport } from '../scripts/problem-bank/candidate-review-gate.mjs';
import { buildStudioDocument, exportCandidateStudioPreview } from '../scripts/problem-bank/candidate-studio-adapter.mjs';
import { validateDocument } from '../studio/model/validation.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const EXAMPLE_FILE = 'content/problem-bank/candidates/items/example-falling-in-love-with-baduk-b1-l2-liberty-001.json';
const PHASE9_FILES = [
  'content/problem-bank/candidates/items/candidate-fib-b1-liberty-count-0002.json',
  'content/problem-bank/candidates/items/candidate-fib-b1-capture-0003.json',
  'content/problem-bank/candidates/items/candidate-fib-b2-atari-0004.json',
  'content/problem-bank/candidates/items/candidate-fib-b2-connect-cut-0005.json',
  'content/problem-bank/candidates/items/candidate-fib-b2-ladder-intro-0006.json',
];
const PHASE9_IDS = PHASE9_FILES.map(file => path.basename(file, '.json'));
const CATALOG_PATH = 'content/problem-bank/sources/catalog.json';
const TURKISH_VISIBLE_WORDS = ['K\u00f6\u015fe', 'ta\u015f', 'nefes', 'kesi\u015fim', 'A\u015fa\u011f\u0131daki', 'g\u00fcvenli', 'Ka\u00e7\u0131\u015f\u0131'];
const NO_MOJI_REGEX = /[\uFFFD\u00c3\u00c4\u00c5\u00d0]/;
const REQUIRED_KEYWORDS = {
  'candidate-fib-b1-liberty-count-0002': ['K\u00f6\u015fe', 'ta\u015f', 'nefes'],
  'candidate-fib-b1-capture-0003': ['ta\u015f', 'nefes', 'yakala'],
  'candidate-fib-b2-atari-0004': ['A\u015fa\u011f\u0131daki', 'nefes'],
  'candidate-fib-b2-connect-cut-0005': ['g\u00fcvenli', 'kesi\u015fim'],
  'candidate-fib-b2-ladder-intro-0006': ['Ka\u00e7\u0131\u015f\u0131', 'devam'],
};
const EXPECTED_PEDAGOGY = {
  'candidate-fib-b1-liberty-count-0002': {
    useCase: 'intro-card',
    difficulty: 'intro',
    reviewDecision: 'keep',
  },
  'candidate-fib-b1-capture-0003': {
    useCase: 'guided-practice',
    difficulty: 'intro',
    reviewDecision: 'keep',
  },
  'candidate-fib-b2-atari-0004': {
    useCase: 'guided-practice',
    difficulty: 'easy',
    reviewDecision: 'keep',
  },
  'candidate-fib-b2-connect-cut-0005': {
    useCase: 'guided-practice',
    difficulty: 'easy',
    reviewDecision: 'keep',
  },
  'candidate-fib-b2-ladder-intro-0006': {
    useCase: 'redesign-needed',
    difficulty: 'intro',
    reviewDecision: 'redesign',
  },
};
let passed = 0;
let failed = 0;

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log('  ?', name);
      passed += 1;
    })
    .catch(error => {
      console.error('  ?', name, '-', error.message);
      failed += 1;
    });
}

function ok(value, message = 'assertion failed') {
  assert.ok(value, message);
}

function equal(actual, expected, message) {
  assert.equal(actual, expected, message);
}

function deepEqual(actual, expected, message) {
  assert.deepEqual(actual, expected, message);
}

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

async function readJson(relativePath) {
  const raw = await fs.readFile(path.join(ROOT, relativePath), 'utf8');
  return JSON.parse(raw.replace(/^\uFEFF/, ''));
}

async function copyCandidateTree(rootDir) {
  await fs.cp(path.join(ROOT, 'content/problem-bank/candidates'), path.join(rootDir, 'content/problem-bank/candidates'), { recursive: true });
  await fs.mkdir(path.join(rootDir, 'content/problem-bank/sources'), { recursive: true });
  await fs.copyFile(path.join(ROOT, CATALOG_PATH), path.join(rootDir, CATALOG_PATH));
}

function scanVisibleText(candidate) {
  return [candidate.extraction?.notes, candidate.task?.prompt, candidate.task?.solution].map(value => String(value ?? '')).join(' ');
}

await test('5 yeni aday schema/validation ve katalog sozlesmesini gecer', async () => {
  const catalog = await readJson(CATALOG_PATH);
  const audit = await auditCandidateCatalog({ rootDir: ROOT });
  ok(audit.items.length >= PHASE9_IDS.length);
  equal(audit.summary.issueCount, 0);
  PHASE9_IDS.forEach(id => ok(audit.items.some(item => item.candidateId === id), `missing audit item ${id}`));

  for (const file of PHASE9_FILES) {
    const candidate = await readJson(file);
    const result = validateCandidate(candidate, catalog);
    ok(result.valid, result.issues.map(issue => issue.code).join(', '));
    equal(candidate.status, 'needs-review');
    equal(candidate.source.sourceId, 'falling-in-love-with-baduk');
    equal(candidate.source.locator.type, 'pdf-page');
    equal(candidate.board.size, 9);
    equal(candidate.rights.canPublish, false);
    equal(candidate.rights.needsRightsReview, true);
    ok(candidate.extraction.notes.trim().length > 0);
    ok(candidate.task.prompt.trim().length > 0);
    ok(candidate.task.solution.trim().length > 0);
    ok(candidate.task.answer !== undefined);
    ok(candidate.pedagogy);
    equal(candidate.pedagogy.useCase, EXPECTED_PEDAGOGY[candidate.candidateId].useCase);
    equal(candidate.pedagogy.difficulty, EXPECTED_PEDAGOGY[candidate.candidateId].difficulty);
    equal(candidate.pedagogy.reviewDecision, EXPECTED_PEDAGOGY[candidate.candidateId].reviewDecision);
    ok(typeof candidate.pedagogy.reviewNotes === 'string' && candidate.pedagogy.reviewNotes.trim().length > 0);
    if (candidate.candidateId === 'candidate-fib-b1-liberty-count-0002') {
      ok(candidate.pedagogy.reviewNotes.includes('gıriş') || candidate.pedagogy.reviewNotes.includes('ısınma'), '0002 reviewNotes should mention giri?/?s?nma');
    }
    if (candidate.candidateId === 'candidate-fib-b1-capture-0003') {
      ok(/son nefes/i.test(candidate.task.solution));
      ok(/yakalar?|yakalam/i.test(candidate.task.solution));
    }
    ok(Array.isArray(candidate.review.checklist));
    equal(NO_MOJI_REGEX.test(candidate.task.prompt), false, 'prompt mojibake');
    equal(NO_MOJI_REGEX.test(candidate.task.solution), false, 'solution mojibake');
    equal(NO_MOJI_REGEX.test(candidate.extraction.notes), false, 'notes mojibake');
    const visibleText = scanVisibleText(candidate);
    for (const keyword of REQUIRED_KEYWORDS[candidate.candidateId] ?? []) {
      ok(visibleText.includes(keyword), `${candidate.candidateId} missing ${keyword}`);
    }
  }
});

await test('review-problem-candidates ve promotion preview tum yeni adaylari raporlar', async () => {
  const reviewCatalog = await buildCandidateReviewCatalog({ rootDir: ROOT });
  ok(reviewCatalog.reports.length >= PHASE9_IDS.length);
  for (const id of PHASE9_IDS) {
    const item = reviewCatalog.reports.find(entry => entry.candidateId === id);
    ok(item, `missing review report ${id}`);
    equal(item.status, 'needs-review');
    equal(item.rights.canPublish, false);
    equal(item.rights.needsRightsReview, true);
    equal(item.board.size, 9);
    equal(item.board.initialStonesValid, true);
    equal(item.board.markersValid, true);
    equal(item.task.hasPrompt, true);
    equal(item.task.hasAnswer, true);
    equal(item.task.hasSolution, true);
    equal(item.task.answerTypeValid, true);
    equal(item.studioPreviewValidation.valid, true);
    equal(item.pedagogy.useCase, EXPECTED_PEDAGOGY[id].useCase);
    equal(item.pedagogy.difficulty, EXPECTED_PEDAGOGY[id].difficulty);
    equal(item.pedagogy.reviewDecision, EXPECTED_PEDAGOGY[id].reviewDecision);
    ok(item.promotionReadiness.readyForPromotion);
    equal(item.promotionReadiness.blockingIssues.length, 0);
    equal(item.promotionReadiness.warnings.includes('rights.canPublish-false'), true);
    equal(item.promotionReadiness.warnings.includes('rights.needsRightsReview-true'), true);
  }

  const promotion = await buildCandidatePromotionReport({ rootDir: ROOT });
  ok(promotion.summary.candidateCount >= PHASE9_IDS.length);
  equal(promotion.summary.blocked, 0);
  equal(promotion.summary.changeCount, 0);
  for (const id of PHASE9_IDS) {
    const item = promotion.reports.find(entry => entry.report?.candidateId === id || entry.candidateId === id);
    ok(item, `missing promotion report ${id}`);
    equal(item.targetStatus, 'review');
    equal(item.blocked, false);
    equal(item.preview.schemaVersion, '1.1.0');
    equal(item.preview.status, 'review');
    deepEqual(Object.keys(item.preview.source).sort(), ['locator', 'sourceId', 'usage']);
  }
});

await test('5 yeni aday icin Studio preview guvenli kalir ve default calistirma dosya yazmaz', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ag-bank-phase9-studio-'));
  await copyCandidateTree(tempRoot);

  for (const id of PHASE9_IDS) {
    const candidate = await readJson(`content/problem-bank/candidates/items/${id}.json`);
    const doc = buildStudioDocument(candidate);
    equal(doc.studioVersion, '1.1.0');
    equal(doc.status, 'review');
    equal(doc.board.size, 9);
    equal(doc.sources.length, 1);
    deepEqual(Object.keys(doc.sources[0]).sort(), ['locator', 'sourceId', 'usage']);
    const report = await exportCandidateStudioPreview({ candidateId: id, rootDir: tempRoot });
    ok(report.valid, id);
    equal(report.outputPath, null);
    equal(report.document.extensions.problemBankCandidate.rights.canPublish, false);
    equal(report.document.extensions.problemBankCandidate.rights.needsRightsReview, true);
    const previewPath = path.join(tempRoot, `${id}.agstudio`);
    const exists = await fs.access(previewPath).then(() => true).catch(() => false);
    equal(exists, false);
    ok(validateDocument(doc).valid, `studio document invalid for ${id}`);
  }
});

await test('phase 9 visible text UTF-8 clean', async () => {
  for (const file of PHASE9_FILES) {
    const candidate = await readJson(file);
    const visibleText = scanVisibleText(candidate);
    ok(NO_MOJI_REGEX.test(visibleText) === false, path.basename(file) + ' mojibake');
    for (const keyword of REQUIRED_KEYWORDS[candidate.candidateId] ?? []) {
      ok(visibleText.includes(keyword), `${candidate.candidateId} missing ${keyword}`);
    }
    ok(visibleText.trim().length > 0, path.basename(file) + ' visible text');
  }
});

await test('ladder intro 0006 remains redesign-needed and 0007 is no longer expected', async () => {
  const ladder6 = await readJson('content/problem-bank/candidates/items/candidate-fib-b2-ladder-intro-0006.json');
  let ladder7Exists = true;
  try {
    await fs.access(path.join(ROOT, 'content/problem-bank/candidates/items/candidate-fib-b2-ladder-intro-0007.json'));
  } catch {
    ladder7Exists = false;
  }

  equal(ladder6.pedagogy.reviewDecision, 'redesign');
  equal(ladder6.status, 'needs-review');
  equal(ladder7Exists, false);
});

await test('aday dosyalari, canonical problem JSON ve index semasi degismez', async () => {
  const before = new Map();
  for (const rel of [...PHASE9_FILES, EXAMPLE_FILE, 'content/problem-bank/problems/b1-l2-liberty-count-0001.json', 'content/problem-bank/index.json']) {
    before.set(rel, sha256(await fs.readFile(path.join(ROOT, rel), 'utf8')));
  }

  await buildCandidateReviewCatalog({ rootDir: ROOT });
  await buildCandidatePromotionReport({ rootDir: ROOT });
  for (const id of PHASE9_IDS) {
    await exportCandidateStudioPreview({ candidateId: id, rootDir: ROOT });
  }

  for (const rel of [...PHASE9_FILES, EXAMPLE_FILE, 'content/problem-bank/problems/b1-l2-liberty-count-0001.json', 'content/problem-bank/index.json']) {
    const after = sha256(await fs.readFile(path.join(ROOT, rel), 'utf8'));
    equal(after, before.get(rel), rel);
  }
});

console.log(`\nToplam: ${passed + failed}  ? ${passed}  ? ${failed}`);
if (failed) process.exit(1);
