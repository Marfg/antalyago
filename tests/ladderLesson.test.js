import assert from 'node:assert/strict';
import {applyMove,isValidMove} from '../core/ruleEngine.js';
import {createLadderScenario,firstAtariTrial,seedBoard,LADDER_STEPS} from '../scenes/ladderLessonPolicy.js';

let checks=0;
for(const options of [{},{breaker:{x:6,y:5}},{breaker:{x:6,y:2}},{long:true},{long:true,breaker:{x:9,y:4}}]){
 const s=createLadderScenario(options);let b=seedBoard(s.seed,s.size);
 for(const [i,m] of s.moves.entries()){
  assert(isValidMove(b,m.x,m.y,m.color).valid);
  if(m.color==='white'){
   const previous=s.frames[i].group;assert.equal(previous.count,1,'White escape must be forced');assert(previous.liberties.some(p=>p.x===m.x&&p.y===m.y));
  }
  const result=applyMove(b,m.x,m.y,m.color);b=result.newState;
  assert.deepEqual(b.stones,s.frames[i+1].stones);
  assert.deepEqual(s.storyboard.timeline[i].after.stones,s.frames[i+1].stones);
  assert.deepEqual(s.storyboard.timeline[i].before.stones,s.frames[i].stones);
  const clip=s.blueprint.clips[i+1],placed=clip.steps.find(p=>p.type==='place-stone');
  assert.deepEqual(placed.point,{x:m.x,y:m.y});assert.equal(placed.color,m.color);
  assert.equal(clip.durationMs,s.storyboard.timeline[i].durationMs);
  if(m.color==='black'&&i!==s.moves.length-1)assert.equal(s.frames[i+1].group.count,1);
  checks++;
 }
 if(s.outcome==='capture'){
  assert.equal(s.frames.at(-1).group.count,0);assert.equal(s.frames.at(-1).captures.length,options.long?17:12);
  assert(s.blueprint.clips.at(-1).steps.some(s=>s.type==='lift-captured-stones'));
 }else{
  assert.equal(s.outcome,'broken');assert.equal(s.frames.at(-1).group.count,3);
  assert(s.frames.at(-1).group.stones.some(p=>p.x===options.breaker.x&&p.y===options.breaker.y));
 }
 assert.equal(s.blueprint.warnings.length,0);
}
const basic=createLadderScenario(),wrong=firstAtariTrial(basic,3,2),right=firstAtariTrial(basic,2,3);
assert.equal(wrong.correct,false);assert.equal(wrong.group.count,3);assert(right.correct);assert.equal(right.group.count,2);
assert.equal(basic.frames[1].group.count,1);assert.equal(basic.frames.at(-2).group.count,1);
assert.equal(LADDER_STEPS.length,9);
console.log(`PASS: ${checks} yasal hamle; zorunlu kaçışlar, atari nefesleri, 12/17 taş yakalama, kırıcı/rota dışı taş, M1–M4 snapshot ve hamle noktası eşleşmesi.`);
