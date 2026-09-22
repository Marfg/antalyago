import assert from 'node:assert/strict';
import { STAGES,createBoard,attempt,liberties,key } from '../scenes/illegalNativePolicy.js';
import { getGroup,getLiberties } from '../core/ruleEngine.js?v=2026-09-20.capture-native1';
import { getIllegalMoveMoments } from '../scenes/illegalMovePolicy.js';
const old=getIllegalMoveMoments();
const signature=stones=>stones.map(s=>`${s.x},${s.y}:${s.color==='B'?'black':s.color==='W'?'white':s.color}`).sort();
assert.deepEqual(signature(STAGES[0].stones),signature(old[0].board),'all four old formations retained');
assert.deepEqual(STAGES[0].targets.map(key).sort(),old[0].targetPoints.map(key).sort());
assert.deepEqual(signature(STAGES[4].stones),signature(old[1].legalCaptureExamples[0].board));
assert.deepEqual(signature(STAGES[5].stones),signature(old[1].legalCaptureExamples[1].board));
for(const stage of STAGES){
 const board=createBoard(stage),before=JSON.stringify(board.stones);
 for(const s of board.stones)assert(getLiberties(board,getGroup(board,s.x,s.y)).size>0,`${stage.key}: dead seed`);
 for(const target of stage.targets){
  const r=attempt(board,target,stage.color);
  if(stage.mode==='discover'||stage.expected==='reject'){assert.equal(r.ok,false);assert.equal(r.reason,'SUICIDE');}
  else{assert(r.ok);assert.equal(r.capturedCount,stage.expected==='capture'?5:0);assert.equal(r.liberties.length,stage.expected==='capture'?3:8);}
 }
 for(let row=0;row<9;row++)for(let col=0;col<9;col++){
  const r=attempt(board,{row,col},stage.color);
  if(r.ok)for(const s of r.newState.stones)assert(getLiberties(r.newState,getGroup(r.newState,s.x,s.y)).size>0);
 }
 assert.equal(JSON.stringify(board.stones),before,'evaluation changed seed');
}
const before=createBoard(STAGES[3]),after=createBoard(STAGES[4]);
assert.equal(after.stones.length-before.stones.length,1);
assert.deepEqual(after.stones.filter(s=>!before.isOccupied(s.x,s.y)),[{x:4,y:2,color:'black'}]);
assert.equal(liberties(before,STAGES[3].opponent).length,2);
assert.equal(liberties(after,STAGES[4].opponent).length,1);
console.log('PASS: 6 stages, 486 moves, original 4 shapes and both 5-stone captures, one-stone contrast, 8/3 shared liberties, immutable seeds');
