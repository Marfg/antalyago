# Problem Bank Taksonomisi

Bu taksonomi, mevcut müfredat ve problem bankasından türetilen kontrollü sözlükleri ayırır. Serbest etiketler tamamen yasaklanmaz; ancak kontrollü sözlükle karıştırılmaz.

## Kimlik alanları

- `problem.id`: yaygın gösterim kimliği
- `schemaVersion`: JSON sözleşmesi sürümü
- `revision`: aynı problem için editoryal revizyon
- `status`: `draft` / `review` / `approved` / `published` / `retired`

## Müfredat kimlikleri

Kanonik eşleşme katmanı iki kaynaklıdır:

- Problem bankası anahtarları: `B1`, `B2`, `B3`, `EXTRA`
- Müfredat düğümleri: `c1`, `c2`, `c3`
- Ders düğümleri: `l1` … `l15`, `l1_deg`, `l2_deg`, `l3_deg`

Mevcut problem bankası kapsaması:

- `B1/l2` — köşe nefes sayısı
- `B1/l3` — tek taş yakalama
- `B2/l10` — merdiven dizisi

## Kontrollü beceri sözlüğü

Müfredat akışından türetilen beceri adları:

- `liberty`
- `capture`
- `atari`
- `connection`
- `life_and_death`
- `ko`
- `forbidden_move`
- `ladder`
- `net`
- `snapback`
- `territory`
- `opening`
- `endgame`
- `shape`

## Serbest etiketler

Mevcut problem bankasında kontrollü sözlüğe girmeyen örnek etiketler:

- `corner`
- `forced_sequence`

Bunlar yasak değildir; fakat ayrı `tags[]` katmanına taşınması önerilir.

## Soru türleri

- `point_select`
- `multi_point_select`
- `stone_select`
- `binary_judgement`
- `choice_on_board`
- `numeric_count`
- `sequence`
- `construct_shape`
- `capture_goal`
- `save_goal`

## Zorluk düzeyleri

- `authorLevel`: 1–5
- `estimated`: 0–1
- `calibrated`: 0–1 veya `null`

## Kaynak türleri

Kanonik değerler:

- `pdf`
- `sgf`
- `studio`
- `manual`
- `web`

## Yayın durumu

- `draft`
- `review`
- `approved`
- `published`
- `retired`

## Renderer / capability türleri

- `web-renderer`
- `three-d-board`
- `motion-ready`
- `ag-studio-export`

## Not

Taksonomide kavramlar ile beceriler ayrıdır. Bir problemde hem kontrollü beceri hem serbest editoryal etiket bulunabilir.