import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'http://antalyago.test';
const PAGE = 'go-nedir.html';
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 720 }
];

let pass = 0;
let fail = 0;

function test(name, fn) {
  return (async () => {
    try {
      await fn();
      pass += 1;
      console.log('  ✓', name);
    } catch (error) {
      fail += 1;
      console.error('  ✗', name, '-', error.message);
    }
  })();
}

function assertOk(value, message) {
  if (!value) throw new Error(message);
}

function mime(filePath) {
  return {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml'
  }[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

async function launchBrowser() {
  const envPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (envPath) {
    return chromium.launch({ headless: true, executablePath: envPath, args: ['--allow-file-access-from-files'] });
  }

  try {
    return await chromium.launch({ headless: true, args: ['--allow-file-access-from-files'] });
  } catch (error) {
    if (!String(error?.message ?? error).includes('spawn EPERM')) {
      throw error;
    }
  }

  for (const candidate of await findSystemBrowsers()) {
    try {
      return await chromium.launch({ headless: true, executablePath: candidate, args: ['--allow-file-access-from-files'] });
    } catch {
      // try the next installed browser
    }
  }

  throw new Error('Uygun Chromium/Chrome y?r?t?lebilir dosyas? bulunamad?.');
}

const browser = await launchBrowser();

async function findSystemBrowsers() {
  const envCandidates = [
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ].filter(Boolean);

  return envCandidates.filter(candidate => fs.existsSync(candidate));
}

async function createContext(options = {}) {
  const context = await browser.newContext({
    viewport: options.viewport || { width: 1280, height: 720 },
    javaScriptEnabled: options.javaScriptEnabled !== false,
    reducedMotion: options.reducedMotion || 'no-preference'
  });

  await context.route(BASE + '/**', async route => {
    const url = new URL(route.request().url());
    const filePath = path.join(ROOT, decodeURIComponent(url.pathname.replace(/^\/+/, '')));

    try {
      await route.fulfill({
        status: 200,
        contentType: mime(filePath),
        body: fs.readFileSync(filePath)
      });
    } catch {
      await route.abort();
    }
  });

  return context;
}

async function waitForAssets(page) {
  await page.waitForFunction(() => Array.from(document.images).every(image => image.complete && image.naturalWidth > 0));
  await page.evaluate(async () => {
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }
  });
}

async function decodeAllImages(page) {
  await page.evaluate(async () => {
    await Promise.all(Array.from(document.images).map(async image => {
      if (typeof image.decode === 'function') {
        try {
          await image.decode();
        } catch {
          // ignore decode flukes; complete/naturalWidth already asserted
        }
      }
    }));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function waitForStablePaint(page) {
  await waitForAssets(page);
  await decodeAllImages(page);
  const reducedMotion = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  if (!reducedMotion) {
    await page.waitForFunction(() => document.documentElement.classList.contains('theme-ready'));
  }
  await page.waitForTimeout(250);
}

async function captureStableScreenshot(page, filePath, options = {}) {
  await page.screenshot({ fullPage: !!options.fullPage });
  await page.waitForTimeout(250);
  await page.screenshot({ path: filePath, fullPage: !!options.fullPage });
}

function decodePng(buffer) {
  assert.equal(buffer.toString('hex', 0, 8), '89504e470d0a1a0a', 'ge?ersiz PNG');

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset); offset += 4;
    const type = buffer.toString('ascii', offset, offset + 4); offset += 4;
    const chunk = buffer.subarray(offset, offset + length); offset += length;
    offset += 4;

    if (type === 'IHDR') {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      bitDepth = chunk[8];
      colorType = chunk[9];
    } else if (type === 'IDAT') {
      idat.push(chunk);
    } else if (type === 'IEND') {
      break;
    }
  }

  assert.equal(bitDepth, 8, 'beklenmeyen PNG bit derinli?i');
  assertOk(colorType === 6 || colorType === 2, 'beklenmeyen PNG renk bi?imi');

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const channels = colorType === 6 ? 4 : 3;
  const rowBytes = width * channels;
  const pixels = Buffer.alloc(width * height * channels);
  const prev = Buffer.alloc(rowBytes);
  const cur = Buffer.alloc(rowBytes);
  let input = 0;
  let output = 0;

  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };

  for (let y = 0; y < height; y += 1) {
    const filter = raw[input];
    input += 1;
    raw.copy(cur, 0, input, input + rowBytes);
    input += rowBytes;

    for (let i = 0; i < rowBytes; i += 1) {
      const left = i >= channels ? cur[i - channels] : 0;
      const up = prev[i];
      const upLeft = i >= channels ? prev[i - channels] : 0;
      let value = cur[i];

      if (filter === 1) {
        value = (value + left) & 255;
      } else if (filter === 2) {
        value = (value + up) & 255;
      } else if (filter === 3) {
        value = (value + Math.floor((left + up) / 2)) & 255;
      } else if (filter === 4) {
        value = (value + paeth(left, up, upLeft)) & 255;
      }

      cur[i] = value;
    }

    cur.copy(pixels, output);
    prev.set(cur);
    output += rowBytes;
  }

  return { width, height, channels, pixels };
}

function diffPngBuffers(a, b) {
  const pa = decodePng(a);
  const pb = decodePng(b);
  assert.equal(pa.width, pb.width, 'PNG geni?li?i farkl?');
  assert.equal(pa.height, pb.height, 'PNG y?ksekli?i farkl?');
  assert.equal(pa.channels, pb.channels, 'PNG kanallar? farkl?');

  let total = 0;
  let max = 0;
  let count = 0;

  for (let i = 0; i < pa.pixels.length; i += pa.channels) {
    for (let c = 0; c < 3; c += 1) {
      const delta = Math.abs(pa.pixels[i + c] - pb.pixels[i + c]);
      total += delta;
      if (delta > max) max = delta;
      count += 1;
    }
  }

  return { meanDelta: total / count, maxDelta: max };
}

function blackBlockStats(buffer, threshold = 5) {
  const { width, height, channels, pixels } = decodePng(buffer);
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  const components = [];

  const isDark = index => {
    const px = index * channels;
    const luminance = (pixels[px] + pixels[px + 1] + pixels[px + 2]) / 3;
    return luminance < threshold;
  };

  const neighbors = (x, y) => [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];

  for (let start = 0; start < width * height; start += 1) {
    if (visited[start] || !isDark(start)) continue;

    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    visited[start] = 1;

    let area = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;

    while (head < tail) {
      const index = queue[head++];
      const y = Math.floor(index / width);
      const x = index % width;
      area += 1;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;

      for (const [nx, ny] of neighbors(x, y)) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const next = ny * width + nx;
        if (visited[next] || !isDark(next)) continue;
        visited[next] = 1;
        queue[tail++] = next;
      }
    }

    components.push({
      area,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
      bboxArea: (maxX - minX + 1) * (maxY - minY + 1)
    });
  }

  const large = components.filter(component => component.area >= 200 && component.bboxArea >= 300);
  return { components, large };
}

async function inspectSurface(locator, label) {
  await locator.scrollIntoViewIfNeeded();
  const info = await locator.evaluate(el => {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    const before = getComputedStyle(el, '::before');
    const after = getComputedStyle(el, '::after');
    const points = [
      [rect.left + rect.width * 0.5, rect.top + rect.height * 0.5],
      [rect.left + rect.width * 0.1, rect.top + rect.height * 0.1],
      [rect.left + rect.width * 0.9, rect.top + rect.height * 0.1],
      [rect.left + rect.width * 0.1, rect.top + rect.height * 0.9],
      [rect.left + rect.width * 0.9, rect.top + rect.height * 0.9]
    ];

    const hits = points.map(([x, y]) => {
      const top = document.elementFromPoint(x, y);
      return {
        x,
        y,
        topTag: top?.tagName || null,
        topClass: top?.className || null,
        contains: top ? el.contains(top) : false
      };
    });

    return {
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      style: {
        opacity: style.opacity,
        filter: style.filter,
        mixBlendMode: style.mixBlendMode,
        transform: style.transform,
        backgroundImage: style.backgroundImage,
        maskImage: style.maskImage,
        clipPath: style.clipPath,
        position: style.position,
        zIndex: style.zIndex,
        overflow: style.overflow
      },
      beforeContent: before.content,
      afterContent: after.content,
      hits
    };
  });

  assertOk(info.rect.width > 0 && info.rect.height > 0, label + ' bbox bo?');
  assert.equal(info.style.opacity, '1', label + ' opacity 1 de?il');
  assert.equal(info.style.filter, 'none', label + ' filter none de?il');
  assert.equal(info.style.mixBlendMode, 'normal', label + ' mix-blend-mode normal de?il');
  assert.equal(info.style.transform, 'none', label + ' transform none de?il');
  assert.equal(info.style.maskImage, 'none', label + ' mask-image none de?il');
  assert.equal(info.style.clipPath, 'none', label + ' clip-path none de?il');
  assert.equal(info.beforeContent, 'none', label + ' ::before i?eri?i var');
  assert.equal(info.afterContent, 'none', label + ' ::after i?eri?i var');
  for (const hit of info.hits) {
    assertOk(hit.contains, label + ' ?stte beklenmeyen katman var');
  }

  return info;
}

async function openPage({ viewport, theme, javaScriptEnabled = true, reducedMotion = 'no-preference' } = {}) {
  const context = await createContext({ viewport, javaScriptEnabled, reducedMotion });
  const page = await context.newPage();

  if (theme) {
    await page.addInitScript(value => localStorage.setItem('antalyago-theme', value), theme);
  }

  await page.goto(BASE + '/' + PAGE, { waitUntil: 'domcontentloaded' });

  if (javaScriptEnabled) {
    await waitForStablePaint(page);
  } else {
    await waitForAssets(page);
  }

  return { context, page };
}

async function captureThemeRenders(theme, viewport) {
  const { context, page } = await openPage({ viewport, theme });

  const hero = page.locator('section.editorial-hero .editorial-media img').first();
  const breath = page.locator('#nefes-ve-yakalama .inline-diagram svg').first();
  const connection = page.locator('#alan-ve-baglanti .inline-diagram svg').first();

  await inspectSurface(hero, 'hero image ' + theme + ' ' + viewport.width + 'x' + viewport.height);
  await inspectSurface(breath, 'breath diagram ' + theme + ' ' + viewport.width + 'x' + viewport.height);
  await inspectSurface(connection, 'connection diagram ' + theme + ' ' + viewport.width + 'x' + viewport.height);

  const heroRasterHash = await hero.evaluate(async el => {
    const canvas = document.createElement('canvas');
    canvas.width = el.naturalWidth;
    canvas.height = el.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(el, 0, 0);
    return canvas.toDataURL('image/png');
  });

  const breathMarkupHash = await breath.evaluate(el => el.outerHTML);
  const connectionMarkupHash = await connection.evaluate(el => el.outerHTML);

  const heroBuffer = await hero.screenshot();
  const breathBuffer = await breath.screenshot();
  const connectionBuffer = await connection.screenshot();

  await context.close();
  return { heroBuffer, breathBuffer, connectionBuffer, heroRasterHash, breathMarkupHash, connectionMarkupHash };
}

await test('sayfa yap?s? ve SEO alanlar? korunur', async () => {
  const html = fs.readFileSync(PAGE, 'utf8');
  const count = needle => html.split(needle).length - 1;

  assert.equal(count('<h1>'), 1, 'tek h1 olmal?');
  assert(html.includes('Go Nedir? &mdash; AntalyaGo'), 'sayfa ba?l??? eksik');
  assert(html.includes('Bir dakikada Go'), 'bir dakikada Go b?l?m? eksik');
  assert(html.includes('Oyunun amac&#305;'), 'oyunun amacı bölümü eksik');
  assert(html.includes('&#220;&#231; temel kural'), '?? temel kural b?l?m? eksik');
  assert(html.includes('Nefes ve ta&#351; yakalama'), 'nefes ve yakalama bölümü eksik');
  assert(html.includes('Alan ve ba&#287;lant&#305;'), 'alan ve bağlantı bölümü eksik');
  assert(html.includes("Go'nun stratejik derinli&#287;i"), 'stratejik derinlik bölümü eksik');
  assert(html.includes('Neden 9&times;9?'), '9x9 b?l?m? eksik');
  assert(html.includes('9&times;9 ile ilk dersine ba&#351;la'), 'ilk ders CTA eksik');
  assert(html.includes('Az say&#305;da kural, her ta&#351;la de&#287;i&#351;en say&#305;s&#305;z olas&#305;l&#305;k.'), 'kapak caption eksik');
  assert(count('class="rule-card"') === 3, '?? kural kart? olmal?');
  assert(html.includes('Weiqi'), 'Weiqi korunmamış');
  assert(html.includes('<em>Go</em>'), 'Go adı eksik');
  assert(html.includes('<em>Baduk</em>'), 'Baduk adı eksik');
  assert(html.includes('4.000 y&#305;l'), '4.000 yıllık anlatı eksik');
  assert(html.includes('ogren-3d.html'), 'ogren-3d CTA eksik');
  assert(html.includes('robot.html'), 'robot bağlantısı eksik');
  assert(html.includes('property="og:title"'), 'OG title eksik');
  assert(html.includes('property="og:description"'), 'OG description eksik');
  assert(html.includes('property="og:url"'), 'OG url eksik');
  assert(html.includes('property="og:image"'), 'OG image eksik');
  assert(html.includes('name="twitter:card"'), 'Twitter card eksik');
  assert(html.includes('name="twitter:title"'), 'Twitter title eksik');
  assert(html.includes('name="twitter:description"'), 'Twitter description eksik');
  assert(html.includes('name="twitter:image"'), 'Twitter image eksik');
  assert(html.includes('rel="canonical"'), 'canonical eksik');
  assert(html.includes('rel="icon" type="image/svg+xml"'), 'SVG favicon eksik');
  assert(html.includes('rel="icon" type="image/png" sizes="32x32"'), 'PNG favicon eksik');
  assert(html.includes('rel="apple-touch-icon"'), 'apple touch icon eksik');
  assert(html.includes('styles/design-system.css'), 'tasar?m sistemi eksik');
  assert(html.includes('styles/theme-compat.css'), 'uyumluluk CSS eksik');
  assert(html.includes('core/theme.js'), 'tema beti?i eksik');
  assert(html.includes('data-theme-toggle'), 'tema d??mesi eksik');

  const css = fs.readFileSync('styles/design-system.css', 'utf8');
  for (const needle of ['.editorial-page', '.editorial-hero', '.editorial-grid', '.editorial-copy', '.editorial-media', '.prose-lead', '.fact-grid', '.rule-card', '.callout', '.quote-card', '.inline-diagram', '.chapter-nav', '.closing-cta', '.media-caption']) {
    assert(css.includes(needle), needle + " CSS'te yok");
  }
});

await test('tema tercihi bu sayfada da uygulan?r ve korunur', async () => {
  const context = await createContext();
  const page = await context.newPage();

  await page.addInitScript(() => localStorage.setItem('antalyago-theme', 'light'));
  await page.goto(BASE + '/' + PAGE, { waitUntil: 'domcontentloaded' });
  await waitForStablePaint(page);

  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
  assert.equal(await page.locator('[data-theme-toggle]').getAttribute('aria-label'), 'Gece temasına geç');
  assert.equal(await page.locator('[data-theme-toggle]').getAttribute('aria-pressed'), 'false');

  await page.locator('[data-theme-toggle]').click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');

  const page2 = await context.newPage();
  await page2.goto(BASE + '/' + PAGE, { waitUntil: 'domcontentloaded' });
  await waitForStablePaint(page2);

  assert.equal(await page2.evaluate(() => document.documentElement.dataset.theme), 'dark');
  assert.equal(await page2.locator('[data-theme-toggle]').getAttribute('aria-label'), 'Gündüz temasına geç');
  assert.equal(await page2.locator('[data-theme-toggle]').getAttribute('aria-pressed'), 'true');

  await context.close();
});

await test('localStorage hatas?nda dark ile a??l?r', async () => {
  const context = await createContext();
  const page = await context.newPage();

  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('blocked');
      }
    });
  });

  await page.goto(BASE + '/' + PAGE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await page.waitForTimeout(100);

  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  await context.close();
});

await test('JavaScript kapal? iken i?erik g?r?n?r kal?r', async () => {
  const context = await createContext({ javaScriptEnabled: false });
  const page = await context.newPage();

  await page.goto(BASE + '/' + PAGE, { waitUntil: 'domcontentloaded' });
  await waitForAssets(page);

  await page.getByRole('heading', { name: 'Go Nedir?' }).waitFor();
  await page.getByRole('link', { name: 'Temel kuralları keşfet' }).waitFor();
  await page.getByText('Bir dakikada Go').waitFor();

  await context.close();
});

await test('reduced-motion durumunda ge?i?ler kapat?l?r', async () => {
  const { context, page } = await openPage({ reducedMotion: 'reduce' });
  const duration = await page.evaluate(() => getComputedStyle(document.querySelector('.button-primary')).transitionDuration);
  assert.equal(duration, '0s');
  await context.close();
});

for (const viewport of VIEWPORTS) {
  await test(viewport.width + '?' + viewport.height + ' yatay ta?ma yok', async () => {
    const { context, page } = await openPage({ viewport });
    assertOk(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'yatay ta?ma var');
    await context.close();
  });
}

await test('ana gezinme ve i?i gezinme ba?lant?lar? do?ru', async () => {
  const { context, page } = await openPage({ theme: 'light' });

  assert.equal(await page.getByRole('navigation', { name: 'Ana navigasyon' }).getByRole('link', { name: 'Öğren' }).getAttribute('href'), 'ogren-3d.html');
  assert.equal(await page.getByRole('navigation', { name: 'Ana navigasyon' }).getByRole('link', { name: 'Robotla Oyna' }).getAttribute('href'), 'robot.html');
  assert.equal(await page.getByRole('navigation', { name: 'Sayfa bölümleri' }).getByRole('link', { name: 'Özet' }).getAttribute('href'), '#giris');
  assert.equal(await page.getByRole('link', { name: 'Temel kuralları keşfet' }).getAttribute('href'), '#uc-temel-kural');
  assert.equal(await page.getByRole('link', { name: 'İlk derse başla' }).getAttribute('href'), 'ogren-3d.html');
  assert.equal(await page.getByRole('link', { name: 'Önce robotla dene' }).getAttribute('href'), 'robot.html');
  await context.close();
});
await test('ışık ve gece tema medyaları aynı kaynaktan benzer biçimde çizilir', async () => {
  const light = await captureThemeRenders('light', { width: 1280, height: 720 });
  const dark = await captureThemeRenders('dark', { width: 1280, height: 720 });

  assert.equal(light.heroRasterHash, dark.heroRasterHash, 'hero source hashleri farklı');
  assert.equal(light.breathMarkupHash, dark.breathMarkupHash, 'nefes diyagramı source hashleri farklı');
  assert.equal(light.connectionMarkupHash, dark.connectionMarkupHash, 'bağlantı diyagramı source hashleri farklı');
});

for (const [theme, label] of [['light', 'light'], ['dark', 'dark']]) {
  for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
    await test(viewport.width + '?' + viewport.height + ' ' + label + ' ekran g?r?nt?s?', async () => {
      const { context, page } = await openPage({ viewport, theme });
      const hero = await page.locator('section.editorial-hero .editorial-media img').first();
      await inspectSurface(hero, 'hero image capture ' + theme + ' ' + viewport.width + 'x' + viewport.height);
      const screenshotPath = 'tests/go-nedir-' + viewport.width + '-' + theme + '.png';
      await captureStableScreenshot(page, screenshotPath);
      const black = blackBlockStats(fs.readFileSync(screenshotPath));
      assert.equal(black.large.length, 0, 'screenshot içinde büyük siyah blok var');
      await context.close();
    });
  }
}

for (const theme of ['light', 'dark']) {
  await test('go-nedir full page ' + theme + ' screenshot', async () => {
    const { context, page } = await openPage({ viewport: { width: 1280, height: 720 }, theme });
    const screenshotPath = 'tests/go-nedir-full-' + theme + '.png';
    await captureStableScreenshot(page, screenshotPath, { fullPage: true });
    const black = blackBlockStats(fs.readFileSync(screenshotPath));
      assert.equal(black.large.length, 0, 'screenshot içinde büyük siyah blok var');
    await context.close();
  });
}

await browser.close();
console.log('\nGo Nedir doğrulaması: ' + pass + '/' + (pass + fail));
if (fail) process.exit(1);


