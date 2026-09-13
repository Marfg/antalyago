# Snapback — dört adımlı ders

9×9 tahta. İlk iki müfredat formasyonu korunur. Üç hamleyi de öğrenci oynar. Tek terim butonu Snapback açıklamasını açar.

| Adım | Kazanım | Kaynak |
|---|---|---|
| 1. Bir taşı ver, üç taşı al | Kurban, alma, geri alma | Mevcut ilk formasyon |
| 2. Kenarda aynı fikri oku | Kenarın nefeslere etkisi | Mevcut ikinci formasyon |
| 3. Bu kez beyazla geri al | Aynı tekniği beyazla uygulama | How to Play Go, PDF s.43, 7-25–27; renkler değiştirildi |
| 4. Kenardaki zinciri çöz | Beş taşlık zinciri kurbanı alan taşla birlikte geri alma | How to Play Go, PDF s.43, 7-29; gerçek kenar korunarak 9×9 tahtaya uyarlandı |

Dördüncü örnekte çevreleyen (7,3) beyaz taşı yalnız bir nefesle kalıyordu. (6,3) noktasındaki beyaz bağlantı taşı geri eklendi. Çevreleyen beyaz grupların her ara konumda en az üç nefesi olduğu, kurbanın alınmasından sonra hedef siyah grubun tek nefesle kaldığı ve son hamlenin altı siyah taşı yakaladığı doğrulandı. Kurbanı alan taş eklendiği için başlangıçtaki beş taşlık hedef zincirin geri alım sayısı altıdır.

## İncelenen kaynaklar

- How to Play Go, PDF s.43, §7.7: diagramlar görsel olarak incelendi; 7-25–27 ve 7-29 kullanıldı.
- A Go Guide by a Beginner — Colour, PDF s.161–162: çevrelenme ve nefes eksiltme ilkesi.
- [Nihon Igo Renmei — Uttegaeshi](https://www.ntkr.co.jp/igoyogo/yogo_138.html)
- [British Go Journal 163 — The Snapback](https://www.britgo.org/files/bgj/bgj163.pdf)

## Doğrulama

Dört formasyon RuleEngine ile denetlendi: 0 → 1 → 3 / 3 / 3 / 6 taş alımı. Çevreleyen beyaz gruplar bütün ara konumlarda ayrıca denetlendi. İmleç sıradaki hamlenin rengiyle eşleşir; geri dönülen adımlar tekrar oynanabilir.
