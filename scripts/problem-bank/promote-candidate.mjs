import { pathToFileURL } from 'node:url';

import {
  ROOT,
  applyCandidatePromotion,
  buildCandidatePromotionReport,
  candidateIdFromArgs,
  outputPathFromArgs,
  resolveOutputPath,
  writeReviewReport,
} from './candidate-review-gate.mjs';

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const json = args.includes('--json');
  const candidateId = candidateIdFromArgs(args);
  const outputPath = outputPathFromArgs(args);
  const report = await buildCandidatePromotionReport({ candidateId, rootDir: ROOT });

  if (apply) {
    if (!candidateId) {
      throw new Error('Usage: node scripts/problem-bank/promote-candidate.mjs --candidate <candidateId> --apply');
    }
    const applied = await applyCandidatePromotion({ candidateId, rootDir: ROOT });
    report.writeResult = applied.writeResult;
    report.preview = applied.preview;
    report.targetPath = applied.targetPath;
    report.readyForPromotion = applied.readyForPromotion;
    report.blocked = applied.blocked;
    report.blockingIssues = applied.blockingIssues;
    report.warnings = applied.warnings;
    report.info = applied.info;
    report.targetStatus = applied.targetStatus;
    report.rightsStatus = applied.rightsStatus;
  }

  const reportOutputPath = resolveOutputPath(outputPath, candidateId, {
    defaultFileName: 'promotion-report.json',
  });
  if (reportOutputPath) {
    await writeReviewReport(report, reportOutputPath);
  }

  if (json || !apply) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    return;
  }

  console.log(JSON.stringify({
    candidateId: report.candidateId,
    targetStatus: report.targetStatus,
    readyForPromotion: report.readyForPromotion,
    blocked: report.blocked,
    targetPath: report.targetPath,
    writeResult: report.writeResult,
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

export {
  ROOT,
};
