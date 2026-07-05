import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildProblemBankMigrationReport } from '../scripts/problem-bank/migrate.mjs';
import { PROBLEM_SCHEMA_VERSION, canonicalProblemStatus, migrateProblemRecord, validateProblem } from '../core/problemBank.js';

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
  if (!value) throw new Error(message);
}

function equal(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `expected ${expected}, got ${actual}`);
  }
}

function deepEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(message || `expected ${b}, got ${a}`);
}

function clone(value) {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function realProblemPaths(rootDir) {
  return [
    'content/problem-bank/problems/b1-l2-liberty-count-0001.json',
    'content/problem-bank/problems/b1-l3-capture-0001.json',
    'content/problem-bank/problems/b2-l10-ladder-sequence-0001.json',
  ].map(relative => path.join(rootDir, relative));
}

function legacyProblem(id, overrides = {}) {
  return {
    schemaVersion: '1.0.0',
    id,
    title: 'Migration test',
    status: 'verified',
    curriculum: { chapter: 'B1', lesson: 'l2', node: 'practice' },
    stage: 'variable_practice',
    interactionType: 'numeric_count',
    concepts: ['liberty'],
    source: { documentId: 'sample-book', page: 7, usage: 'concept_reference' },
    board: {
      size: 9,
      toPlay: 'B',
      stones: [{ color: 'W', x: 0, y: 0 }],
      markers: [],
    },
    question: {
      prompt: 'Köşedeki taşın kaç nefesi var?',
      options: [
        { text: '2', correct: true, feedback: 'Doğru.' },
        { text: '3', correct: false, feedback: 'Yanlış.' },
      ],
    },
    solution: { terminalChecks: ['liberty_count:2'] },
    difficulty: { authorLevel: 1, estimated: 0.2, calibrated: null },
    rights: { status: 'original' },
    ...overrides,
  };
}

function migratedReviewProblem(id, overrides = {}) {
  return {
    schemaVersion: '1.1.0',
    id,
    revision: 1,
    status: 'review',
    title: 'Review migration test',
    curriculum: { chapter: 'B1', lesson: 'l2', node: 'practice' },
    stage: 'variable_practice',
    interactionType: 'numeric_count',
    concepts: ['liberty'],
    source: {
      documentId: 'review-book',
      page: 7,
    },
    board: {
      size: 9,
      toPlay: 'B',
      stones: [{ color: 'W', x: 0, y: 0 }],
      markers: [],
    },
    question: {
      prompt: 'Köşedeki taşın kaç nefesi var?',
      options: [
        { text: '2', correct: true, feedback: 'Doğru.' },
        { text: '3', correct: false, feedback: 'Yanlış.' },
      ],
    },
    solution: { terminalChecks: ['liberty_count:2'] },
    difficulty: { authorLevel: 1, estimated: 0.2, calibrated: null },
    rights: { status: 'original' },
    ...overrides,
  };
}

function migratedApprovedProblem(id, overrides = {}) {
  return {
    schemaVersion: '1.1.0',
    id,
    revision: 1,
    status: 'approved',
    title: 'Approved migration test',
    curriculum: { chapter: 'B1', lesson: 'l2', node: 'practice' },
    stage: 'variable_practice',
    interactionType: 'numeric_count',
    concepts: ['liberty'],
    source: {
      type: 'manual',
      name: 'Approved Source',
      documentId: 'approved-book',
      page: 7,
      usage: 'concept_reference',
      hash: 'sha256:approved',
      importedAt: '2026-07-05T00:00:00.000Z',
      license: 'CC-BY',
    },
    board: {
      size: 9,
      toPlay: 'B',
      stones: [{ color: 'W', x: 0, y: 0 }],
      markers: [],
    },
    question: {
      prompt: 'Köşedeki taşın kaç nefesi var?',
      options: [
        { text: '2', correct: true, feedback: 'Doğru.' },
        { text: '3', correct: false, feedback: 'Yanlış.' },
      ],
    },
    solution: { terminalChecks: ['liberty_count:2'] },
    difficulty: { authorLevel: 1, estimated: 0.2, calibrated: null },
    rights: { status: 'original' },
    ...overrides,
  };
}

async function writeBank(rootDir, problems, indexEntries = null, indexSchemaVersion = '1.0.0') {
  const bankDir = path.join(rootDir, 'content/problem-bank');
  const problemDir = path.join(bankDir, 'problems');
  await fs.mkdir(problemDir, { recursive: true });
  const entries = indexEntries || problems.map(problem => ({
    id: problem.id,
    path: `problems/${problem.id}.json`,
    status: 'verified',
    curriculum: problem.curriculum,
    stage: problem.stage,
    interactionType: problem.interactionType,
    concepts: problem.concepts,
    difficulty: problem.difficulty.authorLevel,
  }));
  await fs.writeFile(path.join(bankDir, 'index.json'), JSON.stringify({ schemaVersion: indexSchemaVersion, updatedAt: '2026-07-05', problems: entries }, null, 2), 'utf8');
  for (const [index, problem] of problems.entries()) {
    const targetPath = entries[index]?.path || `problems/${problem.id}.json`;
    await fs.writeFile(path.join(bankDir, targetPath), JSON.stringify(problem, null, 2), 'utf8');
  }
  return bankDir;
}

const repoRoot = path.resolve(import.meta.dirname, '..');

await test('mevcut problem bankası ready review olarak raporlanır', async () => {
  const report = await buildProblemBankMigrationReport({ rootDir: repoRoot });
  equal(report.summary.totalEntries, 3);
  equal(report.summary.readyEntries, 3);
  equal(report.summary.blockedEntries, 0);
  ok(report.items.every(item => item.decision === 'ready'));
  ok(report.items.every(item => item.policyStatus === 'review'));
  ok(report.items.every(item => item.issues.some(issue => issue.code === 'INCOMPLETE_PROVENANCE')));
  ok(report.items.every(item => item.issues.every(issue => issue.severity !== 'error')));
});

await test('dry-run gerçek üç problem dosyasını değiştirmez', async () => {
  const before = await Promise.all(realProblemPaths(repoRoot).map(async file => sha256(await fs.readFile(file, 'utf8'))));
  const report = await buildProblemBankMigrationReport({ rootDir: repoRoot });
  const after = await Promise.all(realProblemPaths(repoRoot).map(async file => sha256(await fs.readFile(file, 'utf8'))));
  deepEqual(after, before, 'dry-run must not modify real problem files');
  equal(report.summary.blockedEntries, 0);
});

await test('canonical status verified -> review', async () => {
  equal(canonicalProblemStatus('verified'), 'review');
  equal(canonicalProblemStatus('mapped'), 'review');
});

await test('verified does not become approved', async () => {
  equal(canonicalProblemStatus('verified'), 'review');
  ok(canonicalProblemStatus('verified') !== 'approved', 'verified must not map to approved');
});

await test('1.0 -> 1.1 migration review hedefiyle çalışır', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ag-bank-migrate-ok-'));
  const source = legacyProblem('migrate-ok', {
    source: {
      documentId: 'sample-book',
      page: 7,
      usage: 'concept_reference',
      editorialNote: 'kept',
      unknownField: 'preserve-me',
    },
    board: {
      size: 9,
      toPlay: 'B',
      stones: [{ color: 'W', x: 0, y: 0 }],
      markers: [{ x: 1, y: 1, label: 'x' }],
      sgf: '(;SZ[9])',
    },
    solution: {
      acceptedMoves: [{ x: 0, y: 1 }],
      terminalChecks: ['liberty_count:2'],
      tree: { mainline: true },
    },
    question: {
      prompt: 'Köşedeki taşın kaç nefesi var?',
      options: [
        { text: '2', correct: true, feedback: 'Doğru.' },
        { text: '3', correct: false, feedback: 'Yanlış.' },
      ],
    },
    rights: { status: 'original', notes: 'ok' },
    extraLegacyField: 'keep-me',
  });
  await writeBank(rootDir, [source], null, '1.0.0');
  const report = await buildProblemBankMigrationReport({ rootDir, apply: true });
  equal(report.writeResult.applied, true);
  const migrated = JSON.parse(await fs.readFile(path.join(rootDir, 'content/problem-bank/problems/migrate-ok.json'), 'utf8'));
  equal(migrated.schemaVersion, PROBLEM_SCHEMA_VERSION);
  equal(migrated.revision, 1);
  equal(migrated.status, 'review');
  equal(migrated.source.documentId, 'sample-book');
  equal(migrated.source.page, 7);
  ok(!migrated.source.hash, 'source.hash should stay empty for review migration');
  ok(!migrated.source.importedAt, 'importedAt should not be fabricated');
  equal(migrated.extraLegacyField, 'keep-me');
  equal(migrated.source.unknownField, 'preserve-me');
  deepEqual(migrated.board, source.board);
  deepEqual(migrated.solution, source.solution);
  deepEqual(migrated.question, source.question);
  ok(validateProblem(migrated).valid, 'migrated record should validate');
  equal(migrated.migration.legacyStatus, 'verified');
  equal(migrated.migration.recordHash, report.items[0].recordHash);
});

await test('already canonical 1.1 records are no-op', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ag-bank-migrate-noop-'));
  const problem = migratedReviewProblem('migrate-noop', {
    source: { documentId: 'noop-book', page: 7 },
  });
  await writeBank(rootDir, [problem], null, '1.1.0');
  const first = await buildProblemBankMigrationReport({ rootDir, apply: true });
  equal(first.writeResult.applied, false);
  equal(first.writeResult.reason, 'noop');
});

await test('ikinci apply no-op olur', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ag-bank-migrate-noop-2-'));
  const problem = migratedReviewProblem('migrate-noop-2', {
    source: { documentId: 'noop-book-2', page: 7 },
  });
  await writeBank(rootDir, [problem], null, '1.1.0');
  const first = await buildProblemBankMigrationReport({ rootDir, apply: true });
  equal(first.writeResult.applied, false);
  equal(first.writeResult.reason, 'noop');
  const second = await buildProblemBankMigrationReport({ rootDir, apply: true });
  equal(second.writeResult.applied, false);
  equal(second.writeResult.reason, 'noop');
});

await test('review partial provenance kabul edilir', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ag-bank-review-'));
  const problem = migratedReviewProblem('review-partial', {
    source: { documentId: 'review-book', page: 7 },
  });
  await writeBank(rootDir, [problem], null, '1.1.0');
  const report = await buildProblemBankMigrationReport({ rootDir });
  equal(report.items[0].decision, 'ready');
  ok(report.items[0].issues.some(issue => issue.code === 'INCOMPLETE_PROVENANCE'));
  ok(report.items[0].issues.every(issue => issue.severity !== 'error'));
});

await test('review aşaması temel kaynak kimliği ister', async () => {
  const valid = migratedReviewProblem('review-ok', {
    source: { documentId: 'review-book', page: 11 },
  });
  ok(validateProblem(valid).valid, 'review should be accepted with base identity');
  const invalid = migratedReviewProblem('review-bad', { source: { documentId: 'review-book' } });
  ok(!validateProblem(invalid).valid, 'review without page should fail');
});

await test('approved ve published için sıkı provenance reddi çalışır', async () => {
  const approvedMissing = migratedApprovedProblem('approved-missing', {
    source: { type: 'manual', name: 'Approved Source', documentId: 'approved-book', page: 7, usage: 'concept_reference' },
  });
  ok(!validateProblem(approvedMissing).valid, 'approved missing strict provenance should fail');
  const publishedMissing = migratedApprovedProblem('published-missing', {
    status: 'published',
    source: { type: 'manual', name: 'Published Source', documentId: 'published-book', page: 7, usage: 'concept_reference', hash: 'sha256:published' },
  });
  ok(!validateProblem(publishedMissing).valid, 'published missing importedAt/license should fail');
});

await test('input mutate edilmez ve unknown alanlar korunur', async () => {
  const source = legacyProblem('mutate-check', {
    source: {
      documentId: 'mutable-book',
      page: 8,
      usage: 'concept_reference',
      extraProvenance: 'keep-me',
    },
    unknownRootField: 'persist',
  });
  const before = clone(source);
  const migrated = migrateProblemRecord(source, { targetSchemaVersion: PROBLEM_SCHEMA_VERSION, recordHash: 'sha256:record' });
  deepEqual(source, before, 'input must not be mutated');
  equal(migrated.unknownRootField, 'persist');
  equal(migrated.source.extraProvenance, 'keep-me');
  equal(migrated.migration.recordHash, 'sha256:record');
  ok(!migrated.source.hash, 'record hash must not become source.hash');
});

await test('rollback/all-or-nothing davranışı dosyaları korur', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ag-bank-rollback-'));
  const valid = legacyProblem('rollback-ok', {
    source: {
      documentId: 'rollback-book',
      page: 7,
      usage: 'concept_reference',
    },
  });
  const invalid = legacyProblem('rollback-bad', {
    source: { documentId: 'rollback-book' },
  });
  await writeBank(rootDir, [valid, invalid], null, '1.0.0');
  const before = await Promise.all([
    path.join(rootDir, 'content/problem-bank/index.json'),
    path.join(rootDir, 'content/problem-bank/problems/rollback-ok.json'),
    path.join(rootDir, 'content/problem-bank/problems/rollback-bad.json'),
  ].map(async file => sha256(await fs.readFile(file, 'utf8'))));
  const report = await buildProblemBankMigrationReport({ rootDir, apply: true });
  equal(report.writeResult.applied, false);
  equal(report.writeResult.reason, 'blocked-by-validation');
  const after = await Promise.all([
    path.join(rootDir, 'content/problem-bank/index.json'),
    path.join(rootDir, 'content/problem-bank/problems/rollback-ok.json'),
    path.join(rootDir, 'content/problem-bank/problems/rollback-bad.json'),
  ].map(async file => sha256(await fs.readFile(file, 'utf8'))));
  deepEqual(after, before, 'blocked apply must not change files');
});

await test('unsupported version reddedilir', async () => {
  const future = migratedApprovedProblem('future-version', { schemaVersion: '2.0.0' });
  ok(!validateProblem(future).valid, 'future schema must be rejected');
});

console.log(`\nToplam: ${passed + failed}  ✓ ${passed}  ✗ ${failed}`);
if (failed) process.exit(1);