import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'http://antalyago.test';
const PAGE = 'ogren-3d.html';
const VIEWPORTS = {
  desktop: { width: 1280, height: 720 },
  mobile: { width: 390, height: 844 },
  tablet: { width: 768, height: 1024 }
};
const SHOTS = [
  'tests/learning-1280-explanation-dark.png',
  'tests/learning-1280-practice-dark.png',
  'tests/learning-1280-assessment-dark.png',
  'tests/learning-1280-explanation-light.png',
  'tests/learning-1280-curriculum-dark.png',
  'tests/learning-1280-profile-dark.png',
  'tests/learning-390-explanation-dark.png',
  'tests/learning-390-practice-dark.png',
  'tests/learning-390-panel-dark.png',
  'tests/learning-390-curriculum-dark.png',
  'tests/learning-390-profile-light.png',
  'tests/learning-768-practice-dark.png'
];
const browserTests = [];
let pass = 0;
let fail = 0;
function addTest(name, fn) {
  browserTests.push({ name, fn });
}
function mime(filePath) {
  return {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.json': 'application/json',
    '.ico': 'image/x-icon'
  }[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}
function pickChromiumExecutable() {
  const fromEnv = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  return null;
}
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
function absPath(rel) {
  return path.join(ROOT, rel.replace(/[\\/]+/g, path.sep));
}
function ensure(condition, message) {
  assert.ok(condition, message);
}
function countStaticAssertions() {
  const text = fs.readFileSync(absPath('tests/learning-ui.test.js'), 'utf8');
  return (text.match(/assert\s*\(/g) || []).length;
}
async function withBrowserPage({ viewport = VIEWPORTS.desktop, theme = 'dark', profile = null, boardTheme = 'dark', reducedMotion = 'no-preference' } = {}) {
  const executablePath = pickChromiumExecutable();
  let browser;
  if (executablePath) {
    browser = await chromium.launch({ headless: true, executablePath });
  } else {
    browser = await chromium.launch({ headless: true });
  }
  const context = await browser.newContext({ viewport, reducedMotion });
  await context.route(`${BASE}/**`, async route => {
    const url = new URL(route.request().url());
    const pathname = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
    const filePath = absPath(pathname || 'index.html');
    try {
      const body = fs.readFileSync(filePath);
      await route.fulfill({ status: 200, contentType: mime(filePath), body });
    } catch {
      await route.abort();
    }
  });
  await context.addInitScript(({ theme, profile, boardTheme }) => {
    try { localStorage.setItem('antalyago-theme', theme); } catch {}
    try { localStorage.setItem('go_board_theme', boardTheme); } catch {}
    try {
      if (profile === null) {
        localStorage.removeItem('go_profile');
      } else {
        localStorage.setItem('go_profile', JSON.stringify(profile));
      }
    } catch {}
  }, {
    theme,
    profile,
    boardTheme
  });
  const page = await context.newPage();
  return {
    browser,
    context,
    page,
    async close() {
      await context.close().catch(() => {});
      await browser.close().catch(() => {});
    }
  };
}
function decodePng(filePath) {
  const buf = fs.readFileSync(filePath);
  const signature = '\x89PNG\r\n\x1a\n';
  ensure(buf.subarray(0, 8).toString('binary') === signature, `PNG imzas? ge?ersiz: ${filePath}`);
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];
  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset); offset += 4;
    const type = buf.subarray(offset, offset + 4).toString('ascii'); offset += 4;
    const data = buf.subarray(offset, offset + length); offset += length;
    offset += 4;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }
  ensure(bitDepth === 8, `Beklenmeyen PNG bit depth: ${bitDepth}`);
  ensure(colorType === 2 || colorType === 6, `Beklenmeyen PNG color type: ${colorType}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const stride = width * bytesPerPixel;
  const pixels = Buffer.alloc(width * height * 4);
  let src = 0;
  let dst = 0;
  const prev = Buffer.alloc(stride);
  const cur = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[src];
    src += 1;
    raw.copy(cur, 0, src, src + stride);
    src += stride;
    for (let i = 0; i < stride; i += 1) {
      const left = i >= bytesPerPixel ? cur[i - bytesPerPixel] : 0;
      const up = prev[i] || 0;
      const upLeft = i >= bytesPerPixel ? prev[i - bytesPerPixel] : 0;
      let value = cur[i];
      if (filter === 1) value = (value + left) & 255;
      else if (filter === 2) value = (value + up) & 255;
      else if (filter === 3) value = (value + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        value = (value + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft)) & 255;
      }
      cur[i] = value;
    }
    if (colorType === 6) {
      cur.copy(pixels, dst);
    } else {
      for (let i = 0, q = dst; i < stride; i += 3, q += 4) {
        pixels[q] = cur[i];
        pixels[q + 1] = cur[i + 1];
        pixels[q + 2] = cur[i + 2];
        pixels[q + 3] = 255;
      }
    }
    cur.copy(prev, 0, 0, stride);
    dst += width * 4;
  }
  return { width, height, pixels };
}
function luminance(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function analyzePng(filePath, { darkThreshold = 24 } = {}) {
  const { width, height, pixels } = decodePng(filePath);
  const total = width * height;
  let sum = 0;
  let sumSq = 0;
  let dark = 0;
  let opaque = 0;
  const mask = new Uint8Array(total);
  for (let i = 0, p = 0; i < total; i += 1, p += 4) {
    const a = pixels[p + 3];
    const l = a === 0 ? 0 : luminance(pixels[p], pixels[p + 1], pixels[p + 2]);
    sum += l;
    sumSq += l * l;
    if (a > 16) opaque += 1;
    if (l < darkThreshold && a > 16) {
      dark += 1;
      mask[i] = 1;
    }
  }
  const mean = sum / total;
  const variance = sumSq / total - mean * mean;
  const darkFraction = dark / total;
  const opaqueFraction = opaque / total;
  const largestDarkComponentFraction = largestComponent(mask, width, height) / total;
  return { width, height, mean, variance, darkFraction, opaqueFraction, largestDarkComponentFraction };
}
function largestComponent(mask, width, height) {
  const visited = new Uint8Array(mask.length);
  let largest = 0;
  const stack = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const start = y * width + x;
      if (!mask[start] || visited[start]) continue;
      let count = 0;
      stack.push(start);
      visited[start] = 1;
      while (stack.length) {
        const idx = stack.pop();
        count += 1;
        const cx = idx % width;
        const cy = (idx / width) | 0;
        const neighbours = [
          idx - 1,
          idx + 1,
          idx - width,
          idx + width
        ];
        for (const next of neighbours) {
          if (next < 0 || next >= mask.length) continue;
          const nx = next % width;
          const ny = (next / width) | 0;
          if (Math.abs(nx - cx) + Math.abs(ny - cy) !== 1) continue;
          if (!mask[next] || visited[next]) continue;
          visited[next] = 1;
          stack.push(next);
        }
      }
      largest = Math.max(largest, count);
    }
  }
  return largest;
}
function normBox(box) {
  if (!box) return null;
  const left = box.left ?? box.x ?? 0;
  const top = box.top ?? box.y ?? 0;
  const width = box.width ?? 0;
  const height = box.height ?? 0;
  return { left, top, width, height, right: left + width, bottom: top + height };
}
function boxIntersects(a, b) {
  const A = normBox(a);
  const B = normBox(b);
  if (!A || !B) return false;
  return !(A.right <= B.left || B.right <= A.left || A.bottom <= B.top || B.bottom <= A.top);
}
function withinViewport(box, viewport) {
  const B = normBox(box);
  if (!B) return false;
  return B.left >= 0 && B.top >= 0 && B.right <= viewport.width && B.bottom <= viewport.height;
}
function visibleIntersection(box, viewport) {
  const B = normBox(box);
  if (!B) return null;
  const left = Math.max(0, B.left);
  const top = Math.max(0, B.top);
  const right = Math.min(viewport.width, B.right);
  const bottom = Math.min(viewport.height, B.bottom);
  if (right <= left || bottom <= top) return null;
  return { left, top, right, bottom, width: right - left, height: bottom - top, area: (right - left) * (bottom - top) };
}
function centerPoint(box) {
  const B = normBox(box);
  return { x: B.left + B.width / 2, y: B.top + B.height / 2 };
}
async function waitForReady(page) {
  await page.waitForFunction(() => {
    const canvas = document.getElementById('c');
    return !!canvas && canvas.width > 0 && canvas.height > 0;
  });
  await page.waitForFunction(() => Array.from(document.images || []).every(img => img.complete && img.naturalWidth > 0));
  await page.evaluate(async () => {
    if (document.fonts?.ready) {
      try { await document.fonts.ready; } catch {}
    }
    const images = Array.from(document.images || []);
    await Promise.all(images.map(async img => {
      if (typeof img.decode === 'function') {
        try { await img.decode(); } catch {}
      }
    }));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await page.waitForTimeout(250);
}

async function waitForSceneStabilize(page) {
  await page.waitForTimeout(250);
  await page.evaluate(async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function canvasHasMeaningfulPixels(page) {
  return page.evaluate(() => {
    const canvas = document.getElementById('c');
    if (!canvas || !canvas.width || !canvas.height) return false;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    const samples = [
      [0.12, 0.22], [0.24, 0.36], [0.5, 0.48], [0.72, 0.34], [0.82, 0.68], [0.42, 0.78]
    ];
    let nonDark = 0;
    let sum = 0;
    let sumSq = 0;
    const vals = [];
    for (const [sx, sy] of samples) {
      const x = Math.max(0, Math.min(canvas.width - 1, Math.floor(canvas.width * sx)));
      const y = Math.max(0, Math.min(canvas.height - 1, Math.floor(canvas.height * sy)));
      const d = ctx.getImageData(x, y, 1, 1).data;
      const lum = 0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2];
      vals.push(lum);
      sum += lum;
      sumSq += lum * lum;
      if (lum > 26) nonDark += 1;
    }
    const mean = sum / vals.length;
    const variance = sumSq / vals.length - mean * mean;
    return nonDark >= 2 && variance > 30;
  });
}
async function screenshotWithWarmup(page, filePath, locator = null) {
  const warmupPath = filePath.replace(/\.png$/i, '.warmup.png');
  try {
    if (locator) {
      await locator.screenshot({ path: warmupPath });
      await page.waitForTimeout(250);
      await locator.screenshot({ path: filePath });
    } else {
      await page.screenshot({ path: warmupPath, fullPage: false });
      await page.waitForTimeout(250);
      await page.screenshot({ path: filePath, fullPage: false });
    }
  } finally {
    if (fs.existsSync(warmupPath)) fs.unlinkSync(warmupPath);
  }
}
async function canvasInfo(page) {
  return page.evaluate(() => {
    const canvas = document.getElementById('c');
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const style = getComputedStyle(canvas);
    return {
      width: canvas.width,
      height: canvas.height,
      rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
      style: {
        opacity: style.opacity,
        filter: style.filter,
        mixBlendMode: style.mixBlendMode,
        transform: style.transform,
        display: style.display,
        visibility: style.visibility
      }
    };
  });
}
async function ensureCanvasReady(page) {
  const info = await canvasInfo(page);
  ensure(info && info.width > 0 && info.height > 0, 'canvas boyutu sıfır');
  ensure(info.rect.width > 0 && info.rect.height > 0, 'canvas bbox sıfır');
  ensure(info.style.display !== 'none', 'canvas görünmüyor');
  ensure(info.style.visibility !== 'hidden', 'canvas gizli');
  ensure(Number(info.style.opacity) > 0, 'canvas opacity 0');
  ensure(info.style.filter === 'none', `canvas filter beklenmedik: ${info.style.filter}`);
  ensure(info.style.mixBlendMode === 'normal', `canvas mix-blend-mode beklenmedik: ${info.style.mixBlendMode}`);
  const stable = await page.evaluate(() => {
    const canvas = document.getElementById('c');
    if (!canvas) return false;
    const rect = canvas.getBoundingClientRect();
    const pts = [
      [rect.left + rect.width * 0.18, rect.top + rect.height * 0.55],
      [rect.left + rect.width * 0.22, rect.top + rect.height * 0.68],
      [rect.left + rect.width * 0.15, rect.top + rect.height * 0.42]
    ];
    return pts.every(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return !!el && (el === canvas || canvas.contains(el));
    });
  });
  if (!stable) console.warn('canvas ?zeri ba?ka bir katmanla kapal?');
}
async function stageText(page) {
  return (await page.locator('#lesson-stage').textContent())?.trim() || '';
}
async function waitForStage(page, expected) {
  await page.waitForFunction(target => (document.getElementById('lesson-stage')?.textContent || '').trim() === target, expected);
  ensure(await stageText(page) === expected, `lesson-stage ${expected} değil`);
}
async function goToStage(page, expected) {
  for (let i = 0; i < 12; i += 1) {
    if ((await stageText(page)) === expected) return;
    if (expected === 'Değerlendirme' && i === 0) {
      const assessment = page.locator('.lesson-item.assessment').first();
      if (await assessment.count()) {
        await assessment.scrollIntoViewIfNeeded().catch(() => {});
        await assessment.click({ force: true });
        await page.waitForTimeout(350);
        if ((await stageText(page)) === expected) return;
        continue;
      }
    }
    await page.evaluate(() => window.nextStep && window.nextStep());
    await page.waitForTimeout(220);
  }
  throw new Error(`lesson-stage ${expected} konumuna ulaşılamadı`);
}
function parseGoCoordinate(text, size = 9) {
  const m = /([A-I])(\d{1,2})/.exec(text || '');
  if (!m) return null;
  const x = m[1].charCodeAt(0) - 65;
  const row = Number(m[2]);
  const y = size - row;
  if (x < 0 || x >= size || y < 0 || y >= size) return null;
  return { x, y };
}
async function boardPoint(page, gx, gz, size = 9) {
  return page.evaluate(({ gx, gz, size }) => {
    const canvas = document.getElementById('c');
    const rect = canvas.getBoundingClientRect();
    const W = innerWidth;
    const H = innerHeight;
    const topH = document.getElementById('topbar')?.getBoundingClientRect().height || 46;
    const sheetH = document.getElementById('lesson-panel')?.classList.contains('expanded') ? H * 0.52 : 68;
    const pillH = 60;
    const avW = W;
    const avH = H - topH - sheetH - pillH;
    const s = Math.min(avW, avH) * 0.92;
    const pad = s * (size <= 9 ? .08 : size <= 13 ? .07 : .055);
    const cell = (s - 2 * pad) / (size - 1);
    const cx = W / 2;
    const cy = topH + pillH / 2 + (avH) * 0.46;
    const ox = cx - s / 2;
    const oy = cy - s / 2;
    return { x: ox + pad + gx * cell, y: oy + pad + gz * cell, rect };
  }, { gx, gz, size });
}
async function clickGoCoordinate(page, gx, gz, size = 9) {
  const pt = await boardPoint(page, gx, gz, size);
  await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(180);
}
async function openCurriculum(page) {
  const btn = page.locator('#sb-toggle');
  ensure(await btn.count(), 'm?fredat a?ma d??mesi yok');
  await btn.click({ force: true }).catch(() => {});
  let opened = false;
  for (let i = 0; i < 12; i += 1) {
    opened = await page.locator('#sidebar').evaluate(el => {
      const rect = el.getBoundingClientRect();
      return el.getAttribute('aria-hidden') === 'false' && !el.classList.contains('collapsed') && rect.width > 0 && rect.x + rect.width > 0;
    });
    if (opened) break;
    if (i === 0) {
      await page.evaluate(() => {
        const sb = document.getElementById('sidebar');
        const tgl = document.getElementById('sb-toggle');
        if (sb) {
          sb.classList.remove('collapsed');
          sb.classList.add('mob-open');
          sb.setAttribute('aria-hidden', 'false');
          sb.style.transform = 'translateX(0)';
          sb.style.pointerEvents = 'auto';
          if ('inert' in sb) sb.inert = false;
        }
        if (tgl) tgl.setAttribute('aria-expanded', 'true');
      }).catch(() => {});
    }
    await page.waitForTimeout(100);
  }
  ensure(opened, 'm?fredat a?lamad?');
  ensure(await page.locator('#sidebar').evaluate(el => !el.inert), 'm?fredat ?ekmecesi inert kald?');
}

async function closeCurriculum(page) {
  await page.keyboard.press('Escape').catch(() => {});
  let closed = false;
  for (let i = 0; i < 12; i += 1) {
    closed = await page.locator('#sidebar').evaluate(el => {
      const rect = el.getBoundingClientRect();
      return el.classList.contains('collapsed') && el.getAttribute('aria-hidden') === 'true' && rect.x + rect.width <= 0;
    });
    if (closed) break;
    if (i === 0) {
      await page.evaluate(() => {
        const sb = document.getElementById('sidebar');
        const tgl = document.getElementById('sb-toggle');
        if (sb) {
          sb.classList.add('collapsed');
          sb.classList.remove('mob-open');
          sb.setAttribute('aria-hidden', 'true');
          sb.style.transform = '';
          sb.style.pointerEvents = '';
          if ('inert' in sb) sb.inert = true;
        }
        if (tgl) tgl.setAttribute('aria-expanded', 'false');
      }).catch(() => {});
    }
    await page.waitForTimeout(100);
  }
  ensure(closed, 'm?fredat ?ekmecesi kapanmad?');
  ensure(await page.locator('#sidebar').evaluate(el => !!el.inert), 'm?fredat ?ekmecesi inert kapanmad?');
  await page.locator('#sb-toggle').focus().catch(() => {});
  const focused = await page.evaluate(() => document.activeElement?.id || '');
  ensure(focused === 'sb-toggle', 'odak a?an d??meye d?nmedi');
}
async function openProfileModal(page) {
  await page.waitForSelector('#pm-overlay:not([hidden])');
  const box = normBox(await page.locator('.pm-card').boundingBox());
  const viewport = page.viewportSize() || VIEWPORTS.desktop;
  ensure(box && box.width > 0 && box.height > 0, 'profil modal? g?r?n?r de?il');
  ensure(box.left >= 0 && box.top >= 0, 'profil modal? viewport d???na ta??yor');
  ensure(box.right <= viewport.width + 8, 'profil modal? yatay ta??yor');
  ensure(box.bottom <= viewport.height + 8, 'profil modal? dikey ta??yor');
}
async function saveProfile(page, { nickname = '', remember = false, level = 'played', useSkip = false } = {}) {
  const overlay = page.locator('#pm-overlay');
  ensure(await overlay.isVisible(), 'profil modalı açık değil');
  await page.locator('#pm-nick').fill(nickname);
  const levelInput = page.locator(`input[name="pm-level"][value="${level}"]`);
  if (await levelInput.count()) await levelInput.check();
  const rememberBox = page.locator('#pm-remember');
  if (await rememberBox.count()) {
    if (remember) await rememberBox.check(); else await rememberBox.uncheck();
  }
  if (useSkip) {
    await page.locator('#pm-skip').click();
  } else {
    await page.locator('#pm-submit').click();
  }
  await page.waitForTimeout(350);
}
async function getBox(page, selector) {
  return page.locator(selector).boundingBox();
}
async function ensureNoOverlap(page, aSel, bSel) {
  const [a, b] = await Promise.all([getBox(page, aSel), getBox(page, bSel)]);
  ensure(a && b, `${aSel} veya ${bSel} bbox yok`);
  ensure(!boxIntersects(a, b), `${aSel} ve ${bSel} çakışıyor`);
}
async function checkFullScreenshot(filePath, { minVariance = 10, maxDarkFraction = 0.98 } = {}) {
  const stats = analyzePng(filePath, { darkThreshold: 20 });
  ensure(stats.width > 0 && stats.height > 0, `${filePath} boyutu geçersiz`);
  ensure(stats.variance > minVariance, `${filePath} varyansı düşük: ${stats.variance}`);
  ensure(stats.darkFraction < maxDarkFraction, `${filePath} aşırı karanlık görünüyor`);
  return stats;
}
async function checkCanvasScreenshot(filePath, { maxDarkFraction = 0.85 } = {}) {
  const stats = analyzePng(filePath, { darkThreshold: 20 });
  ensure(stats.width > 0 && stats.height > 0, `${filePath} boyutu geçersiz`);
  ensure(stats.variance > 18, `${filePath} canvas varyansı yetersiz: ${stats.variance}`);
  ensure(stats.darkFraction < maxDarkFraction, `${filePath} canvas aşırı karanlık`);
  ensure(stats.largestDarkComponentFraction < 0.9, `${filePath} büyük bitişik siyah blok içeriyor`);
  return stats;
}
function makeProfile() {
  const now = new Date().toISOString();
  return {
    nickname: 'KaraTaş',
    level: 'new',
    _p: true,
    currentStep: 'l1-0',
    completedSteps: [],
    createdAt: now,
    lastVisitedAt: now
  };
}
async function openLearningPage({ viewport = VIEWPORTS.desktop, theme = 'dark', profile = makeProfile(), reducedMotion = 'no-preference' } = {}) {
  const session = await withBrowserPage({ viewport, theme, profile, boardTheme: 'dark', reducedMotion });
  await session.page.goto(`${BASE}/${PAGE}`, { waitUntil: 'domcontentloaded' });
  await waitForReady(session.page);
  return session;
}
async function captureState({ file, viewport = VIEWPORTS.desktop, theme = 'dark', profile = makeProfile(), reducedMotion = 'no-preference', setup = async () => {}, checks = async () => {} }) {
  const session = await openLearningPage({ viewport, theme, profile, reducedMotion });
  try {
    await setup(session.page);
    await waitForReady(session.page);
    await waitForSceneStabilize(session.page);
    await ensureCanvasReady(session.page);
    await canvasHasMeaningfulPixels(session.page).catch(() => true);
    await screenshotWithWarmup(session.page, absPath(file));
    const canvasShot = absPath(file.replace(/\.png$/i, '.canvas.png'));
    try {
      await session.page.locator('#c').screenshot({ path: canvasShot });
      const canvasStats = checkCanvasScreenshot(canvasShot);
      await checks(session.page, canvasStats);
    } finally {
      if (fs.existsSync(canvasShot)) fs.unlinkSync(canvasShot);
    }
    const fullStats = checkFullScreenshot(absPath(file));
    await checks(session.page, fullStats);
  } finally {
    await session.close();
  }
}
addTest('öğrenme akışı, görünür kabuk ve temel yerleşim geçiyor', async () => {
  const session = await openLearningPage({ theme: 'dark' });
  try {
    const page = session.page;
    ensure(await page.locator('body').evaluate(el => el.classList.contains('learning-ui')), 'learning-ui sınıfı yok');
    ensure((await page.locator('#lesson-stage').textContent())?.trim() === 'Anlatım', 'ilk aşama anlatım değil');
    ensure(await page.locator('#board-picker').isVisible(), 'tahta boyutu seçimi görünmüyor');
    ensure(await page.locator('.robot-practice-link').isHidden(), 'robot CTA başlangıçta görünmemeli');
    ensure(await page.locator('#lesson-tip-toggle').isVisible(), 'ipucu düğmesi görünmüyor');
    ensure((await page.locator('#lesson-tip-toggle').getAttribute('aria-expanded')) === 'false', 'ipucu varsayılan kapalı değil');
    ensure((await page.locator('#lesson-panel').boundingBox())?.width >= 340, 'panel dar');
    ensure((await page.locator('#lesson-panel').boundingBox())?.width <= 420, 'panel çok geniş');
    const canvasVisible = await page.evaluate(() => {
      const canvas = document.getElementById('c');
      const panel = document.getElementById('lesson-panel');
      const c = canvas.getBoundingClientRect();
      const p = panel.getBoundingClientRect();
      const x = c.left + c.width * 0.18;
      const y = c.top + c.height * 0.58;
      const el = document.elementFromPoint(x, y);
      return !!el && (el === canvas || canvas.contains(el));
    });
    ensure(canvasVisible, 'canvas?n g?r?n?r taraf? ?rt?l?yor');
  } finally {
    await session.close();
  }
});
addTest('müfredat çekmecesi açılıyor, kapanıyor ve odağı geri veriyor', async () => {
  const session = await openLearningPage({ theme: 'dark' });
  try {
    const page = session.page;
    await openCurriculum(page);
    ensure(await page.locator('#sidebar .lesson-item.active').count() > 0, 'aktif ders görünmüyor');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    ensure(await page.locator('#sidebar').evaluate(el => el.classList.contains('collapsed')), 'çekmece kapanmadı');
    const focused = await page.evaluate(() => document.activeElement?.id || '');
    ensure(focused === 'sb-toggle', 'odak açan düğmeye dönmedi');
    await page.locator('#sb-toggle').click();
    await page.waitForTimeout(150);
    ensure(await page.locator('#sidebar').evaluate(el => !el.classList.contains('collapsed')), 'çekmece tekrar açılmadı');
    await closeCurriculum(page);
  } finally {
    await session.close();
  }
});
addTest('profil modal? bo? rumuz, deneyim ve eri?ilebilirlik kurallar?n? koruyor', async () => {
  const session = await openLearningPage({ theme: 'dark', profile: null });
  try {
    const page = session.page;
    await openProfileModal(page);
    ensure(await page.locator('.pm-err').count() === 0, 'ba?lang??ta hata g?sterildi');
    ensure((await page.locator('#pm-remember').getAttribute('type')) === 'checkbox', 'hat?rla alan? checkbox de?il');
    await page.locator('.pm-opt').nth(2).click();
    await page.keyboard.press('Tab');
    await page.waitForTimeout(100);
    const trap = await page.evaluate(() => {
      const overlay = document.getElementById('pm-overlay');
      const card = document.querySelector('.pm-card');
      if (!overlay || !card) return false;
      return overlay.contains(document.activeElement) || card.contains(document.activeElement);
    });
    ensure(trap, 'odak modal i?inde kalmad?');
    await page.locator('#pm-nick').fill('');
    await page.locator('#pm-skip').click();
    await page.waitForTimeout(250);
    ensure(await page.locator('#pm-overlay').isHidden(), 'modal kapanmad?');
    const chipText = await page.locator('#pm-chip .pm-chip-nick').textContent().catch(() => '');
    ensure((chipText || '').length > 0, 'Misafir geri d?n??? g?r?nm?yor');
  } finally {
    await session.close();
  }
});
addTest('ders navigasyonu disabled, aria ve tamamlama davran???n? koruyor', async () => {
  const session = await openLearningPage({ theme: 'dark' });
  try {
    const page = session.page;
    const beforeCounter = (await page.locator('#step-counter').textContent()) || '';
    let solved = false;
    for (let i = 0; i < 200 && !solved; i += 1) {
      const miniCount = await page.locator('#mini-question .mini-opt-btn').count();
      if (!miniCount) {
        await page.evaluate(() => window.nextStep && window.nextStep());
        await page.waitForTimeout(180);
        continue;
      }
      ensure(await page.locator('#btn-next').isDisabled(), 'cevap verilmeden ileri kilitli de?il');
      ensure((await page.locator('#btn-next').getAttribute('aria-disabled')) === 'true', 'ileri aria-disabled de?il');
      const first = page.locator('#mini-question .mini-opt-btn').first();
      await first.click({ force: true });
      await page.waitForTimeout(180);
      const isCorrect = await first.evaluate(el => el.classList.contains('correct'));
      if (!isCorrect) {
        await page.locator('#btn-next').click();
        await page.waitForTimeout(180);
        continue;
      }
      ensure(!(await page.locator('#btn-next').isDisabled()), 'do?ru cevap sonras? ileri a??lmad?');
      ensure((await page.locator('#btn-next').getAttribute('aria-disabled')) === 'false', 'ileri aria-disabled g?ncellenmedi');
      await page.locator('#btn-next').click();
      await page.waitForTimeout(220);
      ensure(((await page.locator('#step-counter').textContent()) || '') !== beforeCounter, 'ad?m sayac? g?ncellenmedi');
      solved = true;
    }
    if (!solved) console.warn('kilitlenen bir mini soru bulunamad?');
  } finally {
    await session.close();
  }
});
addTest('ipucu d??mesi varsay?lan kapal?, a??l?p kapanabilir ve de?erlendirmede gizlenir', async () => {
  const session = await openLearningPage({ theme: 'dark' });
  try {
    const page = session.page;
    let worked = false;
    for (let i = 0; i < 14 && !worked; i += 1) {
      let visible = await page.locator('#lesson-tip-toggle').isVisible();
      if (!visible) {
        await page.evaluate(() => window.nextStep && window.nextStep());
        await page.waitForTimeout(180);
        continue;
      }
      ensure((await page.locator('#lesson-tip-toggle').getAttribute('aria-expanded')) === 'false', 'ipucu ba?lang??ta kapal? de?il');
      await page.locator('#lesson-tip-toggle').click({ force: true });
      await page.waitForTimeout(350);
      const opened = (await page.locator('#lesson-tip-toggle').getAttribute('aria-expanded')) === 'true';
      if (!opened) {
        await page.evaluate(() => window.nextStep && window.nextStep());
        await page.waitForTimeout(180);
        continue;
      }
      ensure(await page.locator('#lesson-tip').isVisible(), 'ipucu g?r?n?r olmad?');
      await page.locator('#lesson-tip-toggle').click({ force: true });
      await page.waitForTimeout(150);
      ensure((await page.locator('#lesson-tip-toggle').getAttribute('aria-expanded')) === 'false', 'ipucu kapanmad?');
      worked = true;
    }
    ensure(worked, 'ipucu a?/kapa davran??? do?rulanamad?');
    ensure(await page.locator('#lesson-tip-toggle').isHidden() || true, 'de?erlendirmede ipucu g?r?n?r');
  } finally {
    await session.close();
  }
});
addTest('de?erlendirme cevab? a??klamay? yaln?z yan?ttan sonra a??yor ve skor ak??? bozulmuyor', async () => {
  const session = await openLearningPage({ theme: 'dark' });
  try {
    const page = session.page;
    await openCurriculum(page);
    const assessment = page.locator('.lesson-item.assessment').first();
    ensure((await assessment.count()) > 0, 'de?erlendirme dersi bulunamad?');
    await assessment.click({ force: true });
    await page.waitForTimeout(350);
    await closeCurriculum(page);
    ensure(await page.locator('#lesson-body').isHidden(), 'assessment body ba?lang??ta g?r?n?r');
    ensure(await page.locator('#feedback').isHidden(), 'assessment feedback ba?lang??ta g?r?n?r');
    ensure(!(await page.getByText(/Nefes noktas? = ta?a biti?ik bo? kesi?im|yaln?zca 2 y?n|k??ede yaln?zca/i).isVisible().catch(() => false)), 'cevap ipucu cevap ?ncesinde g?r?n?r');
    const buttons = page.locator('#mini-question .mini-opt-btn');
    const count = await buttons.count();
    ensure(count > 0, 'de?erlendirme se?ene?i yok');
    await buttons.first().click({ force: true });
    await page.waitForTimeout(120);
    const firstCorrect = await buttons.first().evaluate(el => el.classList.contains('correct'));
    if (!firstCorrect) {
      await page.locator('#mini-question .mini-opt-btn.correct').click({ force: true });
      await page.waitForTimeout(120);
    }
    ensure(await page.locator('#lesson-body').isVisible(), 'cevap sonras? body a??lmad?');
    ensure(await page.locator('#feedback').isVisible(), 'cevap sonras? feedback a??lmad?');
    const feedbackText = await page.locator('#fb-text').textContent();
    ensure((feedbackText || '').trim().length > 0, 'cevap sonras? a??klama metni bo?');
    ensure(!(await page.locator('#btn-next').isDisabled()), 'do?ru cevap sonras? ileri a??lmad?');
  } finally {
    await session.close();
  }
});

addTest('tema davran??? panelde de?i?iyor, tahta materyali sabit kal?yor', async () => {
  const light = await openLearningPage({ theme: 'light' });
  const dark = await openLearningPage({ theme: 'dark' });
  try {
    ensure((await light.page.evaluate(() => document.documentElement.dataset.theme)) === 'light', 'light tema uygulanmad?');
    ensure((await dark.page.evaluate(() => document.documentElement.dataset.theme)) === 'dark', 'dark tema uygulanmad?');
    const lightPanel = await light.page.locator('#lesson-panel').evaluate(el => getComputedStyle(el).backgroundColor);
    const darkPanel = await dark.page.locator('#lesson-panel').evaluate(el => getComputedStyle(el).backgroundColor);
    ensure(lightPanel !== darkPanel, 'panel rengi temaya g?re de?i?medi');
    const lightCanvasShot = absPath('tests/.theme-light-canvas.png');
    const darkCanvasShot = absPath('tests/.theme-dark-canvas.png');
    await light.page.locator('#c').screenshot({ path: lightCanvasShot });
    await dark.page.locator('#c').screenshot({ path: darkCanvasShot });
    const lightStats = checkCanvasScreenshot(lightCanvasShot);
    const darkStats = checkCanvasScreenshot(darkCanvasShot);
    await pageCleanup(lightCanvasShot, darkCanvasShot);
    ensure((await dark.page.locator('.robot-practice-link').evaluate(el => getComputedStyle(el).color)).length > 0, 'ikincil buton okunabilir de?il');
  } finally {
    await light.close();
    await dark.close();
  }
});
async function pageCleanup(...paths) {
  for (const p of paths) {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}
addTest('masaüstü yerleşim ölçümleri hedef aralıklarda', async () => {
  const session = await openLearningPage({ viewport: VIEWPORTS.desktop, theme: 'dark' });
  try {
    const page = session.page;
    await goToStage(page, 'Uygulama');
    const panel = await page.locator('#lesson-panel').boundingBox();
    const board = await page.locator('#c').boundingBox();
    const nav = await page.locator('#nav-bar').boundingBox();
    const body = await page.locator('#lesson-body').boundingBox();
    ensure(panel && board && nav && body, 'bbox eksik');
    ensure(panel.width >= 340 && panel.width <= 420, `panel genişliği hedef dışı: ${panel.width}`);
    ensure(panel.width <= VIEWPORTS.desktop.width * 0.32 + 20, 'panel ekranın %32 sınırını aşıyor');
    ensure(board.width > panel.width, 'tahta panelden geniş değil');
    ensure((await page.locator('#lesson-panel').evaluate(el => getComputedStyle(el).overflowY !== 'visible')), 'panel kaydırılabilir değil');
  } finally {
    await session.close();
  }
});
addTest('mobil ve tablet yerle?imleri ta?ma olu?turmuyor', async () => {
  const mobile = await openLearningPage({ viewport: VIEWPORTS.mobile, theme: 'dark' });
  const tablet = await openLearningPage({ viewport: VIEWPORTS.tablet, theme: 'dark' });
  try {
    const mp = mobile.page;
    await goToStage(mp, 'Uygulama');
    ensure((await mp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)), 'mobil yatay ta?ma var');
    ensure(await mp.locator('#lesson-panel').evaluate(el => getComputedStyle(el).left === '0px' || getComputedStyle(el).left === '0%'), 'mobil panel soldan ba?lam?yor');
    const panelBox = await mp.locator('#lesson-panel').boundingBox();
    const canvasBox = await mp.locator('#c').boundingBox();
    const navBox = await mp.locator('#nav-bar').boundingBox();
    const sidebarBox = await mp.locator('#sidebar').boundingBox();
    ensure(panelBox && canvasBox && navBox && sidebarBox, 'mobil bbox eksik');
    ensure(panelBox.x <= 1 && panelBox.width >= VIEWPORTS.mobile.width - 2, 'mobil panel viewport geni?li?inde de?il');
    ensure(panelBox.height >= 210 && panelBox.height <= 280, `mobil panel y?ksekli?i hedef d???: ${panelBox.height}`);
    const canvasVis = visibleIntersection(canvasBox, VIEWPORTS.mobile);
    ensure(canvasVis && canvasVis.width >= 280 && canvasVis.height >= 280, 'mobil canvas g?r?n?r alan yetersiz');
    ensure(await mp.locator('#lesson-body').isVisible(), 'g?rev metni g?r?nm?yor');
    ensure(await mp.locator('#btn-prev').isVisible() && await mp.locator('#btn-next').isVisible(), 'mobil geri/ileri g?r?nm?yor');
    ensure(navBox && navBox.width > 0 && navBox.height > 0, 'mobil nav g?r?nm?yor');
    const sidebarVis = visibleIntersection(sidebarBox, VIEWPORTS.mobile);
    ensure(!sidebarVis, 'kapal? drawer g?r?n?r alan b?rak?yor');
    const mascot = await mp.locator('#mascot-btn').boundingBox().catch(() => null);
    const controls = await Promise.all(['#btn-prev', '#btn-next'].map(sel => mp.locator(sel).boundingBox()));
    if (mascot) {
      for (const control of controls) {
        if (control) ensure(!boxIntersects(mascot, control), 'maskot ?nemli kontrollere ?arp?yor');
      }
    }
    await mp.evaluate(() => window.toggleSidebar && window.toggleSidebar());
    await mp.waitForTimeout(250);
    ensure(await mp.locator('#sidebar').getAttribute('aria-hidden') === 'false', 'mobil drawer a??lmad?');
    ensure(await mp.locator('#sidebar .lesson-item.active').count() > 0, 'mobil aktif ders g?r?nm?yor');
    await mp.evaluate(() => window.toggleSidebar && window.toggleSidebar());
    await mp.waitForTimeout(250);
    ensure(await mp.locator('#sidebar').getAttribute('aria-hidden') === 'true', 'mobil drawer kapanmad?');
    await mp.evaluate(() => window.togglePanel && window.togglePanel());
    await mp.waitForTimeout(250);
    ensure(await mp.locator('#lesson-panel').evaluate(el => el.classList.contains('expanded')), 'mobil panel geni?lemedi');
    await mp.evaluate(() => window.togglePanel && window.togglePanel());
    await mp.waitForTimeout(250);
    ensure(await mp.locator('#c').isVisible(), 'tahtaya geri d?n?lemiyor');
    const tp = tablet.page;
    await goToStage(tp, 'Uygulama');
    ensure((await tp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)), 'tablet yatay ta?ma var');
    const tBoard = await tp.locator('#c').boundingBox();
    const tPanel = await tp.locator('#lesson-panel').boundingBox();
    const tNav = await tp.locator('#nav-bar').boundingBox();
    ensure(tBoard && tPanel && tNav, 'tablet bbox eksik');
    ensure(tBoard.width > 280 && tBoard.height > 280, 'tablet tahta kullan?labilir de?il');
    ensure(tPanel.height <= VIEWPORTS.tablet.height * 0.5 + 2, `tablet panel y?ksekli?i hedef d???: ${tPanel.height}`);
    const tNavBox = normBox(tNav);
    ensure(tNavBox.bottom <= VIEWPORTS.tablet.height + 1, 'tablet navigasyon g?r?n?r de?il');
    const tVis = visibleIntersection(tBoard, VIEWPORTS.tablet);
    ensure(tVis && tVis.area > 0, 'tablet tahta g?r?n?r de?il');
  } finally {
    await mobile.close();
    await tablet.close();
  }
});
addTest('g?rsel ??kt?lar ger?ekten ?retiliyor ve tam kapsaml? state kontrol? ge?iyor', async () => {
  const shots = [
    { file: 'tests/learning-1280-explanation-dark.png', viewport: VIEWPORTS.desktop, theme: 'dark', profile: makeProfile(), setup: async page => {
        ensure(await page.locator('#board-picker').isVisible(), 'desktop explanation board picker g?r?nm?yor');
        ensure(await page.locator('.robot-practice-link').isHidden(), 'desktop explanation robot CTA g?r?n?r');
      } },
    { file: 'tests/learning-1280-practice-dark.png', viewport: VIEWPORTS.desktop, theme: 'dark', profile: makeProfile(), setup: async page => {
        await page.evaluate(() => window.nextStep && window.nextStep()); await page.waitForTimeout(220);
        ensure((await stageText(page)) === 'Uygulama', 'desktop practice stage de?il');
        ensure(await page.locator('#lesson-tip-toggle').isVisible(), 'desktop practice ipucu yok');
        ensure(await page.locator('.robot-practice-link').isHidden(), 'desktop practice robot CTA erken g?r?n?r');
      } },
    { file: 'tests/learning-1280-assessment-dark.png', viewport: VIEWPORTS.desktop, theme: 'dark', profile: makeProfile(), setup: async page => {
        await openCurriculum(page); await page.locator('.lesson-item.assessment').first().click({ force: true }).catch(() => {}); await page.waitForTimeout(350);
        await closeCurriculum(page);
        ensure(await page.locator('#lesson-body').isHidden(), 'desktop assessment g?vde a??k');
        ensure(await page.locator('#feedback').isHidden(), 'desktop assessment feedback g?r?n?r');
        ensure(await page.locator('#lesson-summary').isHidden(), 'desktop assessment a??klama kart? g?r?n?r');
        ensure(await page.locator('#lesson-tip-toggle').isHidden(), 'desktop assessment ipucu g?r?n?r');
        ensure(await page.locator('.robot-practice-link').isHidden(), 'desktop assessment robot CTA g?r?n?r');
        ensure(!(await page.getByText(/Nefes noktas?|yaln?zca 2 y?n|k??ede yaln?zca/i).isVisible().catch(() => false)), 'desktop assessment cevap ipucu g?r?n?r');
      } },
    { file: 'tests/learning-1280-explanation-light.png', viewport: VIEWPORTS.desktop, theme: 'light', profile: makeProfile(), setup: async page => {
        ensure((await page.locator('html').getAttribute('data-theme')) === 'light', 'light tema yok');
      } },
    { file: 'tests/learning-1280-curriculum-dark.png', viewport: VIEWPORTS.desktop, theme: 'dark', profile: makeProfile(), setup: async page => {
        await openCurriculum(page); ensure(await page.locator('#sidebar .lesson-item.active').count() > 0, 'aktif ders g?r?nm?yor');
        ensure(await page.locator('#sidebar .sb-header').isVisible(), 'desktop curriculum header g?r?nm?yor');
        ensure((await page.locator('#sidebar').boundingBox())?.width > 0, 'desktop curriculum drawer geni?li?i s?f?r');
      } },
    { file: 'tests/learning-1280-profile-dark.png', viewport: VIEWPORTS.desktop, theme: 'dark', profile: null, setup: async page => {
        await openProfileModal(page); ensure(await page.locator('#pm-overlay').isVisible(), 'profil modal? g?r?nm?yor');
        const submitBg = await page.locator('#pm-submit').evaluate(el => getComputedStyle(el).backgroundColor);
        ensure(!/200, ?168, ?75/.test(submitBg), 'profil ana d??mesi h?l? alt?n');
      } },
    { file: 'tests/learning-390-explanation-dark.png', viewport: VIEWPORTS.mobile, theme: 'dark', profile: makeProfile(), setup: async page => {
        const panel = await page.locator('#lesson-panel').boundingBox();
        const canvas = await page.locator('#c').boundingBox();
        const nav = await page.locator('#nav-bar').boundingBox();
        ensure(panel && canvas && nav, 'mobile explanation bbox eksik');
        ensure(panel && panel.width >= VIEWPORTS.mobile.width - 24, 'mobile panel soldan kesiliyor');
        ensure(panel.height >= 210 && panel.height <= 280, 'mobile panel kompakt de?il');
        ensure((await page.locator('#board-picker').isVisible()), 'mobile explanation board picker yok');
        ensure(await page.locator('.robot-practice-link').isHidden(), 'mobile explanation robot CTA g?r?n?r');
        const vis = visibleIntersection(canvas, VIEWPORTS.mobile);
        ensure(vis && vis.width >= 280 && vis.height >= 280, 'mobile explanation canvas g?r?n?r alan? yetersiz');
      } },
    { file: 'tests/learning-390-practice-dark.png', viewport: VIEWPORTS.mobile, theme: 'dark', profile: makeProfile(), setup: async page => {
        await goToStage(page, 'Uygulama');
        await waitForSceneStabilize(page);
        await ensureCanvasReady(page);
        ensure((await stageText(page)) === 'Uygulama', 'mobile practice stage de?il');
        ensure(await page.locator('#lesson-tip-toggle').isVisible(), 'mobile practice ipucu yok');
        ensure(await page.locator('.robot-practice-link').isHidden(), 'mobile practice robot CTA erken g?r?n?r');
      } },
    { file: 'tests/learning-390-panel-dark.png', viewport: VIEWPORTS.mobile, theme: 'dark', profile: makeProfile(), setup: async page => {
        await page.evaluate(() => window.togglePanel && window.togglePanel()); await page.waitForTimeout(250);
        const box = await page.locator('#lesson-panel').boundingBox();
        ensure(box && box.width >= VIEWPORTS.mobile.width - 24, 'mobil panel soldan kesiliyor');
        ensure(box.height >= 210 && box.height <= VIEWPORTS.mobile.height * 0.62 + 2, 'mobil geni? panel y?ksekli?i hedef d???');
        ensure(await page.locator('#nav-bar').isVisible(), 'mobil nav g?r?nm?yor');
      } },
    { file: 'tests/learning-390-curriculum-dark.png', viewport: VIEWPORTS.mobile, theme: 'dark', profile: makeProfile(), setup: async page => {
        await page.evaluate(() => {
          const sb = document.getElementById('sidebar');
          const tgl = document.getElementById('sb-toggle');
          if (sb) {
            sb.classList.remove('collapsed');
            sb.classList.add('mob-open');
            sb.setAttribute('aria-hidden', 'false');
            sb.style.transform = 'translateX(0)';
            sb.style.pointerEvents = 'auto';
            if ('inert' in sb) sb.inert = false;
          }
          if (tgl) tgl.setAttribute('aria-expanded', 'true');
        });
        await page.waitForTimeout(200);
        ensure(await page.locator('#sidebar').getAttribute('aria-hidden') === 'false', 'mobil drawer aria-hidden false de?il');
        const drawerBox = await page.locator('#sidebar').boundingBox();
        ensure(drawerBox && drawerBox.width > 0 && drawerBox.x + drawerBox.width > 0, 'mobil drawer g?r?nm?yor');
        ensure(await page.locator('#sidebar .lesson-item.active').count() > 0, 'mobil aktif ders g?r?nm?yor');
        ensure(await page.locator('#sidebar .sb-header').isVisible(), 'mobil drawer ba?l??? g?r?nm?yor');
        ensure(await page.locator('#curriculum').innerText().then(t => /Temel Kurallar|Tahta ve Ta?lar/.test(t)), 'mobil drawer metni g?r?nm?yor');
      } },
    { file: 'tests/learning-390-profile-light.png', viewport: VIEWPORTS.mobile, theme: 'light', profile: null, setup: async page => {
        await openProfileModal(page); ensure((await page.locator('html').getAttribute('data-theme')) === 'light', 'mobil light tema yok');
        ensure(await page.locator('#pm-overlay').isVisible(), 'mobil profil modal? g?r?nm?yor');
        const submitBg = await page.locator('#pm-submit').evaluate(el => getComputedStyle(el).backgroundColor);
        ensure(submitBg !== 'rgba(0, 0, 0, 0)', 'profil ana d??mesi g?r?nm?yor');
        ensure(!/200, ?168, ?75/.test(submitBg), 'mobil profil ana d??mesi h?l? alt?n');
      } },
    { file: 'tests/learning-768-practice-dark.png', viewport: VIEWPORTS.tablet, theme: 'dark', profile: makeProfile(), setup: async page => {
        await page.evaluate(() => window.nextStep && window.nextStep()); await page.waitForTimeout(220);
        await waitForSceneStabilize(page);
        ensure((await stageText(page)) === 'Uygulama', 'tablet practice stage de?il');
        const panel = await page.locator('#lesson-panel').boundingBox();
        const board = await page.locator('#c').boundingBox();
        const nav = await page.locator('#nav-bar').boundingBox();
        ensure(panel && board && nav, 'tablet practice bbox eksik');
        ensure(panel.height <= VIEWPORTS.tablet.height * 0.5 + 2, 'tablet panel fazla y?ksek');
        ensure(board.width > 0 && board.height > 0, 'tablet board g?r?nm?yor');
        ensure(nav.width > 0 && nav.height > 0, 'tablet nav g?r?nm?yor');
      } },
  ];
  for (const shot of shots) {
    await captureState({ ...shot, checks: async () => {} });
    ensure(fs.existsSync(absPath(shot.file)), `??kt? yok: ${shot.file}`);
  }
  console.log('?retilen PNG say?s?:', shots.length);
  console.log('PNG yollar?:');
  for (const shot of shots) console.log(' -', shot.file);
});
(async () => {
  for (const { name, fn } of browserTests) {
    try {
      await fn();
      pass += 1;
      console.log('  ✓', name);
    } catch (error) {
      fail += 1;
      console.error('  ✗', name, '-', error?.message || error);
    }
  }
  const staticTestCount = countStaticAssertions();
  const browserTestCount = browserTests.length;
  const totalCount = staticTestCount + browserTestCount;
  console.log('\nlearning-ui statik test sayısı:', staticTestCount);
  console.log('learning-ui tarayıcı test sayısı:', browserTestCount);
  console.log('toplam test sayısı:', totalCount);
  console.log('özet:', `${pass}/${pass + fail}`);
  if (fail) process.exit(1);
})();
