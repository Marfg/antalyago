/**
 * tests/teacherSystemPrompt.test.js
 * node tests/teacherSystemPrompt.test.js
 *
 * core/teacherSystemPrompt.js — spesifikasyonun §7'de zorunlu tuttuğu
 * davranış kurallarının promptta gerçekten yer aldığını doğrulayan basit
 * bir regresyon güvenlik ağı (prompt metni yanlışlıkla kısaltılır/silinirse
 * yakalar).
 */

import { TEACHER_SYSTEM_PROMPT } from '../core/teacherSystemPrompt.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓', name); passed++; }
  catch (e) { console.error('  ✗', name, '-', e.message); failed++; }
}
function ok(value, message = 'assertion failed') { if (!value) throw new Error(message); }

test('"nefes noktası" terimini zorunlu kılar', () => {
  ok(TEACHER_SYSTEM_PROMPT.includes('nefes noktası'));
});

test('"özgürlük" terimini KULLANMA talimatı açıkça var', () => {
  ok(/özgürlük/i.test(TEACHER_SYSTEM_PROMPT), 'terimin yasaklandığını belirten cümle bulunmalı');
});

test('deterministik context\'i sorgulamama/yeniden hesaplamama kuralı var', () => {
  ok(TEACHER_SYSTEM_PROMPT.includes('SORGULAMA'));
  ok(TEACHER_SYSTEM_PROMPT.toLowerCase().includes('go kuralı hesaplama'));
});

test('kapsam dışı konulara (ko, göz, ölüm...) geçmeme talimatı var', () => {
  ok(TEACHER_SYSTEM_PROMPT.includes('ko'));
  ok(TEACHER_SYSTEM_PROMPT.includes('göz'));
});

test('yalnızca say/give_hint/show_liberties action\'larına izin veren çıktı formatı belirtilmiş', () => {
  ok(TEACHER_SYSTEM_PROMPT.includes('"say"'));
  ok(TEACHER_SYSTEM_PROMPT.includes('"give_hint"'));
  ok(TEACHER_SYSTEM_PROMPT.includes('"show_liberties"'));
});

test('effect üretmeme / board değiştirmeme kuralı açık', () => {
  ok(TEACHER_SYSTEM_PROMPT.toLowerCase().includes('effect üretme'));
});

// ── v0.4: show_liberties tool talimatları ────────────────────────────

test('show_liberties isterken koordinat/points/targets üretmeme talimatı açık', () => {
  ok(TEACHER_SYSTEM_PROMPT.includes('show_liberties'));
  ok(TEACHER_SYSTEM_PROMPT.includes('"points"'));
  ok(TEACHER_SYSTEM_PROMPT.includes('"targets"'));
});

test('kademeli yardım pedagojik sıralaması (attempt 1/2/3+) belirtilmiş', () => {
  ok(TEACHER_SYSTEM_PROMPT.includes('attempt 1'));
  ok(TEACHER_SYSTEM_PROMPT.includes('attempt 2'));
  ok(TEACHER_SYSTEM_PROMPT.includes('attempt 3'));
});

// ── v0.5: Student Model talimatları ──────────────────────────────────

test('Student Model\'in 4 status değeri açıklanmış', () => {
  ok(TEACHER_SYSTEM_PROMPT.includes('not_started'));
  ok(TEACHER_SYSTEM_PROMPT.includes('"learning"'));
  ok(TEACHER_SYSTEM_PROMPT.includes('"provisional"'));
  ok(TEACHER_SYSTEM_PROMPT.includes('"mastered"'));
});

test('Student Model\'i AI\'ın değiştiremeyeceği/yeniden sınıflandıramayacağı AÇIKÇA belirtilmiş', () => {
  ok(TEACHER_SYSTEM_PROMPT.includes('DEĞİŞTİREMEZSİN'));
  ok(/deterministik.{0,40}sistem çıktısı/i.test(TEACHER_SYSTEM_PROMPT));
});

// ── v0.6: RAG sınırları ───────────────────────────────────────────────

test('retrieval alanının anlamı (matched/query/items/fallbackLevel) açıklanmış', () => {
  ok(TEACHER_SYSTEM_PROMPT.includes('retrieval'));
  ok(TEACHER_SYSTEM_PROMPT.includes('fallbackLevel'));
});

test('retrieval içeriğinin board gerçeğini asla geçersiz kılmadığı AÇIKÇA belirtilmiş', () => {
  // NOT: .toLowerCase() Türkçe "İ" harfini beklenmeyen bir şekilde
  // (birleşik nokta işaretiyle) küçültür — bu yüzden burada büyük harfli
  // orijinal metinle doğrudan karşılaştırılıyor (mojibake testindeki
  // Türkçe-I gotcha'sının bir başka türü).
  ok(TEACHER_SYSTEM_PROMPT.includes('ASLA geçersiz kılmaz'));
  ok(TEACHER_SYSTEM_PROMPT.includes('board gerçeği DEĞİLDİR'));
});

test('retrieval ile boardObservation çelişirse boardObservation\'ın doğru olduğu belirtilmiş', () => {
  ok(/boardObservation.{0,60}her zaman doğrudur/i.test(TEACHER_SYSTEM_PROMPT.replace(/\n/g, ' ')));
});

test('retrieval metnini kelimesi kelimesine kopyalama zorunluluğu OLMADIĞI belirtilmiş', () => {
  ok(TEACHER_SYSTEM_PROMPT.includes('kelimesine kopyalamak ZORUNDA DEĞİLSİN'));
});

test('retrieval yoksa/eşleşmezse mevcut context ile devam etme talimatı var', () => {
  ok(TEACHER_SYSTEM_PROMPT.includes('matched') && TEACHER_SYSTEM_PROMPT.includes('false'));
});

console.log(`\nToplam: ${passed + failed}  ✓ ${passed}  ✗ ${failed}`);
if (failed) process.exit(1);
