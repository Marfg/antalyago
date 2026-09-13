import assert from 'node:assert/strict';
import {mountNetLesson} from '../scenes/netLessonController.js';
import {BoardState} from '../core/boardState.js';
import {applyMove,isValidMove} from '../core/ruleEngine.js';
const oldTimeout=globalThis.setTimeout,oldClear=globalThis.clearTimeout,oldMatchMedia=globalThis.matchMedia;
const pending=new Map();let serial=0;globalThis.setTimeout=fn=>{pending.set(++serial,fn);return serial};globalThis.clearTimeout=id=>pending.delete(id);globalThis.matchMedia=()=>({matches:false});
class Element{constructor(){this.children=[];this.dataset={};this.attrs={};this.classList={toggle(){}}}setAttribute(k,v){this.attrs[k]=v}append(b){this.children.push(b)}replaceChildren(){this.children=[]}}
const elements=new Map(),document={getElementById(id){if(!elements.has(id))elements.set(id,new Element());return elements.get(id)},createElement:()=>new Element()},$=id=>document.getElementById(id);
let size=9,b=new BoardState(size),tap,hover,enabled,preview,marks=[],unsubscribed=0,captures=[];
const board={setSize(v){size=v},reset(){b=new BoardState(size)},playMove(p){if(!isValidMove(b,p.col,p.row,p.color).valid)return {ok:false};b=applyMove(b,p.col,p.row,p.color).newState;return {ok:true}},clearMovePreview(){preview=null},setMovePreview(p){preview=p},setInputEnabled(v){enabled=v},clearLiberties(){marks=[]},showLiberties(p){marks=p},clearRegionMarks(){},focus(){},focusPoints(){},onIntersectionTap(fn){tap=fn;return ()=>{unsubscribed++;tap=null}},onIntersectionHover(fn){hover=fn;return ()=>{unsubscribed++;hover=null}}};
const overlay={setScenario(){},setRoute(){},clear(){},pulse(e){captures=e.captures},destroy(){}};
const step=i=>$('steps').children[i-1].onclick(),move=(col,row)=>{assert(enabled,'Board input must be enabled');tap({col,row})},flush=()=>{let n=0;while(pending.size){assert(++n<100);const [id,fn]=[...pending][0];pending.delete(id);fn()}};
try{
 const lesson=mountNetLesson({board,overlay,document});assert.equal(lesson.canComplete,false);
 move(4,3);move(5,4);assert.equal($('next').disabled,false);
 step(2);move(5,3);assert.equal($('next').disabled,false);step(1);step(2);assert(enabled);move(5,3);
 step(3);hover({col:4,row:3});assert.equal(preview.color,'white');move(4,3);assert(marks.some(p=>p.col===4&&p.row===2));hover({col:4,row:2});assert.equal(preview.color,'black');move(4,2);move(5,4);move(6,4);assert.equal(captures.length,3);assert.equal($('next').disabled,true);
 $('choices').children[0].onclick();move(4,3);assert.equal(b.colorAt(4,3),null);move(5,4);move(6,4);move(4,3);move(4,2);assert.equal($('next').disabled,false);
 step(4);for(const [x,y] of [[5,4],[4,4],[4,3],[5,5],[6,5],[3,4],[3,3]])move(x,y);assert.equal(captures.length,5);assert.equal($('next').disabled,false);
 step(5);for(const [x,y] of [[2,7],[2,8],[1,8],[3,7],[3,6]])move(x,y);assert.equal(captures.length,4);assert.equal($('next').disabled,true);
 $('choices').children[0].onclick();for(const [x,y] of [[3,7],[3,6],[2,8],[1,8]])move(x,y);assert.equal($('next').disabled,false);
 assert.equal(lesson.canComplete,true);$('next').onclick();assert($('feedback').textContent.includes('Beş adım tamamlandı'));
 step(2);move(5,3);assert(enabled===false);step(1);step(2);assert(enabled);move(5,3);
 lesson.destroy();assert.equal(pending.size,0);assert.equal(unsubscribed,2);assert.equal(enabled,false);
 console.log('PASS: five interactive objectives, both escape branches, alternating cursor colours, two-stone and edge captures, replay and cleanup.');
}finally{globalThis.setTimeout=oldTimeout;globalThis.clearTimeout=oldClear;globalThis.matchMedia=oldMatchMedia}
