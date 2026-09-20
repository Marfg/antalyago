import {mountNetLesson} from './netLessonController.js?v=2026-09-20.capture-native1';
import {createLadderMotionOverlay} from './ladderMotionOverlay.js?v=2026-09-20.capture-native1';
import {mountTopicEndControls} from './topicEndControls.js?v=2026-09-20.capture-native1';
let active=null;
export const scene14Net={
 id:'scene-14-net',version:1,title:'Ağ (Geta)',curriculumRef:{lessonId:'l11',concept:'net'},
 mount(context){
  const root=document.createElement('div');root.className='s14-root';root.innerHTML=" <div class=\"s14-heading-row\"><h1 id=\"heading\" class=\"s14-heading\"></h1><nav id=\"steps\" class=\"s14-row s14-dots\" aria-label=\"Ders adımları\"></nav></div>\n <p id=\"story\" class=\"s14-story\"></p>\n <nav class=\"s14-row s14-terms\" aria-label=\"Kısa terim açıklamaları\"><button id=\"term-geta\" aria-pressed=\"false\">Geta</button></nav><p id=\"term-info\" class=\"s14-term-info\" hidden></p>\n <div id=\"choices\" class=\"s14-row\"></div>\n <p id=\"feedback\" class=\"s14-feedback\" role=\"status\" aria-live=\"polite\"></p>\n <div class=\"s14-row\"><button id=\"previous\">Önceki adım</button><button id=\"libs\" aria-pressed=\"false\">Nefesleri göster</button><button id=\"reset\">Yeni deneme</button><button id=\"next\" class=\"primary\">Devam →</button></div>\n";context.container.append(root);context.container.classList.add('s14-scene-host');
  const canvas=context.canvas||document.getElementById('ls-canvas'),region=canvas.parentElement;
  const motion=document.createElement('canvas');motion.className='s14-motion-overlay';motion.setAttribute('aria-hidden','true');region.append(motion);
  const badge=document.createElement('div');badge.id='badge';badge.className='s14-badge';badge.setAttribute('role','status');region.append(badge);
  const overlay=createLadderMotionOverlay(motion,context.boardAdapter,canvas);
  const state=active={root,motion,badge,end:null,link:null,lesson:null};
  const scopedDocument={getElementById:id=>id==='badge'?badge:root.querySelector('#'+id),createElement:tag=>document.createElement(tag)};
  state.lesson=mountNetLesson({board:context.boardAdapter,overlay,document:scopedDocument,
   onPresented:index=>context.emit('scene_assessment_presented',{assessmentIndex:index,assessmentCount:5,concept:'net',assessmentType:'board_tap'}),
   onStepComplete:(index,count)=>{context.emit('scene_assessment_answered',{assessmentIndex:index,stepIndex:index,concept:'net',correct:true,legal:true});if(count===5)context.emit('scene_completion_unlocked',{})},
   onAllComplete(){if(state.end)return;root.hidden=true;motion.hidden=true;badge.hidden=true;context.boardAdapter.setInputEnabled(false);context.boardAdapter.clearLiberties();state.end=mountTopicEndControls(context,{summaryText:'Küçük ağı, iki taşlı ağı ve kenar ağını kurdun; kaçışları yakalamaya kadar sınadın. Rakip uzayınca yeni dış nefesi kapat.'});
    try{const saved=JSON.parse(localStorage.getItem('go_done_3d')||'[]');if(Array.isArray(saved))localStorage.setItem('go_done_3d',JSON.stringify([...new Set([...saved,'l11'])]))}catch{}
    const link=state.link=document.createElement('a');link.className='ls-strip-btn';link.href='ogren-3d.html?lesson=l12';link.textContent='Müfredatta devam et: Snapback';context.container.append(link);
   }
  });
 },
 unmount(context){if(!active)return;active.lesson.destroy();active.end?.destroy();active.link?.remove();active.root.remove();active.motion.remove();active.badge.remove();context.container.classList.remove('s14-scene-host');active=null},
 canComplete(){return !!active?.lesson.canComplete},complete(){}
};
