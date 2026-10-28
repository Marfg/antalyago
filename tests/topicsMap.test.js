/**
 * tests/topicsMap.test.js
 * node tests/topicsMap.test.js
 *
 * scenes/topicsMap.js — öğrenme haritasının bölümleri registry sırasını
 * bozmadan ardışık dilimlere ayırması ve konu durumları. DOM yok.
 */

import { TOPIC_SECTIONS, groupTopics, topicStates } from '../scenes/topicsMap.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓', name); passed++; }
  catch (e) { console.error('  ✗', name, '-', e.message); failed++; }
}
function ok(value, message = 'assertion failed') { if (!value) throw new Error(message); }
function equal(actual, expected, message) {
  if (actual !== expected) throw new Error(message || `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const REGISTRY_IDS = [
  'scene-01-board-intro', 'scene-02-turns-and-intersections', 'scene-03-liberties-by-position',
  'scene-04-group-liberties', 'scene-05-liberty-assessment', 'scene-06-capture-basics',
  'scene-06-capture-edge', 'scene-06-capture-group', 'scene-07-capture-practice',
  'scene-08-illegal-moves', 'scene-09-ko-rule', 'scene-10-endgame-counting',
  'scene-11-two-eyes', 'scene-12-connections', 'scene-13-ladder', 'scene-14-net', 'scene-15-snapback',
];
const scenes = REGISTRY_IDS.map(id => ({ id, title: id }));

test('1) dört bölüm, registry sırası birebir korunur (düzleştirilince aynı dizi)', () => {
  const groups = groupTopics(scenes);
  equal(groups.length, 4);
  equal(JSON.stringify(groups.flatMap(g => g.scenes.map(s => s.id))), JSON.stringify(REGISTRY_IDS));
});

test('2) bölüm sınırları: 1–5 / 6–9 / 10–12 / 13–17', () => {
  const sizes = groupTopics(scenes).map(g => g.scenes.length);
  equal(JSON.stringify(sizes), '[5,4,3,5]');
  ok(TOPIC_SECTIONS.every(section => REGISTRY_IDS.includes(section.startsAt)), 'her bölüm başlangıcı registry\'de olmalı');
});

test('3) bilinmeyen yeni konu bulunduğu yerin bölümüne girer, sıra değişmez', () => {
  const extra = [...scenes.slice(0, 12), { id: 'scene-99-new' }, ...scenes.slice(12)];
  const groups = groupTopics(extra);
  equal(groups[2].scenes.at(-1).id, 'scene-99-new');
  equal(JSON.stringify(groups.flatMap(g => g.scenes.map(s => s.id))), JSON.stringify(extra.map(s => s.id)));
});

test('4) boş bölüm atlanır; ilk bölümden önce gelen konu ilk bölüme yazılır', () => {
  const groups = groupTopics([{ id: 'scene-00-pre' }, { id: 'scene-11-two-eyes' }]);
  equal(groups.length, 2);
  equal(groups[0].title, TOPIC_SECTIONS[0].title);
  equal(groups[1].title, TOPIC_SECTIONS[3].title);
});

test('5) ilk ziyaret: ilk konu aktif, gerisi kilitli', () => {
  const { states, completedCount, next } = topicStates(scenes, [], REGISTRY_IDS[0]);
  equal(states.get(REGISTRY_IDS[0]), 'active');
  ok(REGISTRY_IDS.slice(1).every(id => states.get(id) === 'locked'));
  equal(completedCount, 0);
  equal(next.id, REGISTRY_IDS[0]);
});

test('6) tamamlanmış bir konu tekrar edilirken done kalır, sıradaki konu "next" olur', () => {
  const { states, current, next } = topicStates(scenes, REGISTRY_IDS.slice(0, 3), REGISTRY_IDS[1]);
  equal(states.get(REGISTRY_IDS[1]), 'done');
  equal(current, REGISTRY_IDS[1]);
  equal(states.get(REGISTRY_IDS[3]), 'next');
  equal(next.id, REGISTRY_IDS[3]);
  equal(states.get(REGISTRY_IDS[4]), 'locked');
});

test('7) hepsi tamamlanınca kilitli konu kalmaz, next null', () => {
  const { states, next, completedCount } = topicStates(scenes, REGISTRY_IDS, REGISTRY_IDS.at(-1));
  ok([...states.values()].every(state => state === 'done'));
  equal(next, null);
  equal(completedCount, REGISTRY_IDS.length);
});

console.log(`\nToplam: ${passed + failed}  ✓ ${passed}  ✗ ${failed}`);
if (failed) process.exit(1);
