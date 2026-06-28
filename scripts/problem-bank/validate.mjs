import fs from 'node:fs/promises';
import path from 'node:path';
import { validateProblem, problemToLessonStep } from '../../core/problemBank.js';
const root=path.resolve(import.meta.dirname,'../..');
const index=JSON.parse(await fs.readFile(path.join(root,'content/problem-bank/index.json'),'utf8'));
let failed=0;
for(const entry of index.problems){
 const file=path.join(root,'content/problem-bank',entry.path);
 const problem=JSON.parse(await fs.readFile(file,'utf8'));
 const result=validateProblem(problem);
 if(!result.valid){failed++;console.error('HATA',entry.id,result.errors.join(' | '));continue}
 try{problemToLessonStep(problem);console.log('OK',entry.id)}catch(error){failed++;console.error('HATA',entry.id,error.message)}
}
if(failed){console.error(`
${failed} problem başarısız.`);process.exit(1)}
console.log(`
${index.problems.length} problem doğrulandı.`);
