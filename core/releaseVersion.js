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
 *
 * v8 (2026-09-02.1) — Sahne #9 ("Ko Kuralı") ve TEK yeni yardımcı modülü
 * (scenes/koRulePolicy.js) eklendi (bkz. scripts/stamp-scene-release.mjs
 * GRAPH_BASENAMES). adapters/sceneBoardAdapter.js'e izole bir ekleme
 * (showKoFree/clearKoFree, v0.20) yapıldı — dosya zaten graph'ın parçası,
 * yeni bir graph girişi GEREKMEDİ. PR #1'in main'in güncel Sahne #8
 * sürümüyle (v7, 2026-09-01.1) birleştirilmesinin ardından damgalandı;
 * eski "2026-08-31.1" (dallanma anındaki taslak sürüm) hiçbir dosyada
 * kalmadı (bkz. tests/sceneRelease.test.js).
 *
 * v9 (2026-09-02.2) — Sahne #10 ("Oyun Sonu ve Sayım") ve TEK yeni yardımcı
 * modülü (scenes/endgameCountingPolicy.js) eklendi (bkz. scripts/
 * stamp-scene-release.mjs GRAPH_BASENAMES). adapters/sceneBoardAdapter.js'e
 * izole bir ekleme (showRegionMarks/clearRegionMarks/getRegionMarks, v0.21)
 * yapıldı — dosya zaten graph'ın parçası, yeni bir graph girişi GEREKMEDİ.
 * AYRICA `core/curriculum.js`'in `l6.steps[0].fb.t` metnindeki ters siyah/
 * beyaz tarifi düzeltildi (kullanıcıya görünür içerik değişikliği).
 *
 * v10 (2026-09-02.3) — `origin/main`'e ayrı birleştirilen "İki Göz"
 * düzeltmesi (PR #2, `fix/two-eyes-curriculum`) bu dala GERÇEK bir 3-way
 * git merge ile taşındı: `core/curriculum.js`'in `l7` ("Canlı Gruplar (İki
 * Göz)") bölümü SEKİZ adıma ve 19×19 BEŞ canlı grup örneğine düzeltildi,
 * YENİ `core/eyeAnalysis.js` eklendi (bkz. tests/twoEyesCurriculum.test.js —
 * bu modül şu an YALNIZ bu test dosyasından ve `ogren-3d.html`'in kendi
 * çalışma-zamanı curriculum yorumlayıcısından kullanılıyor, versioned sahne
 * graph'ının BİR PARÇASI DEĞİL — `learning-scenes.html`/`teacher-studio.html`
 * hiçbir yerde import ETMİYOR, bu yüzden GRAPH_BASENAMES/SCAN_FILES'a
 * EKLENMEDİ, bkz. görev talimatı: "kapsam kasıtlı dar"). Sahne #10'un
 * kendi l6 düzeltmesiyle ÇAKIŞMADI — merge `core/curriculum.js` içinde
 * TEK dosyada iki AYRI ders bölümünü (l6/l7) otomatik/temiz birleştirdi,
 * çakışma işareti KALMADI.
 */
export const SCENE_RELEASE = '2026-09-20.capture-native1';
