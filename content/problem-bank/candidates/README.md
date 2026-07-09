# Problem Bank Candidate Hatı

Bu dizin, PDF/SGF ve benzeri kaynaklardan çıkarılan problem adaylarını canonical problem havuzundan ayrı tutar.

Kurallar:

- `status = extracted` ham adaydır.
- `status = needs-review` insan kontrolünü bekleyen adayı ifade eder.
- `status = rejected` kullanılmayacak adayı ifade eder.
- `status = promoted` inceleme ve güvenlik kapılarından geçen adayı ifade eder.
- Promoted olmayan kayıtlar `content/problem-bank/problems/` altına yazılmaz.
- Mutlak yerel yol, PDF kopyası veya lisans iddiası bu katmanda canonical veri olarak tutulmaz.
- Aday otomatik olarak canonical problem değildir; önce review report, sonra kontrollü promotion preview gerekir.

Yapı:

- `schema/candidate.schema.json` — aday modelinin JSON Schema tanımı
- `items/` — örnek veya ithal edilmiş adaylar
- `reports/` — review raporları ve preview çıktıları için işlevsel alan; canonical veri değildir

## Review report

Review raporu JSON üretilir ve kalite/hak/kaynak kapısı olarak kullanılır. Varsayılan davranış dry-run’dır.

Önerilen komutlar:

- `npm run review-problem-candidate -- --id <candidateId>`
- `npm run review-problem-candidates`

Rapor alanları:

- `candidateId`, `candidateVersion`
- `source` (`sourceId`, `locator`, `usage`)
- `curriculum`
- `rights`
- `board`
- `task`
- `pedagogy`
- `studioPreviewValidation`
- `promotionReadiness`

## Promotion preview

Promotion preview yalnızca inceleme raporu ve güvenli canonical kaynak modeli üzerinden üretilir. Default davranış dry-run’dır; `--apply` açık onay gerektirir.

Kural:

- `approved` / `published` yalnızca hak ve kalite kapıları geçerse önerilebilir.
- Hak/kaynak eksikse en fazla `review` veya `draft` önerilir.
- `--apply` olmadan canonical problem JSON’u yazılmaz.
- `--apply` ile bile çakışma, path traversal veya bloklayan issue varsa yazma yapılmaz.
