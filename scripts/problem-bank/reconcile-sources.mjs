import { auditSourceCatalog } from './audit-sources.mjs';

const report = await auditSourceCatalog();
process.stdout.write(JSON.stringify(report, null, 2) + '\n');
