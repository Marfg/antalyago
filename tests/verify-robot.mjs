import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const BASE='http://antalyago.test';
const STORAGE_KEY='antalyago.adaptiveAI.v1';
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
  await ctx.addInitScript(({kataReady,mctsMode,delayMs,storage})=>{
    if(storage!==undefined)localStorage.setItem('antalyago.adaptiveAI.v1',storage);
    class FakeWorker extends EventTarget{
      constructor(url){super();this.url=String(url);if(this.url.includes('kataWorker'))setTimeout(()=>this.emit({ok:kataReady,type:'READY',backend:kataReady?'test-cpu':undefined,error:kataReady?undefined:'offline test'}),0)}
      emit(data){this.dispatchEvent(new MessageEvent('message',{data}))}
      postMessage(data){
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
  },{kataReady:options.kataReady??false,mctsMode:options.mctsMode||'move',delayMs:options.delayMs||0,storage:options.storage});
  const page=await ctx.newPage();
  await page.goto(`${BASE}/robot.html?e2e=1`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__robotTest);
  return{ctx,page};
}

await test('Uyarlanabilir mod varsayılan açılır ve bozuk veri sıfırlanır',async()=>{
  const{ctx,page}=await context({storage:'{bozuk'});const state=await page.evaluate(()=>window.__robotTest.state());
  assert(state.currentLevel===0,'Uyarlanabilir seçili değil');assert(state.adaptive.profile==='beginner','bozuk veri Başlangıç durumuna dönmedi');
  await page.getByText('Tamamlanan oyunlarına bakar').waitFor();
  await page.getByText('Uyarlanabilir seviye').waitFor();
  await ctx.close();
});

await test('teslim onayı bir kez kaydeder, reset sonuç kaydetmez ve yenilemede korunur',async()=>{
  const{ctx,page}=await context();await page.click('#btn-resign');
  let savedRaw=await page.evaluate(key=>localStorage.getItem(key),STORAGE_KEY);assert(savedRaw===null||JSON.parse(savedRaw).games.length===0,'ilk teslim tıklaması oyun kaydetti');
  await page.getByText('Teslim olursan oyun biter').waitFor();
  await page.click('#btn-resign',{force:true});
  let saved=JSON.parse(await page.evaluate(key=>localStorage.getItem(key),STORAGE_KEY));assert(saved.games.length===1,'teslim birden fazla/hiç kaydedildi');
  await page.getByRole('button',{name:'Yeni Oyun'}).click();saved=JSON.parse(await page.evaluate(key=>localStorage.getItem(key),STORAGE_KEY));assert(saved.games.length===1,'yeni oyun/reset oyun kaydetti');
  await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__robotTest);const state=await page.evaluate(()=>window.__robotTest.state());assert(state.adaptive.games.length===1,'yenilemede geçmiş kayboldu');await ctx.close();
});

await test('uyarlanabilir geçmiş sıfırlama ikinci onay ister',async()=>{
  const completed=JSON.stringify({version:1,profile:'medium',games:[{outcome:'win',endReason:'score'}],gamesSinceChange:1,edgeAdjustment:1,lastReason:'test'});
  const{ctx,page}=await context({storage:completed});
  await page.click('#btn-reset-adaptive');
  let saved=JSON.parse(await page.evaluate(key=>localStorage.getItem(key),STORAGE_KEY));assert(saved.games.length===1,'ilk geçmiş sıfırlama tıklaması veriyi sildi');
  await page.getByText('Eminsen tekrar bas').waitFor();
  await page.click('#btn-reset-adaptive');
  saved=JSON.parse(await page.evaluate(key=>localStorage.getItem(key),STORAGE_KEY));assert(saved.games.length===0&&saved.profile==='beginner','ikinci onay geçmişi sıfırlamadı');
  await ctx.close();
});

await test('renk değişiminde komi ve handikap doğru tarafa uygulanır',async()=>{
  const top=JSON.stringify({version:1,profile:'strong',games:[],gamesSinceChange:3,edgeAdjustment:1,lastReason:'test'});
  const{ctx,page}=await context({storage:top});await page.click('#cp-w');let state=await page.evaluate(()=>window.__robotTest.state());
  assert(state.settings.handicap.length===2&&state.stones.length===2,'AI siyah handikap taşları uygulanmadı');
  await page.click('#cp-b');state=await page.evaluate(()=>window.__robotTest.state());assert(state.settings.handicap.length===0&&state.settings.komi===7.5,'AI beyaz için komi uygulanmadı');await ctx.close();
});

await test('manuel mod uyarlanabilir geçmişi değiştirmez',async()=>{
  const{ctx,page}=await context();await page.click('button[onclick="selectDifficulty(1)"]');await page.click('#btn-resign');
  const raw=await page.evaluate(key=>localStorage.getItem(key),STORAGE_KEY);assert(raw===null||JSON.parse(raw).games.length===0,'manuel oyun geçmişi değiştirdi');await ctx.close();
});

await test('eski worker cevabı reset sonrası taşa dönüşmez',async()=>{
  const{ctx,page}=await context({delayMs:250});await page.click('#btn-pass');await page.click('#btn-reset-board');await page.waitForTimeout(400);
  const state=await page.evaluate(()=>window.__robotTest.state());assert(state.stones.length===0&&state.moveCount===0,'eski worker cevabı yeni tahtaya uygulandı');await ctx.close();
});

await test('iki pas oyunu bitirir',async()=>{
  const{ctx,page}=await context({mctsMode:'pass'});await page.click('#btn-pass');await page.waitForFunction(()=>window.__robotTest.state().gameEnded);
  const state=await page.evaluate(()=>window.__robotTest.state());assert(state.gameEnded,'iki pas oyun sonu üretmedi');assert(state.adaptive.games.length===1,'skorla biten oyun kaydedilmedi');
  await page.getByText('Yeni oyun başlatabilirsin').waitFor();
  await page.getByRole('button',{name:'Yeni Oyun'}).click();
  const fresh=await page.evaluate(()=>window.__robotTest.state());assert(!fresh.gameEnded&&fresh.moveCount===0,'oyun sonundan yeni oyun başlamadı');
  await ctx.close();
});

await test('KataGo başarısı ve çevrimdışı fallback ayrı durumlardır',async()=>{
  const failedCtx=await context({kataReady:false});assert(!(await failedCtx.page.evaluate(()=>window.__robotTest.state().kataReady)),'fallback KataGo başarısı sayıldı');
  await failedCtx.page.getByText('MCTS robotu ile devam ediyoruz').waitFor();await failedCtx.ctx.close();
  const readyCtx=await context({kataReady:true});await readyCtx.page.waitForFunction(()=>window.__robotTest.state().kataReady);assert(await readyCtx.page.evaluate(()=>window.__robotTest.state().kataReady),'READY durumu görülmedi');
  await readyCtx.page.getByText('KataGo yardımcı motoru hazır').waitFor();await readyCtx.ctx.close();
});

await test('zorluk ve renk seçimleri erişilebilir durum bildirir',async()=>{
  const{ctx,page}=await context();
  assert(await page.locator('.diff-card').first().evaluate(el=>el.getAttribute('aria-pressed')==='true'),'aktif zorluk aria-pressed değil');
  assert(await page.locator('#cp-b').evaluate(el=>el.getAttribute('aria-pressed')==='true'),'siyah renk seçimi aria-pressed değil');
  await page.click('#cp-w');
  assert(await page.locator('#cp-w').evaluate(el=>el.getAttribute('aria-pressed')==='true'),'beyaz renk seçimi aria-pressed değil');
  await ctx.close();
});

for(const viewport of [{width:390,height:844},{width:1280,height:720}])await test(`${viewport.width}×${viewport.height} temel kontroller erişilebilir`,async()=>{
  const{ctx,page}=await context({viewport});for(const selector of ['#diff-grid','#cp-b','#cp-w','#btn-pass','#btn-resign','#btn-reset-board']){
    const el=page.locator(selector);await el.scrollIntoViewIfNeeded();assert(await el.isVisible(),selector+' görünür değil');const box=await el.boundingBox();assert(box&&box.width>20&&box.height>20,selector+' erişilebilir boyutta değil')
  }await ctx.close();
});

await browser.close();
console.log(`\nToplam: ${passed+failed}  ✓ ${passed}  ✗ ${failed}`);
if(failed)process.exit(1);
