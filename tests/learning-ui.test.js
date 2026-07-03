import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync('ogren-3d.html', 'utf8');
const css = fs.readFileSync('styles/learning-ui.css', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('  ✓', name);
  } catch (error) {
    failed += 1;
    console.error('  ✗', name, '-', error.message);
  }
}

const includesAll = needles => needles.every(needle => html.includes(needle));
const mojibakePatterns = [/Ã/, /Ä/, /Å/, /Â/, /Æ/, /Ç/, /\?pucu g\?ster/, /Tekrar ho\? geldin/];

test('öğrenme kabuğu ve modal sözleşmesi bağlı', () => {
  assert(html.includes('styles/learning-ui.css'), 'öğrenme UI CSS eksik');
  assert(html.includes('class="app-shell-theme learning-ui"'), 'learning-ui body class eksik');
  assert(html.includes('lesson-stage') && html.includes('updateLearningChrome(ls);'), 'lesson-stage kurgusu eksik');
  assert(html.includes('lesson-summary'), 'lesson-summary eksik');
  assert(html.includes('lesson-tip-toggle'), 'lesson-tip-toggle eksik');
  assert(html.includes('lesson-tip'), 'lesson-tip eksik');
  assert(html.includes('<span id="lp-header-title">Ders</span>'), 'panel ba?l??? sade de?il');
  assert(html.includes('Tahtaya dön') && html.includes('Dersi genişlet') && html.includes('Göster'), 'panel düğmesi metinleri eksik');
  assert(html.includes('role="complementary"'), 'lesson panel landmark eksik');
  assert(html.includes('aria-live="polite"'), 'feedback aria-live eksik');
  assert(includesAll(['Sana nasıl hitap edelim?', 'Bu cihazda hatırla', 'Rumuz vermeden devam et', 'İlk kez oynuyorum']), 'sadeleştirilmiş modal metni eksik');
  assert(html.includes('updateLearningChrome(ls);'), 'öğrenme chrome güncellemesi eksik');
  assert(html.includes('pm-remember'), 'remember checkbox eksik');
  assert(html.includes('pm-skip'), 'skip button eksik');
  assert(!html.includes('setTimeout(() => showWelcomeToast('), 'kar??lama toast ?a?r?s? h?l? ba?l?');
  assert(html.includes('background:var(--primary);'), 'profil birincil d??mesi mor de?il');
  assert(html.includes('background:var(--primary-hover);'), 'profil hover rengi eksik');
  assert(html.includes('background:var(--primary-active);'), 'profil active rengi eksik');
  assert(html.includes('outline:2px solid var(--focus-ring);'), 'profil focus-visible yok');
  assert(html.includes('accent-color:var(--primary);'), 'profil checkbox/radio accent-primary de?il');
});

test('öğrenme UI stil katmanı gerekli editoryal parçaları içerir', () => {
  for (const needle of [
    '.lesson-stage',
    '.lesson-progress',
    '#lesson-summary',
    '#lesson-tip-toggle',
    '#lesson-tip',
    '#lesson-panel',
    '#nav-bar',
    '@media (prefers-reduced-motion: reduce)'
  ]) {
    assert(css.includes(needle), needle + ' CSS içinde yok');
  }
});

test('package zinciri öğrenme UI testini çalıştırıyor', () => {
  assert.equal(pkg.scripts['test-learning-ui'], 'node tests/learning-ui.test.js && node tests/verify-learning-ui.mjs');
  assert(pkg.scripts['test-all'].includes('npm run test-learning-ui'), 'test-all içine test-learning-ui eklenmemiş');
});

test('başlangıç profili boş rumuza izin veriyor', () => {
  assert(html.includes("renderNickname(profile.nickname || 'Misafir')"), 'Misafir fallback yok');
  assert(html.includes("renderNickname(_pmProfile.nickname || 'Misafir')"), 'başlangıç fallback yok');
  assert(!mojibakePatterns.some(pattern => pattern.test(html)), 'HTML i?inde mojibake bulundu');
});

console.log('\nÖğrenme UI statik testleri: ' + passed + '/' + (passed + failed));
if (failed) process.exit(1);
