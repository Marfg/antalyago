import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

import {
  buildCandidateReviewCatalog,
  buildCandidateReviewReport,
  resolveOutputPath,
  writeReviewReport,
} from '../scripts/problem-bank/candidate-review-gate.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const EXAMPLE_ID = 'falling-in-love-with-baduk-b1-l2-liberty-001';
const EXAMPLE_FILE = 'example-falling-in-love-with-baduk-b1-l2-liberty-001';
let passed = 0;
let failed = 0;

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log('  ✓', name);
      passed += 1;
    })
    .catch(error => {
      console.error('  ✗', name, '-', error.message);
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

async function copyCandidateFixtureTree(rootDir, { addBroken = false } = {}) {
  await fs.cp(path.join(ROOT, 'content/problem-bank/candidates'), path.join(rootDir, 'content/problem-bank/candidates'), { recursive: true });
  await fs.mkdir(path.join(rootDir, 'content/problem-bank/sources'), { recursive: true });
  await fs.copyFile(path.join(ROOT, 'content/problem-bank/sources/catalog.json'), path.join(rootDir, 'content/problem-bank/sources/catalog.json'));
  if (addBroken) {
    await fs.writeFile(path.join(rootDir, 'content/problem-bank/candidates/items/broken-candidate.json'), '{', 'utf8');
  }
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw.replace(/^\uFEFF/, ''));
}

await test('review report includes required fields for the example candidate', async () => {
  const report = await buildCandidateReviewReport({ candidateId: EXAMPLE_ID, rootDir: ROOT });
  equal(report.candidateId, EXAMPLE_ID);
  equal(report.candidateVersion, '1.0.0');
  deepEqual(report.source, {
    sourceId: 'falling-in-love-with-baduk',
    locator: { type: 'pdf-page', value: 17 },
    usage: 'concept_reference',
  });
  equal(report.curriculum.section, 'B1');
  equal(report.curriculum.lesson, 'l2');
  equal(report.curriculum.skill, 'liberty');
  equal(report.rights.canPublish, false);
  equal(report.rights.needsRightsReview, true);
  equal(report.board.size, 9);
  equal(report.board.initialStonesValid, true);
  equal(report.board.markersValid, true);
  equal(report.task.hasPrompt, true);
  equal(report.task.hasAnswer, true);
  equal(report.task.answerTypeValid, true);
  equal(report.studioPreviewValidation.valid, true);
  ok(report.promotionReadiness.readyForPromotion);
  ok(Array.isArray(report.promotionReadiness.blockingIssues));
  ok(Array.isArray(report.promotionReadiness.warnings));
  ok(report.promotionReadiness.warnings.includes('rights.canPublish-false'));
  ok(report.promotionReadiness.warnings.includes('rights.needsRightsReview-true'));
});

await test('review defaults do not create report files', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ag-bank-review-no-write-'));
  await copyCandidateFixtureTree(tempRoot);
  await buildCandidateReviewCatalog({ rootDir: tempRoot });
  const reportsDir = path.join(tempRoot, 'content/problem-bank/candidates/reports');
  const jsonFiles = await fs.readdir(reportsDir).catch(() => []);
  equal(jsonFiles.filter(name => name.endsWith('.json')).length, 0);
});

await test('broken candidate JSON does not crash the review catalog', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ag-bank-review-broken-'));
  await copyCandidateFixtureTree(tempRoot, { addBroken: true });
  const report = await buildCandidateReviewCatalog({ rootDir: tempRoot });
  ok(report.reports.some(item => item.parseError));
  ok(report.summary.issueCount >= 1);
  ok(report.reports.some(item => item.candidateId === EXAMPLE_ID));
});

await test('review report does not leak local paths or PDF paths', async () => {
  const report = await buildCandidateReviewReport({ candidateId: EXAMPLE_ID, rootDir: ROOT });
  const json = JSON.stringify(report);
  ok(!/C:\\Users\\/i.test(json), 'absolute path leaked');
  ok(!/OneDrive|Masaüstü|Desktop/i.test(json), 'local path leaked');
  ok(!/Falling-in-love-with-Baduk Copy\.pdf/i.test(json), 'PDF path leaked');
});

await test('rights classification stays warning-level for the example candidate', async () => {
  const report = await buildCandidateReviewReport({ candidateId: EXAMPLE_ID, rootDir: ROOT });
  equal(report.rights.rightsStatus, 'permission-required');
  equal(report.rights.canPublish, false);
  equal(report.rights.needsRightsReview, true);
  ok(report.promotionReadiness.warnings.includes('rights.canPublish-false'));
  ok(report.promotionReadiness.warnings.includes('rights.needsRightsReview-true'));
  equal(report.promotionReadiness.blockingIssues.length, 0);
});

await test('studio preview validation preserves only safe source fields', async () => {
  const report = await buildCandidateReviewReport({ candidateId: EXAMPLE_ID, rootDir: ROOT });
  equal(report.studioPreviewValidation.valid, true);
  equal(report.studioPreviewValidation.sourceSafe, true);
  deepEqual(Object.keys(report.studioPreviewValidation.source).sort(), ['locator', 'sourceId', 'usage']);
  ok(!report.studioPreviewValidation.leaks.absolutePath);
  ok(!report.studioPreviewValidation.leaks.pdfPath);
});

await test('review report write helper only writes when output path is provided', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ag-bank-review-output-'));
  await copyCandidateFixtureTree(tempRoot);
  const report = await buildCandidateReviewReport({ candidateId: EXAMPLE_ID, rootDir: tempRoot });
  const output = resolveOutputPath(path.join(tempRoot, 'reports'), EXAMPLE_ID, { defaultFileName: 'review-report.json' });
  equal(await writeReviewReport(report, output), output);
  const saved = await readJson(output);
  equal(saved.candidateId, EXAMPLE_ID);
  equal(saved.source.sourceId, 'falling-in-love-with-baduk');
});

await test('candidate file hash stays unchanged after review generation', async () => {
  const candidatePath = path.join(ROOT, `content/problem-bank/candidates/items/${EXAMPLE_FILE}.json`);
  const before = sha256(await fs.readFile(candidatePath, 'utf8'));
  await buildCandidateReviewReport({ candidateId: EXAMPLE_ID, rootDir: ROOT });
  const after = sha256(await fs.readFile(candidatePath, 'utf8'));
  equal(after, before);
});

console.log(`\nToplam: ${passed + failed}  ✓ ${passed}  ✗ ${failed}`);
if (failed) process.exit(1);
