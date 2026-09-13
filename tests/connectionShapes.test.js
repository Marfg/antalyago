import assert from 'node:assert/strict';
import {CONNECTION_BOARD_SIZE,CONNECTION_OFFSET,orientedShape,buildConnectionBoard,validShapeCompletion,completedShape,bambooPlacement,connectionStatus} from '../scenes/connectionShapesPolicy.js';
import {scene12Connections} from '../scenes/scene12Connections.js';
import {BoardState} from '../core/boardState.js';
import {applyMove,isValidMove} from '../core/ruleEngine.js';
import {CURRICULUM} from '../core/curriculum.js';
let count=0;
for(let d=0;d<8;d++)for(let i=0;i<4;i++){const s=orientedShape(i,d),b=buildConnectionBoard(s,true);let answers=0;for(let y=0;y<6;y++)for(let x=0;x<6;x++)if(validShapeCompletion(s,i,x,y)){answers++;assert(isValidMove(b,x+CONNECTION_OFFSET,y+CONNECTION_OFFSET,'black').valid)}assert.equal(answers,[4,4,8,1][i]);count++}
assert.equal(CURRICULUM.flatMap(c=>c.lessons).find(l=>l.id==='l8').steps.length,12);
const saved=new Map([['go_done_3d','["l1"]']]);globalThis.localStorage={getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v)};
class Element{constructor(){this.children=new Map();this.dataset={};this.classList={add(){},remove(){}}}querySelector(k){if(!this.children.has(k))this.children.set(k,new Element());return this.children.get(k)}querySelectorAll(){if(this.buttonsHTML===this.innerHTML)return this.buttons;this.buttonsHTML=this.innerHTML;return this.buttons=[...(this.innerHTML||'').matchAll(/data-term="(\d)"/g)].map(m=>{const e=new Element();e.dataset.term=m[1];return e})}append(e){}appendChild(e){}remove(){}addEventListener(){}removeEventListener(){}}
globalThis.document={createElement:()=>new Element()};const container=new Element();let tap,hover,preview,visualBoard=new BoardState(CONNECTION_BOARD_SIZE),marked=0;
const adapter={setSize(size){assert.equal(size,9)},reset(){visualBoard=new BoardState(CONNECTION_BOARD_SIZE)},clearMovePreview(){preview=null},clearLiberties(){},clearIllegalHints(){},clearRegionMarks(){},focusPoints(){},showLiberties(){},setInputEnabled(){},onIntersectionTap(fn){tap=fn;return ()=>{tap=null}},onIntersectionHover(fn){hover=fn;return ()=>{hover=null}},setMovePreview(p){preview=p},playMove(p){if(!isValidMove(visualBoard,p.col,p.row,p.color).valid)return {ok:false};visualBoard=applyMove(visualBoard,p.col,p.row,p.color).newState;return {ok:true}}};
let root;container.append=e=>{if(!root)root=e};scene12Connections.mount({container,boardAdapter:adapter,emit(){},markComplete(){marked++},hasNextScene:false});
for(let i=0;i<4;i++){assert.equal(scene12Connections.canComplete(),false);root.querySelector('.s12-confirm').onclick();root.querySelector('.s12-next').onclick();const s=orientedShape(i),anchor=s.stones.find(p=>p[0]!==s.root[0]||p[1]!==s.root[1]);const target=i===0?[anchor[0]-1,anchor[1]+1]:s.root;if(i===3){for(const p of s.stones.slice(1))tap({col:p[0]+CONNECTION_OFFSET,row:p[1]+CONNECTION_OFFSET})}else tap({col:target[0]+CONNECTION_OFFSET,row:target[1]+CONNECTION_OFFSET});assert.equal(root.querySelector('.s12-next').disabled,false);root.querySelector('.s12-next').onclick();assert.equal(root.querySelector('.s12-next').disabled,true);const built=completedShape(s,i,...target);const cut=built.markers[0]||[anchor[0]+1,anchor[1]];hover({col:cut[0]+CONNECTION_OFFSET,row:cut[1]+CONNECTION_OFFSET});assert.equal(preview.color,'white');tap({col:cut[0]+CONNECTION_OFFSET,row:cut[1]+CONNECTION_OFFSET});assert.equal(root.querySelector('.s12-next').disabled,true);const reply=i===0||i===3?built.markers[1]:[0,0];hover({col:reply[0]+CONNECTION_OFFSET,row:reply[1]+CONNECTION_OFFSET});assert.equal(preview.color,'black');tap({col:reply[0]+CONNECTION_OFFSET,row:reply[1]+CONNECTION_OFFSET});assert.equal(root.querySelector('.s12-next').disabled,false);if(i===0||i===3)assert.equal(connectionStatus(visualBoard,built).joined,true);root.querySelector('.s12-next').onclick()}
assert.equal(scene12Connections.canComplete(),true);assert.equal(marked,1);assert.deepEqual(JSON.parse(saved.get('go_done_3d')),['l1','l8']);scene12Connections.unmount({container,boardAdapter:adapter});assert.equal(tap,null);assert.equal(hover,null);assert.equal(scene12Connections.canComplete(),false);
console.log(count+' yön kontrolü; 12 adımlı sahne, ilerleme kapıları, beyaz/siyah önizleme, ders kaydı ve temizleme geçti.');

for(const [w,h] of [[1,2],[2,1]])for(const dx of [0,w])for(const dy of [0,h]){const s=orientedShape(3),a=s.stones[0],left=a[0]-dx,top=a[1]-dy;let placed=[a],result;for(const p of [[left,top],[left+w,top],[left,top+h],[left+w,top+h]].filter(p=>p[0]!==a[0]||p[1]!==a[1])){result=bambooPlacement(s,placed,...p);assert(result);placed=result.stones}assert(result.complete);assert.equal(result.markers.length,2)}
assert.equal(bambooPlacement(orientedShape(3),[[2,2]],7,7),null);
assert(CURRICULUM.flatMap(c=>c.lessons).find(l=>l.id==='l8').steps.every(s=>s.size===9));
console.log('Bambu sekiz yönde serbest yerleşim ve müfredat 9×9 kontrolü geçti.');

root=null;marked=0;scene12Connections.mount({container,boardAdapter:adapter,emit(){},markComplete(){marked++},hasNextScene:false});
root.querySelector('.s12-topics').querySelectorAll('[data-term]')[3].onclick();
assert.equal(root.dataset.stepIndex,9);
root.querySelector('.s12-confirm').onclick();root.querySelector('.s12-next').onclick();
const bamboo=orientedShape(3);
for(const p of bamboo.stones.slice(1))tap({col:p[0]+CONNECTION_OFFSET,row:p[1]+CONNECTION_OFFSET});
root.querySelector('.s12-next').onclick();
for(const p of bamboo.markers)tap({col:p[0]+CONNECTION_OFFSET,row:p[1]+CONNECTION_OFFSET});
root.querySelector('.s12-next').onclick();
assert.equal(marked,0);assert.equal(scene12Connections.canComplete(),false);assert.equal(root.dataset.stepIndex,0);
root.querySelector('.s12-topics').querySelectorAll('[data-term]')[3].onclick();root.querySelector('.s12-next').onclick();root.querySelector('.s12-next').onclick();
assert.equal(visualBoard.stones.length,4); // The user's completed shape survives topic navigation.
scene12Connections.unmount({container,boardAdapter:adapter});
console.log('Terim gezinmesi şekli koruyor; eksik adımlar tamamlanmadan ders bitmiyor.');
