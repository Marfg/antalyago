import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { buildStudioDocument, exportCandidateStudioPreview, validateCandidateId } from '../scripts/problem-bank/candidate-to-studio.mjs';
import { validateDocument } from '../studio/model/validation.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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

async function copyCandidateFixture(rootDir) {
  await fs.mkdir(path.join(rootDir, 'content/problem-bank/candidates/items'), { recursive: true });
  await fs.copyFile(
    path.join(ROOT, 'content/problem-bank/candidates/items/example-falling-in-love-with-baduk-b1-l2-liberty-001.json'),
    path.join(rootDir, 'content/problem-bank/candidates/items/example-falling-in-love-with-baduk-b1-l2-liberty-001.json'),
  );
  await fs.mkdir(path.join(rootDir, 'content/problem-bank/sources'), { recursive: true });
  await fs.copyFile(path.join(ROOT, 'content/problem-bank/sources/catalog.json'), path.join(rootDir, 'content/problem-bank/sources/catalog.json'));
}

await test('example candidate studio preview’e dönüşür', async () => {
  const candidate = await readJson('content/problem-bank/candidates/items/example-falling-in-love-with-baduk-b1-l2-liberty-001.json');
  const doc = buildStudioDocument(candidate);
  equal(doc.studioVersion, '1.1.0');
  equal(doc.id, 'falling-in-love-with-baduk-b1-l2-liberty-001');
  equal(doc.status, 'review');
  equal(doc.title, 'Köşedeki taşın kaç nefesi var?');
  const validation = validateDocument(doc);
  ok(validation.valid, validation.errors.join(' | '));
});

await test('board size, initialStones ve markers korunur', async () => {
  const candidate = await readJson('content/problem-bank/candidates/items/example-falling-in-love-with-baduk-b1-l2-liberty-001.json');
  const doc = buildStudioDocument(candidate);
  equal(doc.board.size, 9);
  deepEqual(doc.board.stones, [{ color: 'white', x: 0, y: 0 }]);
  deepEqual(doc.board.markers, [{ x: 1, y: 1, label: 'focus' }]);
  equal(doc.moveTree.root.annotations.length, 1);
  equal(doc.moveTree.root.annotations[0].type, 'label');
  deepEqual(doc.moveTree.root.annotations[0].point, { x: 1, y: 1 });
  equal(doc.moveTree.root.annotations[0].text, 'focus');
});

await test('prompt/curriculum/source metadata taşınır', async () => {
  const candidate = await readJson('content/problem-bank/candidates/items/example-falling-in-love-with-baduk-b1-l2-liberty-001.json');
  const doc = buildStudioDocument(candidate);
  equal(doc.summary, 'Example candidate only; not canonical and not promoted.');
  deepEqual(doc.sources, [{ sourceId: 'falling-in-love-with-baduk', locator: { type: 'pdf-page', value: 17 }, usage: 'concept_reference' }]);
  equal(doc.curriculum.section, 'B1');
  equal(doc.curriculum.lesson, 'l2');
  equal(doc.curriculum.skills[0], 'liberty');
  equal(doc.extensions.problemBankCandidate.source.sourceId, 'falling-in-love-with-baduk');
});

await test('rights bilgisi kaybolmaz', async () => {
  const candidate = await readJson('content/problem-bank/candidates/items/example-falling-in-love-with-baduk-b1-l2-liberty-001.json');
  const doc = buildStudioDocument(candidate);
  equal(doc.extensions.problemBankCandidate.rights.canPublish, false);
  equal(doc.extensions.problemBankCandidate.rights.needsRightsReview, true);
  ok(doc.extensions.problemBankCandidate.rights.sourceRightsSnapshot.distributionAllowed === false);
});

await test('default run dosya yazmaz', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ag-bank-studio-'));
  await copyCandidateFixture(tempRoot);
  const report = await exportCandidateStudioPreview({
    candidateId: 'example-falling-in-love-with-baduk-b1-l2-liberty-001',
    rootDir: tempRoot,
  });
  equal(report.outputPath, null);
  const previewPath = path.join(tempRoot, 'preview.agstudio');
  const exists = await fs.access(previewPath).then(() => true).catch(() => false);
  equal(exists, false);
});

await test('--output ile .agstudio oluşturulur', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ag-bank-studio-out-'));
  await copyCandidateFixture(tempRoot);
  const outputPath = path.join(tempRoot, 'preview.agstudio');
  const report = await exportCandidateStudioPreview({
    candidateId: 'example-falling-in-love-with-baduk-b1-l2-liberty-001',
    rootDir: tempRoot,
    outputPath,
  });
  equal(report.outputPath, outputPath);
  const exists = await fs.access(outputPath).then(() => true).catch(() => false);
  equal(exists, true);
  const saved = JSON.parse(await fs.readFile(outputPath, 'utf8'));
  equal(saved.id, 'falling-in-love-with-baduk-b1-l2-liberty-001');
  equal(saved.studioVersion, '1.1.0');
});

await test('geçersiz candidate reddedilir', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ag-bank-studio-invalid-'));
  await copyCandidateFixture(tempRoot);
  await assert.rejects(() => exportCandidateStudioPreview({ candidateId: 'missing-id', rootDir: tempRoot }), /Candidate not found|Invalid candidateId/);
});

await test('path traversal candidateId reddedilir', async () => {
  await assert.rejects(() => exportCandidateStudioPreview({ candidateId: '../evil', rootDir: ROOT }), /Invalid candidateId/);
});

await test('studioDocument validation geçer', async () => {
  const candidate = await readJson('content/problem-bank/candidates/items/example-falling-in-love-with-baduk-b1-l2-liberty-001.json');
  const doc = buildStudioDocument(candidate);
  const result = validateDocument(doc);
  ok(result.valid, result.errors.join(' | '));
  equal(result.warnings.length >= 0, true);
});

await test('mevcut problem JSON’ları değişmez', async () => {
  const before = sha256(await fs.readFile(path.join(ROOT, 'content/problem-bank/problems/b1-l2-liberty-count-0001.json'), 'utf8'));
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ag-bank-studio-noop-'));
  await copyCandidateFixture(tempRoot);
  await exportCandidateStudioPreview({ candidateId: 'example-falling-in-love-with-baduk-b1-l2-liberty-001', rootDir: tempRoot });
  const after = sha256(await fs.readFile(path.join(ROOT, 'content/problem-bank/problems/b1-l2-liberty-count-0001.json'), 'utf8'));
  equal(after, before);
});

await test('candidateId sözleşmesi güvenlidir', async () => {
  ok(validateCandidateId('example-falling-in-love-with-baduk-b1-l2-liberty-001'));
  ok(!validateCandidateId('..\\evil'));
});

console.log(`\nToplam: ${passed + failed}  ✓ ${passed}  ✗ ${failed}`);
if (failed) process.exit(1);