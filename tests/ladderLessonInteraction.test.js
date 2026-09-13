import assert from 'node:assert/strict';
import {mountLadderLesson} from '../scenes/ladderLessonController.js';
import {BoardState} from '../core/boardState.js';
import {applyMove,isValidMove} from '../core/ruleEngine.js';
const oldTimeout=globalThis.setTimeout,oldClear=globalThis.clearTimeout;
const pending=new Map();let serial=0;
globalThis.setTimeout=fn=>{pending.set(++serial,fn);return serial};globalThis.clearTimeout=id=>pending.delete(id);
globalThis.matchMedia=()=>({matches:false});
class Element{
 constructor(){this.children=[];this.dataset={};this.attrs={};this.classList={toggle(){}}}
 setAttribute(k,v){this.attrs[k]=v}append(e){this.children.push(e)}replaceChildren(){this.children=[]}
}
const elements=new Map(),document={getElementById(id){if(!elements.has(id))elements.set(id,new Element());return elements.get(id)},createElement:()=>new Element()};
let size=9,live=new BoardState(size),tap,hover,enabled=false,marks=[],preview=null;
const board={setSize(s){size=s},reset(){live=new BoardState(size)},playMove(p){if(!isValidMove(live,p.col,p.row,p.color).valid)return {ok:false};live=applyMove(live,p.col,p.row,p.color).newState;return {ok:true}},clearMovePreview(){preview=null},clearRegionMarks(){},clearLiberties(){marks=[]},showLiberties(p){marks=p},setInputEnabled(v){enabled=v},setMovePreview(p){preview=p},focus(){},focusPoints(){},onIntersectionTap(fn){tap=fn},onIntersectionHover(fn){hover=fn},destroy(){}};
const overlay={clear(){},setScenario(){},setRoute(){},pulse(){},destroy(){}};
const $=id=>document.getElementById(id),step=i=>$('steps').children[i-1].onclick(),move=(col,row)=>{assert(enabled,'Board input must be open');tap({col,row})};
try{
 let completed=0;
 const lesson=mountLadderLesson({board,overlay,document,onAllComplete(){completed++}});
 assert.equal(lesson.canComplete,false);
 // Re-entering a completed scene starts an interactive attempt without losing progress.
 step(2);move(2,3);assert.equal($('next').disabled,false);
 step(3);step(2);assert(enabled);move(2,3);assert.equal(live.colorAt(2,3),'black');
 // White preview before extension; both liberties remain visible and hoverable afterward.
 step(3);hover({col:3,row:2});assert.equal(preview.color,'white');move(3,2);
 assert.deepEqual(marks,[{col:4,row:2},{col:3,row:3}]);assert(enabled);
 hover({col:3,row:2});assert.equal(marks.length,2);assert.equal(preview,null);
 step(2);step(3);assert(enabled);move(3,2);assert.equal(marks.length,2);
 // Three ataris can also be replayed. Pending automatic white replies are cancelled on exit.
 for(let attempt=0;attempt<2;attempt++){
  step(5);
  for(const [col,row] of [[4,2],[3,4],[5,3]]){
   move(col,row);
   if(pending.size){const [id,fn]=[...pending][0];pending.delete(id);fn()}
  }
  assert.equal($('next').disabled,false);
 }
 step(5);move(4,2);assert.equal(pending.size,1);step(2);assert.equal(pending.size,0);
 // Stage 6 starts at move zero; watching reaches the last escape before user capture.
 step(6);assert.equal($('counter').textContent,'0 / 22');assert.equal(pending.size,1);assert.equal(live.stones.length,4);
 for(let i=0;i<22;i++)$('frame-next').onclick();
 assert.equal($('counter').textContent,'22 / 22');move(8,8);
 assert.equal($('counter').textContent,'23 / 23');assert.equal($('scrub').max,23);
 assert($('badge').textContent.includes('12 beyaz taş yakalandı'));
 step(2);step(6);assert.equal($('counter').textContent,'0 / 22');
 // The final step cannot complete the lesson while earlier objectives are missing.
 step(9);for(let i=0;i<32;i++)$('frame-next').onclick();
 $('choices').children[1].onclick();for(let i=0;i<17;i++)$('frame-next').onclick();
 $('next').onclick();assert.equal(completed,0);assert.equal(lesson.canComplete,false);
 assert($('heading').textContent.startsWith('1 / 9'));
 move(2,3);move(3,2);
 step(4);for(let i=0;i<7;i++)$('frame-next').onclick();
 step(7);$('choices').children[1].onclick();for(let i=0;i<12;i++)$('frame-next').onclick();
 step(8);move(6,5);for(let i=0;i<12;i++)$('frame-next').onclick();
 assert.equal(lesson.canComplete,true);
 step(9);$('next').onclick();assert.equal(completed,1);
 lesson.destroy();assert.equal(pending.size,0);assert.equal(enabled,false);
 console.log('PASS: tamamlanan sahneleri tekrar oynama, beyaz imleç ve iki nefes, otomatik cevabı iptal etme, 6. adımın baştan başlayıp yakalamaya ulaşması.');
}finally{globalThis.setTimeout=oldTimeout;globalThis.clearTimeout=oldClear}
