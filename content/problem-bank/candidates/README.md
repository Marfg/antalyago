# Problem Bank Candidate Hatı

Bu dizin, PDF/SGF ve benzeri kaynaklardan çıkarılan problem adaylarını canonical problem havuzundan ayrı tutar.

Kurallar:

- `status = extracted` ham adayı ifade eder.
- `status = needs-review` insan kontrolünü bekleyen adaydır.
- `status = rejected` kullanılmayacak adaydır.
- `status = promoted` yalnızca onaylı ve canonical havuza aktarılmaya hazır adaydır.
- Promoted olmayan kayıtlar `content/problem-bank/problems/` altına yazılmaz.
- Mutlak yerel yol, PDF kopyası veya lisans iddiası bu katmanda canonical veri olarak tutulmaz.

Yapı:

- `schema/candidate.schema.json` — aday modelinin JSON Schema tanımı
- `items/` — örnek veya ithal edilmiş adaylar
- `reports/` — geçici raporların ve preview'lerin işlevsel alanı; canonical veri değildir

İthalat akışı ve promotion ayrı bir insan onayı gerektirir.
