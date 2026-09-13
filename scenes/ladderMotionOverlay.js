// Ladder rendering bridge: motion effects share the production camera.
// The main board remains solely responsible for pointer hit-testing.
export function createLadderMotionOverlay(canvas,board,mainCanvas){
 const ctx=canvas.getContext('2d');let scenario,effect=null,route=false,raf;
 function project(p,surface=false){
  const size=scenario.size,cell=size===9?48:32,half=(size-1)*cell/2,c=board.getCameraState();
  const x=p.x*cell-half,z=p.y*cell-half,r=cell*20/48,y=surface?-7-r*.36-1:-7.4;
  const rx=x*Math.cos(c.yaw)+z*Math.sin(c.yaw),rz=-x*Math.sin(c.yaw)+z*Math.cos(c.yaw);
  const ry=y*Math.cos(c.pitch)-rz*Math.sin(c.pitch),depth=y*Math.sin(c.pitch)+rz*Math.cos(c.pitch),scale=700/(700+depth)*(c.dist/500);
  const fx=canvas.width/mainCanvas.width,fy=canvas.height/mainCanvas.height;
  return {x:(mainCanvas.width/2+rx*scale)*fx,y:(mainCanvas.height/2+ry*scale)*fy,rx:r*scale*fx,ry:r*scale*Math.sqrt(Math.sin(c.pitch)**2+.36**2*Math.cos(c.pitch)**2)*fy};
 }
 function draw(now){
  if(canvas.width!==canvas.clientWidth)canvas.width=canvas.clientWidth;
  if(canvas.height!==canvas.clientHeight)canvas.height=canvas.clientHeight;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if(scenario&&route){
   ctx.save();ctx.strokeStyle='rgba(210,240,226,.65)';ctx.lineWidth=2;ctx.setLineDash([4,7]);ctx.beginPath();
   const points=[scenario.anchor,...scenario.moves.filter(m=>m.color==='white')];
   points.forEach((p,i)=>{const a=project(p);i?ctx.lineTo(a.x,a.y):ctx.moveTo(a.x,a.y)});ctx.stroke();ctx.restore();
  }
  if(scenario&&effect){
   const t=Math.min(1,(now-effect.start)/700);
   if(t===1)effect=null;
   else {
    ctx.save();ctx.globalAlpha=1-t;
    for(const stone of effect.captures){const p=project(stone,true);ctx.fillStyle='#efece3';ctx.strokeStyle='#b4b0a6';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(p.x,p.y-t*15,p.rx*(1-t*.15),p.ry*(1-t*.15),0,0,Math.PI*2);ctx.fill();ctx.stroke()}
    if(effect.move){const p=project(effect.move,true);ctx.strokeStyle='#82cbb1';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(p.x,p.y,p.rx*(1.06+t*.22),p.ry*(1.06+t*.22),0,0,Math.PI*2);ctx.stroke()}
    ctx.restore();
   }
  }
  raf=requestAnimationFrame(draw);
 }
 raf=requestAnimationFrame(draw);
 return {setScenario(s){scenario=s;effect=null},setRoute(v){route=v},pulse(frame){if(!matchMedia('(prefers-reduced-motion: reduce)').matches)effect={move:frame.move,captures:frame.captures,start:performance.now()}},clear(){effect=null},destroy(){cancelAnimationFrame(raf)}};
}
