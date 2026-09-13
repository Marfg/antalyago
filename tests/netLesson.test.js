import assert from 'node:assert/strict';
import {applyMove,isValidMove} from '../core/ruleEngine.js';
import {NET_FORMS,NET_STEPS,seedBoard,targetGroup,netSequence,permutations} from '../scenes/netLessonPolicy.js';
let moves=0,branches=0;
for(const [name,f] of Object.entries(NET_FORMS))for(const order of permutations(f.exits)){
 const s=netSequence(name,order);
 for(const scenario of [s]){
  let b=seedBoard(scenario.seed);const remaining=new Set(f.exits.map(p=>p.x+','+p.y));
  for(const [i,m] of scenario.moves.entries()){
   assert(isValidMove(b,m.x,m.y,m.color).valid);
   if(m.color==='white'){
    // Every legal extension of the target group is one of the remaining tested exits.
    const g=targetGroup(b,f.anchor);assert.deepEqual(new Set(g.liberties.map(p=>p.x+','+p.y)),remaining);assert(remaining.has(m.x+','+m.y));remaining.delete(m.x+','+m.y);
   }
   const r=applyMove(b,m.x,m.y,m.color);b=r.newState;
   assert.deepEqual(b.stones,scenario.frames[i+1].stones);
   assert.deepEqual(scenario.storyboard.timeline[i].before.stones,scenario.frames[i].stones);
   assert.deepEqual(scenario.storyboard.timeline[i].after.stones,scenario.frames[i+1].stones);
   const clip=scenario.blueprint.clips[i+1],place=clip.steps.find(p=>p.type==='place-stone');
   assert.deepEqual(place.point,{x:m.x,y:m.y});assert.equal(place.color,m.color);assert.equal(clip.durationMs,scenario.storyboard.timeline[i].durationMs);
   if(i===0)assert.equal(targetGroup(b,f.anchor).count,f.exits.length,'The net setup itself is not atari');
   moves++;
  }
  assert.equal(targetGroup(b,f.anchor).count,0);assert.equal(scenario.frames.at(-1).captures.length,name==='pair'?5:name==='edge'?4:3);
  assert(scenario.blueprint.clips.at(-1).steps.some(s=>s.type==='lift-captured-stones'));branches++;
 }
}
assert.equal(NET_STEPS.length,5);
console.log(`PASS: ${branches} net branches, ${moves} legal moves; all target extensions, complete captures, and M1–M4 move/capture coordinates.`);
