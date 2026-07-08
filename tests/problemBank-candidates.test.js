import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { auditCandidateCatalog, buildCandidatePromotionReport, candidateToProblemPreview, canTransitionCandidateStatus, normalizeCandidate, validateCandidate } from '../scripts/problem-bank/candidates.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
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

async function readJson(relativePath) {
  const raw = await fs.readFile(path.join(ROOT, relativePath), 'utf8');
  return JSON.parse(raw.replace(/^\uFEFF/, ''));
}

async function copyFixtureTree(rootDir) {
  await fs.cp(path.join(ROOT, 'content/problem-bank/candidates'), path.join(rootDir, 'content/problem-bank/candidates'), { recursive: true });
  await fs.mkdir(path.join(rootDir, 'content/problem-bank/sources'), { recursive: true });
  await fs.copyFile(path.join(ROOT, 'content/problem-bank/sources/catalog.json'), path.join(rootDir, 'content/problem-bank/sources/catalog.json'));
}

async function copyProblemFixture(rootDir) {
  const target = path.join(rootDir, 'content/problem-bank/problems');
  await fs.mkdir(target, { recursive: true });
  await fs.copyFile(path.join(ROOT, 'content/problem-bank/problems/b1-l2-liberty-count-0001.json'), path.join(target, 'b1-l2-liberty-count-0001.json'));
}

await test('candidate schema geçerli', async () => {
  const candidate = await readJson('content/problem-bank/candidates/items/example-falling-in-love-with-baduk-b1-l2-liberty-001.json');
  const catalog = await readJson('content/problem-bank/sources/catalog.json');
  const result = validateCandidate(candidate, catalog);
  ok(result.valid, result.issues.map(issue => issue.code).join(', '));
  equal(candidate.status, 'needs-review');
  equal(candidate.review.required, true);
  equal(candidate.rights.canPublish, false);
  equal(candidate.rights.needsRightsReview, true);
});

await test('sourceId katalogda var', async () => {
  const report = await auditCandidateCatalog();
  equal(report.summary.sourceCount, 1);
  ok(report.items.every(item => item.catalogSourceFound));
});

await test('locator geçerli', async () => {
  const report = await auditCandidateCatalog();
  const item = report.items[0];
  equal(item.locatorType, 'pdf-page');
  equal(item.locatorValue, 17);
  equal(item.issueCount, 0);
});

await test('status lifecycle doğru', async () => {
  ok(canTransitionCandidateStatus('extracted', 'needs-review'));
  ok(canTransitionCandidateStatus('needs-review', 'promoted'));
  ok(canTransitionCandidateStatus('needs-review', 'rejected'));
  ok(!canTransitionCandidateStatus('rejected', 'promoted'));
  ok(!canTransitionCandidateStatus('promoted', 'needs-review'));
});

await test('review.required varsayılan true', async () => {
  const candidate = normalizeCandidate({
    candidateId: 'sample',
    status: 'extracted',
    source: { sourceId: 'falling-in-love-with-baduk', locator: { type: 'pdf-page', value: 17 }, usage: 'concept_reference' },
    extraction: { method: 'manual', extractedAt: '2026-07-08T00:00:00Z', extractor: 'x', confidence: 1, notes: '' },
    curriculum: { section: 'B1', lesson: 'l2', skill: 'liberty', tags: [] },
    board: { size: 9, initialStones: [], markers: [] },
    task: { type: 'count', prompt: 'p', expectedAnswer: '1', answerPolicy: 'single' },
    review: {},
    rights: { sourceRightsSnapshot: {} },
  });
  equal(candidate.review.required, true);
});

await test('rights.canPublish varsayılan false', async () => {
  const candidate = normalizeCandidate({
    candidateId: 'sample',
    status: 'extracted',
    source: { sourceId: 'falling-in-love-with-baduk', locator: { type: 'pdf-page', value: 17 }, usage: 'concept_reference' },
    extraction: { method: 'manual', extractedAt: '2026-07-08T00:00:00Z', extractor: 'x', confidence: 1, notes: '' },
    curriculum: { section: 'B1', lesson: 'l2', skill: 'liberty', tags: [] },
    board: { size: 9, initialStones: [], markers: [] },
    task: { type: 'count', prompt: 'p', expectedAnswer: '1', answerPolicy: 'single' },
    review: {},
    rights: { sourceRightsSnapshot: {} },
  });
  equal(candidate.rights.canPublish, false);
});

await test('needsRightsReview varsayılan true', async () => {
  const candidate = normalizeCandidate({
    candidateId: 'sample',
    status: 'extracted',
    source: { sourceId: 'falling-in-love-with-baduk', locator: { type: 'pdf-page', value: 17 }, usage: 'concept_reference' },
    extraction: { method: 'manual', extractedAt: '2026-07-08T00:00:00Z', extractor: 'x', confidence: 1, notes: '' },
    curriculum: { section: 'B1', lesson: 'l2', skill: 'liberty', tags: [] },
    board: { size: 9, initialStones: [], markers: [] },
    task: { type: 'count', prompt: 'p', expectedAnswer: '1', answerPolicy: 'single' },
    review: {},
    rights: { sourceRightsSnapshot: {} },
  });
  equal(candidate.rights.needsRightsReview, true);
});

await test('promoted olmayan aday canonical klasöre yazılamaz', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ag-bank-candidate-'));
  await copyFixtureTree(tempRoot);
  const report = await buildCandidatePromotionReport({ rootDir: tempRoot, apply: true });
  equal(report.writeResult, null);
  equal(report.summary.changeCount, 0);
  const problemPath = path.join(tempRoot, 'content/problem-bank/problems/example-falling-in-love-with-baduk-b1-l2-liberty-001.json');
  const exists = await fs.access(problemPath).then(() => true).catch(() => false);
  equal(exists, false);
});

await test('promote dry-run problem JSON’u değiştirmez', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ag-bank-candidate-apply-'));
  await copyFixtureTree(tempRoot);
  await copyProblemFixture(tempRoot);
  const problemPath = path.join(tempRoot, 'content/problem-bank/problems/b1-l2-liberty-count-0001.json');
  const before = sha256(await fs.readFile(problemPath, 'utf8'));
  await buildCandidatePromotionReport({ rootDir: tempRoot, apply: true });
  const after = sha256(await fs.readFile(problemPath, 'utf8'));
  equal(after, before);
});

await test('candidate -> problem dönüşümünde source modeli canonical 1.1 sözleşmesine uyar', async () => {
  const candidate = await readJson('content/problem-bank/candidates/items/example-falling-in-love-with-baduk-b1-l2-liberty-001.json');
  const preview = candidateToProblemPreview(candidate);
  deepEqual(preview.source, {
    sourceId: 'falling-in-love-with-baduk',
    locator: { type: 'pdf-page', value: 17 },
    usage: 'concept_reference',
  });
});

await test('Studio adapter alanı varsa güvenli ve opsiyonel kalır', async () => {
  const candidate = await readJson('content/problem-bank/candidates/items/example-falling-in-love-with-baduk-b1-l2-liberty-001.json');
  ok(candidate.studio);
  equal(candidate.studio.compatible, true);
  ok('proposedStudioDocument' in candidate.studio);
});

console.log(`\nToplam: ${passed + failed}  ✓ ${passed}  ✗ ${failed}`);
if (failed) process.exit(1);