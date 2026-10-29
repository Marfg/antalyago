/**
 * tests/home-hero-modes.test.js
 * node tests/home-hero-modes.test.js
 *
 * Ana sayfa mini ders modları (home/heroModes.js). Dizilimler ders
 * sahnelerinin modüllerinden gelir; burada her adım kural motoruyla oynanır:
 * yasak noktalar gerçekten yasak, ko noktası gerçekten ko, cevaplar geçerli,
 * alınan taş sayıları ve oyun sonu alanları beklendiği gibi.
 */
import assert from 'node:assert/strict';
import { buildModes } from '../home/heroModes.js';
import { BoardState } from '../core/boardState.js';
import { applyMove, isValidMove } from '../core/ruleEngine.js';

let pass = 0;
const check = (name, fn) => { fn(); pass += 1; console.log('  ✓', name); };

const modes = buildModes();
const byId = Object.fromEntries(modes.map(m => [m.id, m]));

/** Bir modu baştan sona kural motoruyla oynar; her adımda alınan taş sayısını döndürür. */
function playThrough(mode) {
  let state = new BoardState(9);
  const captured = [];
  const play = (m, where) => {
    const v = isValidMove(state, m.x, m.y, m.color);
    assert.ok(v.valid, `${mode.id} ${where}: ${JSON.stringify(m)} geçersiz (${v.reason})`);
    const r = applyMove(state, m.x, m.y, m.color);
    state = r.newState;
    return r.captured.length;
  };
  for (const [i, step] of mode.steps.entries()) {
    assert.ok(step.cap && step.cap.length > 10, `${mode.id} adım ${i}: açıklama boş`);
    if (step.setup) {
      state = new BoardState(9);
      for (const s of step.setup) state.placeStone(s.x, s.y, s.color);
    }
    let taken = 0;
    for (const m of step.after || []) taken += play(m, `adım ${i} gösterim`);
    const t = step.task;
    if (t?.kind === 'rule') {
      for (const p of t.targets) {
        assert.equal(isValidMove(state, p.x, p.y, t.color).reason, t.reason, `${mode.id} adım ${i}: ${JSON.stringify(p)} ${t.reason} değil`);
      }
      assert.ok(t.ok && t.err, `${mode.id} adım ${i}: geri bildirim eksik`);
    } else if (t?.kind === 'answer') {
      taken += play({ ...t.targets[0], color: t.color }, `adım ${i} cevap`);
      for (const m of t.after || []) taken += play(m, `adım ${i} devam`);
      assert.ok(t.ok && t.err, `${mode.id} adım ${i}: geri bildirim eksik`);
    } else if (t?.kind === 'region') {
      for (const r of t.regions) assert.ok(r.points.every(p => state.isEmpty(p.x, p.y)), `${mode.id}: ${r.color} alanı boş değil`);
    }
    captured.push(taken);
  }
  return captured;
}

check('yedi mod sırasıyla geliyor (Taş alma açılış dersinin kendisi)', () => {
  assert.deepEqual(modes.map(m => m.id), ['yasak', 'ko', 'oyun-sonu', 'iki-goz', 'baglanti', 'merdiven', 'ag-snapback']);
  assert.deepEqual(modes.map(m => m.label), ['Yasak hamle', 'Ko', 'Oyun sonu', 'İki göz', 'Bağlantı', 'Merdiven', 'Ağ · Snapback']);
});

check('yasak hamle: Sahne 8 keşif tahtasındaki dört nokta siyaha yasak', () => {
  const t = byId.yasak.steps[0].task;
  assert.equal(t.targets.length, 4);
  assert.deepEqual(t.targets.map(p => p.label), ['Kenardaki cep', 'Diğer kenar', 'Tahtanın içi', 'Köşe']);
  playThrough(byId.yasak);
});

check('ko: siyah alır, beyaz hemen geri alamaz, araya hamle girince geri alır', () => {
  assert.deepEqual(playThrough(byId.ko), [1, 0, 1]);
  assert.equal(byId.ko.steps[1].task.reason, 'KO');
});

check('oyun sonu: Sahne 10 tahtasında siyah 22, beyaz 20 nokta', () => {
  const [black, white] = byId['oyun-sonu'].steps[0].task.regions;
  assert.equal(black.points.length, 22);
  assert.equal(white.points.length, 20);
  playThrough(byId['oyun-sonu']);
});

check('iki göz: tek göz ve iki göz beyaza yasak, doğru hamle iki göz açar', () => {
  playThrough(byId['iki-goz']);
  assert.deepEqual(byId['iki-goz'].steps.map(s => s.task.kind), ['rule', 'rule', 'answer']);
});

check('bağlantı: beyaz bir noktaya gelince siyah diğerinden bağlanır (Kosumi, Bambu)', () => {
  assert.deepEqual(playThrough(byId.baglanti), [0, 0, 0, 0]);
});

check('merdiven: doğru yönden atari, merdiven kenarda 12 taşı alır', () => {
  assert.deepEqual(playThrough(byId.merdiven), [12]);
});

check('ağ · snapback: ağ kapanır; snapback bir taş verip üç taş alır', () => {
  assert.deepEqual(playThrough(byId['ag-snapback']), [0, 4]);
});

console.log('\nAna sayfa mini ders modları: ' + pass + '/' + pass);
