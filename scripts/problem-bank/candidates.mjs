import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '../..');
const CATALOG_PATH = 'content/problem-bank/sources/catalog.json';
const CANDIDATES_DIR = 'content/problem-bank/candidates';
const ITEMS_DIR = path.join(ROOT, CANDIDATES_DIR, 'items');
const VALID_STATUSES = new Set(['extracted', 'needs-review', 'rejected', 'promoted']);
const VALID_METHODS = new Set(['manual', 'assisted', 'ocr', 'vision', 'sgf', 'mixed']);
const VALID_LOCATOR_TYPES = new Set(['pdf-page', 'printed-page', 'section', 'unresolved']);

function stripBom(value) {
  return String(value ?? '').replace(/^\uFEFF/, '');
}

async function readJson(relativePath) {
  const fullPath = path.isAbsolute(relativePath) ? relativePath : path.join(ROOT, relativePath);
  const text = stripBom(await fs.readFile(fullPath, 'utf8'));
  return { fullPath, data: JSON.parse(text) };
}

function clone(value) {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function isObj(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function isIsoDateTime(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function normalizeCandidate(candidate) {
  const normalized = clone(candidate);
  normalized.candidateVersion ??= '1.0.0';
  normalized.review ??= {};
  normalized.review.required ??= true;
  normalized.review.checklist ??= [];
  normalized.rights ??= {};
  normalized.rights.canPublish ??= false;
  normalized.rights.needsRightsReview ??= true;
  normalized.curriculum ??= { section: '', lesson: '', skill: '', tags: [] };
  normalized.board ??= { size: 9, initialStones: [], markers: [] };
  normalized.board.initialStones ??= [];
  normalized.board.markers ??= [];
  normalized.task ??= { type: '', prompt: '', expectedAnswer: null, answerPolicy: '' };
  normalized.extraction ??= { method: 'manual', extractedAt: '', extractor: '', confidence: 0, notes: '' };
  normalized.source ??= { sourceId: '', locator: { type: 'unresolved', value: 'unresolved' }, usage: 'concept_reference' };
  normalized.source.locator ??= { type: 'unresolved', value: 'unresolved' };
  return normalized;
}

function candidateStatusTransitions() {
  return {
    extracted: new Set(['needs-review', 'rejected']),
    'needs-review': new Set(['rejected', 'promoted']),
    rejected: new Set([]),
    promoted: new Set([]),
  };
}

function canTransitionCandidateStatus(from, to) {
  return candidateStatusTransitions()[from]?.has(to) ?? false;
}

async function loadCatalog(rootDir = ROOT) {
  return (await readJson(path.join(rootDir, CATALOG_PATH))).data;
}

function findCatalogSource(catalog, sourceId) {
  return (catalog?.sources || []).find(source => source.sourceId === sourceId) || null;
}

function validateCandidate(candidate, catalog) {
  const issues = [];
  const normalized = normalizeCandidate(candidate);

  if (!candidate || typeof candidate !== 'object') {
    issues.push({ severity: 'error', code: 'INVALID_CANDIDATE_SHAPE', message: 'candidate must be an object.' });
    return { valid: false, issues, normalized: null };
  }
  if (!normalized.candidateId || typeof normalized.candidateId !== 'string') {
    issues.push({ severity: 'error', code: 'MISSING_CANDIDATE_ID', message: 'candidateId is required.' });
  }
  if (!normalized.candidateVersion || typeof normalized.candidateVersion !== 'string') {
    issues.push({ severity: 'error', code: 'MISSING_CANDIDATE_VERSION', message: 'candidateVersion is required.' });
  }
  if (!VALID_STATUSES.has(normalized.status)) {
    issues.push({ severity: 'error', code: 'INVALID_CANDIDATE_STATUS', message: `unknown status: ${normalized.status}` });
  }

  if (!isObj(normalized.source)) {
    issues.push({ severity: 'error', code: 'MISSING_SOURCE', message: 'source is required.' });
  } else {
    if (!normalized.source.sourceId || typeof normalized.source.sourceId !== 'string') {
      issues.push({ severity: 'error', code: 'MISSING_SOURCE_ID', message: 'source.sourceId is required.' });
    } else if (catalog && !findCatalogSource(catalog, normalized.source.sourceId)) {
      issues.push({ severity: 'error', code: 'UNKNOWN_SOURCE_ID', message: `unknown sourceId: ${normalized.source.sourceId}` });
    }
    const locator = normalized.source.locator;
    if (!isObj(locator)) {
      issues.push({ severity: 'error', code: 'MISSING_LOCATOR', message: 'source.locator is required.' });
    } else {
      if (!VALID_LOCATOR_TYPES.has(locator.type)) {
        issues.push({ severity: 'error', code: 'INVALID_LOCATOR_TYPE', message: `invalid locator type: ${locator.type}` });
      }
      if (!(typeof locator.value === 'number' || typeof locator.value === 'string')) {
        issues.push({ severity: 'error', code: 'INVALID_LOCATOR_VALUE', message: 'locator value must be a number or string.' });
      }
      const source = catalog ? findCatalogSource(catalog, normalized.source.sourceId) : null;
      if (source && Number.isInteger(source.pageCount) && typeof locator.value === 'number' && locator.value > source.pageCount) {
        issues.push({ severity: 'error', code: 'LOCATOR_PAGE_OUT_OF_RANGE', message: `locator page ${locator.value} exceeds source pageCount ${source.pageCount}` });
      }
    }
    if (!normalized.source.usage || typeof normalized.source.usage !== 'string') {
      issues.push({ severity: 'error', code: 'MISSING_SOURCE_USAGE', message: 'source.usage is required.' });
    }
  }

  if (!isObj(normalized.extraction)) {
    issues.push({ severity: 'error', code: 'MISSING_EXTRACTION', message: 'extraction is required.' });
  } else {
    if (!VALID_METHODS.has(normalized.extraction.method)) {
      issues.push({ severity: 'error', code: 'INVALID_EXTRACTION_METHOD', message: `invalid extraction method: ${normalized.extraction.method}` });
    }
    if (!isIsoDateTime(normalized.extraction.extractedAt)) {
      issues.push({ severity: 'error', code: 'INVALID_EXTRACTED_AT', message: 'extractedAt must be an ISO-8601 date-time.' });
    }
    if (typeof normalized.extraction.extractor !== 'string' || !normalized.extraction.extractor.trim()) {
      issues.push({ severity: 'error', code: 'INVALID_EXTRACTOR', message: 'extractor is required.' });
    }
    if (!(typeof normalized.extraction.confidence === 'number' && normalized.extraction.confidence >= 0 && normalized.extraction.confidence <= 1)) {
      issues.push({ severity: 'error', code: 'INVALID_CONFIDENCE', message: 'confidence must be between 0 and 1.' });
    }
  }

  if (!isObj(normalized.review) || normalized.review.required !== true) {
    issues.push({ severity: 'error', code: 'REVIEW_REQUIRED_TRUE', message: 'review.required must be true.' });
  }
  if (!isObj(normalized.rights)) {
    issues.push({ severity: 'error', code: 'MISSING_RIGHTS', message: 'rights is required.' });
  } else {
    if (normalized.rights.canPublish !== false) {
      issues.push({ severity: 'error', code: 'RIGHTS_CAN_PUBLISH_FALSE', message: 'rights.canPublish must default to false.' });
    }
    if (normalized.rights.needsRightsReview !== true) {
      issues.push({ severity: 'error', code: 'RIGHTS_NEEDS_REVIEW_TRUE', message: 'rights.needsRightsReview must default to true.' });
    }
  }

  if (!isObj(normalized.board) || !Number.isInteger(normalized.board.size)) {
    issues.push({ severity: 'error', code: 'INVALID_BOARD', message: 'board.size is required.' });
  }

  return { valid: issues.length === 0, issues, normalized };
}

function candidateToProblemPreview(candidate) {
  const normalized = normalizeCandidate(candidate);
  return {
    schemaVersion: '1.1.0',
    revision: 1,
    status: 'review',
    id: normalized.candidateId,
    title: normalized.task.prompt || normalized.candidateId,
    source: {
      sourceId: normalized.source.sourceId,
      locator: {
        type: normalized.source.locator.type,
        value: normalized.source.locator.value,
      },
      usage: normalized.source.usage,
    },
    board: {
      size: normalized.board.size,
      initialStones: normalized.board.initialStones,
      markers: normalized.board.markers,
    },
    curriculum: normalized.curriculum,
    task: normalized.task,
    review: normalized.review,
    rights: normalized.rights,
    studio: normalized.studio ?? null,
  };
}

async function readCandidateFiles(rootDir = ROOT) {
  const itemsDir = path.join(rootDir, CANDIDATES_DIR, 'items');
  const exists = await fs.access(itemsDir).then(() => true).catch(() => false);
  if (!exists) return [];
  const entries = await fs.readdir(itemsDir, { withFileTypes: true });
  const items = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const fullPath = path.join(itemsDir, entry.name);
    const text = stripBom(await fs.readFile(fullPath, 'utf8'));
    items.push({ fullPath, data: JSON.parse(text) });
  }
  return items;
}

async function auditCandidateCatalog({ rootDir = ROOT } = {}) {
  const catalog = await loadCatalog(rootDir);
  const items = await readCandidateFiles(rootDir);
  const issues = [];
  const reports = [];
  for (const item of items) {
    const result = validateCandidate(item.data, catalog);
    const normalized = result.normalized;
    const source = normalized?.source?.sourceId ? findCatalogSource(catalog, normalized.source.sourceId) : null;
    for (const issue of result.issues) {
      issues.push({ ...issue, candidateId: normalized?.candidateId ?? null, path: path.relative(rootDir, item.fullPath) });
    }
    reports.push({
      candidateId: normalized?.candidateId ?? null,
      candidateVersion: normalized?.candidateVersion ?? null,
      status: normalized?.status ?? null,
      sourceId: normalized?.source?.sourceId ?? null,
      locatorType: normalized?.source?.locator?.type ?? null,
      locatorValue: normalized?.source?.locator?.value ?? null,
      catalogSourceFound: Boolean(source),
      sourcePageCount: source?.pageCount ?? null,
      reviewRequired: normalized?.review?.required ?? null,
      canPublish: normalized?.rights?.canPublish ?? null,
      needsRightsReview: normalized?.rights?.needsRightsReview ?? null,
      studioCompatible: normalized?.studio?.compatible ?? null,
      issueCount: result.issues.length,
      issues: result.issues,
      normalized,
      canPromote: normalized?.status === 'promoted' && result.valid,
    });
  }
  const summary = {
    candidateCount: reports.length,
    extracted: reports.filter(item => item.status === 'extracted').length,
    needsReview: reports.filter(item => item.status === 'needs-review').length,
    rejected: reports.filter(item => item.status === 'rejected').length,
    promoted: reports.filter(item => item.status === 'promoted').length,
    valid: reports.filter(item => item.issueCount === 0).length,
    issueCount: issues.length,
    sourceCount: new Set(reports.map(item => item.sourceId).filter(Boolean)).size,
  };
  return { catalog, items: reports, issues, summary };
}

async function buildCandidatePromotionReport({ rootDir = ROOT, apply = false } = {}) {
  const audit = await auditCandidateCatalog({ rootDir });
  return {
    summary: {
      ...audit.summary,
      promotableCount: audit.items.filter(item => item.canPromote).length,
      changeCount: 0,
    },
    items: audit.items.map(item => ({
      candidateId: item.candidateId,
      status: item.status,
      sourceId: item.sourceId,
      locatorType: item.locatorType,
      locatorValue: item.locatorValue,
      canPromote: item.canPromote,
      issueCount: item.issueCount,
      issues: item.issues,
      preview: item.canPromote ? candidateToProblemPreview(item.normalized) : null,
      writeResult: null,
    })),
    writeResult: null,
    apply: Boolean(apply),
    issues: audit.issues,
  };
}

async function mainAudit() {
  const json = process.argv.includes('--json');
  const report = await auditCandidateCatalog();
  if (json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    return;
  }
  console.log(`Candidate catalog: ${report.summary.candidateCount} items`);
  console.log(`Status counts: extracted=${report.summary.extracted}, needs-review=${report.summary.needsReview}, rejected=${report.summary.rejected}, promoted=${report.summary.promoted}`);
  console.log(`Valid: ${report.summary.valid}`);
  console.log(`Issues: ${report.summary.issueCount}`);
  for (const item of report.items) {
    console.log(`- ${item.candidateId}: ${item.status} -> ${item.sourceId}/${item.locatorType}:${item.locatorValue}`);
  }
  if (report.issues.length) process.exitCode = 1;
}

async function mainPromote() {
  const json = process.argv.includes('--json');
  const apply = process.argv.includes('--apply');
  const report = await buildCandidatePromotionReport({ apply });
  if (json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    return;
  }
  console.log('Candidate promotion preview');
  console.log(`  Items: ${report.summary.candidateCount}`);
  console.log(`  Promotable: ${report.summary.promotableCount}`);
  console.log(`  Change count: ${report.summary.changeCount}`);
  console.log(`  Mode: ${apply ? 'apply (preview-only in phase 5)' : 'dry-run'}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const script = path.basename(process.argv[1]);
  if (script === 'audit-candidates.mjs') {
    await mainAudit();
  } else if (script === 'promote-candidate.mjs') {
    await mainPromote();
  }
}

export {
  ROOT,
  CANDIDATES_DIR,
  VALID_STATUSES,
  VALID_METHODS,
  VALID_LOCATOR_TYPES,
  normalizeCandidate,
  candidateStatusTransitions,
  canTransitionCandidateStatus,
  validateCandidate,
  candidateToProblemPreview,
  auditCandidateCatalog,
  buildCandidatePromotionReport,
};
