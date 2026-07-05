# Schema Sürümleme ve Güvenli Migration

Problem Bank şu anda iki okunabilir sürümü birlikte destekler:

- `1.0.0` — legacy kabul sözleşmesi
- `1.1.0` — canonical editoryal sözleşme

## Sürüm kuralları

- `1.0.0` kayıtları migration olmadan okunabilir kalır.
- `1.1.0` kayıtları daha sıkı doğrulanır.
- Bilinmeyen gelecek sürümler reddedilir.
- Runtime, yalnızca yeni metadata gelmesi nedeniyle davranış değiştirmez.
- `status` alanı şu fazda filtreleme mantığı için kullanılmaz; veri sözleşmesi düzeyinde saklanır.

## 1.1.0 sözleşmesi

Yeni sürümde üç unsur netleşir:

- `revision`: aynı problemin editoryal revizyon numarası
- `status`: editorial durumun kanonik karşılığı
- provenance / source alanları: kaynak kimliği, sayfa, hash, import izi ve lisans

## Güvenli migration yaklaşımı

`npm run migrate-problem-bank` komutu varsayılan olarak yalnız dry-run üretir.

Dry-run çıktısı:

- hangi kayıtların 1.1.0'a geçeceğini
- hangi alanların ekleneceğini
- hangi kayıtların insan doğrulaması isteyeceğini
- hangi kayıtların `ready` veya `blocked` olduğunu

raporlar; dosyaları yazmaz.

Apply modu gerektiğinde açıkça `--apply` ile çağrılır. Apply, önce tüm adayları doğrular; hata varsa hiçbir dosya değiştirmez. Yazma başarılı olursa atomik geçici dosya + rename yaklaşımı kullanılır.
