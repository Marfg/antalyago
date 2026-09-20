import {mountLadderLesson} from './ladderLessonController.js?v=2026-09-20.capture-native1';
import {createLadderMotionOverlay} from './ladderMotionOverlay.js?v=2026-09-20.capture-native1';
import {mountTopicEndControls} from './topicEndControls.js?v=2026-09-20.capture-native1';
let active=null;
export const scene13Ladder={
 id:'scene-13-ladder',version:1,title:'Merdiven (Shichō)',curriculumRef:{lessonId:'l10',concept:'ladder'},
 mount(context){
  const root=document.createElement('div');root.className='s13-root';root.innerHTML="  <div class=\"s13-heading-row\"><h1 class=\"s13-heading\" id=\"heading\"></h1><nav class=\"s13-row s13-dots\" id=\"steps\" aria-label=\"Ders adımları\"></nav></div><p class=\"s13-story\" id=\"story\"></p>\r\n  <div class=\"s13-row\" id=\"choices\"></div>\r\n  <div class=\"s13-row s13-timeline\" id=\"transport\"><button id=\"frame-back\" aria-label=\"Önceki hamle\">←</button><button id=\"play\">Oynat</button><button id=\"frame-next\" aria-label=\"Sonraki hamle\">→</button><input type=\"range\" id=\"scrub\" min=\"0\" max=\"23\" value=\"0\" aria-label=\"Hamle sırası\"><span id=\"counter\" class=\"s13-counter\"></span></div>\r\n  <p id=\"feedback\" class=\"s13-feedback\" role=\"status\" aria-live=\"polite\"></p>\r\n  <div class=\"s13-row\"><button id=\"previous\">Önceki adım</button><button id=\"libs\" aria-pressed=\"false\">Nefesleri göster</button><button id=\"route\" aria-pressed=\"false\">Rotayı göster</button><button id=\"reset\">Yeni deneme</button><button class=\"primary\" id=\"next\">Devam →</button></div>\r\n";context.container.append(root);context.container.classList.add('s13-scene-host');
  const canvas=context.canvas||document.getElementById('ls-canvas'),region=canvas.parentElement;
  const motion=document.createElement('canvas');motion.className='s13-motion-overlay';motion.setAttribute('aria-hidden','true');region.append(motion);
  const badge=document.createElement('div');badge.id='badge';badge.className='s13-badge';badge.setAttribute('role','status');region.append(badge);
  const overlay=createLadderMotionOverlay(motion,context.boardAdapter,canvas);
  const state=active={root,motion,badge,end:null,link:null,lesson:null};
  const scopedDocument={getElementById:id=>id==='badge'?badge:root.querySelector('#'+id),createElement:tag=>document.createElement(tag)};
  state.lesson=mountLadderLesson({board:context.boardAdapter,overlay,document:scopedDocument,
   onPresented:index=>context.emit('scene_assessment_presented',{assessmentIndex:index,assessmentCount:9,concept:'ladder',assessmentType:'board_tap'}),
   onStepComplete:(index,count)=>{context.emit('scene_assessment_answered',{assessmentIndex:index,stepIndex:index,concept:'ladder',correct:true,legal:true});if(count===9)context.emit('scene_completion_unlocked',{})},
   onAllComplete(){if(state.end)return;root.hidden=true;motion.hidden=true;badge.hidden=true;context.boardAdapter.setInputEnabled(false);context.boardAdapter.clearLiberties();state.end=mountTopicEndControls(context,{summaryText:'Zorunlu kaçışları, doğru atari yönünü ve merdiven kırıcıyı hamlelerle sınadın. Takibe başlamadan önce bütün rotayı kontrol et.'});
    try{const saved=JSON.parse(localStorage.getItem('go_done_3d')||'[]');if(Array.isArray(saved))localStorage.setItem('go_done_3d',JSON.stringify([...new Set([...saved,'l10'])]))}catch{}
    const link=state.link=document.createElement('a');link.className='ls-strip-btn';link.href='ogren-3d.html?lesson=l11';link.textContent='Müfredatta devam et: Ağ (Geta)';context.container.append(link);
   }
  });
 },
 unmount(context){if(!active)return;active.lesson.destroy();active.end?.destroy();active.link?.remove();active.root.remove();active.motion.remove();active.badge.remove();context.container.classList.remove('s13-scene-host');active=null},
 canComplete(){return !!active?.lesson.canComplete},complete(){}
};
