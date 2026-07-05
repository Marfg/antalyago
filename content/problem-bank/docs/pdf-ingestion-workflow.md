# PDF Ingestion Workflow

Bu akış, gelecekte PDF ve SGF kaynaklarından güvenli problem üretimi için hazırlanmıştır.

## Adımlar

1. Kaynak kaydı
   - PDF / SGF / web / studio kaynağı ayrı kayda alınır.
2. PDF sayfa / problem tespiti
   - insan ve araç birlikte sayfa bazlı problem adaylarını işaretler.
3. Ham çıkarım
   - metin, koordinat ve görsel ipuçları ayrıştırılır.
4. İnsan doğrulaması
   - problem kimliği, board, prompt ve çözüm kontrol edilir.
5. Tahta formasyonu kurulumu
   - koordinatlar canonical board state'e çevrilir.
6. Beceri / müfredat eşleme
   - controlled vocabulary üzerinden chapter/lesson/skill atanır.
7. Çözüm doğrulaması
   - yasal hamleler, pass biçimi, capture ve tree erişilebilirliği kontrol edilir.
8. Draft problem oluşturma
   - kaynak izi korunarak draft JSON yazılır.
9. Editoryal inceleme
   - çözüm, feedback ve telif uygunluğu kontrol edilir.
10. Yayın onayı
   - yalnız onaylanan kayıtlar `published` olur.

## Otorite modeli

- JSON problem bankası yayın ve çalışma verisinin kaynağıdır.
- Obsidian notları keşif, not alma ve editoryal takip içindir.
- Kontrolsüz çift yönlü senkronizasyon yapılmaz.

## Güvenlik ilkeleri

- Ham çıkarımdan doğrudan yayın yapılmaz.
- İnsan doğrulaması olmadan yayınlanmış kayıt üretilmez.
- Kaynak hash olmadan değişiklik izlenemez kabul edilir.

## Kapanış

Bu fazda PDF toplu ayrıştırma yapılmaz; yalnız güvenli ingestion sözleşmesi tanımlanır.