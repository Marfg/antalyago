import {BoardState} from '../core/boardState.js?v=2026-09-13.6';
import {applyMove,isValidMove,getGroup,getLiberties} from '../core/ruleEngine.js?v=2026-09-13.6';
import {LADDER_SCENARIOS,LADDER_STEPS} from './ladderScenarioData.js?v=2026-09-13.6';
export {LADDER_STEPS};
export function whiteGroup(board,anchor){
 if(board.colorAt(anchor.x,anchor.y)!=='white')return {stones:[],liberties:[],count:0};
 const group=getGroup(board,anchor.x,anchor.y),libs=getLiberties(board,group);
 const points=s=>[...s].map(k=>{const [x,y]=k.split(',').map(Number);return {x,y}});
 return {stones:points(group),liberties:points(libs),count:libs.size};
}
export function seedBoard(stones,size){const board=new BoardState(size);for(const p of stones)board.placeStone(p.x,p.y,p.color);return board}
export function goPoint(p,size=9){return 'ABCDEFGHJKLMNOPQRST'[p.x]+(size-p.y)}
export function createLadderScenario({long=false,breaker=null}={}){
 const key=long?(breaker?'longBreaker':'long'):(breaker?(breaker.x===6&&breaker.y===5?'breaker':'outside'):'basic');
 const allowed=!breaker||(long?breaker.x===9&&breaker.y===4:breaker.x===6&&(breaker.y===5||breaker.y===2));
 if(!allowed)throw new Error('Unsupported ladder support point');
 return LADDER_SCENARIOS[key];
}
export function firstAtariTrial(scenario,x,y){
 let board=seedBoard(scenario.seed,scenario.size);
 if(!isValidMove(board,x,y,'black').valid)return {legal:false};
 board=applyMove(board,x,y,'black').newState;
 let group=whiteGroup(board,scenario.anchor);
 if(group.count!==1)return {legal:true,board,group,correct:false,reply:null};
 const reply=group.liberties[0];board=applyMove(board,reply.x,reply.y,'white').newState;group=whiteGroup(board,scenario.anchor);
 return {legal:true,board,group,reply,correct:x===scenario.moves[0].x&&y===scenario.moves[0].y};
}
