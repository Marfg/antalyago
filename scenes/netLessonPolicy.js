import {BoardState} from '../core/boardState.js?v=2026-09-22.illegal-native2';
import {getGroup,getLiberties} from '../core/ruleEngine.js?v=2026-09-22.illegal-native2';
import {NET_FORMS,NET_STEPS,NET_VARIANTS} from './netScenarioData.js?v=2026-09-22.illegal-native2';
export {NET_FORMS,NET_STEPS};
export function seedBoard(stones,size=9){const b=new BoardState(size);for(const p of stones)b.placeStone(p.x,p.y,p.color);return b}
export function targetGroup(board,anchor){
 if(board.colorAt(anchor.x,anchor.y)!=='white')return {stones:[],liberties:[],count:0};
 const g=getGroup(board,anchor.x,anchor.y),l=getLiberties(board,g),points=s=>[...s].map(k=>{const [x,y]=k.split(',').map(Number);return {x,y}});
 return {stones:points(g),liberties:points(l),count:l.size};
}
export function goPoint(p){return 'ABCDEFGHJ'[p.x]+(9-p.y)}
export function netSequence(name,order=NET_FORMS[name].exits){
 const s=NET_VARIANTS[name]?.find(v=>order.length===NET_FORMS[name].exits.length&&order.every((p,i)=>v.moves[i*2+1].x===p.x&&v.moves[i*2+1].y===p.y));
 if(!s)throw new Error('Unsupported net escape order');
 return s;
}
export function permutations(items){return items.length===0?[[]]:items.flatMap((p,i)=>permutations(items.filter((_,j)=>j!==i)).map(rest=>[p,...rest]));}
