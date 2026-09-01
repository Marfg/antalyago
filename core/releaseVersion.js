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
 *
 * v6 (2026-08-29.1) — Sahne #8 ("Yasak Hamleler") ve TEK yeni yardımcı
 * modülü (scenes/illegalMovePolicy.js) eklendi (bkz. scripts/
 * stamp-scene-release.mjs GRAPH_BASENAMES).
 * v7 (2026-09-01.1) — Sahne #8'in iki gerçek eksikliği düzeltildi (bkz.
 * görev talimatı): (1) "Yasak noktaları göster" ipucu marker'ı — kök neden
 * gerçek piksel örneklemesiyle "teknik olarak çiziliyor ama görünmeyecek
 * kadar zayıf" olarak KANITLANDI, `drawLibertyMark` İLE AYNI çapraz+nokta+
 * glow tekniği (farklı renk) kullanan bir tasarıma geçildi (bkz. adapters/
 * sceneBoardAdapter.js drawIllegalHint v0.20); (2) An 2'nin (`legal_capture`)
 * curriculum'un GERÇEK İKİ formasyon örneğinden yalnız İLKİNİ (üst) gösterip
 * ikinciyi (alt) SESSİZCE ATLAMASI — artık `legalCaptureExamples[]`
 * (bkz. scenes/illegalMovePolicy.js) HER GERÇEK örneği taşıyor, kullanıcı
 * ikisini de ayrı taze seed'lerle deneyimliyor. Kullanıcıya görünür davranış
 * değişikliği (yeni ipucu marker tasarımı + ikinci formasyonun eklenmesi).
 */
export const SCENE_RELEASE = '2026-09-01.1';
