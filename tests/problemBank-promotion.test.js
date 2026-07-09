import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

import {
  applyCandidatePromotion,
  buildCandidatePromotionReport,
  buildCanonicalProblemPreview,
  normalizeJsonText,
  writeJsonAtomic,
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

async function copyCandidateFixtureTree(rootDir, { candidateJson = null, addProblem = false } = {}) {
  await fs.cp(path.join(ROOT, 'content/problem-bank/candidates'), path.join(rootDir, 'content/problem-bank/candidates'), { recursive: true });
  await fs.mkdir(path.join(rootDir, 'content/problem-bank/sources'), { recursive: true });
  await fs.copyFile(path.join(ROOT, 'content/problem-bank/sources/catalog.json'), path.join(rootDir, 'content/problem-bank/sources/catalog.json'));
  await fs.mkdir(path.join(rootDir, 'content/problem-bank/problems'), { recursive: true });
  if (candidateJson) {
    await fs.writeFile(path.join(rootDir, `content/problem-bank/candidates/items/${candidateJson.candidateId}.json`), JSON.stringify(candidateJson, null, 2) + '\n', 'utf8');
  }
  if (addProblem) {
    await fs.copyFile(path.join(ROOT, 'content/problem-bank/problems/b1-l2-liberty-count-0001.json'), path.join(rootDir, 'content/problem-bank/problems/b1-l2-liberty-count-0001.json'));
  }
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw.replace(/^\uFEFF/, ''));
}

await test('default promotion preview is dry-run and writes nothing', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ag-bank-promo-dry-'));
  await copyCandidateFixtureTree(tempRoot);
  const report = await buildCandidatePromotionReport({ candidateId: EXAMPLE_ID, rootDir: tempRoot });
  equal(report.writeResult, null);
  equal(report.targetStatus, 'review');
  equal(report.blocked, false);
  equal(report.preview.source.sourceId, 'falling-in-love-with-baduk');
  equal(report.preview.status, 'review');
  const targetPath = path.join(tempRoot, 'content/problem-bank/problems', `${EXAMPLE_ID}.json`);
  const exists = await fs.access(targetPath).then(() => true).catch(() => false);
  equal(exists, false);
});

await test('rights review required keeps approved/published off the table', async () => {
  const report = await buildCandidatePromotionReport({ candidateId: EXAMPLE_ID, rootDir: ROOT });
  equal(report.targetStatus, 'review');
  equal(report.blocked, false);
  ok(report.warnings.includes('rights-blocks-approved-published'));
  equal(report.preview.status, 'review');
  equal(report.preview.rights.status, 'review_required');
});

await test('blocking candidate is rejected before preview promotion', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ag-bank-promo-block-'));
  await copyCandidateFixtureTree(tempRoot, {
    candidateJson: {
      candidateId: 'blocked-candidate',
      candidateVersion: '1.0.0',
      status: 'needs-review',
      source: { sourceId: 'falling-in-love-with-baduk', locator: { type: 'pdf-page', value: 17 }, usage: 'concept_reference' },
      extraction: { method: 'vision', extractedAt: '2026-07-08T00:00:00Z', extractor: 'fixture', confidence: 0.5, notes: '' },
      curriculum: { section: 'B1', lesson: 'l2', skill: 'liberty', tags: [] },
      board: { size: 9, initialStones: [{ color: 'white', x: 99, y: 99 }], markers: [] },
      task: { type: 'numeric_count', prompt: 'Broken board', expectedAnswer: '2', answerPolicy: 'single' },
      review: { required: true, reviewer: null, reviewedAt: null, checklist: [] },
      rights: { sourceRightsSnapshot: {}, canPublish: false, needsRightsReview: true },
    },
  });
  const report = await buildCandidatePromotionReport({ candidateId: 'blocked-candidate', rootDir: tempRoot });
  equal(report.blocked, true);
  ok(report.blockingIssues.some(issue => issue.code === 'INVALID_INITIAL_STONES' || issue.code === 'INVALID_BOARD_SIZE' || issue.code === 'INVALID_STUDIO_PREVIEW'));
});

await test('candidateId traversal and invalid identifiers are rejected', async () => {
  await assert.rejects(() => applyCandidatePromotion({ candidateId: '../evil', rootDir: ROOT }), /Invalid candidateId/);
  await assert.rejects(() => applyCandidatePromotion({ candidateId: 'bad/slug', rootDir: ROOT }), /Invalid candidateId/);
  await assert.rejects(() => applyCandidatePromotion({ candidateId: 'bad\\slug', rootDir: ROOT }), /Invalid candidateId/);
});

await test('canonical source model stays minimal in the preview', async () => {
  const report = await buildCandidatePromotionReport({ candidateId: EXAMPLE_ID, rootDir: ROOT });
  deepEqual(Object.keys(report.preview.source).sort(), ['locator', 'sourceId', 'usage']);
  equal(report.preview.source.locator.type, 'pdf-page');
  equal(report.preview.source.locator.value, 17);
  equal(report.preview.source.usage, 'concept_reference');
});

await test('apply writes atomically in a safe temp workspace', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ag-bank-promo-apply-'));
  await copyCandidateFixtureTree(tempRoot, { addProblem: false });
  const beforeCandidateHash = sha256(await fs.readFile(path.join(tempRoot, 'content/problem-bank/candidates/items', `${EXAMPLE_FILE}.json`), 'utf8'));
  const applied = await applyCandidatePromotion({ candidateId: EXAMPLE_ID, rootDir: tempRoot });
  equal(applied.writeResult.status, 'created');
  const outputPath = path.join(tempRoot, 'content/problem-bank/problems', `${EXAMPLE_ID}.json`);
  const saved = await readJson(outputPath);
  equal(saved.schemaVersion, '1.1.0');
  equal(saved.status, 'review');
  deepEqual(Object.keys(saved.source).sort(), ['locator', 'sourceId', 'usage']);
  const afterCandidateHash = sha256(await fs.readFile(path.join(tempRoot, 'content/problem-bank/candidates/items', `${EXAMPLE_FILE}.json`), 'utf8'));
  equal(afterCandidateHash, beforeCandidateHash);
});

await test('apply rejects target collisions with different canonical content', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ag-bank-promo-collision-'));
  await copyCandidateFixtureTree(tempRoot, { addProblem: false });
  const targetPath = path.join(tempRoot, 'content/problem-bank/problems', `${EXAMPLE_ID}.json`);
  await fs.writeFile(targetPath, JSON.stringify({ stale: true }, null, 2) + '\n', 'utf8');
  await assert.rejects(() => applyCandidatePromotion({ candidateId: EXAMPLE_ID, rootDir: tempRoot }), /Target canonical problem already exists and differs/);
});

await test('writeJsonAtomic rolls back when the final rename fails', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ag-bank-promo-rollback-'));
  const targetPath = path.join(tempRoot, 'atomic.json');
  await fs.writeFile(targetPath, JSON.stringify({ version: 1 }, null, 2) + '\n', 'utf8');
  const fakeFs = {
    mkdir: async () => {},
    writeFile: async (filePath, value) => fs.writeFile(filePath, value, 'utf8'),
    readFile: async filePath => fs.readFile(filePath, 'utf8'),
    rename: (() => {
      let calls = 0;
      return async (...args) => {
        calls += 1;
        if (calls === 2) {
          throw new Error('forced rename failure');
        }
        return fs.rename(...args);
      };
    })(),
    unlink: async filePath => fs.unlink(filePath).catch(() => {}),
  };
  await assert.rejects(() => writeJsonAtomic(targetPath, { version: 2 }, fakeFs), /forced rename failure/);
  const saved = await readJson(targetPath);
  deepEqual(saved, { version: 1 });
});

await test('promotion preview JSON stays canonical and no candidate file changes', async () => {
  const candidatePath = path.join(ROOT, `content/problem-bank/candidates/items/${EXAMPLE_FILE}.json`);
  const before = sha256(await fs.readFile(candidatePath, 'utf8'));
  const report = await buildCandidatePromotionReport({ candidateId: EXAMPLE_ID, rootDir: ROOT });
  ok(report.preview);
  equal(report.preview.schemaVersion, '1.1.0');
  equal(report.preview.revision, 1);
  const after = sha256(await fs.readFile(candidatePath, 'utf8'));
  equal(after, before);
});

await test('problem JSON remains untouched during dry-run promotion planning', async () => {
  const problemPath = path.join(ROOT, 'content/problem-bank/problems/b1-l2-liberty-count-0001.json');
  const before = sha256(await fs.readFile(problemPath, 'utf8'));
  await buildCandidatePromotionReport({ candidateId: EXAMPLE_ID, rootDir: ROOT });
  const after = sha256(await fs.readFile(problemPath, 'utf8'));
  equal(after, before);
});

await test('second apply is a no-op when the canonical file is already up to date', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ag-bank-promo-noop-'));
  await copyCandidateFixtureTree(tempRoot, { addProblem: false });
  const first = await applyCandidatePromotion({ candidateId: EXAMPLE_ID, rootDir: tempRoot });
  equal(first.writeResult.status, 'created');
  const second = await applyCandidatePromotion({ candidateId: EXAMPLE_ID, rootDir: tempRoot });
  equal(second.writeResult.status, 'noop');
  const outputPath = path.join(tempRoot, 'content/problem-bank/problems', `${EXAMPLE_ID}.json`);
  const firstHash = sha256(await fs.readFile(outputPath, 'utf8'));
  const secondHash = sha256(await fs.readFile(outputPath, 'utf8'));
  equal(secondHash, firstHash);
});

console.log(`\nToplam: ${passed + failed}  ✓ ${passed}  ✗ ${failed}`);
if (failed) process.exit(1);
