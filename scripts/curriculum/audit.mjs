import { CURRICULUM } from '../../core/curriculum.js';
import { auditCurriculum } from '../../core/learningContext.js';

const audit = auditCurriculum(CURRICULUM);
console.log(JSON.stringify(audit, null, 2));
