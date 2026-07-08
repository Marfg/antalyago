import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { auditCandidateCatalog } from './candidates.mjs';

async function main() {
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

export { auditCandidateCatalog };
