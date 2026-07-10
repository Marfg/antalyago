# Faz 11 â€” Takip HattÄ± Beceri TasarÄ±m Raporu

Tarih: 2026-07-10

## Arka plan

Faz 10C araÅŸtÄ±rmasÄ±, 9Ã—9 Ã¼zerinde gerÃ§ek bir ladder-intro iÃ§in yeterince temiz ve pedagojik olarak gÃ¼venilir bir sahne bulunmadÄ±ÄŸÄ±nÄ± gÃ¶sterdi. `candidate-fib-b2-ladder-intro-0006` ve `candidate-fib-b2-ladder-intro-0007` legal takip dizileri sunsa da bunlar gerÃ§ek ladder zinciri Ã¼retmiyor; daha Ã§ok atari sonrasÄ± takip veya forcing-chase hissi veriyor.

Bu nedenle ladder Ã¶ncesi bir ara beceri tanÄ±mlamak daha doÄŸru:

- canonical skill id: `forcing-chase`
- TÃ¼rkÃ§e gÃ¶rÃ¼nen ad: `Takip hattÄ±`

## Neden ladder deÄŸil?

0006 ve 0007 bazÄ± legal takip dizileri sunsa da gerÃ§ek ladder zinciri kurmuyor.

- Ã–ÄŸrenciye â€œmerdivenâ€ yerine â€œatari sonrasÄ± takipâ€ fikri veriyor.
- Takip hattÄ± ve kaÃ§Ä±ÅŸ yÃ¶nÃ¼ yeterince netleÅŸmeden ladder etiketi pedagojik olarak yanÄ±ltÄ±cÄ± oluyor.
- Bu nedenle kavramÄ± ladder olarak sunmak yerine ara beceri olarak ayÄ±rmak daha doÄŸru.

## Ã–nerilen beceri adÄ±

- canonical skill id: `forcing-chase`
- TÃ¼rkÃ§e gÃ¶rÃ¼nen ad: `Takip hattÄ±`
- kÄ±sa aÃ§Ä±klama: Atari sonrasÄ± kaÃ§Ä±ÅŸ yÃ¶nÃ¼nÃ¼ okuma, takip hamlesini koruma ve rakibin Ã¶zgÃ¼r alanÄ±nÄ± daraltma becerisi.

## Pedagojik hedef

Bu beceri Ã¶ÄŸrencide ÅŸunlarÄ± Ã¶lÃ§melidir:

- Atari sonrasÄ± grubun tek doÄŸal kaÃ§Ä±ÅŸÄ±nÄ± gÃ¶rmek.
- Rakibin kaÃ§Ä±ÅŸ yÃ¶nÃ¼nÃ¼ takip etmek.
- KaÃ§Ä±ÅŸ hattÄ±nÄ±n aÃ§Ä±lÄ±p aÃ§Ä±lmadÄ±ÄŸÄ±nÄ± deÄŸerlendirmek.
- â€œSadece atari vermek yetmez, devamÄ± takip etmek gerekirâ€ fikrini gÃ¶rmek.
- Ladderâ€™a geÃ§meden Ã¶nce chase mantÄ±ÄŸÄ±nÄ± anlamak.

## MÃ¼fredat konumu

- B2 iÃ§inde ladderâ€™dan Ã¶nce gelen Ã¶n-adÄ±m.
- Ladder Ã¶ÄŸrenimine hazÄ±rlÄ±k saÄŸlar.

## Problem tipi Ã¶nerileri

### A) Ä°lk takip hamlesini bul

- task.type: `choose-move`
- useCase: `guided-practice`
- difficulty: `intro`
- marker: hedef grup + takip yÃ¶nÃ¼

### B) KaÃ§Ä±ÅŸ hattÄ± aÃ§Ä±k mÄ± kapalÄ± mÄ±?

- task.type: `multiple-choice` veya `choose-move`
- useCase: `drill`
- difficulty: `intro` / `easy`
- marker: kaÃ§Ä±ÅŸ hattÄ± + daraltan taÅŸlar

### C) KÄ±sa takip dizisini tamamla

- task.type: `sequence`
- useCase: `guided-practice`
- difficulty: `easy`
- marker: hedef grup + ilk takip hamlesi

## Board formasyonu Ã¶nerileri

### Formasyon A â€” tek kaÃ§Ä±ÅŸ yÃ¶nlÃ¼ chase

- Beyaz grup baskÄ± altÄ±nda.
- Ä°lk siyah hamle beyazÄ± tek doÄŸal kaÃ§Ä±ÅŸa zorlar.
- Beyaz kaÃ§Ä±nca siyah aynÄ± takip yÃ¶nÃ¼nÃ¼ korur.
- Tam ladder deÄŸildir; takip hattÄ± fikrini Ã¶ÄŸretir.

### Formasyon B â€” kenar baskÄ±lÄ± chase

- Hedef grup kenara veya kÃ¶ÅŸeye yakÄ±n.
- KaÃ§Ä±ÅŸ hattÄ± sÄ±nÄ±rlÄ±dÄ±r.
- Siyah takip hamlesi kaÃ§Ä±ÅŸ yÃ¶nÃ¼nÃ¼ daraltÄ±r.
- GerÃ§ek ladder deÄŸil; ladder Ã¶ncesi yÃ¶n okuma pratiÄŸidir.

## Test edilebilir kabul kriterleri

- initialStones legal
- answer legal
- hedef grup marker ile belli
- answer sonrasÄ± hedef grup hÃ¢lÃ¢ baskÄ± altÄ±nda veya kaÃ§Ä±ÅŸ hattÄ± daralÄ±yor
- capture beklenmiyorsa capture olmamalÄ±
- task.prompt â€œladderâ€ veya â€œmerdivenâ€ dememeli
- pedagogy.useCase guided-practice veya drill olmalÄ±
- difficulty intro/easy olmalÄ±
- source/rights canonical gÃ¼venlik modeli korunmalÄ±

## 0006 ve 0007 kararÄ±

- 0006 redesign-needed olarak kalmalÄ±.
- 0007 ladder-intro olarak kabul edilmemeli.
- 0007 exploratory olarak commit dÄ±ÅŸÄ± kalmalÄ± veya ayrÄ± bir fazda forcing-chase adayÄ± olarak yeniden tasarlanmalÄ±.
- 0007 mevcut haliyle final candidate olarak commit edilmemeli.

## Sonraki faz Ã¶nerisi

- AG-BANK Faz 11B â€” Ä°lk Takip HattÄ± AdaylarÄ±
- 2 yeni candidate Ã¼ret:
  1. Ä°lk takip hamlesini bul
  2. KaÃ§Ä±ÅŸ hattÄ± aÃ§Ä±k mÄ± kapalÄ± mÄ±?
- Bu adaylar ladder deÄŸil, forcing-chase / Takip hattÄ± becerisini hedeflemeli.