import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { auditSourceCatalog, verifyLocalSourcePaths } from '../scripts/problem-bank/audit-sources.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const SOURCES_DIR = path.join(ROOT, 'content/problem-bank/sources');
const PROBLEM_DIR = path.join(ROOT, 'content/problem-bank/problems');
let passed = 0;
let failed = 0;

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log('  ?', name);
      passed++;
    })
    .catch(error => {
      console.error('  ?', name, '-', error.message);
      failed++;
    });
}

function ok(value, message = 'assertion failed') {
  assert.ok(value, message);
}

function equal(actual, expected, message) {
  assert.equal(actual, expected, message);
}

function stripBom(value) {
  return String(value ?? '').replace(/^\uFEFF/, '');
}

async function readJson(relativePath) {
  return JSON.parse(stripBom(await fs.readFile(path.join(ROOT, relativePath), 'utf8')));
}

async function fileSha256(relativePath) {
  const buffer = await fs.readFile(path.join(ROOT, relativePath));
  return crypto.createHash('sha256').update(buffer).digest('hex').toUpperCase();
}

async function writeTempCatalog(sources) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ag-bank-sources-'));
  const catalogPath = path.join(dir, 'catalog.json');
  const catalog = { schemaVersion: '1.0.0', updatedAt: '2026-07-05', sources };
  await fs.writeFile(catalogPath, JSON.stringify(catalog, null, 2), 'utf8');
  return { dir, catalogPath };
}

function baseSource() {
  return {
    sourceId: 'alpha',
    sourceType: 'pdf',
    title: 'Alpha',
    localPathKey: 'alpha-pdf',
    fileName: 'alpha.pdf',
    pageCount: 3,
    fileIdentity: { sha256: 'A'.repeat(64), pageCount: 3 },
    rights: { licenseStatus: 'unknown', rightsReviewRequired: true, distributionAllowed: false, allowedUse: 'reference-only', distributionScope: 'none', verificationLevel: 'page-reference-only' },
    documentMetadata: { title: 'Alpha' },
    pageLocator: { type: 'pdf-page', value: 1, relation: 'printed-page', confidence: 'confirmed' },
  };
}

async function scanForPdfs(dir) {
  const output = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      output.push(...await scanForPdfs(full));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
      output.push(path.relative(ROOT, full));
    }
  }
  return output;
}

await test('catalog and preview summary are deterministic', async () => {
  const report = await auditSourceCatalog();
  equal(report.summary.sourceCount, 2);
  equal(report.summary.mappedProblemCount, 3);
  equal(report.summary.ready, 3);
  equal(report.summary.blocked, 0);
  equal(report.summary.issueCount, 0);
  equal(report.issues.length, 0);
  equal(report.mappings.length, 3);
});

await test('falling-in-love-with-baduk hash and metadata are recorded', async () => {
  const catalog = await readJson('content/problem-bank/sources/catalog.json');
  const source = catalog.sources.find(item => item.sourceId === 'falling-in-love-with-baduk');
  ok(source);
  equal(source.fileIdentity.sha256, '9FD3989AF7C34C8FF1ADDEC279E3E890B72857B89D559DDF5A9E9BAE9A85E76E');
  equal(source.pageCount, 240);
  equal(source.documentMetadata.title, '001-007_\uC601\uBB38.pdf');
  equal(source.documentMetadata.creator, 'Fastserver (Esko-Graphics)');
  equal(source.visibleTitle, 'scan cover title not machine-extracted; page text layer absent');
  equal(source.visibleAuthor, 'not machine-extracted');
  equal(source.language, 'und');
  equal(source.textLayer, 'absent');
  equal(source.pageLocator.type, 'pdf-page');
  equal(source.pageLocator.confidence, 'probable');
  equal(source.rights.licenseStatus, 'permission-required');
  equal(source.rights.verificationLevel, 'page-reference-only');
  equal(source.rights.distributionAllowed, false);
  equal(source.rights.rightsReviewRequired, true);
  equal(source.rights.allowedUse, 'reference-only');
  equal(source.rights.distributionScope, 'none');
});

await test('igotext hash and metadata are recorded without over-claiming rights', async () => {
  const catalog = await readJson('content/problem-bank/sources/catalog.json');
  const source = catalog.sources.find(item => item.sourceId === 'igotext');
  ok(source);
  equal(source.fileIdentity.sha256, 'C75EA776F5EB38A28ECF4F5C623C22D4B0B85B7F39B99720E0349B0F571536D0');
  equal(source.pageCount, 65);
  equal(source.documentMetadata.title, '\u95A2\u897F\u68CB\u9662 \u56F2\u7881\u5165\u9580\u30C6\u30AD\u30B9\u30C8');
  equal(source.documentMetadata.author, 'Junji MASAMITSU');
  equal(source.visibleTitle, '????????');
  equal(source.visibleAuthor, 'Junji MASAMITSU');
  equal(source.language, 'ja');
  equal(source.textLayer, 'present');
  equal(source.pageLocator.type, 'printed-page');
  equal(source.pageLocator.value, 2);
  equal(source.rights.licenseStatus, 'permission-granted-noncommercial');
  equal(source.rights.distributionAllowed, false);
  equal(source.rights.rightsReviewRequired, true);
  equal(source.rights.allowedUse, 'noncommercial-only');
  equal(source.rights.distributionScope, 'noncommercial-only');
  ok(String(source.rights.rightsNote).includes('noncommercial'));
  ok(String(source.pageRelation).includes('printed-page 2'));
});

await test('current problems map to probable page references', async () => {
  const report = await auditSourceCatalog();
  const ids = new Map(report.mappings.map(entry => [entry.problemId, entry]));
  equal(ids.get('b1-l2-liberty-count-0001').pageClassification, 'probable');
  equal(ids.get('b1-l3-capture-0001').pageClassification, 'probable');
  equal(ids.get('b2-l10-ladder-sequence-0001').pageClassification, 'probable');
  equal(ids.get('b1-l2-liberty-count-0001').locatorType, 'pdf-page');
});

await test('reconciliation output is deterministic and canonical preview is absent', async () => {
  const first = await auditSourceCatalog();
  const second = await auditSourceCatalog();
  equal(JSON.stringify(first), JSON.stringify(second), 'reconciliation output must be deterministic');
  ok(JSON.stringify(first).includes('falling-in-love-with-baduk'));
  const previewExists = await fs.access(path.join(SOURCES_DIR, 'reconciliation-preview.json')).then(() => true).catch(() => false);
  equal(previewExists, false, 'canonical reconciliation-preview.json must not exist');
});

await test('audit output does not leak absolute local paths', async () => {
  const report = await auditSourceCatalog();
  const output = JSON.stringify(report);
  const leakPattern = /[A-Za-z]:\\|\/Users\/|OneDrive|Masa?st?|Masaustu/;
  ok(!leakPattern.test(output), 'audit output leaked an absolute path');
});

await test('duplicate sourceId is rejected', async () => {
  const source = baseSource();
  const { catalogPath } = await writeTempCatalog([
    source,
    { ...source, title: 'Beta', fileIdentity: { sha256: 'B'.repeat(64), pageCount: 3 } },
  ]);
  const report = await auditSourceCatalog({ catalogPath });
  ok(report.issues.some(issue => issue.code === 'DUPLICATE_SOURCE_ID'));
});

await test('duplicate fileHash is rejected', async () => {
  const source = baseSource();
  const { catalogPath } = await writeTempCatalog([
    source,
    { ...source, sourceId: 'beta' },
  ]);
  const report = await auditSourceCatalog({ catalogPath });
  ok(report.issues.some(issue => issue.code === 'DUPLICATE_FILE_HASH'));
});

await test('invalid hash is rejected', async () => {
  const source = baseSource();
  source.fileIdentity.sha256 = 'not-a-hash';
  const { catalogPath } = await writeTempCatalog([source]);
  const report = await auditSourceCatalog({ catalogPath });
  ok(report.issues.some(issue => issue.code === 'INVALID_SOURCE_HASH'));
});

await test('unknown rights status is reported but not treated as fatal', async () => {
  const source = baseSource();
  source.rights.licenseStatus = 'mystery-rights';
  const { catalogPath } = await writeTempCatalog([source]);
  const report = await auditSourceCatalog({ catalogPath });
  ok(report.issues.some(issue => issue.code === 'UNKNOWN_RIGHTS_STATUS'));
});

await test('locator page out of range is rejected', async () => {
  const source = baseSource();
  source.pageLocator.value = 99;
  const { catalogPath } = await writeTempCatalog([source]);
  const report = await auditSourceCatalog({ catalogPath });
  ok(report.issues.some(issue => issue.code === 'LOCATOR_PAGE_OUT_OF_RANGE'));
});

await test('unknown sourceId is reported', async () => {
  const source = baseSource();
  source.sourceId = 'different-source';
  const { catalogPath } = await writeTempCatalog([source]);
  const report = await auditSourceCatalog({ catalogPath });
  ok(report.issues.some(issue => issue.code === 'UNKNOWN_SOURCE_ID'));
});

await test('local-paths file absence is allowed and verify helper passes', async () => {
  const report = await verifyLocalSourcePaths();
  equal(report.present, false);
  equal(report.issues.length, 0);
});

await test('repository does not contain copied PDF files', async () => {
  const pdfs = await scanForPdfs(ROOT);
  ok(!pdfs.some(file => file.toLowerCase().includes('falling-in-love-with-baduk copy.pdf')));
  ok(!pdfs.some(file => file.toLowerCase().includes('igotext copy.pdf')));
});

await test('dry-run style commands do not mutate real problem files', async () => {
  const before = {
    a: await fileSha256('content/problem-bank/problems/b1-l2-liberty-count-0001.json'),
    b: await fileSha256('content/problem-bank/problems/b1-l3-capture-0001.json'),
    c: await fileSha256('content/problem-bank/problems/b2-l10-ladder-sequence-0001.json'),
  };
  await auditSourceCatalog();
  await auditSourceCatalog();
  const after = {
    a: await fileSha256('content/problem-bank/problems/b1-l2-liberty-count-0001.json'),
    b: await fileSha256('content/problem-bank/problems/b1-l3-capture-0001.json'),
    c: await fileSha256('content/problem-bank/problems/b2-l10-ladder-sequence-0001.json'),
  };
  assert.deepEqual(after, before);
});

process.on('beforeExit', () => {
  console.log(`  ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
});
