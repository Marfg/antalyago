/**
 * tests/sceneRelease.test.js
 * node tests/sceneRelease.test.js
 *
 * Sahne graph'ının statik ESM sürümleme şemasını (bkz. core/releaseVersion.js,
 * scene-release.json, scripts/stamp-scene-release.mjs) DOM'suz/ağsız olarak
 * denetler. Kök neden: GitHub Pages önündeki CDN .js dosyalarına saatlerce
 * (max-age=14400) önbellekleme izni veriyor — bir kullanıcının tarayıcısı
 * yeni bir deploy'dan SONRA bile eski sahne modüllerini sunmaya devam
 * edebiliyordu (bkz. görev talimatı). Bu test, gelecekteki her release'te
 * versiyonlamanın YARIM kalmadığını (yalnız üst seviye import değil, TÜM
 * transitive local import'ların) mekanik olarak kanıtlar.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓', name); pass++; }
  catch (e) { console.error('  ✗', name, '-', e.message); fail++; }
}

const releaseSrc = read('core/releaseVersion.js');
const RELEASE = releaseSrc.match(/SCENE_RELEASE\s*=\s*['"]([^'"]+)['"]/)?.[1];

const GRAPH_BASENAMES = [
  'sceneRuntime.js', 'eventLog.js', 'curriculum.js', 'boardState.js', 'ruleEngine.js',
  'sceneRegistry.js', 'scene01BoardIntro.js', 'scene02TurnsAndIntersections.js',
  'scene03LibertiesByPosition.js', 'scene04GroupLiberties.js', 'groupLibertyPolicy.js',
  'turnPolicy.js', 'boardZones.js', 'topicEndControls.js', 'sceneTransition.js',
  'sceneBoardAdapter.js', 'sceneProgressAdapter.js',
  // v2 düzeltmesi: bekçinin kendi sabiti de artık versioned graph'ın
  // parçası — BARE import edilirse "o an çalışanı yansıtır" iddiası
  // geçersiz kalır (bkz. görev talimatı, core/releaseVersion.js dosya
  // başı notu).
  'releaseVersion.js',
  // v3 (2026-08-23.3) — Sahne #5 ve iki yeni yardımcı modülü.
  'scene05LibertyAssessment.js', 'libertyAssessmentPolicy.js', 'assessmentTransition.js',
  // v4 (2026-08-25.1) — Sahne #6 ve bir yeni yardımcı modülü.
  'scene06CaptureBasics.js', 'capturePolicy.js',
  // v5 (2026-08-25.2) — Sahne #7 ve bir yeni yardımcı modülü.
  'scene07CapturePractice.js', 'capturePracticePolicy.js',
];
const SCAN_FILES = [
  'learning-scenes.html', 'teacher-studio.html',
  'core/ruleEngine.js',
  'scenes/scene01BoardIntro.js', 'scenes/scene02TurnsAndIntersections.js',
  'scenes/scene03LibertiesByPosition.js', 'scenes/scene04GroupLiberties.js',
  'scenes/topicEndControls.js', 'scenes/groupLibertyPolicy.js',
  'adapters/sceneBoardAdapter.js',
  'scenes/scene05LibertyAssessment.js', 'scenes/libertyAssessmentPolicy.js',
  'scenes/scene06CaptureBasics.js', 'scenes/capturePolicy.js',
  'scenes/scene07CapturePractice.js', 'scenes/capturePracticePolicy.js',
];
// Studio'nun kapsam DIŞI (AI asistan / içerik kütüphanesi) import'ları —
// bunlar KASITLI olarak versiyonSUZ kalmalı (bkz. stamp script dosya başı
// notu, görev talimatı Bölüm 2).
const OUT_OF_SCOPE_BASENAMES_IN_STUDIO = [
  'learningContext.js', 'conceptMap.js', 'studentModel.js', 'contentStore.js',
  'contentValidation.js', 'contentOverrides.js', 'teacherContentOverrides.js',
  'contentRetriever.js', 'teacherAssistant.js',
];

const importLineRe = /from\s+['"](\.[\w./-]+\.js)(\?[^'"]*)?['"]/g;

function collectImports(rel) {
  const src = read(rel);
  const found = [];
  let m;
  while ((m = importLineRe.exec(src))) found.push({ specPath: m[1], query: m[2] || null });
  return found;
}

test('core/releaseVersion.js geçerli bir SCENE_RELEASE string dışa aktarıyor', () => {
  assert.ok(RELEASE && RELEASE.length > 0, `SCENE_RELEASE bulunamadı veya boş: ${RELEASE}`);
});

test('scene-release.json release alanı core/releaseVersion.js ile AYNI', () => {
  const manifest = JSON.parse(read('scene-release.json'));
  assert.equal(manifest.release, RELEASE);
});

test('KRİTİK REGRESYON: core/releaseVersion.js ARTIK BARE import EDİLMİYOR — kendisi de versioned graph\'ın parçası', () => {
  for (const entry of ['learning-scenes.html', 'teacher-studio.html']) {
    const src = read(entry);
    assert.ok(!/from\s+['"]\.\/core\/releaseVersion\.js['"]/.test(src), `${entry}: releaseVersion.js BARE import edilmemeli (v1 regresyonu — bekçi kendi kendini geçersiz kılardı)`);
    assert.ok(new RegExp(`from\\s+['"]\\./core/releaseVersion\\.js\\?v=${RELEASE.replace(/\./g, '\\.')}['"]`).test(src), `${entry}: releaseVersion.js GÜNCEL release ile versioned import edilmeli`);
  }
});

for (const rel of SCAN_FILES) {
  test(`${rel}: sahne-graph'ına işaret eden HER local import ?v=${RELEASE} taşıyor (transitive dahil, yarım sürümleme YOK)`, () => {
    const imports = collectImports(rel);
    const graphImports = imports.filter(i => GRAPH_BASENAMES.includes(i.specPath.split('/').pop()));
    assert.ok(graphImports.length > 0, `${rel}: beklenen sahne-graph import'ları bulunamadı (ön koşul başarısız)`);
    for (const imp of graphImports) {
      assert.equal(imp.query, `?v=${RELEASE}`, `${rel}: '${imp.specPath}' import'u güncel release'i taşımıyor (bulunan query: ${imp.query})`);
    }
  });
}

test('teacher-studio.html: kapsam DIŞI AI-asistan/içerik importları KASITLI olarak versiyonSUZ (aşırı-versiyonlama YOK)', () => {
  const imports = collectImports('teacher-studio.html');
  const outOfScope = imports.filter(i => OUT_OF_SCOPE_BASENAMES_IN_STUDIO.includes(i.specPath.split('/').pop()));
  assert.ok(outOfScope.length > 0, 'ön koşul: kapsam dışı import listesi beklenenden boş çıktı');
  for (const imp of outOfScope) {
    assert.equal(imp.query, null, `${imp.specPath}: bu import kasıtlı olarak versiyonSUZ kalmalıydı, bulunan query: ${imp.query}`);
  }
});

test('KAÇIŞ YOK: her SCAN_FILES dosyasındaki HER local .js import ya graph (versioned) ya da açık allowlist\'te (versionsuz) — üçüncü bir olasılık YOK (bkz. görev talimatı: "geniş regex ile yanlışlıkla kapsam dışı bırakma")', () => {
  for (const rel of SCAN_FILES) {
    const imports = collectImports(rel);
    assert.ok(imports.length > 0, `${rel}: ön koşul, en az bir local import bulunmalı`);
    for (const imp of imports) {
      const base = imp.specPath.split('/').pop();
      const inGraph = GRAPH_BASENAMES.includes(base);
      const inAllowlist = rel === 'teacher-studio.html' && OUT_OF_SCOPE_BASENAMES_IN_STUDIO.includes(base);
      assert.ok(inGraph || inAllowlist, `${rel}: '${imp.specPath}' ne GRAPH_BASENAMES'te ne de açık allowlist'te — sınıflandırılmamış KAÇAK import (denetim dışı kalmış olabilir)`);
      if (inGraph) {
        assert.equal(imp.query, `?v=${RELEASE}`, `${rel}: graph import'u '${imp.specPath}' güncel release'i taşımıyor, bulunan: ${imp.query}`);
      } else {
        assert.equal(imp.query, null, `${rel}: allowlist'teki '${imp.specPath}' KASITLI versiyonsuz kalmalıydı, bulunan query: ${imp.query}`);
      }
    }
  }
});

test('learning-scenes.html ve teacher-studio.html FARKLI reload-guard sessionStorage anahtarları kullanıyor (bkz. görev talimatı: "sayfaya özel guard anahtarları birbirini yanlışlıkla engellememeli")', () => {
  const learningGuard = read('learning-scenes.html').match(/RELOAD_GUARD_KEY\s*=\s*'([^']+)'/)?.[1];
  const studioGuard = read('teacher-studio.html').match(/RELOAD_GUARD_KEY\s*=\s*'([^']+)'/)?.[1];
  assert.ok(learningGuard, 'learning-scenes.html: guard anahtarı bulunamadı');
  assert.ok(studioGuard, 'teacher-studio.html: guard anahtarı bulunamadı');
  assert.notEqual(learningGuard, studioGuard, `guard anahtarları AYNI olmamalı: learning=${learningGuard} studio=${studioGuard}`);
});

test('reload yönlendirme query parametresi "?release=" kullanıyor (learning-scenes.html ve teacher-studio.html)', () => {
  for (const entry of ['learning-scenes.html', 'teacher-studio.html']) {
    const src = read(entry);
    assert.ok(/searchParams\.set\('release',/.test(src), `${entry}: '?release=' query parametresi kullanılmalı`);
  }
});

test('scenes/scene04GroupLiberties.js: exported version >= 4 (bu release için bump edildi)', () => {
  const src = read('scenes/scene04GroupLiberties.js');
  const idIdx = src.indexOf(`id: 'scene-04-group-liberties'`);
  assert.ok(idIdx >= 0, 'exported scene objesi bulunamadı');
  const m = src.slice(idIdx).match(/version:\s*(\d+)/);
  assert.ok(m, 'exported obje içinde version alanı bulunamadı');
  assert.ok(Number(m[1]) >= 4, `version >= 4 olmalı, bulunan: ${m[1]}`);
});

test('scenes/scene05LibertyAssessment.js: exported version >= 1, sahne release token\'ından BAĞIMSIZ (bkz. görev talimatı: "Scene version bağımsız olarak 1 başlayabilir")', () => {
  const src = read('scenes/scene05LibertyAssessment.js');
  const idIdx = src.indexOf(`id: 'scene-05-liberty-assessment'`);
  assert.ok(idIdx >= 0, 'exported scene objesi bulunamadı');
  const m = src.slice(idIdx).match(/version:\s*(\d+)/);
  assert.ok(m, 'exported obje içinde version alanı bulunamadı');
  assert.ok(Number(m[1]) >= 1, `version >= 1 olmalı, bulunan: ${m[1]}`);
});

test('RELEASE token "2026-08-26.2" — eski "2026-08-23.2/.3", "2026-08-24.1", "2026-08-25.1", "2026-08-25.2" ve "2026-08-26.1" query\'leri AKTİF graph\'ta KALMAMIŞ', () => {
  assert.equal(RELEASE, '2026-08-26.2');
  for (const rel of SCAN_FILES) {
    const src = read(rel);
    assert.ok(!src.includes('?v=2026-08-23.2'), `${rel}: eski (2026-08-23.2) release query'si HÂLÂ mevcut`);
    assert.ok(!src.includes('?v=2026-08-23.3'), `${rel}: eski (2026-08-23.3) release query'si HÂLÂ mevcut`);
    assert.ok(!src.includes('?v=2026-08-24.1'), `${rel}: eski (2026-08-24.1) release query'si HÂLÂ mevcut`);
    assert.ok(!src.includes('?v=2026-08-25.1'), `${rel}: eski (2026-08-25.1) release query'si HÂLÂ mevcut`);
    assert.ok(!src.includes('?v=2026-08-25.2'), `${rel}: eski (2026-08-25.2) release query'si HÂLÂ mevcut`);
    assert.ok(!src.includes('?v=2026-08-26.1'), `${rel}: eski (2026-08-26.1, production'da idi) release query'si HÂLÂ mevcut`);
  }
});

test('scenes/scene06CaptureBasics.js: exported version >= 1', () => {
  const src = read('scenes/scene06CaptureBasics.js');
  const idIdx = src.indexOf(`id: 'scene-06-capture-basics'`);
  assert.ok(idIdx >= 0, 'exported scene objesi bulunamadı');
  const m = src.slice(idIdx).match(/version:\s*(\d+)/);
  assert.ok(m, 'exported obje içinde version alanı bulunamadı');
  assert.ok(Number(m[1]) >= 1, `version >= 1 olmalı, bulunan: ${m[1]}`);
});

test('scenes/scene07CapturePractice.js: exported version >= 1', () => {
  const src = read('scenes/scene07CapturePractice.js');
  const idIdx = src.indexOf(`id: 'scene-07-capture-practice'`);
  assert.ok(idIdx >= 0, 'exported scene objesi bulunamadı');
  const m = src.slice(idIdx).match(/version:\s*(\d+)/);
  assert.ok(m, 'exported obje içinde version alanı bulunamadı');
  assert.ok(Number(m[1]) >= 1, `version >= 1 olmalı, bulunan: ${m[1]}`);
});

test('scripts/stamp-scene-release.mjs idempotent: script tekrar çalıştırılınca dosyalarda DEĞİŞİKLİK üretmiyor (zaten güncel)', () => {
  const before = SCAN_FILES.map(read);
  execSync('node scripts/stamp-scene-release.mjs', { cwd: ROOT });
  const after = SCAN_FILES.map(read);
  before.forEach((content, i) => {
    assert.equal(after[i], content, `${SCAN_FILES[i]}: stamp script'in tekrar çalıştırılması dosyayı DEĞİŞTİRDİ (idempotent olmalı)`);
  });
});

console.log(`\nToplam: ${pass + fail}  ✓ ${pass}  ✗ ${fail}`);
if (fail) process.exit(1);
