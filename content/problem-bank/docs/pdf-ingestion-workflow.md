# PDF Ingestion Workflow

Bu akış, PDF kaynaklarından güvenli problem adayı üretmek ve bunları insan onayıyla canonical havuza aktarmak için kullanılır.

## Temel ilke

- PDF dosyaları repoya kopyalanmaz.
- Mutlak yerel yol canonical JSON içine yazılmaz.
- Lisans / izin bilgisi doğrulanmadan yayın yapılmaz.
- İnsan onayı olmadan aday doğrudan canonical problem JSON'una dönüşmez.

## Adımlar

1. Kaynak kaydı
   - Kaynak katalogundaki `sourceId` ile kaynak kimliği belirlenir.
2. PDF sayfa seçimi
   - Aday için ilgili PDF sayfası veya basılı sayfa seçilir.
3. Görsel / tahta tespiti
   - Tahta, taşlar, işaretler ve soru kökü ayrışır.
4. Aday üretimi
   - Çıkarım `content/problem-bank/candidates/items/` altında aday olarak tutulur.
5. Hak / lisans kontrolü
   - Rights snapshot kaynaktan kopyalanır; `canPublish` varsayılan olarak `false` kalır.
6. Müfredat eşlemesi
   - Bölüm, ders ve beceri kontrollü sözlüklerle eşleştirilir.
7. Studio'da açma
   - Aday, AG-STUDIO için güvenli preview formatıyla açılabilir.
8. İnsan onayı
   - Aday gözden geçirilir, gerekirse reddedilir.
9. Canonical promotion
   - Yalnızca `promoted` ve onaylı adaylar canonical problem bankasına aktarılır.
10. Audit ve raporlama
   - Aday hattı, kaynak kataloğu ve canonical problem bankası ayrı denetlenir.

## Otorite modeli

- `content/problem-bank/problems/` — canonical problem verisi.
- `content/problem-bank/candidates/` — aday ve preview hattı.
- `content/problem-bank/sources/catalog.json` — kaynak ve rights otoritesi.
- Obsidian notları — araştırma ve editoryal takip.

## Promotion güvenliği

- `extracted` ve `needs-review` adaylar canonical klasöre yazılamaz.
- `rejected` adaylar promotion için uygun değildir.
- `promoted` adaylar bile insan onayı ve doğrulama geçmeden yazılmaz.
- Dry-run, yazma planı üretir; dosya değiştirmez.

## Kapanış

Bu fazda PDF toplu ayrıştırma yapılmaz; yalnızca aday hattı ve güvenli promotion sözleşmesi tanımlanır.
