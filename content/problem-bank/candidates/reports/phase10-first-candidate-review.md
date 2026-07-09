# Faz 10 ?lk 5 Aday Pedagojik De?erlendirme Raporu

Tarih: 2026-07-09

## Kapsam

Bu rapor, Faz 9?da eklenen ilk be? aday?n pedagojik s?n?fland?rma, soru dili, tahta do?rulu?u, ??z?m netli?i ve Studio/video ?retim de?eri a??s?ndan de?erlendirilmesini ?zetler. Bu ?al??ma yaln?zca rapor ?retir; aday JSON dosyalar?, canonical problem JSON?lar? ve indeks dosyalar? de?i?tirilmemi?tir.

## Genel bulgu

?lk 5 aday teknik olarak b?y?k ?l??de sa?lamd?r; ancak paket genel olarak assessment de?il, a??rl?kl? olarak intro / drill / guided-practice karakteri ta??r. Bu nedenle problem bankas?nda pedagojik kullan?m t?r? metadata?s? daha a??k hale getirilmelidir. Ladder-intro aday? yeniden tasar?m gerektirir.

## Aday bazl? karar tablosu

| Aday | Karar | K?sa gerek?e | ?nerilen kullan?m t?r? |
|---|---|---|---|
| candidate-fib-b1-liberty-count-0002 | revise | Go do?rulu?u ve metin kalitesi uygun; ancak assessment de?il, intro-card/drill olarak konumlanmal?. | intro-card / drill |
| candidate-fib-b1-capture-0003 | revise | Tahta ve cevap do?ru; prompt cevaba fazla yak?n, guided-practice/drill daha uygun. | guided-practice / drill |
| candidate-fib-b2-atari-0004 | keep | Tahta, cevap ve pedagojik hedef uygun; atari durumunu do?ru ?l??yor. | guided-practice / drill |
| candidate-fib-b2-connect-cut-0005 | keep | Tahta mant??? do?ru; iki siyah ta?? tek grupta birle?tiren hamle net. | guided-practice / drill |
| candidate-fib-b2-ladder-intro-0006 | redesign | Sequence modeli ve mevcut sahne ladder-intro i?in yeterince a??k de?il; hedef grup/ka??? hatt? belirsiz. | guided-practice / worked-example |

## Aday bazl? k?sa de?erlendirmeler

### candidate-fib-b1-liberty-count-0002

Bu aday temiz T?rk?e ile korunmu?, k??e ta??n?n nefes say?s?n? do?ru soruyor ve answer da do?ru. Ancak i?erik, notland?r?lm?? bir assessment probleminden ?ok ilk nefes sayma al??t?rmas? niteli?inde. Bu y?zden `intro-card` veya `drill` olarak etiketlenmesi daha do?ru olur.

### candidate-fib-b1-capture-0003

Tahta ve cevap do?ru; tek beyaz ta??n son nefesi ger?ekten kapat?l?yor. Buna kar??n prompt, cevaba olduk?a yak?n. Bu nedenle rehberli pratik / drill olarak konumland?r?ld???nda daha iyi ?al???r. Studio/video a??s?ndan ta? alma animasyonu i?in g??l? bir mikro-sahne verir.

### candidate-fib-b2-atari-0004

Tahta do?ru kurulmu?, beklenen hamle ger?ekten atari yarat?yor ve capture ?retmiyor. B2 i?in do?al bir basamak ve pedagojik hedefi net. Bu aday mevcut haliyle tutulabilir; `guided-practice` veya `drill` olarak en iyi uyumu verir.

### candidate-fib-b2-connect-cut-0005

?ki siyah ta??n tek hamleyle ayn? gruba ba?lanmas? do?ru modellenmi?. Hamle legal ve ba?ka bir yanl?? sonu? ?retmiyor. B2 ba?lant?/kesme prati?i i?in sa?lam; yine `guided-practice` / `drill` s?n?f? uygun.

### candidate-fib-b2-ladder-intro-0006

Metin temiz olsa da `sequence` modeli ve mevcut sahne ladder-intro hedefini yeterince a??k ta??m?yor. Hedef grup, ka??? hatt? ve takip y?n? pedagojik olarak belirsiz kal?yor. Bu nedenle yeniden tasar?m gerekir.

## Ortak pedagojik desenler

- Adaylar tahta do?rulu?u a??s?ndan genel olarak g?venilirdir.
- Prompt ve classification ayr?m? geli?tirilmelidir.
- Assessment ile guided-practice / drill ayr?m? netle?tirilmelidir.
- Studio/video ?retimi a??s?ndan ilk 4 aday iyi mikro-sahne potansiyeli ta??r.
- Ladder-intro aday? daha a??k hedef grup ve ka??? hatt? gerektirir.

## Revizyon ?ncelikleri

1. Pedagojik kullan?m t?r? metadata?s?n? a??kla?t?rmak.
2. Assessment ile intro/drill ayr?m?n? netle?tirmek.
3. Prompt?lar? cevap s?z?nt?s? riskine g?re s?k?la?t?rmak.
4. Ladder-intro aday?n? yeniden tasarlamak; hedef grup ve ka??? hatt?n? g?r?n?r k?lmak.

## Sonraki ?nerilen faz

Bir sonraki fazda adaylar?n kullan?m t?r? metadata?s? (`intro-card`, `drill`, `guided-practice`, `assessment`, `worked-example`) a??k?a standardize edilmeli ve ladder-intro aday? i?in yeni bir tahta/prompt kurgusu haz?rlanmal?d?r.
