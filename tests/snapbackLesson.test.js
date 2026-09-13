import assert from 'node:assert/strict';
import {SNAP_STEPS,seedBoard,buildScenario,groupAt} from '../scenes/snapbackLessonPolicy.js';
import {applyMove,isValidMove} from '../core/ruleEngine.js';
import {BoardState} from '../core/boardState.js';
import {mountSnapbackLesson} from '../scenes/snapbackLessonController.js';
for(const [i,s] of SNAP_STEPS.entries()){
 const scenario=buildScenario(s);let b=new BoardState(9);
 for(const p of s.form.seed){assert(isValidMove(b,p.x,p.y,p.color).valid,'seed order');b=applyMove(b,p.x,p.y,p.color).newState}
 assert.deepEqual(b.grid,seedBoard(s.form.seed).grid);
 if(s.kind==='snap'){
  assert.equal(scenario.frames[1].captures.length,0);
  assert.equal(scenario.frames[2].captures.length,1);
  assert.equal(scenario.frames[2].koPoint,null,'multi-stone snapback must never be falsely classified as ko');
  const after=seedBoard(scenario.frames[2].stones),reply=s.form.moves[1];
  assert.equal(groupAt(after,reply).liberties.length,1);
  const rec=s.form.moves[2];assert(isValidMove(after,rec.x,rec.y,rec.color).valid);
  assert.equal(scenario.frames[3].captures.length,i===3?6:3);
  assert.notDeepEqual(scenario.board.grid,seedBoard(s.form.seed).grid);
 }
}
class Element{constructor(){this.children=[];this.dataset={};this.attrs={};this.classList={toggle(){}}}setAttribute(k,v){this.attrs[k]=v}append(b){this.children.push(b)}replaceChildren(){this.children=[]}}
const elements=new Map(),document={getElementById(id){if(!elements.has(id))elements.set(id,new Element());return elements.get(id)},createElement:()=>new Element()},$=id=>document.getElementById(id);
let b=new BoardState(9),tap,hover,enabled,preview,unsubscribed=0,marks=[];
const board={setSize(){},reset(){b=new BoardState(9)},playMove(p){if(!isValidMove(b,p.col,p.row,p.color).valid)return {ok:false};b=applyMove(b,p.col,p.row,p.color).newState;return {ok:true}},clearMovePreview(){preview=null},setMovePreview(p){preview=p},setInputEnabled(v){enabled=v},clearLiberties(){marks=[]},showLiberties(p){marks=p},showIllegalMoves(){},focus(){},focusPoints(){},onIntersectionTap(fn){tap=fn;return ()=>{unsubscribed++;tap=null}},onIntersectionHover(fn){hover=fn;return ()=>{unsubscribed++;hover=null}}};
const overlay={setScenario(){},setRoute(){},clear(){},pulse(){},destroy(){}};
const lesson=mountSnapbackLesson({board,overlay,document});
for(let i=0;i<SNAP_STEPS.length;i++){
 $('steps').children[i].onclick();assert(enabled);assert(!lesson.canComplete);
 for(const m of SNAP_STEPS[i].form.moves){hover({col:m.x,row:m.y});assert.equal(preview.color,m.color);tap({col:m.x,row:m.y})}
 assert.equal($('next').disabled,false);
}
assert(lesson.canComplete);$('next').onclick();assert($('feedback').textContent.includes('Dört adım'));
$('steps').children[0].onclick();assert(enabled);tap({col:3,row:4});assert.equal(b.colorAt(3,4),'black');$('reset').onclick();assert.equal(b.colorAt(3,4),null);assert(enabled);
lesson.destroy();assert.equal(unsubscribed,2);assert.equal(enabled,false);
const edge=SNAP_STEPS[3];for(const f of buildScenario(edge).frames){const board=seedBoard(f.stones);for(const p of edge.form.seed.filter(p=>p.color==='white'))assert(groupAt(board,p).liberties.length>=2,'surrounding white group must stay out of atari at every frame')}
assert.equal(SNAP_STEPS.length,4);
console.log('PASS: four formations; legal alternating moves, 3/6-stone recaptures, no false ko, cursor colours, safe surrounding white groups, replay and cleanup.');
