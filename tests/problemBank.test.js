import fs from 'node:fs/promises';
import path from 'node:path';
import { validateProblem, createProblemVariant, problemToLessonStep, selectProblemEntries } from '../core/problemBank.js';
const root=path.resolve(import.meta.dirname,'..');
const index=JSON.parse(await fs.readFile(path.join(root,'content/problem-bank/index.json'),'utf8'));
let passed=0,failed=0;
function test(name,fn){try{fn();console.log('  ✓',name);passed++}catch(e){console.error('  ✗',name,'-',e.message);failed++}}
function ok(value,message='assertion failed'){if(!value)throw new Error(message)}
const load=async id=>JSON.parse(await fs.readFile(path.join(root,'content/problem-bank/problems',id+'.json'),'utf8'));
for(const entry of index.problems){const p=await load(entry.id);test(entry.id+' şema doğrulama',()=>{const r=validateProblem(p);ok(r.valid,r.errors.join(' | '))});test(entry.id+' 3D step dönüşümü',()=>{const s=problemToLessonStep(p);ok(s.problemMeta.id===p.id);ok(s.size===p.board.size);ok(Array.isArray(s.board))})}
const capture=await load('b1-l3-capture-0001');
test('90 derece varyant koordinatı',()=>{const v=createProblemVariant(capture,{rotate:90});ok(v.solution.acceptedMoves[0].x===3);ok(v.solution.acceptedMoves[0].y===4)});
test('renk değişimi',()=>{const v=createProblemVariant(capture,{swapColors:true});ok(v.board.toPlay==='W');ok(v.board.stones[0].color==='B')});
test('müfredat filtresi',()=>{const rows=selectProblemEntries(index,{lesson:'l3',stage:'assessment'});ok(rows.length===1);ok(rows[0].id==='b1-l3-capture-0001')});
console.log(`
Toplam: ${passed+failed}  ✓ ${passed}  ✗ ${failed}`);if(failed)process.exit(1);
