/**
 * tests/captureObservation.test.js
 * node tests/captureObservation.test.js
 *
 * core/captureObservation.js — mevcut ruleEngine.js primitifleri (getGroup/
 * getLiberties) üzerine kurulu saf atari/grup gözlemi. Yeni bir capture
 * motoru değil; bu testler yalnızca gözlemin gerçek board durumuyla
 * tutarlı olduğunu doğrular.
 */

import { BoardState } from '../core/boardState.js';
import { findAllGroups, findAtariGroups, isPointInAtari } from '../core/captureObservation.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓', name); passed++; }
  catch (e) { console.error('  ✗', name, '-', e.message); failed++; }
}
function ok(value, message = 'assertion failed') { if (!value) throw new Error(message); }
function equal(actual, expected, message) {
  if (actual !== expected) throw new Error(message || `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function keys(points) { return points.map(p => `${p.x},${p.y}`).sort().join('|'); }

// ── findAllGroups ─────────────────────────────────────────────────────

test('findAllGroups: bağlı taşlar tek grup, ayrı taşlar ayrı grup olarak raporlanır', () => {
  const b = new BoardState(9);
  b.placeStone(3, 4, 'black');
  b.placeStone(4, 4, 'black'); // (3,4)'e bağlı — aynı grup
  b.placeStone(0, 0, 'white'); // izole — ayrı grup
  const groups = findAllGroups(b);
  equal(groups.length, 2);
  const blackGroup = groups.find(g => g.color === 'black');
  const whiteGroup = groups.find(g => g.color === 'white');
  equal(blackGroup.points.length, 2);
  equal(whiteGroup.points.length, 1);
});

test('findAllGroups: her grubun liberty listesi doğru', () => {
  const b = new BoardState(9);
  b.placeStone(4, 4, 'black'); // orta, 4 nefes
  const [group] = findAllGroups(b);
  equal(group.liberties.length, 4);
  equal(keys(group.liberties), '3,4|4,3|4,5|5,4');
});

// ── findAtariGroups: tek taş ────────────────────────────────────────────

test('findAtariGroups: tek taşın tam 1 nefesi kaldığında atari olarak tespit edilir', () => {
  const b = new BoardState(9);
  // (4,4) beyaz, üç yönü siyahla çevrili — yalnız (4,5) boş
  b.placeStone(4, 4, 'white');
  b.placeStone(3, 4, 'black');
  b.placeStone(4, 3, 'black');
  b.placeStone(5, 4, 'black');
  const atari = findAtariGroups(b);
  equal(atari.length, 1);
  equal(atari[0].color, 'white');
  equal(atari[0].points.length, 1);
  equal(keys(atari[0].liberties), '4,5');
});

test('findAtariGroups: 2+ nefesi olan taş atari sayılmaz', () => {
  const b = new BoardState(9);
  b.placeStone(4, 4, 'white');
  b.placeStone(3, 4, 'black'); // yalnız 1 komşu kapalı → 3 nefes kaldı
  equal(findAtariGroups(b).length, 0);
});

test('findAtariGroups: köşe taşı 1 nefeste doğru tespit edilir', () => {
  const b = new BoardState(9);
  b.placeStone(0, 0, 'white');
  b.placeStone(1, 0, 'black'); // köşenin 2 nefesinden biri kapandı, 1 kaldı
  const atari = findAtariGroups(b);
  equal(atari.length, 1);
  equal(keys(atari[0].liberties), '0,1');
});

// ── findAtariGroups: bağlı grup ──────────────────────────────────────────

test('findAtariGroups: bağlı 2 taşlı grubun ortak tek nefesi kaldığında grup olarak atari', () => {
  const b = new BoardState(9);
  // (4,4)-(4,5) beyaz grup; siyahlar çevreliyor, yalnız (4,6) boş
  b.placeStone(4, 4, 'white');
  b.placeStone(4, 5, 'white');
  b.placeStone(3, 4, 'black');
  b.placeStone(5, 4, 'black');
  b.placeStone(4, 3, 'black');
  b.placeStone(3, 5, 'black');
  b.placeStone(5, 5, 'black');
  const atari = findAtariGroups(b);
  equal(atari.length, 1);
  equal(atari[0].points.length, 2, 'grubun her iki taşı da hedef içinde');
  equal(keys(atari[0].liberties), '4,6');
});

test('findAtariGroups: grubun 2 ayrı boş komşusu varsa atari değildir', () => {
  const b = new BoardState(9);
  b.placeStone(4, 4, 'white');
  b.placeStone(4, 5, 'white');
  b.placeStone(3, 4, 'black');
  b.placeStone(5, 4, 'black');
  // (4,3), (3,5), (5,5), (4,6) hepsi boş bırakıldı — grup atari'de değil
  equal(findAtariGroups(b).length, 0);
});

test('findAtariGroups: birden fazla ayrı atari grubu varsa hepsi raporlanır', () => {
  const b = new BoardState(9);
  // Sol-üst köşe: beyaz (0,0), tek nefesi (0,1) kaldı
  b.placeStone(0, 0, 'white');
  b.placeStone(1, 0, 'black');
  // Sağ-üst köşe: beyaz (8,0), tek nefesi (8,1) kaldı — tamamen ayrı grup
  b.placeStone(8, 0, 'white');
  b.placeStone(7, 0, 'black');
  const atari = findAtariGroups(b);
  equal(atari.length, 2);
  const libSets = atari.map(g => keys(g.liberties)).sort();
  equal(libSets.join('|'), '0,1|8,1');
});

// ── isPointInAtari ────────────────────────────────────────────────────

test('isPointInAtari: atari\'deki taşın herhangi bir noktasında true', () => {
  const b = new BoardState(9);
  b.placeStone(4, 4, 'white');
  b.placeStone(3, 4, 'black');
  b.placeStone(4, 3, 'black');
  b.placeStone(5, 4, 'black');
  equal(isPointInAtari(b, 4, 4), true);
});

test('isPointInAtari: boş noktada / atari olmayan taşta false', () => {
  const b = new BoardState(9);
  b.placeStone(4, 4, 'white');
  equal(isPointInAtari(b, 4, 4), false, 'tek başına 4 nefesli taş atari değil');
  equal(isPointInAtari(b, 0, 0), false, 'boş nokta taş taşımıyor');
});

console.log(`\nToplam: ${passed + failed}  ✓ ${passed}  ✗ ${failed}`);
if (failed) process.exit(1);
