/**
 * boardRenderer arayüzü:
 *   render(container, boardData)
 *   clear(container)
 *
 * boardData: { size, stones, markers, ko, turn }
 *
 * Faz A: SVG uygulaması (read-only).
 * Faz B+: canvas uygulaması veya başka bir renderer geçilebilir;
 *          çağıran kod bu modülü import etmeye devam eder.
 */

const NS = 'http://www.w3.org/2000/svg';
const VIEWBOX = 360;
const PAD = 24;
const GRID = VIEWBOX - PAD * 2; // 312

// 9x9 hoshi noktaları — merkez relative index'ler (0-tabanlı)
const HOSHI = {
  9:  [[2,2],[2,6],[6,2],[6,6],[4,4]],
  13: [[3,3],[3,9],[9,3],[9,9],[6,6]],
  19: [[3,3],[3,9],[3,15],[9,3],[9,9],[9,15],[15,3],[15,9],[15,15]],
};

function cell(size) { return GRID / (size - 1); }
function px(idx, size) { return PAD + idx * cell(size); }

function svgEl(tag, attrs) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function buildSvg(size) {
  const svg = svgEl('svg', {
    viewBox: `0 0 ${VIEWBOX} ${VIEWBOX}`,
    xmlns: NS,
    role: 'img',
    'aria-label': `${size}×${size} Go tahtası`,
    style: 'width:100%;height:100%;display:block;',
  });

  // Ahşap zemin
  const bg = svgEl('rect', {
    x: 0, y: 0, width: VIEWBOX, height: VIEWBOX,
    fill: 'var(--board-wood, #d4a96a)',
    rx: 4,
  });
  svg.appendChild(bg);

  // Tahta iç alanı (biraz daha koyu)
  const inner = svgEl('rect', {
    x: PAD - 4, y: PAD - 4,
    width: GRID + 8, height: GRID + 8,
    fill: 'var(--board-wood-inner, #c9994e)',
    rx: 2,
  });
  svg.appendChild(inner);

  // Grid çizgileri
  const g = svgEl('g', { stroke: 'var(--board-line, #7a5c2e)', 'stroke-width': '0.8', opacity: '0.85' });
  for (let i = 0; i < size; i++) {
    const c = px(i, size);
    g.appendChild(svgEl('line', { x1: c, y1: PAD, x2: c, y2: PAD + GRID }));
    g.appendChild(svgEl('line', { x1: PAD, y1: c, x2: PAD + GRID, y2: c }));
  }
  svg.appendChild(g);

  // Hoshi noktaları
  const points = HOSHI[size] ?? [];
  const hoshiG = svgEl('g', { fill: 'var(--board-line, #7a5c2e)' });
  for (const [x, y] of points) {
    hoshiG.appendChild(svgEl('circle', {
      cx: px(x, size), cy: px(y, size), r: cell(size) * 0.1,
    }));
  }
  svg.appendChild(hoshiG);

  // Koordinat etiketleri
  const COLS = 'ABCDEFGHJKLMNOPQRST';
  const labelG = svgEl('g', {
    'font-family': 'monospace',
    'font-size': Math.max(8, cell(size) * 0.38),
    fill: 'var(--board-label, #5a3e1e)',
    'text-anchor': 'middle',
  });
  for (let i = 0; i < size; i++) {
    const c = px(i, size);
    // sütun harfleri (üst)
    const col = svgEl('text', { x: c, y: PAD - 8, 'dominant-baseline': 'auto' });
    col.textContent = COLS[i];
    labelG.appendChild(col);
    // satır rakamları (sol)
    const row = svgEl('text', { x: PAD - 8, y: c, 'dominant-baseline': 'middle', 'text-anchor': 'end' });
    row.textContent = String(size - i);
    labelG.appendChild(row);
  }
  svg.appendChild(labelG);

  return svg;
}

function renderStones(svg, stones, size) {
  const r = cell(size) * 0.43;
  const stonesG = svgEl('g', { 'class': 'stones' });
  for (const s of (stones ?? [])) {
    const cx = px(s.x, size);
    const cy = px(s.y, size);
    if (s.color === 'black') {
      const c = svgEl('circle', { cx, cy, r, fill: '#1a1a1a', stroke: '#000', 'stroke-width': '0.5' });
      stonesG.appendChild(c);
    } else {
      const c = svgEl('circle', { cx, cy, r, fill: '#f5f0e8', stroke: '#999', 'stroke-width': '0.8' });
      stonesG.appendChild(c);
    }
  }
  svg.appendChild(stonesG);
}

function renderMarkers(svg, markers, size) {
  if (!markers?.length) return;
  const g = svgEl('g', { 'class': 'markers', stroke: '#2255cc', fill: 'none', 'stroke-width': '1.5' });
  const r = cell(size) * 0.26;
  for (const m of markers) {
    const cx = px(m.x, size);
    const cy = px(m.y, size);
    switch (m.type) {
      case 'triangle': {
        const h = r * 1.5;
        const pts = `${cx},${cy - h} ${cx - h * 0.87},${cy + h * 0.5} ${cx + h * 0.87},${cy + h * 0.5}`;
        g.appendChild(svgEl('polygon', { points: pts }));
        break;
      }
      case 'square':
        g.appendChild(svgEl('rect', { x: cx - r, y: cy - r, width: r * 2, height: r * 2 }));
        break;
      case 'circle':
        g.appendChild(svgEl('circle', { cx, cy, r }));
        break;
      default:
        g.appendChild(svgEl('line', { x1: cx - r, y1: cy - r, x2: cx + r, y2: cy + r }));
        g.appendChild(svgEl('line', { x1: cx + r, y1: cy - r, x2: cx - r, y2: cy + r }));
    }
  }
  svg.appendChild(g);
}

function renderKo(svg, ko, size) {
  if (!ko) return;
  const cx = px(ko.x, size);
  const cy = px(ko.y, size);
  const r = cell(size) * 0.2;
  svg.appendChild(svgEl('rect', {
    x: cx - r, y: cy - r, width: r * 2, height: r * 2,
    fill: '#cc3333', opacity: '0.75',
  }));
}

// ── Dışa aktarılan arayüz ────────────────────────────────────────────

export const svgBoardRenderer = {
  render(container, boardData) {
    const { size = 9, stones = [], markers = [], ko = null } = boardData ?? {};
    const svg = buildSvg(size);
    renderStones(svg, stones, size);
    renderMarkers(svg, markers, size);
    renderKo(svg, ko, size);
    container.innerHTML = '';
    container.appendChild(svg);
  },

  clear(container) {
    container.innerHTML = '';
  },
};

export function createBoardRenderer(/* type = 'svg' */) {
  // Faz B: if (type === 'canvas') return canvasBoardRenderer;
  return svgBoardRenderer;
}
