import assert from 'node:assert/strict';
import { readFileSync,writeFileSync } from 'node:fs';
import { BoardState } from '../core/boardState.js';
import {isValidMove,applyMove,getGroup,getLiberties} from '../core/ruleEngine.js';
import {classifySinglePointEye,findEmptyRegion} from '../core/eyeAnalysis.js';
import { CURRICULUM } from '../core/curriculum.js';
import { getTwoEyesMoments, buildTwoEyesBoard, evaluateTwoEyesTap } from '../scenes/twoEyesPolicy.js';
const convert=s=>({...s,board:s.board.map(p=>({...p,color:p.color==='B'?'black':'white'})),...(s.examples?{examples:s.examples.map(convert)}:{})});
const steps=CURRICULUM.flatMap(c=>c.lessons).find(l=>l.id==='l7').steps.map(convert);
let count=0;const results=[];
function test(name,fn){fn();count++;results.push('PASS '+name)}
function seed(s){const b=new BoardState(9);for(const p of s.board)b.placeStone(p.x,p.y,p.color);return b;}
for(const [i,s] of steps.entries()){
 const b=seed(s);test(`Adım ${i+1}: koordinatlar tekil ve sınırlar içinde`,()=>{assert.equal(new Set(s.board.map(p=>`${p.x},${p.y}`)).size,s.board.length);for(const p of s.board)assert(b.isInBounds(p.x,p.y));});
 for(const [x,y] of s.targets){test(`Adım ${i+1}: hedef ${x},${y} kural sonucu`,()=>assert.equal(isValidMove(b,x,y,s.turn).valid,s.kind!=='observe'));}
 if(s.capturedExpected){test(`Adım ${i+1}: doğru sayıda taş yakalanır`,()=>assert.equal(applyMove(b,...s.targets[0],s.turn).captured.length,s.capturedExpected));}
 if(s.afterEyes){const after=applyMove(b,...s.targets[0],s.turn).newState;test(`Adım ${i+1}: iki ayrı gerçek göz aynı gruba ait`,()=>{const eyes=s.afterEyes.map(p=>classifySinglePointEye(after,...p));assert(eyes.every(e=>e.isTrue));assert.equal(eyes[0].groupId,eyes[1].groupId);for(const p of s.afterEyes){assert.equal(findEmptyRegion(after,...p).points.length,1);assert.equal(isValidMove(after,...p,'white').valid,false);}});
 test(`Adım ${i+1}: tek hamlede iki göz yapan tüm alternatifler tarandı`,()=>{const valid=[];for(let y=0;y<9;y++)for(let x=0;x<9;x++){if(!isValidMove(b,x,y,'black').valid)continue;const after=applyMove(b,x,y,'black').newState;const gid=[...getGroup(after,x,y)].sort().join('|');let eyes=0;for(let ey=0;ey<9;ey++)for(let ex=0;ex<9;ex++){const e=classifySinglePointEye(after,ex,ey);if(e.isTrue&&e.groupId===gid)eyes++;}if(eyes>=2)valid.push([x,y]);}assert.deepEqual(valid,s.targets);});}
 if(s.continuation){test(`Adım ${i+1}: devamın her hamlesi yasal ve siyah grup yakalanır`,()=>{let state=applyMove(b,...s.targets[0],s.turn).newState;for(const m of s.continuation){assert(isValidMove(state,m.x,m.y,m.color).valid);state=applyMove(state,m.x,m.y,m.color).newState;}assert.equal(state.stones.filter(p=>p.color==='black').length,0);});}
}
test('Tek göz: üç siyah taşın yalnız bir nefesi vardır',()=>{const b=seed(steps[1]);assert.equal(getLiberties(b,getGroup(b,0,7)).size,1)});
test('İki göz: altı siyah taşın yalnız iki iç nefesi vardır',()=>{const b=seed(steps[2]);assert.equal(getLiberties(b,getGroup(b,0,7)).size,2)});
test('Sahte göz: A çevresindeki siyahlar farklı bağlı gruplardır',()=>{const b=seed(steps[3]);assert(!getGroup(b,3,3).has('2,4'));assert.equal(classifySinglePointEye(b,3,4).isEyeCandidate,false)});

for(const s of steps[4].examples){
 const b=seed(s),anchor=s.board.find(p=>p.color==='black');
 test(`5/${s.label}: siyah tek bağlı grup, dış nefes yok, iç alan üç boşluk`,()=>{const g=getGroup(b,anchor.x,anchor.y);assert.equal(g.size,s.board.filter(p=>p.color==='black').length);const libs=getLiberties(b,g);assert.equal(libs.size,3);const [k]=libs;assert.equal(findEmptyRegion(b,...k.split(',').map(Number)).points.length,3);assert.equal(new Set(s.board.map(p=>`${p.x},${p.y}`)).size,s.board.length);for(const p of s.board)assert(b.isInBounds(p.x,p.y));});
 test(`5/${s.label}: doğru cevap yasal ve yakalama yok`,()=>{assert(isValidMove(b,...s.targets[0],'black').valid);assert.equal(applyMove(b,...s.targets[0],'black').captured.length,0)});
 const after=applyMove(b,...s.targets[0],'black').newState;
 test(`5/${s.label}: iki ayrı gerçek göz aynı gruba ait`,()=>{const eyes=s.afterEyes.map(p=>classifySinglePointEye(after,...p));assert(eyes.every(e=>e.isTrue));assert.equal(eyes[0].groupId,eyes[1].groupId);for(const p of s.afterEyes){assert.equal(findEmptyRegion(after,...p).points.length,1);assert.equal(isValidMove(after,...p,'white').valid,false)}});
 test(`5/${s.label}: tüm hamleler tarandı, tek yaşama cevabı`,()=>{const valid=[];for(let y=0;y<9;y++)for(let x=0;x<9;x++){if(!isValidMove(b,x,y,'black').valid)continue;const state=applyMove(b,x,y,'black').newState;const gid=[...getGroup(state,anchor.x,anchor.y)].sort().join('|');let eyes=0;for(let ey=0;ey<9;ey++)for(let ex=0;ex<9;ex++){const e=classifySinglePointEye(state,ex,ey);if(e.isTrue&&e.groupId===gid)eyes++;}if(eyes>=2)valid.push([x,y]);}assert.deepEqual(valid,s.targets)});
}


const moments=getTwoEyesMoments();
test('Sekiz ana adım, yedi örnek dahil 14 zorunlu an',()=>{assert.equal(steps.length,8);assert.equal(moments.length,14);assert.equal(moments.filter(m=>m.curriculumStepIndex===4).length,7)});
test('Onaylanan alt kenar: alt taş katmanı yok, hedef tahta kenarında',()=>{const m=moments.find(m=>m.curriculumStepIndex===4);assert.deepEqual(m.targets,[[4,8]]);assert.deepEqual(m.afterEyes,[[3,8],[5,8]]);assert.deepEqual(m.board.filter(p=>p.y===8&&p.color==='B').map(p=>p.x).sort(),[2,6])});
for(const [i,m] of moments.entries()){
 test(`An ${i+1}: sıralı kurulum formasyonu değiştirmez`,()=>{let b=new BoardState(9);for(const p of m.board){const color=p.color==='B'?'black':'white';assert(isValidMove(b,p.x,p.y,color).valid);b=applyMove(b,p.x,p.y,color).newState;}const key=b=>b.stones.map(p=>`${p.x},${p.y},${p.color}`).sort();assert.deepEqual(key(b),key(buildTwoEyesBoard(m)));});
 test(`An ${i+1}: yanlış dokunuş tahtayı değiştirmez`,()=>{const b=buildTwoEyesBoard(m);const before=JSON.stringify(b.stones);const p=m.board[0];assert.equal(evaluateTwoEyesTap(b,m,{row:p.y,col:p.x}).correct,false);assert.equal(JSON.stringify(b.stones),before);});
}

results.push(`\n${count}/${count} kontroller geçti.`);console.log(results.join('\n'));
