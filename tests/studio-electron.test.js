import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ipcChannelsModule from '../desktop/ipc/ipcChannels.cjs';
import studioApiModule from '../desktop/ipc/studioApi.cjs';
import pathPolicyModule from '../desktop/ipc/pathPolicy.cjs';
import settingsStoreModule from '../desktop/ipc/settingsStore.cjs';
import fileHandlersModule from '../desktop/ipc/fileHandlers.cjs';
import { createStudioBoardAdapter } from '../desktop/ipc/studioBoardAdapter.js';
import { BoardState } from '../core/boardState.js';
import { createDocument } from '../studio/model/studioDocument.js';

const { STUDIO_CHANNELS } = ipcChannelsModule;
const { createStudioApi } = studioApiModule;
const {
  getSuggestedWorkspaceFolder,
  resolveAgstudioPath,
  isAgstudioPath,
} = pathPolicyModule;
const {
  loadStudioSettings,
  saveStudioSettings,
  writeJsonAtomic,
} = settingsStoreModule;
const {
  listAgstudioDocuments,
  readAgstudioDocument,
  resolveDocumentPath,
  writeAgstudioDocument,
} = fileHandlersModule;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function main() {
  await testIpcContract();
  await testPathPolicy();
  await testSettingsStore();
  await testFileHandlers();
  await testBoardAdapter();
  await testSecurityTexts();
  await testModeSelector();
  await testMoveTreeVisual();
  await testMoveModeClick();
  console.log('studio-electron.test.js: ok');
}

async function testIpcContract() {
  const calls = [];
  const subscriptions = [];
  const ipcRenderer = {
    invoke(channel, ...args) {
      calls.push({ channel, args });
      return Promise.resolve({ channel, args });
    },
    on(channel, listener) {
      subscriptions.push({ channel, listener });
    },
    removeListener(channel, listener) {
      const index = subscriptions.findIndex(entry => entry.channel === channel && entry.listener === listener);
      if (index !== -1) subscriptions.splice(index, 1);
    },
  };

  const api = createStudioApi(ipcRenderer);
  await api.boot();
  await api.openFilePath('sample.agstudio');
  await api.listCandidates();
  await api.openCandidatePreview('candidate-1');
  await api.openCandidateDocument('candidate-1');
  const off = api.onDocumentOpened(() => {});
  assert.equal(subscriptions[0].channel, STUDIO_CHANNELS.DOCUMENT_OPENED);
  off();
  assert.equal(calls[0].channel, STUDIO_CHANNELS.BOOT);
  assert.equal(calls[1].channel, STUDIO_CHANNELS.OPEN_FILE_PATH);
  assert.equal(calls[2].channel, STUDIO_CHANNELS.LIST_CANDIDATES);
  assert.equal(calls[3].channel, STUDIO_CHANNELS.OPEN_CANDIDATE_PREVIEW);
  assert.equal(calls[4].channel, STUDIO_CHANNELS.OPEN_CANDIDATE_DOCUMENT);
}

async function testPathPolicy() {
  const workspace = path.join(os.tmpdir(), `agstudio-path-${Date.now()}`);
  const suggested = getSuggestedWorkspaceFolder('C:\\Users\\Ekim\\Documents');
  assert.match(suggested, /AntalyaGo Studio$/);
  assert.equal(resolveAgstudioPath(workspace, 'lesson-one'), path.join(workspace, 'lesson-one.agstudio'));
  assert.equal(resolveAgstudioPath(workspace, '../evil'), null);
  assert.equal(isAgstudioPath(path.join(workspace, 'lesson-one.agstudio'), workspace), true);
  assert.equal(isAgstudioPath(path.join(workspace, 'evil.txt'), workspace), false);
}

async function testSettingsStore() {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'agstudio-settings-'));
  const userData = path.join(base, 'user');
  const documents = path.join(base, 'documents');
  const settingsPath = path.join(userData, 'studio-settings.json');
  const next = {
    workspaceFolder: path.join(documents, 'AntalyaGo Studio'),
    workspaceConfirmed: true,
    contentProducerMode: false,
    recentDocuments: ['a.agstudio'],
    lastOpenedDocument: 'a.agstudio',
    theme: 'dark',
  };

  const saved = await saveStudioSettings(userData, documents, next);
  assert.equal(saved.workspaceFolder, next.workspaceFolder);
  assert.equal(saved.workspaceConfirmed, true);
  assert.equal(await fs.stat(settingsPath).then(() => true).catch(() => false), true);

  const loaded = await loadStudioSettings(userData, documents);
  assert.equal(loaded.workspaceFolder, next.workspaceFolder);
  assert.equal(loaded.contentProducerMode, false);
  await writeJsonAtomic(path.join(base, 'atomic.json'), { ok: true });
  const atomic = JSON.parse(await fs.readFile(path.join(base, 'atomic.json'), 'utf8'));
  assert.equal(atomic.ok, true);
}

async function testFileHandlers() {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'agstudio-files-'));
  const workspace = path.join(base, 'workspace');
  const document = createDocument({
    id: 'file-handler-check',
    title: 'File handler check',
    slug: 'file-handler-check',
    summary: 'Round-trip test for .agstudio writes.',
  });
  const filePath = resolveDocumentPath(workspace, document.slug);
  assert.ok(filePath && filePath.endsWith('.agstudio'));

  await writeAgstudioDocument(filePath, document);
  const loaded = await readAgstudioDocument(filePath);
  assert.equal(loaded.title, document.title);
  const docs = await listAgstudioDocuments(workspace);
  assert.equal(docs[0].filePath, filePath);
}

async function testBoardAdapter() {
  const adapter = createStudioBoardAdapter(BoardState);
  const boardState = adapter.fromDocumentBoard({
    size: 9,
    turn: 'white',
    ko: { x: 1, y: 1 },
    stones: [{ x: 0, y: 0, color: 'black' }],
  });

  assert.equal(boardState.size, 9);
  assert.equal(boardState.turn, 'white');
  assert.equal(boardState.koPoint?.x, 1);
  assert.equal(boardState.stones.length, 1);

  const roundTrip = adapter.toDocumentBoard(boardState);
  assert.equal(roundTrip.stones[0].color, 'black');
  assert.equal(roundTrip.turn, 'white');

  const merged = adapter.mergeDocumentBoard(
    {
      size: 9,
      markers: [{ id: 'm1', type: 'triangle', point: { x: 2, y: 2 } }],
      regions: [{ id: 'r1', type: 'region', points: [{ x: 1, y: 1 }] }],
      viewport: { x: 0, y: 0, scale: 1.5 },
      customField: 'keep-me',
    },
    roundTrip,
  );
  assert.equal(merged.size, 9);
  assert.equal(merged.turn, 'white');
  assert.equal(merged.ko?.x, 1);
  assert.equal(merged.stones[0].color, 'black');
  assert.equal(merged.markers[0].id, 'm1');
  assert.equal(merged.regions[0].id, 'r1');
  assert.equal(merged.viewport.scale, 1.5);
  assert.equal(merged.customField, 'keep-me');
}

async function testModeSelector() {
  const html = await fs.readFile(path.join(root, 'desktop', 'index.html'), 'utf8');
  assert.ok(html.includes('data-studio-mode="review"'), 'body data-studio-mode="review" mevcut');
  assert.ok(html.includes('data-mode-toolbar'), 'data-mode-toolbar mevcut');
  assert.ok(html.includes('data-mode="review"'), 'review modu mevcut');
  assert.ok(html.includes('data-mode="move"'), 'move modu mevcut');
  assert.ok(html.includes('data-mode="setup"'), 'setup modu mevcut');
  assert.ok(html.includes('data-mode="marker"'), 'marker modu mevcut');

  const app = await fs.readFile(path.join(root, 'desktop', 'renderer', 'app.mjs'), 'utf8');
  assert.ok(app.includes('VALID_MODES'), 'VALID_MODES sabiti mevcut');
  assert.ok(app.includes("activeMode: 'review'"), 'activeMode default review mevcut');
  assert.ok(app.includes('setActiveMode'), 'setActiveMode fonksiyonu mevcut');
  assert.ok(app.includes('renderModeSelector'), 'renderModeSelector fonksiyonu mevcut');
}

async function testMoveTreeVisual() {
  // Saf düzen algoritması testleri (DOM gerektirmez)
  function buildLayout(root) {
    const pos = new Map();
    function layout(node, c, r) {
      pos.set(node.id, { c, r });
      if (!node.children?.length) return r;
      const pref = node.children.find(n => n.id === node.preferredChildId) ?? node.children[0];
      const rest = node.children.filter(n => n !== pref);
      let bot = layout(pref, c + 1, r);
      for (const ch of rest) bot = layout(ch, c + 1, bot + 1);
      return bot;
    }
    layout(root, 0, 0);
    return pos;
  }

  // Test 1: tek zincir → hepsi satır 0'da
  {
    const r = { id: 'r', preferredChildId: 'a', children: [
      { id: 'a', parentId: 'r', preferredChildId: 'b', children: [
        { id: 'b', parentId: 'a', children: [] },
      ]},
    ]};
    const pos = buildLayout(r);
    assert.equal(pos.get('r').r, 0, 'kök satır 0');
    assert.equal(pos.get('a').r, 0, 'tercih edilen çocuk satır 0');
    assert.equal(pos.get('b').r, 0, 'ana hat sonu satır 0');
    assert.equal(pos.get('r').c, 0, 'kök sütun 0');
    assert.equal(pos.get('a').c, 1, 'a sütun 1');
    assert.equal(pos.get('b').c, 2, 'b sütun 2');
  }

  // Test 2: varyasyon bir alt satıra iner
  {
    const r = { id: 'r', preferredChildId: 'a', children: [
      { id: 'a', parentId: 'r', preferredChildId: null, children: [
        { id: 'b', parentId: 'a', children: [] },
        { id: 'c', parentId: 'a', children: [] },
      ]},
    ]};
    const pos = buildLayout(r);
    assert.equal(pos.get('b').r, 0, 'tercih edilen çocuk ana hatta');
    assert.equal(pos.get('c').r, 1, 'varyasyon alt satıra iner');
    assert.equal(pos.get('b').c, pos.get('c').c, 'aynı sütunda farklı satır');
  }

  // Test 3: preferredChildId ana hattı belirler
  {
    const r = { id: 'r', preferredChildId: 'main', children: [
      { id: 'main', parentId: 'r', children: [] },
      { id: 'var',  parentId: 'r', children: [] },
    ]};
    const mainline = new Set(['r']);
    let cur = r;
    while (cur?.preferredChildId) {
      const child = cur.children?.find(n => n.id === cur.preferredChildId);
      if (!child || mainline.has(child.id)) break;
      mainline.add(child.id);
      cur = child;
    }
    assert.ok(mainline.has('main'), 'preferred child ana hatta');
    assert.ok(!mainline.has('var'), 'diğer child varyasyon');
  }

  // Test 4: app.mjs SVG ağacını oluşturur
  const appSrc = await fs.readFile(path.join(root, 'desktop', 'renderer', 'app.mjs'), 'utf8');
  assert.ok(appSrc.includes('buildMoveTreeSvg'), 'buildMoveTreeSvg fonksiyonu mevcut');
  assert.ok(appSrc.includes('tree-node__stone'), 'SVG node sınıfları mevcut');
  assert.ok(appSrc.includes("'Pas'"), "pass node için 'Pas' etiketi mevcut");
  assert.ok(!appSrc.includes('renderTreeBranch'), 'eski renderTreeBranch kaldırıldı');
  assert.ok(!appSrc.includes('move-tree-item__select'), 'eski liste elemanları kaldırıldı');

  // Test 5: HTML canvas listesiz, data-node-id SVG'de
  const htmlSrc = await fs.readFile(path.join(root, 'desktop', 'index.html'), 'utf8');
  assert.ok(!htmlSrc.includes('data-move-tree-list'), 'eski liste elementi kaldırıldı');
  assert.ok(htmlSrc.includes('data-move-tree-canvas'), 'SVG canvas container mevcut');

  // Test 6: S2A — tek click yolu (per-node listener yok)
  assert.ok(!appSrc.includes("g.addEventListener('click'"), 'SVG node başına per-node click listener yok');
  assert.ok(appSrc.includes("elements.treeViewport.addEventListener('click'"), 'viewport delegated click mevcut');

  // Test 7: S2A — breadcrumb chip'leri tıklanabilir
  assert.ok(appSrc.includes("elements.treePath.addEventListener('click'"), 'treePath delegated click mevcut');
  const treePathIdx = appSrc.indexOf("elements.treePath.addEventListener('click'");
  const viewportIdx = appSrc.indexOf("elements.treeViewport.addEventListener('click'");
  assert.ok(treePathIdx !== viewportIdx, 'treePath ve treeViewport ayrı listener\'lara sahip');
}

async function testMoveModeClick() {
  // 1. Saf koordinat çözümü matematigi (DOM gerektirmez)
  function resolveCoord(clientX, clientY, rect, size) {
    const VBOX = 360, PAD = 24, GRID = 312;
    const svgX = (clientX - rect.left) / rect.width  * VBOX;
    const svgY = (clientY - rect.top)  / rect.height * VBOX;
    const cellSize = GRID / (size - 1);
    const gx = Math.round((svgX - PAD) / cellSize);
    const gy = Math.round((svgY - PAD) / cellSize);
    if (gx < 0 || gx >= size || gy < 0 || gy >= size) return null;
    return { x: gx, y: gy };
  }
  const r = { left: 0, top: 0, width: 300, height: 300 };

  // Sol üst köşe (0,0): svgX=24→clientX=20
  assert.deepEqual(resolveCoord(20, 20, r, 9), { x: 0, y: 0 }, '(0,0) köşesi');

  // Merkez (4,4) 9x9: svgX=180→clientX=150
  assert.deepEqual(resolveCoord(150, 150, r, 9), { x: 4, y: 4 }, '(4,4) merkez');

  // Sağ alt (8,8) 9x9: svgX=336→clientX=280
  assert.deepEqual(resolveCoord(280, 280, r, 9), { x: 8, y: 8 }, '(8,8) sağ alt köşe');

  // Tahta dışı — sol üst padding öncesi
  assert.equal(resolveCoord(0, 0, r, 9), null, 'tahta dışı null döner');

  // 19x19 merkez (9,9): cell=312/18=17.33, svgX=24+9*17.33≈180
  assert.deepEqual(resolveCoord(150, 150, r, 19), { x: 9, y: 9 }, '19x19 merkez (9,9)');

  // 2. Kaynak doğrulaması
  const appSrc = await fs.readFile(path.join(root, 'desktop', 'renderer', 'app.mjs'), 'utf8');
  assert.ok(appSrc.includes('boardClickCoord'), 'boardClickCoord fonksiyonu mevcut');
  assert.ok(appSrc.includes('addMoveFromBoardClick'), 'addMoveFromBoardClick fonksiyonu mevcut');
  assert.ok(appSrc.includes("elements.board.addEventListener('click'"), 'board click listener bağlı');

  // Guard sözleşmeleri fonksiyon gövdesinde
  const fnStart = appSrc.indexOf('function addMoveFromBoardClick');
  const fnEnd = appSrc.indexOf('\nfunction ', fnStart + 1);
  const fnBody = appSrc.slice(fnStart, fnEnd > 0 ? fnEnd : fnStart + 800);
  assert.ok(fnBody.includes("state.activeMode !== 'move'"), 'move mode guard mevcut');
  assert.ok(fnBody.includes('isCandidatePreviewMode'), 'candidate preview guard mevcut');
  assert.ok(fnBody.includes('boardClickCoord'), 'koordinat çözümü çağrılıyor');

  // 3. MoveTree model: ikinci hamle sibling varyasyon olarak ekleniyor
  const { createDocument } = await import('../studio/model/studioDocument.js');
  const { addChildMove: acm, rebuildBoardState: rbs } = await import('../studio/model/moveTree.js');
  const doc = createDocument({ id: 'click-test', title: 'Click Test', slug: 'click-test' });
  const treeRoot = doc.moveTree.root;

  const r1 = acm(treeRoot, 'root', { color: 'black', x: 3, y: 4 });
  assert.ok(r1.ok, 'ilk hamle eklendi');
  assert.equal(treeRoot.children.length, 1, 'bir child');

  // İkinci farklı hamle — sibling varyasyon
  const r2 = acm(treeRoot, 'root', { color: 'black', x: 4, y: 4 });
  assert.ok(r2.ok, 'ikinci hamle eklendi');
  assert.equal(treeRoot.children.length, 2, 'iki child — sibling varyasyon');
  assert.equal(treeRoot.preferredChildId, r1.node.id, 'preferredChild ilk hamlede kaldı');

  // Hamle sonrası sıra değişimi
  const bs1 = rbs(treeRoot, r1.node.id);
  assert.equal(bs1.turn, 'white', 'siyah sonrası sıra beyazda');

  // Dolu kesişime hamle illegal
  const rIllegal = acm(treeRoot, r1.node.id, { color: 'white', x: 3, y: 4 });
  assert.ok(!rIllegal.ok, 'dolu kesişim reddedilir');
  assert.equal(rIllegal.reason, 'OCCUPIED', 'OCCUPIED hatası');
}

async function testSecurityTexts() {
  const mainText = await fs.readFile(path.join(root, 'desktop', 'main.cjs'), 'utf8');
  const preloadText = await fs.readFile(path.join(root, 'desktop', 'preload.cjs'), 'utf8');

  assert.match(mainText, /contextIsolation:\s*true/);
  assert.match(mainText, /nodeIntegration:\s*false/);
  assert.match(mainText, /sandbox:\s*true/);
  assert.match(mainText, /webSecurity:\s*true/);
  assert.match(preloadText, /createStudioApi\(ipcRenderer\)/);
  assert.doesNotMatch(preloadText, /require\(['"]fs/);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
