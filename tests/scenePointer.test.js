import assert from 'node:assert/strict';
import {createSceneBoardAdapter} from '../adapters/sceneBoardAdapter.js';
let frame,observeResize,disconnected=false;
const gradient={addColorStop(){}};
const ctx=new Proxy({}, {get:(o,k)=>k in o?o[k]:k==='createLinearGradient'||k==='createRadialGradient'?()=>gradient:()=>{}});
globalThis.window={matchMedia:()=>({matches:true}),addEventListener(){},removeEventListener(){}};
globalThis.document={createElement:()=>({getContext:()=>ctx})};
globalThis.requestAnimationFrame=fn=>{frame=fn;return 1};
globalThis.cancelAnimationFrame=()=>{};
globalThis.ResizeObserver=class{constructor(fn){observeResize=fn}observe(){}disconnect(){disconnected=true}};
const listeners=new Map();let displayScale=1;
const canvas={clientWidth:800,clientHeight:600,getContext:()=>ctx,addEventListener:(k,fn)=>listeners.set(k,fn),removeEventListener:k=>listeners.delete(k),getBoundingClientRect(){return {left:100,top:40,width:this.clientWidth*displayScale,height:this.clientHeight*displayScale}}};
const board=createSceneBoardAdapter(canvas,{initialSize:9});let hover,tap;
board.onIntersectionHover(p=>hover=p);board.onIntersectionTap(p=>tap=p);board.setInputEnabled(true);
function point(row,col){const {yaw,pitch,dist}=board.getCameraState(),x=(col-4)*48,z=(row-4)*48,y=-7.4;
 const rx=x*Math.cos(yaw)+z*Math.sin(yaw),rz=-x*Math.sin(yaw)+z*Math.cos(yaw);
 const ry=y*Math.cos(pitch)-rz*Math.sin(pitch),depth=y*Math.sin(pitch)+rz*Math.cos(pitch),scale=700/(700+depth)*(dist/500),r=canvas.getBoundingClientRect();
 return {clientX:r.left+(canvas.width/2+rx*scale)*r.width/canvas.width,clientY:r.top+(canvas.height/2+ry*scale)*r.height/canvas.height};
}
function check(){for(const [row,col] of [[0,0],[2,6],[4,4],[6,2],[8,8]]){const event=point(row,col);listeners.get('pointermove')(event);listeners.get('click')(event);assert.deepEqual(hover,{row,col});assert.deepEqual(tap,{row,col})}}
for(const preset of ['connections','center','overview']){
 board.focus(preset);frame(0);frame(1000);check();
 // Before ResizeObserver runs, backing dimensions still differ from CSS dimensions.
 canvas.clientHeight=420;check();observeResize();assert.equal(canvas.height,420);check();
 displayScale=.75;check();displayScale=1;
 canvas.clientHeight=600;observeResize();
}
board.destroy();assert(disconnected);assert.equal(listeners.size,0);
console.log('PASS: üç kamera açısı, yerleşim değişimi, CSS ölçeği, hover/tıklama eşleşmesi ve temizleme.');
