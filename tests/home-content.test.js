import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync('index.html', 'utf8');
const count = needle => html.split(needle).length - 1;

assert.equal(count('class="card timeline-card'), 6, 'altı turnuva kartı korunmalı');
assert(html.includes('17&ndash;18 A&#287;ustos 2013'), '2013 tarihi eksik');
assert(html.includes('2014'), '2014 kaydı eksik');
assert(html.includes('27&ndash;28 Temmuz 2019'), '2019 tarihi eksik');
assert(html.includes('2023'), '2023 kaydı eksik');
assert(html.includes('Olimpos Yaz Kamp&#305;'), 'kamp bilgisi eksik');
assert(html.includes('Tarih ve mek&acirc;n bilgisi derleniyor.'), 'derleniyor kaydı eksik');
assert(html.includes('Varuna Gezgin Cafe, Kalei&ccedil;i'), '5. turnuva mekanı eksik');
assert(html.includes('Jiraf Coffee &amp; Book, Antalya'), 'haftalık buluşma içeriği eksik');
assert(html.includes('Haftal&#305;k Bulu&#351;ma'), 'haftalık buluşma etiketi eksik');
assert(html.includes('property="og:title"'), 'OG başlığı eksik');
assert(html.includes('property="og:description"'), 'OG açıklaması eksik');
assert(html.includes('property="og:url"'), 'OG URL eksik');
assert(html.includes('property="og:image"'), 'OG görseli eksik');
assert(html.includes('name="twitter:card"'), 'Twitter card eksik');
assert(html.includes('name="twitter:title"'), 'Twitter başlığı eksik');
assert(html.includes('name="twitter:description"'), 'Twitter açıklaması eksik');
assert(html.includes('name="twitter:image"'), 'Twitter görseli eksik');
assert(html.includes('rel="canonical"'), 'canonical eksik');
assert(html.includes('rel="icon" type="image/svg+xml"'), 'SVG favicon eksik');
assert(html.includes('rel="icon" type="image/png" sizes="32x32"'), 'PNG favicon eksik');
assert(html.includes('rel="apple-touch-icon"'), 'apple touch icon eksik');
assert(html.includes('&Ouml;&#287;renmeye ba&#351;la') && html.includes('ogren-3d.html'), 'öğren CTA yanlış');
assert(html.includes('9&times;9 robotla oyna') && html.includes('robot.html'), 'robot CTA yanlış');

console.log('  ✓ Ana sayfa içerik koruma testi geçti');
