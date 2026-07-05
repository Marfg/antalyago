import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PROBLEM_SCHEMA_VERSION, canonicalProblemStatus, buildProblemMigrationPlan, migrateProblemRecord, provenancePolicyForStatus, validateProblem } from '../../core/problemBank.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const DEFAULT_INDEX = 'content/problem-bank/index.json';
const STAGING_ROOT_NAME = '.ag-bank-migration-staging';

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function normalizeJsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function countMap(items, keyOf) {
  const counts = new Map();
  for (const item of items) {
    const key = keyOf(item);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort(([a], [b]) => String(a).localeCompare(String(b), 'tr'));
}

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function sourceIdentifier(problem) {
  const source = problem?.source || {};
  return hasValue(source.name) || hasValue(source.documentId);
}

function clone(value) {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function collectProvenanceIssues(problem, migrated, plan) {
  const source = migrated.source || {};
  const policy = provenancePolicyForStatus(migrated.status);
  const issues = [];
  const missing = new Set(plan.missingSourceFields || []);
  const advisory = new Set(plan.advisorySourceFields || []);
  const typeMissing = !hasValue(source.type);
  const identifierMissing = !sourceIdentifier(migrated);
  const licenseMissing = !hasValue(source.license);

  if (missing.size) {
    issues.push({
      severity: 'error',
      code: 'PROVENANCE_INCOMPLETE',
      message: `${[...missing].join(', ')} zorunlu`,
      missing: [...missing],
    });
  }

  if ((policy.status === 'draft' || policy.status === 'review') && advisory.size) {
    issues.push({
      severity: policy.status === 'draft' ? 'info' : 'warning',
      code: 'INCOMPLETE_PROVENANCE',
      message: `${[...advisory].join(', ')} eksik`,
      missing: [...advisory],
    });
  }

  if (policy.status === 'approved' || policy.status === 'published' || policy.status === 'retired') {
    const strictMissing = [];
    if (typeMissing) strictMissing.push('source.type');
    if (identifierMissing) strictMissing.push('source.identifier');
    if (!Number.isInteger(source.page) || source.page < 1) strictMissing.push('source.page');
    if (!hasValue(source.usage)) strictMissing.push('source.usage');
    if (!hasValue(source.hash)) strictMissing.push('source.hash');
    if (!hasValue(source.importedAt)) strictMissing.push('source.importedAt');
    if (licenseMissing) strictMissing.push('source.license');
    if (strictMissing.length) {
      issues.push({
        severity: 'error',
        code: 'PROVENANCE_INCOMPLETE',
        message: `${strictMissing.join(', ')} zorunlu`,
        missing: strictMissing,
      });
    }
  }

  return issues;
}

function decisionFromIssues(issues) {
  return issues.some(issue => issue.severity === 'error') ? 'blocked' : 'ready';
}

async function ensureDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function readJsonFile(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function writeJsonFile(filePath, value) {
  await ensureDir(filePath);
  await fs.writeFile(filePath, normalizeJsonText(value), 'utf8');
}

async function safeRemove(filePath) {
  await fs.rm(filePath, { force: true, recursive: true }).catch(() => {});
}

async function replaceFileAtomically({ targetPath, stagedPath, backupSuffix }) {
  const backupPath = `${targetPath}.${backupSuffix}.bak`;
  let targetMoved = false;
  try {
    try {
      await fs.rename(targetPath, backupPath);
      targetMoved = true;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await fs.rename(stagedPath, targetPath);
    return { backupPath, targetMoved };
  } catch (error) {
    if (targetMoved) {
      await fs.rename(backupPath, targetPath).catch(() => {});
    }
    throw error;
  }
}

async function rollbackAppliedFiles(applied) {
  for (const entry of applied.reverse()) {
    try {
      await fs.rename(entry.targetPath, entry.stagedBackupPath).catch(async () => {
        await safeRemove(entry.targetPath);
        if (await exists(entry.backupPath)) {
          await fs.rename(entry.backupPath, entry.targetPath);
        }
      });
    } catch {
      // Best-effort rollback; tests verify the success path and blocked path.
    }
    await safeRemove(entry.backupPath);
  }
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function formatProblemDecision(item) {
  if (item.decision === 'ready') {
    if (item.issues.length) {
      return `ready (${item.issues.map(issue => issue.code).join(', ')})`;
    }
    return 'ready';
  }
  const reason = item.issues.map(issue => `${issue.code}: ${issue.missing.join(', ')}`).join(' | ');
  return `blocked (${reason})`;
}

function renderReport(report) {
  const lines = [];
  const push = (...parts) => lines.push(parts.join(''));
  push('AG-BANK Migration Dry Run');
  push('Root: ', report.rootDir);
  push('Index: ', report.indexPath);
  push('Target schema: ', report.targetSchemaVersion);
  push('Mode: ', report.apply ? 'apply' : 'dry-run');
  push('Generated: ', report.generatedAt);
  push('');
  push('Summary');
  push('  Entries: ', report.summary.totalEntries);
  push('  Ready: ', report.summary.readyEntries);
  push('  Blocked: ', report.summary.blockedEntries);
  push('  Current schema versions:');
  for (const [version, count] of report.summary.currentSchemaVersions) push('    ', version, ': ', count);
  push('  Canonical status preview:');
  for (const [status, count] of report.summary.canonicalStatuses) push('    ', status, ': ', count);
  push('');
  push('Problems');
  for (const item of report.items) {
    push('  - ', item.problemId, ' [', item.currentVersion || 'none', ' → ', item.targetVersion, '] ');
    push(formatProblemDecision(item));
    push(' | status=', item.policyStatus || 'draft');
    if (item.currentHash && item.candidateHash) push(' | sha256=', item.currentHash, ' → ', item.candidateHash);
  }
  push('');
  push('Warnings');
  const warnings = report.items.flatMap(item => item.issues.filter(issue => issue.severity !== 'error').map(issue => ({ item, issue })));
  if (!warnings.length) {
    push('  (none)');
  } else {
    for (const { item, issue } of warnings) {
      push('  - ', item.problemId, ': ', issue.code, ' ', issue.message);
    }
  }
  return lines.join('\n');
}

async function loadBank(rootDir, indexUrl) {
  const indexPath = path.resolve(rootDir, indexUrl);
  const index = await readJsonFile(indexPath);
  const entries = [];
  for (const entry of index.problems || []) {
    const filePath = path.resolve(rootDir, 'content/problem-bank', entry.path);
    const raw = await fs.readFile(filePath, 'utf8');
    const currentHash = sha256(raw);
    const problem = JSON.parse(raw);
    const plan = buildProblemMigrationPlan(problem, {
      targetSchemaVersion: PROBLEM_SCHEMA_VERSION,
      recordHash: currentHash,
      fileRef: entry.path,
    });
    const candidate = migrateProblemRecord(problem, {
      targetSchemaVersion: PROBLEM_SCHEMA_VERSION,
      recordHash: currentHash,
      fileRef: entry.path,
    });
    const currentText = normalizeJsonText(problem);
    const candidateText = normalizeJsonText(candidate);
    const candidateHash = sha256(candidateText);
    const issues = collectProvenanceIssues(problem, candidate, plan);
    const decision = decisionFromIssues(issues);
    entries.push({
      id: plan.problemId,
      path: entry.path,
      currentVersion: plan.currentVersion,
      targetVersion: plan.targetVersion,
      canonicalStatus: canonicalProblemStatus(problem.status),
      policyStatus: candidate.status,
      legacyStatus: plan.legacyStatus,
      recordHash: plan.recordHash,
      currentHash,
      candidateHash,
      currentRawText: raw,
      currentText,
      candidateText,
      issues,
      decision,
      plan,
      candidate,
    });
  }
  return { indexPath, index, entries };
}

async function applyMigration({ rootDir, indexPath, index, entries, targetSchemaVersion }) {
  const blocked = entries.filter(entry => entry.decision !== 'ready');
  if (blocked.length) {
    return {
      applied: false,
      reason: 'blocked-by-validation',
      blocked: blocked.map(entry => ({
        problemId: entry.id,
        path: entry.path,
        reasons: entry.issues.map(issue => ({ code: issue.code, severity: issue.severity, message: issue.message, missing: issue.missing })),
      })),
    };
  }

  const nextIndex = {
    ...index,
    schemaVersion: targetSchemaVersion,
    updatedAt: new Date().toISOString(),
  };
  const nextIndexText = normalizeJsonText(nextIndex);
  const nextIndexHash = sha256(nextIndexText);
  if (index.schemaVersion === targetSchemaVersion && entries.every(entry => entry.currentText === entry.candidateText)) {
    return { applied: false, reason: 'noop', writtenProblems: 0, writtenIndex: false, nextIndexHash };
  }

  const stagingToken = `${process.pid}-${Date.now()}-${crypto.randomUUID()}`;
  const stagingRoot = path.join(path.dirname(indexPath), `${STAGING_ROOT_NAME}-${stagingToken}`);
  const backups = [];
  try {
    for (const entry of entries) {
      const stagedPath = path.join(stagingRoot, entry.path);
      await ensureDir(stagedPath);
      await fs.writeFile(stagedPath, entry.candidateText, 'utf8');
      const stagedValidation = validateProblem(JSON.parse(await fs.readFile(stagedPath, 'utf8')));
      if (!stagedValidation.valid) {
        throw new Error(`${entry.id}: ${stagedValidation.errors.join(' | ')}`);
      }
    }

    await writeJsonFile(path.join(stagingRoot, path.relative(path.dirname(indexPath), indexPath)), nextIndex);

    try {
      for (const entry of entries) {
        const targetPath = path.resolve(rootDir, 'content/problem-bank', entry.path);
        const stagedPath = path.join(stagingRoot, entry.path);
        const backupSuffix = `${stagingToken}-${path.basename(entry.path)}`;
        const result = await replaceFileAtomically({ targetPath, stagedPath, backupSuffix });
        backups.push({ targetPath, backupPath: `${targetPath}.${backupSuffix}.bak`, ...result });
      }

      const indexStagePath = path.join(stagingRoot, path.relative(path.dirname(indexPath), indexPath));
      const indexResult = await replaceFileAtomically({ targetPath: indexPath, stagedPath: indexStagePath, backupSuffix: `${stagingToken}-index` });
      backups.push({ targetPath: indexPath, backupPath: `${indexPath}.${stagingToken}-index.bak`, ...indexResult });

      for (const entry of backups) {
        await safeRemove(entry.backupPath);
      }

      return {
        applied: true,
        writtenProblems: entries.length,
        writtenIndex: true,
        targetSchemaVersion,
        stagedRoot: stagingRoot,
        nextIndexHash,
      };
    } catch (error) {
      for (const entry of backups.reverse()) {
        try {
          if (await exists(entry.backupPath)) {
            await safeRemove(entry.targetPath);
            await fs.rename(entry.backupPath, entry.targetPath);
          }
        } catch {
          // best-effort rollback
        }
      }
      return {
        applied: false,
        reason: 'rollback-after-failure',
        error: error.message,
      };
    }
  } finally {
    await safeRemove(stagingRoot);
  }
}
export async function buildProblemBankMigrationReport({ rootDir = ROOT, indexUrl = DEFAULT_INDEX, targetSchemaVersion = PROBLEM_SCHEMA_VERSION, apply = false } = {}) {
  if (targetSchemaVersion !== PROBLEM_SCHEMA_VERSION) {
    throw new Error(`Desteklenmeyen hedef schemaVersion: ${targetSchemaVersion}`);
  }
  const bank = await loadBank(rootDir, indexUrl);
  const summary = {
    totalEntries: bank.entries.length,
    readyEntries: bank.entries.filter(entry => entry.decision === 'ready').length,
    blockedEntries: bank.entries.filter(entry => entry.decision !== 'ready').length,
    currentSchemaVersions: countMap(bank.entries, entry => entry.currentVersion || 'unknown'),
    canonicalStatuses: countMap(bank.entries, entry => entry.canonicalStatus || 'unknown'),
  };

  const report = {
    rootDir,
    indexPath: bank.indexPath,
    targetSchemaVersion,
    apply,
    dryRun: !apply,
    generatedAt: new Date().toISOString(),
    summary,
    items: bank.entries.map(entry => ({
      problemId: entry.id,
      path: entry.path,
      currentVersion: entry.currentVersion,
      targetVersion: entry.targetVersion,
      canonicalStatus: entry.canonicalStatus,
      policyStatus: entry.policyStatus,
      legacyStatus: entry.plan.legacyStatus,
      recordHash: entry.plan.recordHash,
      currentHash: entry.currentHash,
      candidateHash: entry.candidateHash,
      decision: entry.decision,
      issues: entry.issues,
      changes: entry.plan.changes,
      missingSourceFields: entry.plan.missingSourceFields,
      advisorySourceFields: entry.plan.advisorySourceFields,
      incompleteProvenance: entry.plan.incompleteProvenance,
      migratedValid: entry.plan.migratedValid,
      migratedErrors: entry.plan.migratedErrors,
    })),
  };

  if (apply) {
    report.writeResult = await applyMigration({
      rootDir,
      indexPath: bank.indexPath,
      index: bank.index,
      entries: bank.entries,
      targetSchemaVersion,
    });
  }

  return report;
}

export async function main(argv = process.argv.slice(2)) {
  const rootArg = argv.find(arg => arg.startsWith('--root='));
  const targetArg = argv.find(arg => arg.startsWith('--target='));
  const json = argv.includes('--json') || argv.includes('--format=json');
  const apply = argv.includes('--apply');
  const rootDir = rootArg ? path.resolve(process.cwd(), rootArg.slice('--root='.length)) : ROOT;
  const targetSchemaVersion = targetArg ? targetArg.slice('--target='.length) : PROBLEM_SCHEMA_VERSION;
  const report = await buildProblemBankMigrationReport({ rootDir, targetSchemaVersion, apply });
  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(renderReport(report));
  }
  if (apply && report.writeResult?.applied === false && report.writeResult?.reason !== 'noop') {
    process.exitCode = 1;
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
