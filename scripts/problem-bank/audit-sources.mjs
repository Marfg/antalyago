import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(import.meta.dirname, '../..');
const CATALOG_PATH = 'content/problem-bank/sources/catalog.json';
const LOCAL_PATHS_PATH = 'content/problem-bank/sources/local-paths.json';
const SOURCE_DIR = path.join(ROOT, 'content/problem-bank/problems');
const CANONICAL_STATUS_VALUES = ['draft', 'review', 'approved', 'published', 'retired'];

function stripBom(value) {
  return String(value ?? '').replace(/^\uFEFF/, '');
}

async function readJson(relativePath) {
  const fullPath = path.isAbsolute(relativePath) ? relativePath : path.join(ROOT, relativePath);
  const text = stripBom(await fs.readFile(fullPath, 'utf8'));
  return { fullPath, data: JSON.parse(text) };
}

function absolutePathPattern(value) {
  return typeof value === 'string' && (/^[A-Za-z]:\\/.test(value) || value.startsWith('\\\\') || value.startsWith('/'));
}

function collectStrings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const item of value) collectStrings(item, out);
  else if (value && typeof value === 'object') for (const nested of Object.values(value)) collectStrings(nested, out);
  return out;
}

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex').toUpperCase();
}

function pageLocatorConfidence(locator) {
  if (locator && ['confirmed', 'probable', 'mismatch', 'unresolved'].includes(locator.confidence)) return locator.confidence;
  return 'confirmed';
}

function classifyPageReference(problem, source) {
  const locator = problem?.source?.locator || null;
  const catalogLocator = source?.pageLocator || null;
  const confidence = pageLocatorConfidence(catalogLocator);
  const page = locator?.value;
  if (!source) return { classification: 'unresolved', locatorType: locator?.type || 'unresolved', reason: 'no matching sourceId in catalog.' };
  if (!locator || typeof locator !== 'object' || !locator.type) {
    return { classification: 'unresolved', locatorType: 'unresolved', reason: 'problem source.locator missing.' };
  }
  if (!Number.isInteger(page)) return { classification: 'unresolved', locatorType: locator.type || 'unresolved', reason: 'problem source.locator.value missing.' };
  if (Number.isInteger(source.pageCount) && (page < 1 || page > source.pageCount)) {
    return { classification: 'mismatch', locatorType: locator.type || 'unresolved', reason: 'problem source.locator.value is outside source page bounds.' };
  }
  if (catalogLocator?.confidence === 'mismatch') return { classification: 'mismatch', locatorType: locator.type || 'unresolved', reason: 'catalog locator marked mismatch.' };
  if (catalogLocator?.type === 'unresolved') return { classification: 'unresolved', locatorType: 'unresolved', reason: 'locator unresolved.' };
  if (confidence === 'probable') return { classification: 'probable', locatorType: locator.type || 'pdf-page', reason: 'locator marked probable.' };
  return { classification: 'confirmed', locatorType: locator.type || 'pdf-page', reason: 'problem source.locator.value is within the source page range.' };
}

function validateCatalog(catalog, issues) {
  const seenSourceIds = new Set();
  const seenHashes = new Set();
  for (const source of catalog.sources || []) {
    if (seenSourceIds.has(source.sourceId)) issues.push({ severity: 'error', code: 'DUPLICATE_SOURCE_ID', sourceId: source.sourceId });
    seenSourceIds.add(source.sourceId);
    if (!/^[A-Fa-f0-9]{64}$/.test(String(source.fileIdentity?.sha256 || ''))) {
      issues.push({ severity: 'error', code: 'INVALID_SOURCE_HASH', sourceId: source.sourceId });
    }
    const normalizedHash = String(source.fileIdentity?.sha256 || '').toUpperCase();
    if (normalizedHash && seenHashes.has(normalizedHash)) {
      issues.push({ severity: 'error', code: 'DUPLICATE_FILE_HASH', sourceId: source.sourceId, hash: normalizedHash });
    }
    if (normalizedHash) seenHashes.add(normalizedHash);
    const strings = collectStrings(source);
    for (const value of strings) {
      if (absolutePathPattern(value)) {
        issues.push({ severity: 'error', code: 'ABSOLUTE_PATH_EXPOSED', sourceId: source.sourceId, value });
      }
    }
    if (source.rights && !['unknown', 'permission-required', 'permission-granted-noncommercial', 'review-required', 'restricted', 'licensed', 'public_domain'].includes(source.rights.licenseStatus)) {
      issues.push({ severity: 'warning', code: 'UNKNOWN_RIGHTS_STATUS', sourceId: source.sourceId, licenseStatus: source.rights.licenseStatus });
    }
    if (!source.localPathKey) {
      issues.push({ severity: 'info', code: 'LOCAL_PATH_KEY_MISSING', sourceId: source.sourceId });
    }
    if (source.pageLocator && Number.isInteger(source.pageLocator.value) && Number.isInteger(source.pageCount) && (source.pageLocator.value < 1 || source.pageLocator.value > source.pageCount)) {
      issues.push({ severity: 'error', code: 'LOCATOR_PAGE_OUT_OF_RANGE', sourceId: source.sourceId, page: source.pageLocator.value, pageCount: source.pageCount });
    }
  }
}

function canonicalTargetStatus(problem) {
  if (CANONICAL_STATUS_VALUES.includes(problem?.status)) return problem.status;
  if (problem?.status === 'verified') return 'review';
  if (problem?.status === 'published') return 'published';
  if (['raw', 'analyzed', 'mapped'].includes(problem?.status)) return 'draft';
  if (problem?.status === 'sgf_ready') return 'approved';
  return 'draft';
}

function classifyProblems(catalog, problems, issues) {
  const sourceById = new Map((catalog.sources || []).map(source => [source.sourceId, source]));
  return problems.map(problem => {
    const sourceId = problem?.source?.sourceId || null;
    const source = sourceById.get(sourceId);
    if (!source) {
      issues.push({ severity: 'warning', code: 'UNKNOWN_SOURCE_ID', problemId: problem.id, sourceId });
    }
    const page = classifyPageReference(problem, source);
    if (page.classification === 'mismatch') {
      issues.push({ severity: 'warning', code: 'PAGE_LOCATOR_MISMATCH', problemId: problem.id, sourceId, locator: problem?.source?.locator || null });
    }
    return {
      problemId: problem.id,
      sourceId,
      locator: problem?.source?.locator || null,
      pageLocator: source?.pageLocator || null,
      pageClassification: page.classification,
      locatorType: page.locatorType,
      reason: page.reason,
      targetStatus: canonicalTargetStatus(problem),
      legacyStatus: problem.status || null,
    };
  });
}

export async function auditSourceCatalog({ catalogPath = CATALOG_PATH, localPathsPath = LOCAL_PATHS_PATH } = {}) {
  const catalogRead = await readJson(catalogPath);
  const issues = [];
  validateCatalog(catalogRead.data, issues);

  const localPathsExists = await fs.access(path.join(ROOT, localPathsPath)).then(() => true).catch(() => false);
  if (localPathsExists) {
    issues.push({ severity: 'warning', code: 'LOCAL_PATHS_FILE_PRESENT', path: localPathsPath });
  }

  const dirEntries = await fs.readdir(SOURCE_DIR, { withFileTypes: true });
  const problems = [];
  for (const file of dirEntries.filter(entry => entry.isFile() && entry.name.endsWith('.json'))) {
    const { data } = await readJson(path.join('content/problem-bank/problems', file.name));
    problems.push(data);
  }
  const mappings = classifyProblems(catalogRead.data, problems, issues);

  const summary = {
    sourceCount: (catalogRead.data.sources || []).length,
    mappedProblemCount: mappings.length,
    ready: mappings.filter(item => item.pageClassification !== 'mismatch').length,
    blocked: mappings.filter(item => item.pageClassification === 'mismatch').length,
    issueCount: issues.length,
    sourceHashCount: new Set((catalogRead.data.sources || []).map(source => String(source.fileIdentity?.sha256 || '').toUpperCase()).filter(Boolean)).size,
  };

  return { catalog: catalogRead.data, mappings, summary, issues };
}

export async function verifyLocalSourcePaths() {
  const fullPath = path.join(ROOT, LOCAL_PATHS_PATH);
  const exists = await fs.access(fullPath).then(() => true).catch(() => false);
  if (!exists) return { present: false, issues: [], summary: { present: false } };
  const data = JSON.parse(stripBom(await fs.readFile(fullPath, 'utf8')));
  const issues = [];
  for (const [key, value] of Object.entries(data || {})) {
    if (absolutePathPattern(value)) {
      issues.push({ severity: 'error', code: 'ABSOLUTE_LOCAL_PATH_EXPOSED', key, value });
    }
  }
  return { present: true, issues, summary: { present: true, keyCount: Object.keys(data || {}).length } };
}

async function main() {
  const json = process.argv.includes('--json');
  const report = await auditSourceCatalog();
  if (json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    return;
  }
  console.log(`Source catalog: ${report.summary.sourceCount} sources`);
  console.log(`Reconciliation preview: ready=${report.summary.ready}, blocked=${report.summary.blocked}, mapped=${report.summary.mappedProblemCount}`);
  for (const mapping of report.mappings) {
    console.log(`- ${mapping.problemId}: ${mapping.pageClassification}/${mapping.locatorType} -> ${mapping.targetStatus}`);
  }
  console.log(`Issues: ${report.summary.issueCount}`);
  if (report.issues.length) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

function pathToFileURL(value) {
  const url = new URL('file://');
  const normalized = path.resolve(value).replace(/\\/g, '/');
  url.pathname = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return url;
}
