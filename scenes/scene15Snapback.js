import {mountSnapbackLesson} from './snapbackLessonController.js?v=2026-09-20.capture-native1';
import {createLadderMotionOverlay} from './snapbackMotionOverlay.js?v=2026-09-20.capture-native1';
import {mountTopicEndControls} from './topicEndControls.js?v=2026-09-20.capture-native1';
let active=null;
export const scene15Snapback={
 id:'scene-15-snapback',version:1,title:'Snapback',curriculumRef:{lessonId:'l12',concept:'snapback'},
 mount(context){
  const root=document.createElement('div');root.className='s15-root';root.innerHTML=" <div class=\"s15-heading-row\"><h1 id=\"heading\" class=\"s15-heading\"></h1><nav id=\"steps\" class=\"s15-row s15-dots\" aria-label=\"Ders adımları\"></nav></div>\n <p id=\"story\" class=\"s15-story\"></p>\n <nav class=\"s15-row s15-terms\" aria-label=\"Kısa terim açıklamaları\"><button id=\"term-snapback\" aria-pressed=\"false\">Snapback</button></nav><p id=\"term-info\" class=\"s15-term-info\" hidden></p>\n <div id=\"choices\" class=\"s15-row\"></div>\n <p id=\"feedback\" class=\"s15-feedback\" role=\"status\" aria-live=\"polite\"></p>\n <div class=\"s15-row\"><button id=\"previous\">Önceki adım</button><button id=\"libs\" aria-pressed=\"false\">Nefesleri göster</button><button id=\"hint\">Sıradaki noktayı göster</button><button id=\"reset\">Yeni deneme</button><button id=\"next\" class=\"primary\">Devam →</button></div>\n";context.container.append(root);context.container.classList.add('s15-scene-host');
  const canvas=context.canvas||document.getElementById('ls-canvas'),region=canvas.parentElement;
  const motion=document.createElement('canvas');motion.className='s15-motion-overlay';motion.setAttribute('aria-hidden','true');region.append(motion);
  const badge=document.createElement('div');badge.id='badge';badge.className='s15-badge';badge.setAttribute('role','status');region.append(badge);
  const overlay=createLadderMotionOverlay(motion,context.boardAdapter,canvas);
  const state=active={root,motion,badge,end:null,link:null,lesson:null};
  const scopedDocument={getElementById:id=>id==='badge'?badge:root.querySelector('#'+id),createElement:tag=>document.createElement(tag)};
  state.lesson=mountSnapbackLesson({board:context.boardAdapter,overlay,document:scopedDocument,
   onPresented:index=>context.emit('scene_assessment_presented',{assessmentIndex:index,assessmentCount:4,concept:'snapback',assessmentType:'board_tap'}),
   onStepComplete:(index,count)=>{context.emit('scene_assessment_answered',{assessmentIndex:index,stepIndex:index,concept:'snapback',correct:true,legal:true});if(count===4)context.emit('scene_completion_unlocked',{})},
   onAllComplete(){if(state.end)return;root.hidden=true;motion.hidden=true;badge.hidden=true;context.boardAdapter.setInputEnabled(false);context.boardAdapter.clearLiberties();state.end=mountTopicEndControls(context,{summaryText:'Kurban, alma ve geri alma dizisini iki renkle oynadın. Kurbanı alan grubun nefeslerini yeniden say.'});
    try{const saved=JSON.parse(localStorage.getItem('go_done_3d')||'[]');if(Array.isArray(saved))localStorage.setItem('go_done_3d',JSON.stringify([...new Set([...saved,'l12'])]))}catch{}
    const link=state.link=document.createElement('a');link.className='ls-strip-btn';link.href='ogren-3d.html?lesson=l2_deg';link.textContent='Müfredatta devam et: B2 — Taktik Okuma';context.container.append(link);
   }
  });
 },
 unmount(context){if(!active)return;active.lesson.destroy();active.end?.destroy();active.link?.remove();active.root.remove();active.motion.remove();active.badge.remove();context.container.classList.remove('s15-scene-host');active=null},
 canComplete(){return !!active?.lesson.canComplete},complete(){}
};
