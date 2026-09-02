/**
 * scripts/stamp-scene-release.mjs
 * node scripts/stamp-scene-release.mjs
 *
 * core/releaseVersion.js'teki SCENE_RELEASE token'ını, sahne/curriculum
 * ESM graph'ı içindeki HER relative import specifier'ına ?v=<RELEASE>
 * olarak damgalar (idempotent — mevcut ?v=... varsa günceller, yoksa
 * ekler). Build sistemi olmayan statik GitHub Pages üzerinde, CDN'in
 * .js dosyalarına uyguladığı saatlerce süren Cache-Control (bkz. görev
 * talimatı) yüzünden, her yeni release ÖNCEDEN HİÇ görülmemiş URL'ler
 * kullanmalı — yalnızca üst seviye <script type="module"> import'larını
 * değil, TÜM transitive local import'ları da versiyonlamak GEREKİR;
 * aksi hâlde yarım sürümleme olur (bkz. görev talimatı Bölüm 2).
 *
 * Kapsam KASITLI olarak dar tutulur: yalnızca aşağıdaki GRAPH_BASENAMES
 * listesindeki (Sahne #1-4 + paylaşılan RuleEngine/curriculum) dosyalara
 * işaret eden import'lar damgalanır. teacher-studio.html'in AI-asistanı/
 * içerik kütüphanesi tarafındaki (learningContext, conceptMap,
 * studentModel, contentStore/Validation/Overrides, teacherAssistant,
 * teacherContentOverrides, contentRetriever vb.) import'ları bu görevin
 * kapsamı DIŞINDA — kasıtlı olarak DOKUNULMAZ.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const releaseSrc = fs.readFileSync(path.join(ROOT, 'core/releaseVersion.js'), 'utf8');
const releaseMatch = releaseSrc.match(/SCENE_RELEASE\s*=\s*['"]([^'"]+)['"]/);
if (!releaseMatch) throw new Error('core/releaseVersion.js içinde SCENE_RELEASE bulunamadı');
const RELEASE = releaseMatch[1];

const manifestPath = path.join(ROOT, 'scene-release.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (manifest.release !== RELEASE) {
  manifest.release = RELEASE;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`scene-release.json güncellendi -> ${RELEASE}`);
}

/** Sahne graph'ının parçası sayılan dosyaların BASENAME'leri — bkz. dosya
    başı notu (kapsam kasıtlı olarak dar). */
const GRAPH_BASENAMES = [
  'sceneRuntime.js', 'eventLog.js', 'curriculum.js', 'boardState.js', 'ruleEngine.js',
  'sceneRegistry.js', 'scene01BoardIntro.js', 'scene02TurnsAndIntersections.js',
  'scene03LibertiesByPosition.js', 'scene04GroupLiberties.js', 'groupLibertyPolicy.js',
  'turnPolicy.js', 'boardZones.js', 'topicEndControls.js', 'sceneTransition.js',
  'sceneBoardAdapter.js', 'sceneProgressAdapter.js',
  // KRİTİK DÜZELTME (bkz. görev talimatı): releaseVersion.js ARTIK BARE
  // import edilmiyor — bekçinin kendisi de versioned graph'ın bir
  // parçası, aksi hâlde "o an gerçekte ne çalıştığını yansıtır" iddiası
  // geçersiz kalırdı (bare URL kendisi de saatlerce eski cache'den
  // gelebilirdi — çözülmeye çalışılan sorunun ta kendisi).
  'releaseVersion.js',
  // v3 (2026-08-23.3) — Sahne #5 ve İKİ yeni yardımcı modülü.
  'scene05LibertyAssessment.js', 'libertyAssessmentPolicy.js', 'assessmentTransition.js',
  // v4 (2026-08-25.1) — Sahne #6 ("Taş Alma") ve TEK yeni yardımcı modülü.
  'scene06CaptureBasics.js', 'capturePolicy.js',
  // v5 (2026-08-25.2) — Sahne #7 ("Taş Alma Uygulamaları") ve TEK yeni
  // yardımcı modülü.
  'scene07CapturePractice.js', 'capturePracticePolicy.js',
  // v6 (2026-08-29.1) — Sahne #8 ("Yasak Hamleler") ve TEK yeni yardımcı
  // modülü.
  'scene08IllegalMoves.js', 'illegalMovePolicy.js',
  // v7 (2026-08-31.1) — Sahne #9 ("Ko Kuralı") ve TEK yeni yardımcı modülü.
  'scene09KoRule.js', 'koRulePolicy.js',
];

/** Import satırı içerebilecek, graph'a dahil dosyalar + HTML entry point'leri. */
const SCAN_FILES = [
  'learning-scenes.html',
  'teacher-studio.html',
  'core/ruleEngine.js',
  'scenes/scene01BoardIntro.js',
  'scenes/scene02TurnsAndIntersections.js',
  'scenes/scene03LibertiesByPosition.js',
  'scenes/scene04GroupLiberties.js',
  'scenes/topicEndControls.js',
  'scenes/groupLibertyPolicy.js',
  'adapters/sceneBoardAdapter.js',
  'scenes/scene05LibertyAssessment.js',
  'scenes/libertyAssessmentPolicy.js',
  'scenes/scene06CaptureBasics.js',
  'scenes/capturePolicy.js',
  'scenes/scene07CapturePractice.js',
  'scenes/capturePracticePolicy.js',
  'scenes/scene08IllegalMoves.js',
  'scenes/illegalMovePolicy.js',
  'scenes/scene09KoRule.js',
  'scenes/koRulePolicy.js',
];

const importLineRe = /(from\s+['"])(\.[\w./-]+\.js)(\?[^'"]*)?(['"])/g;

let totalGraphEdges = 0;
let filesActuallyWritten = 0;
for (const rel of SCAN_FILES) {
  const filePath = path.join(ROOT, rel);
  const original = fs.readFileSync(filePath, 'utf8');
  let edgesInFile = 0;
  const updated = original.replace(importLineRe, (full, pre, specPath, _oldQuery, post) => {
    const base = specPath.split('/').pop();
    if (!GRAPH_BASENAMES.includes(base)) return full; // kapsam dışı — DOKUNMA
    edgesInFile++;
    return `${pre}${specPath}?v=${RELEASE}${post}`;
  });
  totalGraphEdges += edgesInFile;
  // GERÇEK idempotency: içerik ZATEN güncelse dosyaya YAZMA (mtime'ı
  // gereksiz bump etme) — yalnız GERÇEKTEN değişince yaz+raporla (bkz.
  // görev talimatı: "arka arkaya iki çalıştırmada ikinci çalıştırma diff
  // üretmesin").
  if (updated !== original) {
    fs.writeFileSync(filePath, updated);
    filesActuallyWritten++;
    console.log(`stamped ${edgesInFile} import(s) in ${rel} (İÇERİK DEĞİŞTİ)`);
  } else if (edgesInFile > 0) {
    console.log(`${rel}: ${edgesInFile} graph import zaten güncel — DEĞİŞİKLİK YOK`);
  }
}

console.log(`\nRELEASE=${RELEASE}  toplam graph edge=${totalGraphEdges}  yazılan dosya=${filesActuallyWritten}`);
