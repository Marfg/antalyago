/**
 * tests/home-hero-caption.test.js
 * node tests/home-hero-caption.test.js
 *
 * Ana sayfa serbest oyununda beyazın cevabından sonraki açıklama
 * (home/heroBoard.js → freePlayCaption): ilk taş alındığında, kim alırsa
 * alsın, tahtayı temizlemek önerilir; sonraki almalarda öneri yinelenmez.
 */
import assert from 'node:assert/strict';
import { freePlayCaption } from '../home/heroBoard.js';

const base = { blackTook: 0, whiteTook: 0, firstCapture: false, danger: 0, chance: 0, caps: { black: 0, white: 0 } };
let pass = 0;
const check = (name, fn) => { fn(); pass += 1; console.log('  ✓', name); };

check('ilk taşı siyah alırsa temizleme önerilir', () => {
  const text = freePlayCaption({ ...base, blackTook: 1, firstCapture: true, caps: { black: 1, white: 0 } });
  assert.match(text, /^İlk taşı sen aldın!/);
  assert.match(text, /tahtayı temizleyebilir/);
});

check('ilk taşı beyaz alırsa temizleme önerilir', () => {
  const text = freePlayCaption({ ...base, whiteTook: 1, firstCapture: true, caps: { black: 0, white: 1 } });
  assert.match(text, /^Beyaz ilk taşı aldı\./);
  assert.match(text, /Tahtayı temizleyip/);
});

check('aynı turda ikisi de alırsa ilk alan siyahtır', () => {
  const text = freePlayCaption({ ...base, blackTook: 1, whiteTook: 2, firstCapture: true, caps: { black: 1, white: 2 } });
  assert.match(text, /^İlk taşı sen aldın!/);
});

check('sonraki almalarda öneri yinelenmez', () => {
  assert.equal(freePlayCaption({ ...base, whiteTook: 2, caps: { black: 1, white: 3 } }), 'Beyaz 2 taş aldı. Sıra sende.');
  assert.equal(freePlayCaption({ ...base, blackTook: 1, caps: { black: 2, white: 0 } }), 'Esir: sen 2, beyaz 0. Sıra sende.');
});

check('alma yoksa atari ve esir açıklamaları aynı kalır', () => {
  assert.match(freePlayCaption({ ...base, danger: 1 }), /^Kırmızı halka/);
  assert.match(freePlayCaption({ ...base, chance: 1 }), /^Altın halka/);
  assert.equal(freePlayCaption(base), 'Esir: sen 0, beyaz 0. Sıra sende.');
});

console.log('\nAna sayfa serbest oyun açıklaması: ' + pass + '/' + pass);
