/**
 * tests/capturePolicy.test.js
 * node tests/capturePolicy.test.js
 *
 * scenes/capturePolicy.js — DOM'suz, saf değerlendirme politikası.
 * core/curriculum.js l3 dersinin GERÇEK (production) steps[0..2] verisini
 * kullanır — synthetic fixture DEĞİL, bkz. tests/libertyAssessmentPolicy.test.js
 * ile AYNI disiplin.
 */
import assert from 'node:assert/strict';
import {
  MOMENT_STEP_INDICES, MOMENT_COUNT, getCaptureMoments,
  computeTargetGroup, computeMomentConcept, isValidCapturePoint,
  computeCaptureResult,
} from '../scenes/capturePolicy.js';
import { findAtariGroups } from '../core/captureObservation.js';
import { defaultConceptForLesson } from '../core/conceptMap.js';
import { BoardState } from '../core/boardState.js';
import { applyMove } from '../core/ruleEngine.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓', name); passed++; }
  catch (e) { console.error('  ✗', name, '-', e.message); failed++; }
}
function equal(a, b, message = `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(message);
}
function ok(cond, message) { if (!cond) throw new Error(message || 'assertion failed'); }

function seedBoard(boardSeed, size = 9) {
  const bs = new BoardState(size);
  for (const s of boardSeed) bs.placeStone(s.x, s.y, s.color === 'B' ? 'black' : 'white');
  return bs;
}

test('MOMENT_STEP_INDICES = [0,1,2] (l3 kullanıcıya görünen 1-3. adımlar)', () => {
  equal(MOMENT_STEP_INDICES, [0, 1, 2]);
  equal(MOMENT_COUNT, 3);
});

test('getCaptureMoments() curriculum sırasıyla TAM 3 öğe döner', () => {
  const moments = getCaptureMoments();
  equal(moments.length, 3);
  equal(moments.map(m => m.curriculumStepIndex), [0, 1, 2]);
  equal(moments.map(m => m.momentIndex), [0, 1, 2]);
});

test('hedef grup boyutu curriculum\'un KENDİ authored sırasıyla 1→2→3 yükselir', () => {
  const moments = getCaptureMoments();
  equal(moments.map(m => m.targetGroupSize), [1, 2, 3]);
});

test('moment 0 (tek taş, merkez): GERÇEK son nefes noktası tek ve curriculum answer ile AYNI', () => {
  const [m] = getCaptureMoments();
  equal(m.targetGroupSize, 1);
  equal(m.lastLibertyPoints, [{ row: 5, col: 4 }]);
  equal(m.curriculumStatedAnswer, { row: 5, col: 4 });
  ok(isValidCapturePoint(m, { row: 5, col: 4 }));
  ok(!isValidCapturePoint(m, { row: 0, col: 0 }));
});

test('moment 1 (2 taşlı grup): GERÇEK son nefes noktası tek ve curriculum answer ile AYNI', () => {
  const moments = getCaptureMoments();
  const m = moments[1];
  equal(m.targetGroupSize, 2);
  equal(m.lastLibertyPoints, [{ row: 4, col: 3 }]);
  equal(m.curriculumStatedAnswer, { row: 4, col: 3 });
});

test('moment 2 (3 taşlı grup, saldıran taşlar dizilimde ÖNCE gelir): anchor tespiti dizilim SIRASINDAN bağımsız', () => {
  const moments = getCaptureMoments();
  const m = moments[2];
  // Bu adımda board seed SİYAH taşlarla başlar (bkz. scenes/capturePolicy.js
  // dosya başı "ANCHOR TESPİTİ" notu) — hâlâ doğru (beyaz) hedef grubu
  // bulmalı, sırayla bağımlı bir varsayım YOK.
  equal(m.board[0].color, 'B');
  equal(m.targetGroupSize, 3);
  equal(m.lastLibertyPoints, [{ row: 3, col: 4 }]);
  equal(m.curriculumStatedAnswer, { row: 3, col: 4 });
});

test('her üç an da GERÇEK olarak TEK nefes noktasına indirgenir (atari senaryosu) — sabit varsayım DEĞİL', () => {
  const moments = getCaptureMoments();
  for (const m of moments) {
    equal(m.lastLibertyPoints.length, 1, `step=${m.curriculumStepIndex}`);
  }
});

test('computeMomentConcept: tam 1 nefeste "atari", aksi hâlde DEFAULT_CONCEPT ("capture")', () => {
  const moments = getCaptureMoments();
  for (const m of moments) equal(computeMomentConcept(m.board, m.size), 'atari');
  // Sentetik (curriculum dışı) çok-nefesli bir grup — DEFAULT_CONCEPT dalı.
  const multiLibertyBoard = [{ color: 'W', x: 4, y: 4 }];
  equal(computeMomentConcept(multiLibertyBoard, 9), 'capture');
});

test('assessmentConcept HER ÜÇ anda "atari" — core/conceptMap.js/core/captureObservation.js ile ÇAPRAZ DOĞRULAMA', () => {
  const moments = getCaptureMoments();
  for (const m of moments) {
    equal(m.assessmentConcept, 'atari');
    const bs = seedBoard(m.board, m.size);
    const atariGroups = findAtariGroups(bs);
    const target = m.lastLibertyPoints[0];
    // GERÇEK atari grubunun tek nefesi, policy'nin hesapladığı son nefes
    // noktasıyla BİREBİR aynı olmalı.
    const matching = atariGroups.find(g => g.color === 'white' &&
      g.liberties.some(l => l.x === target.col && l.y === target.row));
    ok(matching, `step=${m.curriculumStepIndex}: core/captureObservation.js findAtariGroups AYNI son nefes noktasını bulmalı`);
  }
});

test('sahne-seviyesi (primary) concept — core/conceptMap.js defaultConceptForLesson("l3") ile AYNI ("capture")', () => {
  equal(defaultConceptForLesson('l3'), 'capture');
});

test('expectedResultConcept HER ÜÇ anda "capture" — GERÇEK applyMove sonucundan, statik varsayımdan DEĞİL', () => {
  const moments = getCaptureMoments();
  for (const m of moments) {
    equal(m.expectedResultConcept, 'capture', `step=${m.curriculumStepIndex}`);
    // Çapraz doğrulama: core/ruleEngine.js applyMove'u BAĞIMSIZ olarak
    // burada TEKRAR çalıştırıp AYNI sonucu doğrula.
    const bs = seedBoard(m.board, m.size);
    const target = m.lastLibertyPoints[0];
    const { captured } = applyMove(bs, target.col, target.row, 'black');
    ok(captured.length > 0, `step=${m.curriculumStepIndex}: applyMove GERÇEKTEN yakalama üretmeli`);
    equal(captured.length, m.targetGroupSize, `step=${m.curriculumStepIndex}: yakalanan taş sayısı hedef grup boyutuyla eşleşmeli`);
  }
});

test('computeCaptureResult: doğru noktada hedef grup TAM OLARAK kalkar, capturedCount === targetGroupSize', () => {
  const moments = getCaptureMoments();
  for (const m of moments) {
    const target = m.lastLibertyPoints[0];
    const result = computeCaptureResult(m, target);
    equal(result.capturedCount, m.targetGroupSize, `step=${m.curriculumStepIndex}`);
    ok(result.targetRemovedFromBoard, `step=${m.curriculumStepIndex}: hedef grup tahtadan kalkmalı`);
    equal(result.captured.length, m.targetGroupSize);
  }
});

test('computeTargetGroup: boş board seed veya beyaz taş yoksa {size:0, libertyPoints:[]} güvenle döner', () => {
  equal(computeTargetGroup([], 9), { size: 0, libertyPoints: [] });
  equal(computeTargetGroup([{ color: 'B', x: 0, y: 0 }], 9), { size: 0, libertyPoints: [] });
});

test('isValidCapturePoint: null/undefined nokta güvenle reddedilir', () => {
  const [m] = getCaptureMoments();
  ok(!isValidCapturePoint(m, null));
  ok(!isValidCapturePoint(m, undefined));
});

test('getCaptureMoments() SAF — art arda iki çağrı AYNI sonucu üretir (yan etki/mutasyon YOK)', () => {
  const a = getCaptureMoments();
  const b = getCaptureMoments();
  equal(a, b);
});

test('curriculumStatedAnswer HER ÜÇ anda GERÇEK hedef kümesinin TEK elemanıyla birebir aynı', () => {
  const moments = getCaptureMoments();
  for (const m of moments) {
    equal(m.curriculumStatedAnswer, m.lastLibertyPoints[0], `step=${m.curriculumStepIndex}`);
  }
});

test('promptText/feedbackOk/feedbackErr curriculum\'un GERÇEK metninden okunur, burada YENİDEN YAZILMAZ', () => {
  const moments = getCaptureMoments();
  ok(moments[0].promptText.includes('nefes noktaları'), 'moment 0 promptText curriculum HTML\'ini taşımalı');
  equal(moments[0].feedbackOk, 'Yakaladın! Beyaz taş tahtadan kalkar.');
  equal(moments[1].feedbackOk, 'Grubu yakaladın!');
  equal(moments[2].feedbackOk, 'Mükemmel! Üç beyaz taş birden yakalandı.');
});

test('terminoloji: promptText/feedbackOk/feedbackErr hiçbirinde "özgürlük"/"serbestlik" YOK', () => {
  const moments = getCaptureMoments();
  for (const m of moments) {
    const combined = `${m.promptText} ${m.feedbackOk || ''} ${m.feedbackErr || ''}`;
    ok(!/özgürlük|serbestlik/i.test(combined), `step=${m.curriculumStepIndex}: yasak terminoloji sızmış: "${combined}"`);
  }
});

console.log(`\ncapturePolicy test sayısı: ${passed + failed}`);
console.log('özet:', `${passed}/${passed + failed}`);
if (failed) process.exit(1);
