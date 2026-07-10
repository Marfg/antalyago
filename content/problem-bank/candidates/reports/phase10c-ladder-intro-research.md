# Faz 10C Ladder Intro AraÅŸtÄ±rma SonuÃ§ Raporu

Tarih: 2026-07-10

## AmaÃ§

9Ã—9 Ã¼zerinde B2 baÅŸlangÄ±Ã§ seviyesi iÃ§in gerÃ§ekten â€œladder-introâ€ taÅŸÄ±yan, kÄ±sa ve doÄŸrulanabilir bir formasyon bulmak. Bu araÅŸtÄ±rma, neden `candidate-fib-b2-ladder-intro-0006` ve `candidate-fib-b2-ladder-intro-0007` adaylarÄ±nÄ±n ladder-intro olarak kabul edilmediÄŸini ve neden yeni ladder candidate Ã¼retiminin ertelendiÄŸini kayda geÃ§irir.

## Kabul kriteri

Bir formasyonun bu araÅŸtÄ±rmada â€œladder-introâ€ sayÄ±labilmesi iÃ§in en az ÅŸu koÅŸullarÄ± saÄŸlamasÄ± gerekiyordu:

- hedef beyaz grup baÅŸlangÄ±Ã§ta 1â€“2 liberty baskÄ±sÄ±nda olmalÄ±,
- siyahÄ±n doÄŸru ilk hamlesi beyazÄ± tek doÄŸal kaÃ§Ä±ÅŸa zorlamalÄ±,
- beyazÄ±n kaÃ§Ä±ÅŸ hamlesi sonrasÄ± siyah aynÄ± yÃ¶nÃ¼ sÃ¼rdÃ¼rebilmeli,
- dizi en az 4â€“6 ply boyunca legal kalmalÄ±,
- beyazÄ±n kaÃ§Ä±ÅŸ yÃ¶nÃ¼ gÃ¶rsel olarak aynÄ± hatta ilerlemeli,
- siyah hamleleri beyazÄ±n Ã¶zgÃ¼r alanÄ±nÄ± daraltmalÄ±,
- sonuÃ§, kÃ¶ÅŸe/kenar/duvar baskÄ±sÄ± hissi vermeli,
- sadece â€œatari ver ve takip etâ€ dÃ¼zeyinde kalmamalÄ±.

## 0006 deÄŸerlendirmesi

`candidate-fib-b2-ladder-intro-0006` hÃ¢lÃ¢ `redesign-needed` durumunda kalmalÄ±dÄ±r.

Ana sorunlar:

- hedef grup aÃ§Ä±k deÄŸil,
- kaÃ§Ä±ÅŸ hattÄ± aÃ§Ä±k deÄŸil,
- takip yÃ¶nÃ¼ pedagojik olarak gÃ¶rÃ¼nÃ¼r deÄŸil,
- mevcut tahta ve sequence bir ladder fikrini gÃ¼venilir biÃ§imde Ã¶ÄŸretmiyor.

SonuÃ§: 0006, ladder-intro deÄŸil; yeniden tasarÄ±m gerektiren adaydÄ±r.

## 0007 deÄŸerlendirmesi

`candidate-fib-b2-ladder-intro-0007` teknik olarak legal gÃ¶rÃ¼nse de gerÃ§ek ladder zinciri Ã¼retmiyor.

GÃ¶zlem:

- siyah ilk hamle sonrasÄ± beyaz kaÃ§Ä±ÅŸa zorlanÄ±yor,
- fakat ikinci siyah hamleden sonra beyazÄ±n libertyâ€™leri pedagojik olarak beklenen ladder baskÄ±sÄ±nÄ± gÃ¶stermiyor,
- dizi, â€œladderâ€dan Ã§ok â€œatari ver ve takip etâ€ hissi veriyor.

SonuÃ§: 0007 ladder-intro olarak kabul edilmemelidir.

## Denenen alternatifler

### Alternatif A

**initialStones**

```json
[
  { "x": 4, "y": 4, "color": "white" },
  { "x": 3, "y": 4, "color": "black" },
  { "x": 4, "y": 5, "color": "black" },
  { "x": 6, "y": 4, "color": "black" },
  { "x": 5, "y": 5, "color": "black" }
]
```

**sequence**

1. black `(4,3)`
2. white `(5,4)`
3. black `(5,2)`
4. white `(5,3)`
5. black `(6,2)`
6. white `(6,3)`

**neden yetersiz**

- yasal ve forcing bir zincir var,
- ancak sahne doÄŸal bir ladder Ã¶ÄŸretmiyor,
- beyazÄ±n hattÄ± Ã§ok aÃ§Ä±k/Ã§ok yapay kalÄ±yor,
- marker kullanÄ±lmadan pedagojik anlam zayÄ±f,
- marker ile de cevap fazla sÄ±zÄ±yor.

### Alternatif B

**initialStones**

```json
[
  { "x": 4, "y": 4, "color": "white" },
  { "x": 3, "y": 4, "color": "black" },
  { "x": 4, "y": 5, "color": "black" },
  { "x": 6, "y": 4, "color": "black" },
  { "x": 5, "y": 5, "color": "black" },
  { "x": 6, "y": 5, "color": "black" }
]
```

**sequence**

1. black `(4,3)`
2. white `(5,4)`
3. black `(5,2)`
4. white `(5,3)`
5. black `(7,3)`
6. white `(6,3)`

**neden yetersiz**

- yine legal bir forcing Ã§izgi var,
- ama bu yapÄ± da B2 baÅŸlangÄ±Ã§ iÃ§in temiz bir ladder-intro deÄŸil,
- sahne, â€œladderâ€ fikrinden Ã§ok genel takip/kaÃ§Ä±ÅŸ dizisine benziyor,
- pedagojik okunabilirlik dÃ¼ÅŸÃ¼k.

## Ana karar

**Karar: C â€” 9x9â€™da bu seviyede gerÃ§ek ladder-intro iÃ§in daha uzun veya daha net bir sahne gerekiyor; aday Ã¼retimi ertelensin.**

Bu nedenle:

- yeni ladder-intro candidate henÃ¼z Ã¼retilmemeli,
- 0006 `redesign-needed` olarak kalmalÄ±,
- 0007 ladder-intro olarak kabul edilmemeli.

## Pedagojik keÅŸif

AraÅŸtÄ±rma, ladderâ€™dan Ã¶nce daha temel bir becerinin gerekli olabileceÄŸini gÃ¶sterdi:

- atari-follow-up,
- escape-line,
- forcing-chase.

Bu Ã¶n beceriler netleÅŸmeden ladder-intro adaylarÄ± ya Ã§ok soyut kalÄ±yor ya da yalnÄ±zca taktik zincir gibi gÃ¶rÃ¼nÃ¼yor.

## Sonraki Ã¶nerilen faz

- B2 iÃ§in Ã¶nce â€œkaÃ§Ä±ÅŸ hattÄ± / takip hattÄ±â€ adaylarÄ± tasarlanmalÄ±,
- gerÃ§ek ladder-intro daha sonra daha uzun ve doÄŸrulanmÄ±ÅŸ bir worked-example olarak ele alÄ±nmalÄ±,
- 9Ã—9â€™da ladder anlatÄ±mÄ± iÃ§in daha net hedef grup ve kaÃ§Ä±ÅŸ hattÄ± kurulumu gerekip gerekmediÄŸi tekrar test edilmelidir.

## DeÄŸiÅŸmezlik notu

- Bu turda `0006` ve `0007` candidate dosyalarÄ± deÄŸiÅŸtirilmedi.
- Yeni candidate oluÅŸturulmadÄ±.
- `test-problems` geÃ§ti.
- `tmp/` altÄ±nda kullanÄ±lan araÅŸtÄ±rma scripti commit adayÄ± deÄŸildir.