/**
 * core/releaseVersion.js
 *
 * Sahne/curriculum ESM graph'ının TEK sürüm kaynağı.
 *
 * v2 DÜZELTMESİ (bkz. görev talimatı): bu dosya artık BARE (versiyonsuz)
 * import EDİLMEMELİDİR. İlk sürümde learning-scenes.html/teacher-studio.html
 * bu dosyayı versiyonsuz bir URL'den import ediyordu — "o an tarayıcıda
 * ÇALIŞAN kodun gerçek sürümünü yansıtır" iddiası GEÇERSİZDİ, çünkü bare
 * URL'nin kendisi de GitHub Pages önündeki CDN'in .js dosyalarına verdiği
 * saatlerce süren Cache-Control (bkz. görev talimatı ölçümü) yüzünden eski
 * bir tarayıcı cache'inden gelebilirdi — bu da çözülmeye çalışılan sorunun
 * TA KENDİSİYDİ.
 *
 * Artık bu dosya da versioned graph'ın parçası: HTML'lerdeki import satırı
 * `./core/releaseVersion.js?v=<RELEASE>` biçiminde damgalanır (bkz.
 * scripts/stamp-scene-release.mjs GRAPH_BASENAMES listesi). Bu sayede
 * SCENE_RELEASE, o an yüklü HTML'in KENDİ import metnine gömülü query
 * string'i üzerinden gelir — yani HER ZAMAN "bu belirli HTML+JS paketinin
 * GERÇEKTEN hangi release olduğunu" deterministik yansıtır (bare URL'nin
 * aksine, hangi HTML'in yüklediğinden bağımsız olarak rastgele eski/yeni
 * bir değer dönme riski YOKTUR).
 *
 * Yeni bir release'te:
 *   1) Bu sabiti güncelle,
 *   2) scene-release.json'daki "release" alanını AYNI değere getir,
 *   3) node scripts/stamp-scene-release.mjs çalıştır (scene graph'taki
 *      TÜM transitive import URL'lerine — bu dosyanın kendi importu
 *      DAHİL — ?v=<RELEASE> damgalar).
 */
export const SCENE_RELEASE = '2026-08-23.2';
