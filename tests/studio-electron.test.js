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
  await testSetupModeClick();
  await testMarkerModeClick();
  await testEmptyDocumentState();
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

  // Test 8: S3B — aktif yol kenarları ayrı katmanda
  assert.ok(appSrc.includes('tree-edge--active-path'), 'aktif yol kenar sınıfı mevcut');
  assert.ok(appSrc.includes('activePathIds'), 'activePathIds buildMoveTreeSvg\'ye geçiyor');
  assert.ok(appSrc.includes("buildMoveTreeSvg(root, mainlineIds, activePathIds)"), 'üçüncü parametre geçiliyor');

  // Test 9: S3B — aktif node scroll + tooltip
  assert.ok(appSrc.includes('scrollIntoView'), 'aktif node scroll mevcut');
  assert.ok(appSrc.includes("createElementNS(ns, 'title')"), 'SVG title tooltip mevcut');
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

async function testSetupModeClick() {
  // 1. cycleSetupStone saf döngü mantığı
  function cycleSetupStone(formation, x, y) {
    if (!formation) return;
    if (!Array.isArray(formation.stones)) formation.stones = [];
    const idx = formation.stones.findIndex(s => s.x === x && s.y === y);
    if (idx === -1) {
      formation.stones.push({ x, y, color: 'black' });
    } else if (formation.stones[idx].color === 'black') {
      formation.stones[idx] = { x, y, color: 'white' };
    } else {
      formation.stones.splice(idx, 1);
    }
  }

  // boş → siyah → beyaz → boş döngüsü
  const f = { size: 9, stones: [] };
  cycleSetupStone(f, 3, 3);
  assert.equal(f.stones.length, 1, 'ilk tık: siyah taş eklendi');
  assert.equal(f.stones[0].color, 'black', 'renk siyah');

  cycleSetupStone(f, 3, 3);
  assert.equal(f.stones.length, 1, 'ikinci tık: hâlâ 1 taş');
  assert.equal(f.stones[0].color, 'white', 'renk beyaza döndü');

  cycleSetupStone(f, 3, 3);
  assert.equal(f.stones.length, 0, 'üçüncü tık: taş kaldırıldı');

  // Farklı hücreler birbirini etkilemez
  cycleSetupStone(f, 0, 0);
  cycleSetupStone(f, 8, 8);
  assert.equal(f.stones.length, 2, 'iki farklı hücre bağımsız');
  cycleSetupStone(f, 0, 0);
  assert.equal(f.stones.length, 2, '(0,0) beyaza geçti, (8,8) siyah kaldı');
  assert.equal(f.stones.find(s => s.x === 0).color, 'white');

  // 2. MoveTree ağacı değişmemeli
  const { createDocument: cd } = await import('../studio/model/studioDocument.js');
  const { addChildMove: acm, rebuildBoardState: rbs } = await import('../studio/model/moveTree.js');
  const doc = cd({ id: 'setup-test', title: 'Setup Test', slug: 'setup-test' });
  const treeRoot = doc.moveTree.root;

  // Bir hamle ekle
  const r1 = acm(treeRoot, 'root', { color: 'black', x: 4, y: 4 });
  assert.ok(r1.ok, 'hamle eklendi');
  const childrenBefore = treeRoot.children.length;
  const activeNodeBefore = doc.moveTree.activeNodeId ?? 'root';

  // Kurulum: formation'a taş ekle
  cycleSetupStone(treeRoot.formation, 2, 2);

  // Ağaç yapısı değişmemeli
  assert.equal(treeRoot.children.length, childrenBefore, 'children sayısı değişmedi');
  assert.equal(doc.moveTree.activeNodeId ?? 'root', activeNodeBefore, 'activeNodeId değişmedi');

  // Formation taşı rebuildBoardState'de yansımalı
  const bs = rbs(treeRoot, 'root');
  assert.ok(bs.stones.some(s => s.x === 2 && s.y === 2 && s.color === 'black'), 'formation taşı kök pozisyona yansıdı');

  // Hamle sonrası pozisyonda da formation taşı var
  const bs2 = rbs(treeRoot, r1.node.id);
  assert.ok(bs2.stones.some(s => s.x === 2 && s.y === 2 && s.color === 'black'), 'formation taşı hamle sonrası pozisyonda da mevcut');

  // 3. mergeDocumentBoard metadata koruması
  const adapter = createStudioBoardAdapter(BoardState);
  const existingBoard = {
    size: 9,
    markers: [{ id: 'm1', type: 'triangle', point: { x: 5, y: 5 } }],
    regions: [{ id: 'r1', type: 'region', points: [{ x: 1, y: 1 }] }],
    viewport: { x: 0, y: 0, scale: 2.0 },
    stones: [],
  };
  const newBoardState = adapter.fromDocumentBoard({ size: 9, stones: [{ x: 2, y: 2, color: 'black' }] });
  const merged = adapter.mergeDocumentBoard(existingBoard, adapter.toDocumentBoard(newBoardState));
  assert.equal(merged.markers[0].id, 'm1', 'markers korundu');
  assert.equal(merged.regions[0].id, 'r1', 'regions korundu');
  assert.equal(merged.viewport.scale, 2.0, 'viewport korundu');
  assert.ok(merged.stones.some(s => s.x === 2 && s.y === 2), 'yeni taş yansıdı');

  // 4. Kaynak guard sözleşmeleri
  const appSrc = await fs.readFile(path.join(root, 'desktop', 'renderer', 'app.mjs'), 'utf8');
  assert.ok(appSrc.includes('cycleSetupStone'), 'cycleSetupStone fonksiyonu mevcut');
  assert.ok(appSrc.includes('addStoneFromSetupClick'), 'addStoneFromSetupClick fonksiyonu mevcut');

  const fnStart = appSrc.indexOf('function addStoneFromSetupClick');
  const fnEnd = appSrc.indexOf('\nfunction ', fnStart + 1);
  const fnBody = appSrc.slice(fnStart, fnEnd > 0 ? fnEnd : fnStart + 800);
  assert.ok(fnBody.includes("state.activeMode !== 'setup'"), 'setup mode guard mevcut');
  assert.ok(fnBody.includes('isCandidatePreviewMode'), 'candidate preview guard mevcut');
  assert.ok(fnBody.includes('boardClickCoord'), 'koordinat çözümü çağrılıyor');
  assert.ok(!fnBody.includes('activeNodeId'), 'activeNodeId mutasyonu yok');
  assert.ok(!fnBody.includes('selectedNodeId ='), 'selectedNodeId mutasyonu yok');

  const css = await fs.readFile(path.join(root, 'desktop', 'renderer', 'studio.css'), 'utf8');
  assert.ok(css.includes('[data-studio-mode="setup"] .board-frame'), 'setup mode crosshair CSS mevcut');
}

async function testMarkerModeClick() {
  // 1. toggleBoardMarker saf döngü mantığı
  function toggleBoardMarker(board, x, y) {
    if (!board) return;
    if (!Array.isArray(board.markers)) board.markers = [];
    const idx = board.markers.findIndex(m => m.x === x && m.y === y);
    if (idx === -1) {
      board.markers.push({ x, y, type: 'circle' });
    } else {
      board.markers.splice(idx, 1);
    }
  }

  // İlk tık: marker eklenir
  const b = { size: 9, markers: [] };
  toggleBoardMarker(b, 3, 3);
  assert.equal(b.markers.length, 1, 'ilk tık: marker eklendi');
  assert.equal(b.markers[0].type, 'circle', 'varsayılan tip circle');
  assert.equal(b.markers[0].x, 3, 'x koordinatı doğru');
  assert.equal(b.markers[0].y, 3, 'y koordinatı doğru');

  // İkinci tık: marker kaldırılır
  toggleBoardMarker(b, 3, 3);
  assert.equal(b.markers.length, 0, 'ikinci tık: marker kaldırıldı');

  // Duplicate oluşmaz: farklı hücreler bağımsız
  toggleBoardMarker(b, 0, 0);
  toggleBoardMarker(b, 8, 8);
  assert.equal(b.markers.length, 2, 'iki farklı hücre bağımsız');
  toggleBoardMarker(b, 0, 0);
  assert.equal(b.markers.length, 1, '(0,0) kaldırıldı, (8,8) kaldı');
  assert.equal(b.markers[0].x, 8, 'kalan marker (8,8)');

  // markers dizisi yoksa oluşturulur
  const b2 = { size: 9 };
  toggleBoardMarker(b2, 4, 4);
  assert.ok(Array.isArray(b2.markers), 'markers dizisi oluşturuldu');
  assert.equal(b2.markers.length, 1, 'taş eklendi');

  // 2. MoveTree / formation değişmezliği
  const { createDocument: cd } = await import('../studio/model/studioDocument.js');
  const { addChildMove: acm } = await import('../studio/model/moveTree.js');
  const doc = cd({ id: 'marker-test', title: 'Marker Test', slug: 'marker-test' });
  const treeRoot = doc.moveTree.root;

  const r1 = acm(treeRoot, 'root', { color: 'black', x: 4, y: 4 });
  assert.ok(r1.ok, 'hamle eklendi');
  const childrenBefore = treeRoot.children.length;
  const formationStonesBefore = [...(treeRoot.formation?.stones ?? [])];
  const activeNodeBefore = doc.moveTree.activeNodeId ?? 'root';

  // doc.board.markers üzerine yaz
  if (!Array.isArray(doc.board.markers)) doc.board.markers = [];
  toggleBoardMarker(doc.board, 2, 2);

  // MoveTree yapısı değişmemeli
  assert.equal(treeRoot.children.length, childrenBefore, 'children sayısı değişmedi');
  assert.equal(doc.moveTree.activeNodeId ?? 'root', activeNodeBefore, 'activeNodeId değişmedi');

  // root.formation.stones değişmemeli
  assert.deepEqual(
    treeRoot.formation?.stones ?? [],
    formationStonesBefore,
    'formation.stones değişmedi',
  );

  // doc.board.markers güncellendi
  assert.ok(doc.board.markers.some(m => m.x === 2 && m.y === 2), 'marker doc.board.markers içinde');

  // 3. mergeDocumentBoard metadata koruması (markers eklenirken regions/viewport/unknown korunur)
  const adapter = createStudioBoardAdapter(BoardState);
  const existingBoard = {
    size: 9,
    markers: [{ x: 1, y: 1, type: 'triangle' }],
    regions: [{ id: 'r1', type: 'region', points: [{ x: 3, y: 3 }] }],
    viewport: { x: 0, y: 0, scale: 1.5 },
    customField: 'preserve-me',
    stones: [],
  };
  const runtimeBoard = adapter.toDocumentBoard(
    adapter.fromDocumentBoard({ size: 9, stones: [{ x: 4, y: 4, color: 'black' }] }),
  );
  const merged = adapter.mergeDocumentBoard(existingBoard, runtimeBoard);
  // markers runtime'da yok → mevcut korunur
  assert.equal(merged.markers[0].type, 'triangle', 'markers runtime tarafından bozulmadı');
  assert.equal(merged.regions[0].id, 'r1', 'regions korundu');
  assert.equal(merged.viewport.scale, 1.5, 'viewport korundu');
  assert.equal(merged.customField, 'preserve-me', 'unknown alan korundu');
  assert.ok(merged.stones.some(s => s.x === 4), 'yeni taş yansıdı');

  // 4. Kaynak guard sözleşmeleri
  const appSrc = await fs.readFile(path.join(root, 'desktop', 'renderer', 'app.mjs'), 'utf8');
  assert.ok(appSrc.includes('toggleBoardMarker'), 'toggleBoardMarker fonksiyonu mevcut');
  assert.ok(appSrc.includes('addMarkerFromBoardClick'), 'addMarkerFromBoardClick fonksiyonu mevcut');

  const fnStart = appSrc.indexOf('function addMarkerFromBoardClick');
  const fnEnd = appSrc.indexOf('\nfunction ', fnStart + 1);
  const fnBody = appSrc.slice(fnStart, fnEnd > 0 ? fnEnd : fnStart + 800);
  assert.ok(fnBody.includes("state.activeMode !== 'marker'"), 'marker mode guard mevcut');
  assert.ok(fnBody.includes('isCandidatePreviewMode'), 'candidate preview guard mevcut');
  assert.ok(fnBody.includes('boardClickCoord'), 'koordinat çözümü çağrılıyor');
  assert.ok(!fnBody.includes('selectedNodeId ='), 'selectedNodeId mutasyonu yok');
  assert.ok(!fnBody.includes('activeNodeId ='), 'activeNodeId mutasyonu yok');
  assert.ok(!fnBody.includes('addChildMove'), 'addChildMove çağrısı yok');
  assert.ok(!fnBody.includes('formation'), 'formation değişmez');

  // markers renderBoard'a geçiyor
  assert.ok(appSrc.includes("markers: doc.board?.markers ?? []"), 'markers renderBoard\'a geçiyor');

  // CSS
  const css = await fs.readFile(path.join(root, 'desktop', 'renderer', 'studio.css'), 'utf8');
  assert.ok(css.includes('[data-studio-mode="marker"] .board-frame'), 'marker mode crosshair CSS mevcut');
}

async function testEmptyDocumentState() {
  // 1. createDocument temel şablonu boş başlar
  const { createDocument: cd } = await import('../studio/model/studioDocument.js');
  const { rebuildBoardState: rbs } = await import('../studio/model/moveTree.js');

  const doc = cd({ id: 'empty-test', title: 'Empty', slug: 'empty-test' });
  assert.equal(doc.board.stones.length, 0, 'createDocument boş stones');
  assert.equal(doc.board.markers.length, 0, 'createDocument boş markers');
  assert.equal(doc.moveTree.root.children.length, 0, 'yeni belge moveTree children yok');
  assert.deepEqual(doc.moveTree.root.formation?.stones ?? [], [], 'formation.stones boş');
  assert.equal(doc.activeNodeId, 'root', 'activeNodeId root');

  // rebuildBoardState kök için taş yok
  const bs = rbs(doc.moveTree.root, 'root');
  assert.equal(bs.stones.length, 0, 'kök pozisyonda taş yok');

  // 2. createEmptyDocument (app.mjs) boş stones kullanıyor
  const appSrc = await fs.readFile(path.join(root, 'desktop', 'renderer', 'app.mjs'), 'utf8');
  const fnStart = appSrc.indexOf('function createEmptyDocument');
  const fnEnd = appSrc.indexOf('\nfunction ', fnStart + 1);
  const fnBody = appSrc.slice(fnStart, fnEnd > 0 ? fnEnd : fnStart + 600);
  assert.ok(fnBody.includes('stones: []'), 'createEmptyDocument boş stones kullanıyor');
  assert.ok(!fnBody.includes("color: 'black'") && !fnBody.includes("color: 'white'"), 'createEmptyDocument içinde hardcoded taş yok');

  // 3. Kütüphane öğeleri data-doc-index ve role içeriyor
  assert.ok(appSrc.includes('data-doc-index'), 'library item data-doc-index ile oluşturuluyor');
  assert.ok(appSrc.includes("role', 'button'"), 'library item role=button');
  assert.ok(appSrc.includes("elements.libraryList.addEventListener('click'"), 'library delegated click listener mevcut');

  // 4. Markers renderBoard'a geçiyor (S5 koruması)
  assert.ok(appSrc.includes("markers: doc.board?.markers ?? []"), 'markers renderBoard\'a geçiyor');

  // 5. CSS: library item aktif ve hover state
  const css = await fs.readFile(path.join(root, 'desktop', 'renderer', 'studio.css'), 'utf8');
  assert.ok(css.includes('.library-item.is-active'), 'library-item aktif state CSS mevcut');
  assert.ok(css.includes('.library-item:hover'), 'library-item hover CSS mevcut');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
