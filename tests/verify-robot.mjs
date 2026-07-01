import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const BASE='http://antalyago.test';
let passed=0,failed=0;
function assert(value,message){if(!value)throw new Error(message)}
async function test(name,fn){try{await fn();console.log('  ✓',name);passed++}catch(error){console.error('  ✗',name,'-',error.message);failed++}}
function mime(fp){return{'.html':'text/html','.js':'application/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'}[path.extname(fp).toLowerCase()]||'application/octet-stream'}

const browser=await chromium.launch({headless:true});

async function context(options={}){
  const ctx=await browser.newContext({viewport:options.viewport||{width:1280,height:720}});
  await ctx.route(`${BASE}/**`,async route=>{
    const file=path.join(ROOT,new URL(route.request().url()).pathname);
    try{await route.fulfill({status:200,contentType:mime(file),body:fs.readFileSync(file)})}catch{await route.abort()}
  });
  await ctx.addInitScript(({mctsMode,delayMs})=>{
    window.__workerMessages=[];
    class FakeWorker extends EventTarget{
      constructor(url){super();this.url=String(url)}
      emit(data){this.dispatchEvent(new MessageEvent('message',{data}))}
      postMessage(data){
        window.__workerMessages.push({...data,boardData:undefined});
        if(data.type==='LOAD')return;
        if(data.type==='SCORE'){setTimeout(()=>this.emit({ok:true,type:'SCORE',score:{winner:'white',rawDiff:-6.5,margin:6.5,komi:data.boardData.komi,blackTerritory:[],whiteTerritory:[],blackDead:[],whiteDead:[]},gameId:data.gameId,requestId:data.requestId}),0);return}
        if(data.type==='MOVE'||data.type==='MOVE_PROFILE'){
          const move=mctsMode==='pass'?'pass':{x:0,y:0,iters:1};
          setTimeout(()=>this.emit({ok:true,type:data.type,move,gameId:data.gameId,requestId:data.requestId}),delayMs||0);
        }
      }
      terminate(){}
    }
    window.Worker=FakeWorker;
  },{mctsMode:options.mctsMode||'move',delayMs:options.delayMs||0});
  const page=await ctx.newPage();
  await page.goto(`${BASE}/${options.path||'robot.html?e2e=1'}`,{waitUntil:'domcontentloaded'});
  if(options.waitRobot!==false)await page.waitForFunction(()=>window.__robotTest);
  return{ctx,page};
}

await test('ana sayfada belirgin 9×9 robot çağrısı görünür',async()=>{
  const{ctx,page}=await context({path:'index.html',waitRobot:false});
  await page.getByRole('heading',{name:'9×9 Robotla Oyna'}).waitFor();
  const playButton=page.getByRole('link',{name:'9×9 Oyuna Başla'});
  await playButton.waitFor();
  assert((await playButton.getAttribute('href'))==='robot.html','ana oyun butonu robot.html hedeflemiyor');
  const navLink=page.getByRole('navigation',{name:'Ana navigasyon'}).getByRole('link',{name:'Robotla Oyna'});
  await navLink.waitFor();
  assert((await navLink.getAttribute('href'))==='robot.html','header robot bağlantısı robot.html hedeflemiyor');
  await ctx.close();
});

await test('öğrenme ekranında robot pratik kartı görünür',async()=>{
  const{ctx,page}=await context({path:'ogren-3d.html',waitRobot:false});
  const link=page.getByRole('link',{name:'Pratik yap: 9×9 Robotla Oyna'});
  await link.waitFor();
  assert((await link.getAttribute('href'))==='robot.html','öğrenme ekranı robot bağlantısı robot.html hedeflemiyor');
  await ctx.close();
});

await test('ekran yalnız Kulüp Robotu seviyesini gösterir',async()=>{
  const{ctx,page}=await context();const state=await page.evaluate(()=>window.__robotTest.state());
  assert(state.profile==='club'&&state.settings.profile==='club','club profili etkin değil');
  await page.getByText('Kulüp Robotu · 8–10 kyu hedefi').waitFor();
  for(const removed of ['Uyarlanabilir','Başlangıç','Orta','Güçlü','Geçmişi Sıfırla'])assert(await page.getByText(removed,{exact:true}).count()===0,removed+' arayüzde kaldı');
  assert(await page.locator('#iter-count, #iter-lbl, #diff-grid').count()===0,'teknik sayaç veya eski seviye seçimi kaldı');
  await ctx.close();
});

await test('teslim ikinci onay ister ve yeni oyun akışı çalışır',async()=>{
  const{ctx,page}=await context();await page.click('#btn-resign');
  assert(!(await page.evaluate(()=>window.__robotTest.state().gameEnded)),'ilk tıklama oyunu bitirdi');
  await page.getByText('Teslim olursan oyun biter').waitFor();
  await page.click('#btn-resign',{force:true});
  assert(await page.evaluate(()=>window.__robotTest.state().gameEnded),'ikinci tıklama oyunu bitirmedi');
  await page.locator('#gameover').getByRole('button',{name:'Yeni oyun başlat'}).click();
  assert(!(await page.evaluate(()=>window.__robotTest.state().gameEnded)),'yeni oyun başlamadı');
  await ctx.close();
});

await test('renk değişse de sabit komi ve club profili korunur',async()=>{
  const{ctx,page}=await context();await page.click('#cp-w');const state=await page.evaluate(()=>window.__robotTest.state());
  assert(state.settings.komi===6.5&&state.settings.handicap.length===0&&state.profile==='club','sabit oyun ayarı bozuldu');
  await page.waitForFunction(()=>window.__workerMessages.some(m=>m.type==='MOVE_PROFILE'));
  assert(await page.evaluate(()=>window.__workerMessages.find(m=>m.type==='MOVE_PROFILE').profile==='club'),'worker club profili almadı');await ctx.close();
});

await test('eski worker cevabı reset sonrası taşa dönüşmez',async()=>{
  const{ctx,page}=await context({delayMs:250});await page.click('#btn-pass');await page.click('#btn-reset-board');await page.waitForTimeout(400);
  const state=await page.evaluate(()=>window.__robotTest.state());assert(state.stones.length===0&&state.moveCount===0,'eski worker cevabı yeni tahtaya uygulandı');await ctx.close();
});

await test('iki pas oyunu bitirir',async()=>{
  const{ctx,page}=await context({mctsMode:'pass'});await page.click('#btn-pass');await page.waitForFunction(()=>window.__robotTest.state().gameEnded);
  const state=await page.evaluate(()=>window.__robotTest.state());assert(state.gameEnded,'iki pas oyun sonu üretmedi');
  await page.getByText('Yeni oyun başlatabilirsin').waitFor();
  await page.locator('#gameover').getByRole('button',{name:'Yeni oyun başlat'}).click();
  const fresh=await page.evaluate(()=>window.__robotTest.state());assert(!fresh.gameEnded&&fresh.moveCount===0,'oyun sonundan yeni oyun başlamadı');
  await ctx.close();
});

await test('renk seçimleri erişilebilir durum bildirir',async()=>{
  const{ctx,page}=await context();
  assert(await page.locator('#cp-b').evaluate(el=>el.getAttribute('aria-pressed')==='true'),'siyah renk seçimi aria-pressed değil');
  await page.click('#cp-w');
  assert(await page.locator('#cp-w').evaluate(el=>el.getAttribute('aria-pressed')==='true'),'beyaz renk seçimi aria-pressed değil');
  await ctx.close();
});

for(const viewport of [{width:390,height:844},{width:1280,height:720}])await test(`${viewport.width}×${viewport.height} temel kontroller erişilebilir`,async()=>{
  const{ctx,page}=await context({viewport});for(const selector of ['#club-profile','#cp-b','#cp-w','#btn-pass','#btn-resign','#btn-reset-board']){
    const el=page.locator(selector);await el.scrollIntoViewIfNeeded();assert(await el.isVisible(),selector+' görünür değil');const box=await el.boundingBox();assert(box&&box.width>20&&box.height>20,selector+' erişilebilir boyutta değil')
  }await ctx.close();
});

await browser.close();
console.log(`\nToplam: ${passed+failed}  ✓ ${passed}  ✗ ${failed}`);
if(failed)process.exit(1);
