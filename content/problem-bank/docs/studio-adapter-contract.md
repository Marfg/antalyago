# Studio Adapter Sözleşmesi

Bu belge, Problem Bank ile `.agstudio` arasındaki gelecekteki köprüyü tanımlar.

## Yönler

### Problem Bank → `.agstudio`

Amaç:

- yayın probleminden editörün çalışma dosyasına güvenli aktarım
- kaynak kimliği ve revizyon bilgisini koruma
- atomik yazma

Gerekli taşıma alanları:

- `problem.id`
- `schemaVersion`
- `revision`
- `source.sourceId`
- `source.locator.type` / `source.locator.value`
- `source.usage`
- `migration.migratedFromHash`
- `status`
- `curriculum`
- `board`
- `question`
- `solution`
- `rights`

### `.agstudio` → Problem Bank

Amaç:

- editör çalışmasını geri içe aktarma
- çakışma varsa kullanıcı onayı alma
- validation preview üretme

Gerekli davranışlar:

- sourceId / locator / usage / revision korunur
- çakışma algılama dosya yazmadan önce yapılır
- draft export yayın öncesi ayrı tutulur
- atomik yazma: önce geçici dosya, sonra güvenli replace

## Çakışma algılama

Aşağıdaki durumlarda müdahale gerekir:

- aynı `problem.id` için farklı `source.hash`
- farklı revizyonla aynı canonical ID
- aynı kaynak için farklı koordinat çözümü
- kabul edilen çözüm ile `.agstudio` çözüm ağacı arasında uyuşmazlık

## Validation preview

Export/import öncesi kullanıcıya şu özet gösterilmelidir:

- problem kimliği
- kaynak izi
- müfredat eşleşmesi
- board size
- çözüm şekli
- olası uyarılar

## Kullanıcı onayı

Aşağıdaki durumlarda açık onay gerekir:

- kaynak hash değişmişse
- yayınlanmış kayda yazılacaksa
- mevcut çözüm ağacında branch siliniyorsa
- otomatik upgrade birden fazla dosyayı etkiliyorsa

## Atomik yazma

Önerilen akış:

1. yeni dosya geçici adla yazılır
2. JSON doğrulanır
3. çakışma kontrolü geçer
4. geçici dosya asıl dosyayla atomik olarak değiştirilir
5. indeks gerekirse ayrı işlemde güncellenir

## Kapsam dışı

Bu fazda Studio kodu yazılmıyor. Yalnız sözleşme tanımlanıyor.