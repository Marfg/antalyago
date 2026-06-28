# AntalyaGo Problem Havuzu

Bu klasör, Obsidian'daki editoryal problem kayıtlarının site tarafından yüklenen yayın karşılığıdır.

## Akış

1. PDF kaynağı Obsidian'da Kaynak şablonuyla kaydedilir.
2. Her aday soru ayrı Problem notuna dönüştürülür.
3. Tahta pozisyonu görselden kopyalanmaz; SGF/koordinat olarak yeniden kurulur.
4. Kaynak sayfa, müfredat düğümü, soru türü, çözüm, ipuçları ve hak durumu doldurulur.
5. JSON dosyası schema/problem.schema.json sözleşmesine göre hazırlanır.
6. scripts/problem-bank/validate.mjs çalıştırılır.
7. Doğrulanan kayıt index.json'a eklenir ve 3D motor problemToLessonStep ile yükler.

## Motor kullanımı

```js
import { loadProblemBank, selectProblemEntries, problemToLessonStep } from './core/problemBank.js';

const { index, problems } = await loadProblemBank('./content/problem-bank/index.json');
const entries = selectProblemEntries(index, { lesson: 'l3', stage: 'assessment' });
const selected = problems.find(problem => problem.id === entries[0].id);
const step = problemToLessonStep(selected, { transform: { rotate: 90 } });
```

Üretilen step mevcut LessonEngine alanlarını kullanır: board, answer/answers, miniQuestion, turn, size, markers, fb, fb_ok ve fb_err. Sequence soruları ilk hamleyi answer, devam yolunu movesAfterAnswer ve problemMeta.solutionTree alanlarında taşır.

## Durum kapıları

raw -> analyzed -> mapped -> sgf_ready -> verified -> published

published için: kaynak sayfası, hak durumu, müfredat eşlemesi, geçerli koordinatlar, çözüm kontrolü ve en az bir insan incelemesi zorunludur.
