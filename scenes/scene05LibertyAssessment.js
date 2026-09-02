/**
 * scenes/scene05LibertyAssessment.js
 *
 * Konu #5 — "Nefes Noktalarını Değerlendir". Müfredat kaynağı: core/
 * curriculum.js, l2 "Nefes Noktaları" dersinin kullanıcıya görünen 4., 5.,
 * 6., 7. ve 8. adımları (sıfır tabanlı steps[3..7] — bkz. scenes/
 * libertyAssessmentPolicy.js, TEK doğruluk kaynağı). Bu BEŞ ayrı curriculum
 * adımı BEŞ AYRI sahne DEĞİL, TEK bir sahnenin (bu dosya) kendi İÇ
 * değerlendirme aşamalarıdır (bkz. görev talimatı: "Sahne #4 → Sahne #5
 * arasında yalnız BİR runtime sahne geçişi olmalı").
 *
 * İç aşama geçişleri (1/5→5/5) `scenes/sceneTransition.js`'i KULLANMAZ —
 * `context.advanceToNext()`/`replayActive()` HİÇ çağrılmaz, `mount/unmount`
 * yalnız BİR kez (sahne mount edildiğinde/ayrıldığında) çalışır. Bunun
 * yerine küçük, sahneye özel scenes/assessmentTransition.js kullanılır.
 *
 * Beş adımın GERÇEK türleri (bkz. libertyAssessmentPolicy.js normalizeStep):
 *   1) steps[3] — 'choice' (köşe taşının nefes SAYISI, çoktan seçmeli)
 *   2) steps[4] — 'choice' (bitişik taş sonrası kalan nefes SAYISI)
 *   3) steps[5] — 'board_tap' (tek taşın nefes noktalarından BİRİNE dokun)
 *   4) steps[6] — 'board_tap' (iki taşlı grubun nefes noktalarından BİRİNE dokun)
 *   5) steps[7] — 'board_tap' (atari — SON nefes noktasına oyna, GERÇEK
 *      yakalama core/ruleEngine.js üzerinden adapters/sceneBoardAdapter.js
 *      playMove()'un zaten desteklediği capture mekanizmasıyla olur — AYRI
 *      bir "capture modu" YAZILMADI, aynı 'board_tap' kod yolu kullanılır).
 *
 * TERMİNOLOJİ (bkz. görev talimatı Bölüm 4): "özgürlük/özgürlüğü/serbestlik"
 * veya İngilizce "liberty/liberties" KULLANILMAZ — yalnız "nefes noktası"/
 * "nefes noktaları". Teknik tanımlayıcı `concept:'liberty'` (sahnenin
 * PRIMARY/paket kavramı, geriye uyumluluk için korunuyor) DEĞİŞMEDİ.
 *
 * KAVRAM AYRIMI (v2 — kök neden düzeltmesi): sahnenin primary `concept`i
 * ('liberty') ile HER ÖĞENİN gerçekten değerlendirdiği kavram AYNI ŞEY
 * DEĞİLDİR — steps[7] (atari/yakalama) `l2` dersinin altında yaşasa da
 * kendi konusu 'liberty' değil 'atari'dir (doğru cevap sonrası 'capture'a
 * dönüşür). Önceki sürüm TEK bir `CONCEPT='liberty'` sabitini TÜM beş öğe
 * için kullanıyordu — bu, event/Studio/Diagnostics çıktısında item 5'in
 * gerçek kavramını YOK ediyordu. Artık her event üç AYRI, açık alan taşır:
 *   - `concept` — sahne-seviyesi (her zaman 'liberty', runtime sözleşmesi)
 *   - `assessmentConcept` — ÖĞE-seviyesi, libertyAssessmentPolicy.js'in
 *     GERÇEK RuleEngine-hesaplı sonucu (bkz. computeAssessmentConcept)
 *   - `resultConcept` — YALNIZ doğru cevap board'u GERÇEKTEN bir kavrama
 *     dönüştürdüyse eklenir (steps[7] için 'capture'; steps[3..6] için HİÇ
 *     eklenmez, bkz. computeExpectedResultConcept)
 *
 * SKOR DİLİ YOK (bkz. görev talimatı Bölüm 10): puan/yüzde/başarısızlık
 * ekranı YOK — yalnız "Doğru" / "Bir kez daha düşün" + kısa açıklama.
 */
import { mountTopicEndControls } from './topicEndControls.js?v=2026-09-02.1';
import { assessmentTransition } from './assessmentTransition.js?v=2026-09-02.1';
import {
  getAssessmentSteps, computeChoiceCorrectIndex, computeTapTargets,
  isValidTapAnswer, isValidChoiceAnswer, computeResultAfterMove,
} from './libertyAssessmentPolicy.js?v=2026-09-02.1';

const CONCEPT = 'liberty';

const STATE = { INTRO: 'intro', ASSESSING: 'assessing' };

const INTRO_TEXT = 'Şimdi nefes noktası bilgini birkaç kısa alıştırmayla pekiştir.';
const CONTINUE_LABEL = 'Devam';
const RETRY_HINT_CHOICE = 'Bir kez daha düşün.';
const RETRY_HINT_TAP = 'Bir kez daha düşün — doğru noktayı tekrar dene.';
const SUMMARY_TEXT = 'Nefes noktalarını beş kısa alıştırmayla pekiştirdin.';

let state = STATE.INTRO;
let assessments = [];
let currentIndex = 0;
let answeredCorrectly = [];
let attemptCount = [];
let awaitingContinue = false;
let transitioning = false;
let unlockedEmitted = false;
let topicEnded = false;
let topicEnd = null;
let els = null;
let cleanupFns = [];
let itemCleanupFns = [];
let unsubscribeTap = null;

function resetState() {
  state = STATE.INTRO;
  assessments = getAssessmentSteps();
  currentIndex = 0;
  answeredCorrectly = new Array(assessments.length).fill(false);
  attemptCount = new Array(assessments.length).fill(0);
  awaitingContinue = false;
  transitioning = false;
  unlockedEmitted = false;
  topicEnded = false;
  topicEnd = null;
  unsubscribeTap = null;
}

function on(el, type, handler) {
  el.addEventListener(type, handler);
  cleanupFns.push(() => el.removeEventListener(type, handler));
}
function onItem(el, type, handler) {
  el.addEventListener(type, handler);
  itemCleanupFns.push(() => el.removeEventListener(type, handler));
}
function clearItemListeners() {
  itemCleanupFns.forEach(fn => fn());
  itemCleanupFns = [];
  if (unsubscribeTap) { unsubscribeTap(); unsubscribeTap = null; }
}

function allAnsweredCorrectly() {
  return answeredCorrectly.length === assessments.length && answeredCorrectly.every(Boolean);
}

function seedBoard(context, assessment) {
  const board = context.boardAdapter;
  board.setSize(assessment.size);
  board.reset();
  if (assessment.cameraPreset) board.focus(assessment.cameraPreset);
  for (const stone of assessment.board) {
    board.playMove({ row: stone.y, col: stone.x, color: stone.color === 'B' ? 'black' : 'white' });
  }
  if (assessment.showLibertiesBeforeAnswer) {
    board.showLiberties(computeTapTargets(assessment));
  } else {
    board.clearLiberties();
  }
}

function buildProgressHtml(index) {
  const dots = assessments.map((_, i) => {
    const cls = i < index ? 's05-dot s05-dot--done' : i === index ? 's05-dot s05-dot--active' : 's05-dot';
    return `<span class="${cls}" aria-hidden="true"></span>`;
  }).join('');
  return `
    <span class="s05-progress-text">${index + 1} / ${assessments.length}</span>
    <span class="s05-progress-dots">${dots}</span>
  `;
}

function renderChoiceItem(context, assessment) {
  els.contentEl.innerHTML = `
    <div class="s05-item">
      <div class="s05-prompt">${assessment.promptText}</div>
      <div class="s05-choice-options" role="group" aria-label="${assessment.questionLabel}"></div>
    </div>
  `;
  const optsWrap = els.contentEl.querySelector('.s05-choice-options');
  const realLibertyCount = computeChoiceCorrectIndex(assessment) >= 0
    ? Number(assessment.options[computeChoiceCorrectIndex(assessment)].text)
    : null;
  let locked = false;
  assessment.options.forEach((opt, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 's05-choice-btn';
    btn.textContent = opt.text;
    onItem(btn, 'click', () => {
      if (locked || awaitingContinue || transitioning) return;
      const isCorrect = isValidChoiceAnswer(assessment, idx);
      attemptCount[currentIndex] += 1;
      context.emit('scene_assessment_answered', {
        assessmentIndex: currentIndex,
        curriculumStepIndex: assessment.curriculumStepIndex,
        concept: CONCEPT,
        assessmentConcept: assessment.assessmentConcept,
        attemptNumber: attemptCount[currentIndex],
        correct: isCorrect,
        selectedOptionText: opt.text,
        libertyCount: realLibertyCount,
      });
      if (isCorrect) {
        locked = true;
        answeredCorrectly[currentIndex] = true;
        optsWrap.querySelectorAll('button').forEach(b => { b.disabled = true; });
        btn.classList.add('s05-choice-btn--correct');
        setFeedback(opt.feedback || 'Doğru!', 'ok');
        showContinueControl(context);
      } else {
        btn.classList.add('s05-choice-btn--wrong');
        setTimeout(() => btn.classList.remove('s05-choice-btn--wrong'), 260);
        setFeedback(opt.feedback ? `${opt.feedback} ${RETRY_HINT_CHOICE}` : RETRY_HINT_CHOICE, 'err');
      }
    });
    optsWrap.appendChild(btn);
  });
  return optsWrap.querySelector('button');
}

function renderTapItem(context, assessment) {
  els.contentEl.innerHTML = `
    <div class="s05-item">
      <div class="s05-prompt">${assessment.promptText}</div>
      <p class="s05-tap-hint">Tahtada doğru noktaya dokun.</p>
    </div>
  `;
  context.boardAdapter.setInputEnabled(true);
  const realTargets = computeTapTargets(assessment);
  unsubscribeTap = context.boardAdapter.onIntersectionTap(hit => {
    if (awaitingContinue || transitioning) return;
    const isCorrect = isValidTapAnswer(assessment, hit);
    attemptCount[currentIndex] += 1;
    // Yanlış cevapta hamle HİÇ oynanmaz — board eski durumda kalır (steps[7]
    // hâlâ atari'dedir), bu yüzden resultConcept HİÇ hesaplanmaz/eklenmez.
    // Doğru cevapta ise playMove'dan SONRA, bu SPESİFİK hamlenin GERÇEK
    // `captured` sonucundan okunur (assessment.expectedResultConcept'in
    // önceden hesaplanmış tahmininden DEĞİL) — steps[5]/[6]'nın doğru
    // cevapları hiçbir zaman yakalama ÜRETMEZ, steps[7] her zaman üretir
    // (bkz. görev talimatı Bölüm 2/6/7). Event TEK BİR scene_assessment_answered
    // çağrısıyla, hamle sonucu belli olduktan SONRA emit edilir.
    let resultConcept = null;
    let playResult = null;
    // v2 — kök neden düzeltmesi: resultInfo, HAM curriculum seed'i + GERÇEKTEN
    // tıklanan `hit` noktası üzerinden core/ruleEngine.js ile SIMÜLE edilir
    // (bkz. libertyAssessmentPolicy.js computeResultAfterMove) — sonuç
    // highlight'ı ARTIK computeTapTargets(assessment)'i (hamle-ÖNCESİ küme)
    // TEKRAR ÇAĞIRMIYOR (eski hata: board'da yeni taş/yeni grup varken
    // ekranda hâlâ eski taşın/grubun hamle-öncesi nefesleri gösteriliyordu —
    // bkz. görev talimatı Bölüm 1). Seçilen yön DEĞİŞSE bile (item 4'ün dört
    // kabul edilen noktası) sonuç HER ZAMAN gerçek/tekil hesaplanır.
    let resultInfo = null;
    if (isCorrect) {
      resultInfo = computeResultAfterMove(assessment, hit);
      playResult = context.boardAdapter.playMove({ row: hit.row, col: hit.col, color: 'black' });
      if (!playResult.ok) return; // savunma amaçlı — geçerli hedefler zaten her zaman yasaldır.
      if (playResult.captured?.length > 0) resultConcept = 'capture';
    }
    context.emit('scene_assessment_answered', {
      assessmentIndex: currentIndex,
      curriculumStepIndex: assessment.curriculumStepIndex,
      concept: CONCEPT,
      assessmentConcept: assessment.assessmentConcept,
      attemptNumber: attemptCount[currentIndex],
      correct: isCorrect,
      row: hit.row,
      col: hit.col,
      libertyCount: realTargets.length,
      ...(resultConcept ? { resultConcept } : {}),
      // Yanlış cevapta HİÇ eklenmez (hamle oynanmadı, board değişmedi) —
      // yalnız doğru cevapta, GERÇEK hamle-öncesi/hamle-sonrası kanıtı taşır.
      ...(resultInfo ? {
        groupSizeBeforeMove: resultInfo.groupSizeBeforeMove,
        libertyCountBeforeMove: resultInfo.libertyCountBeforeMove,
        groupSizeAfterMove: resultInfo.groupSizeAfterMove,
        libertyCountAfterMove: resultInfo.libertyCountAfterMove,
        resultLibertyPoints: resultInfo.resultLibertyPoints,
      } : {}),
    });
    if (!isCorrect) {
      setFeedback(assessment.feedbackErr ? `${assessment.feedbackErr}` : RETRY_HINT_TAP, 'err');
      return; // board state DEĞİŞMEZ — yanlış dokunma taş bırakmaz.
    }
    answeredCorrectly[currentIndex] = true;
    context.boardAdapter.setInputEnabled(false);
    // Önceki (hamle-öncesi) highlight'lar TAMAMEN temizlenir — eski ve yeni
    // işaretler bir kareliğine bile üst üste kalmaz (bkz. görev talimatı
    // Bölüm 3/5).
    context.boardAdapter.clearLiberties();
    const captured = resultConcept === 'capture';
    if (captured) {
      // steps[7] (atari/yakalama) — yeni taşın KENDİ (izole, gruba bağlı
      // OLMAYAN) nefeslerini göstermek pedagojik olarak konu dışıdır (bkz.
      // görev talimatı Bölüm 2: "pedagojik odağını bozmadan ele al") — bu
      // alıştırmanın konusu yakalamanın KENDİSİ, sonuç grup boyutu DEĞİL.
      // Eski hatalı (görünmez biçimde çakışan) tek noktalık işaret artık HİÇ
      // çizilmiyor; capture'ın kendisi zaten yeterli görsel geri bildirim.
      setFeedback(assessment.feedbackOk || 'Mükemmel! Yakaladın.', 'ok');
    } else {
      // steps[5]/[6] (item 3/4) — sonuç, GERÇEK hesaplanan nihai grubun TÜM
      // nefes noktalarını gösterir; feedback metni artık curriculum'un sabit
      // "Bu bir nefes noktasıydı" cümlesiyle YETİNMEZ, oluşan grubu anlatır
      // (bkz. görev talimatı Bölüm 6).
      context.boardAdapter.showLiberties(resultInfo.resultLibertyPoints);
      setFeedback(`Doğru. Yeni taş gruba bağlandı. Bu ${resultInfo.groupSizeAfterMove} taşlı grubun ${resultInfo.libertyCountAfterMove} nefes noktası var.`, 'ok');
    }
    showContinueControl(context);
  });
  return els.contentEl.querySelector('.s05-tap-hint');
}

function setFeedback(text, kind) {
  els.feedbackEl.textContent = text;
  els.feedbackEl.classList.remove('s05-feedback--ok', 's05-feedback--err');
  els.feedbackEl.classList.add(kind === 'ok' ? 's05-feedback--ok' : 's05-feedback--err');
}

function showContinueControl(context) {
  awaitingContinue = true;
  els.continueBtn.classList.remove('s05-continue--waiting');
  els.continueBtn.tabIndex = 0;
  // preventScroll: dar/kısa viewport'ta içerik #ls-narration'ın
  // overflow-y:auto alanını GERÇEKTEN aşabiliyor (ör. uzun geri bildirim
  // metni + mobil genişlik) — varsayılan focus-scroll davranışı bu durumda
  // üstteki ilerleme/prompt satırını YARIM KIRPILMIŞ bırakarak kaydırıyordu
  // (bkz. görev talimatı: "hiçbir viewport'ta kırpılma olmamalı"). Kaydırma
  // burada BİLEREK devre dışı — kullanıcı isterse kendi kaydırabilir, ama
  // doğru cevaptan hemen sonra görünüm SIÇRAMAZ/YARIM KALMAZ.
  els.continueBtn.focus({ preventScroll: true });
  if (currentIndex === assessments.length - 1 && !unlockedEmitted && allAnsweredCorrectly()) {
    unlockedEmitted = true;
    context.emit('scene_completion_unlocked', {});
  }
}

function renderCurrentItem(context) {
  const assessment = assessments[currentIndex];
  els.progressEl.innerHTML = buildProgressHtml(currentIndex);
  els.feedbackEl.textContent = '';
  els.feedbackEl.classList.remove('s05-feedback--ok', 's05-feedback--err');
  els.continueBtn.classList.add('s05-continue--waiting');
  els.continueBtn.tabIndex = -1;
  awaitingContinue = false;
  seedBoard(context, assessment);
  const firstFocusable = assessment.type === 'choice'
    ? renderChoiceItem(context, assessment)
    : renderTapItem(context, assessment);
  return firstFocusable;
}

async function loadItem(context, index, { withTransition }) {
  clearItemListeners();
  context.boardAdapter.setInputEnabled(false);
  currentIndex = index;
  if (!withTransition) {
    renderCurrentItem(context);
    presentCurrentAssessment(context);
    return;
  }
  // transitioning SENKRON olarak (ilk await'ten ÖNCE) true'ya çekilir —
  // hızlı çift tıklamada goToNextItem'ın guard'ı (`transitioning`) bu
  // fonksiyon geri dönmeden ÖNCE ZATEN true'dur (JS tek iş parçacıklı,
  // ilk await'e kadar SENKRON çalışır) — bkz. dosya başı v1 notu.
  transitioning = true;
  let firstFocusable = null;
  await assessmentTransition({
    container: els.contentEl,
    renderNext: () => { firstFocusable = renderCurrentItem(context); },
    focusTarget: () => firstFocusable,
  });
  transitioning = false;
  presentCurrentAssessment(context);
}

async function goToNextItem(context) {
  if (!awaitingContinue || transitioning) return;
  const fromIndex = currentIndex;
  const toIndex = currentIndex + 1;
  const completedAssessment = assessments[fromIndex];
  // Yalnız GERÇEK bir sonraki öğe varsa emit edilir — son öğe (steps[7])
  // tamamlanınca sahte bir toAssessmentIndex (ör. eskiden Math.min ile
  // fromIndex'e KLEMPLENMİŞ, "4'ten 4'e ilerledi" gibi anlamsız bir değer)
  // ÜRETİLMEZ; konu sonu zaten scene_completion_unlocked/scene_completed
  // ile temsil edilir (bkz. görev talimatı Bölüm 6).
  if (toIndex < assessments.length) {
    context.emit('scene_assessment_advanced', {
      fromAssessmentIndex: fromIndex,
      toAssessmentIndex: toIndex,
      concept: CONCEPT,
      assessmentConcept: completedAssessment.assessmentConcept,
      // completedAssessment.expectedResultConcept HER ZAMAN bu öğenin doğru
      // cevabının GERÇEK (RuleEngine ile önceden doğrulanmış) sonucudur —
      // buraya yalnız goToNextItem `awaitingContinue===true` iken (yani
      // öğe zaten DOĞRU cevaplanmışken) ulaşılabildiği için güvenle okunur.
      ...(completedAssessment.expectedResultConcept ? { resultConcept: completedAssessment.expectedResultConcept } : {}),
    });
  }
  if (toIndex >= assessments.length) {
    goToTopicEnd(context);
    return;
  }
  await loadItem(context, toIndex, { withTransition: true });
}

function presentCurrentAssessment(context) {
  const assessment = assessments[currentIndex];
  context.emit('scene_assessment_presented', {
    assessmentIndex: currentIndex,
    assessmentCount: assessments.length,
    curriculumStepIndex: assessment.curriculumStepIndex,
    assessmentType: assessment.type,
    concept: CONCEPT,
    assessmentConcept: assessment.assessmentConcept,
    // Bu aşamada henüz hiçbir hamle oynanmadı — steps[7] sunulduğunda board
    // hâlâ atari'dedir, yakalama GERÇEKLEŞMEMİŞTİR. resultConcept:'capture'
    // BİLEREK yazılmaz (bkz. görev talimatı Bölüm 6, scene_assessment_presented).
  });
}

function goToTopicEnd(context) {
  if (topicEnded) return;
  topicEnded = true;
  clearItemListeners();
  context.boardAdapter.setInputEnabled(false);
  context.boardAdapter.clearLiberties();
  els.assessRow.hidden = true;
  topicEnd = mountTopicEndControls(context, { summaryText: SUMMARY_TEXT });
}

function buildDom(context) {
  const root = document.createElement('div');
  root.className = 'ls-strip-root';
  root.innerHTML = `
    <div class="ls-strip-row ls-strip-fade" id="s05-intro">
      <p class="ls-strip-text">${INTRO_TEXT}</p>
      <span class="ls-tick-wrap">
        <button type="button" class="ls-tick" id="s05-confirm" aria-label="Bilgiyi onayla">
          <svg class="ls-tick-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>
        </button>
        <span class="ls-tick-tip" aria-hidden="true">Onayla</span>
      </span>
    </div>
    <div class="ls-strip-row" id="s05-assess" hidden>
      <div class="s05-progress" id="s05-progress" aria-label="Değerlendirme ilerlemesi"></div>
      <div class="s05-content" id="s05-content"></div>
      <div class="s05-feedback-row">
        <p class="s05-feedback" id="s05-feedback" role="status" aria-live="polite"></p>
        <button type="button" class="ls-strip-btn s05-continue--waiting" id="s05-continue" tabindex="-1">${CONTINUE_LABEL}</button>
      </div>
    </div>
  `;
  context.container.appendChild(root);
  return {
    root,
    introRow: root.querySelector('#s05-intro'),
    confirmBtn: root.querySelector('#s05-confirm'),
    assessRow: root.querySelector('#s05-assess'),
    progressEl: root.querySelector('#s05-progress'),
    contentEl: root.querySelector('#s05-content'),
    feedbackEl: root.querySelector('#s05-feedback'),
    continueBtn: root.querySelector('#s05-continue'),
  };
}

export const scene05LibertyAssessment = {
  id: 'scene-05-liberty-assessment',
  // v2 (2026-08-24.1) — davranışsal değişiklik: doğru cevap sonrası nefes
  // highlight'ı artık hamle-ÖNCESİ değil hamle-SONRASI GERÇEK grubu gösterir
  // (bkz. computeResultAfterMove, dosya başı v2 notu). Sahne version'ı
  // sürüm token'ından BAĞIMSIZ (bkz. tests/sceneRelease.test.js).
  version: 2,
  title: 'Nefes Noktalarını Değerlendir',
  curriculumRef: { lessonId: 'l2', concept: 'liberty', stepIndex: 3 },
  // Geriye uyumlu TEKİL curriculumRef korunurken (registry/Diagnostics
  // sözleşmesi bunu kullanır — bkz. scenes/sceneRegistry.js), bu sahnenin
  // GERÇEKTEN kapsadığı BEŞ curriculum adımı ayrıca burada listelenir.
  // Teacher Studio Diagnostics'in kendi doğrulaması BUNU okur (bkz. görev
  // talimatı Bölüm 2/13). `concept` alanı HER GİRDİ İÇİN
  // libertyAssessmentPolicy.js'in GERÇEK, RuleEngine-hesaplı
  // `assessmentConcept`'inden türetilir (statik 5×'liberty' listesi DEĞİL) —
  // steps[7] (atari) burada da 'atari' taşır, aksi hâlde bu liste kendisi
  // tam olarak düzeltilmeye çalışılan hatayı (item concept'inin sahne
  // primary concept'iyle karıştırılması) yeniden üretirdi (bkz. görev
  // talimatı Bölüm 5).
  curriculumRefs: getAssessmentSteps().map(a => ({
    lessonId: 'l2', concept: a.assessmentConcept, stepIndex: a.curriculumStepIndex,
  })),

  mount(context) {
    resetState();
    cleanupFns = [];
    els = buildDom(context);
    // Sahne #5'in dört bloklu (progress/content/feedback/devam) düzeni
    // Sahne #1-4'ün tek satırlık şeridinden GERÇEKTEN daha uzun olabiliyor
    // (bkz. styles/learning-scenes.css v0.19d notu) — #ls-narration'ın
    // `align-items:center`i, bütçeyi aşan içeriği YUKARI DOĞRU da taşırıp
    // erişilemez kılardı (scrollTop 0'dan aşağı inemez). Bu sınıf YALNIZ bu
    // sahne mount'luyken `#ls-scene-host`u üstten hizalar (bkz. CSS) — taşma
    // varsa yalnız AŞAĞIYA (kaydırılabilir alana) doğru olur. Sahne #1-4
    // dokunulmadı, unmount'ta KALDIRILIYOR (sızıntı yok).
    context.container.classList.add('s05-scene-host');

    context.boardAdapter.setSize(9);
    context.boardAdapter.reset();
    context.boardAdapter.focus('center');
    context.boardAdapter.setInputEnabled(false);
    context.boardAdapter.clearLiberties();

    let confirming = false;
    on(els.confirmBtn, 'click', () => {
      if (confirming || state !== STATE.INTRO) return;
      confirming = true;
      els.confirmBtn.disabled = true;
      els.confirmBtn.classList.add('ls-confirmed');

      const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const doAdvance = () => {
        context.emit('scene_intro_confirmed', {});
        state = STATE.ASSESSING;
        els.introRow.hidden = true;
        els.assessRow.hidden = false;
        renderCurrentItem(context);
        presentCurrentAssessment(context);
      };
      if (reduceMotion) { doAdvance(); return; }
      els.introRow.classList.add('ls-closing');
      setTimeout(doAdvance, 220);
    });

    on(els.continueBtn, 'click', () => { goToNextItem(context); });

    render();
  },

  unmount(context) {
    clearItemListeners();
    context.container.classList.remove('s05-scene-host');
    context.boardAdapter.clearMovePreview();
    context.boardAdapter.clearLiberties();
    cleanupFns.forEach(fn => fn());
    cleanupFns = [];
    topicEnd?.destroy();
    topicEnd = null;
    els?.root?.remove();
    els = null;
    resetState();
  },

  canComplete() {
    return allAnsweredCorrectly();
  },

  complete() {
    // Runtime zaten scene_completed event'ini ve progress yazımını
    // yönetiyor — bu sahnenin tamamlanma ANINDA ek bir yan etkisi yok.
  },
};

function render() {
  if (!els) return;
  els.introRow.hidden = state !== STATE.INTRO;
  els.assessRow.hidden = state === STATE.INTRO || topicEnded;
}
