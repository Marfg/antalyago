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

test('yalnızca say/give_hint action\'larına izin veren çıktı formatı belirtilmiş', () => {
  ok(TEACHER_SYSTEM_PROMPT.includes('"say"'));
  ok(TEACHER_SYSTEM_PROMPT.includes('"give_hint"'));
});

test('effect üretmeme / board değiştirmeme kuralı açık', () => {
  ok(TEACHER_SYSTEM_PROMPT.toLowerCase().includes('effect üretme'));
});

console.log(`\nToplam: ${passed + failed}  ✓ ${passed}  ✗ ${failed}`);
if (failed) process.exit(1);
