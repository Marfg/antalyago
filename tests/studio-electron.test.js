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
import sgfExportHandlerModule from '../desktop/ipc/sgfExportHandler.cjs';
import { createStudioBoardAdapter } from '../desktop/ipc/studioBoardAdapter.js';
import { BoardState } from '../core/boardState.js';
import { createDocument } from '../studio/model/studioDocument.js';
import { formatSGF } from '../studio/adapters/sgfAdapter.js';
import { OUTPUT_CAPABILITIES } from '../studio/adapters/capabilities.js';

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
  writeSgfFile,
} = fileHandlersModule;
const { exportSgfDocument } = sgfExportHandlerModule;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function main() {
  await testIpcContract();
  await testPathPolicy();
  await testSettingsStore();
  await testFileHandlers();
  await testSgfExportHandler();
  await testSgfExportDoesNotTouchAgstudioPath();
  await testSgfExportUiButton();
  await testSgfExportCapability();
  await testBoardAdapter();
  await testSecurityTexts();
  await testModeSelector();
  await testMoveTreeVisual();
  await testMoveModeClick();
  await testSetupModeClick();
  await testMarkerModeClick();
  await testEmptyDocumentState();
  await testFileRoundTrip();
  await testStudioHeartbeatFlow();
  await testHumanizeMoveCoordinateLabels();
  await testInspectorOverflowFix();
  await testSaveFeedbackNearButtons();
  await testModeHintText();
  await testCandidatePanelCompact();
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
  await api.exportSgfDocument({ id: 'doc-1' });
  const off = api.onDocumentOpened(() => {});
  assert.equal(subscriptions[0].channel, STUDIO_CHANNELS.DOCUMENT_OPENED);
  off();
  assert.equal(calls[0].channel, STUDIO_CHANNELS.BOOT);
  assert.equal(calls[1].channel, STUDIO_CHANNELS.OPEN_FILE_PATH);
  assert.equal(calls[2].channel, STUDIO_CHANNELS.LIST_CANDIDATES);
  assert.equal(calls[3].channel, STUDIO_CHANNELS.OPEN_CANDIDATE_PREVIEW);
  assert.equal(calls[4].channel, STUDIO_CHANNELS.OPEN_CANDIDATE_DOCUMENT);
  assert.equal(calls[5].channel, STUDIO_CHANNELS.EXPORT_SGF_DOCUMENT);
  assert.equal(STUDIO_CHANNELS.EXPORT_SGF_DOCUMENT, 'studio:export-sgf-document', 'kanal ismi sabit');
  assert.deepEqual(calls[5].args, [{ id: 'doc-1' }], 'exportSgfDocument belgeyi olduğu gibi iletir');
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

function buildSgfExportSampleDocument() {
  const doc = createDocument({ id: 'sgf-export-check', title: 'SGF export check', slug: 'sgf-export-check' });
  doc.moveTree.root.formation.stones.push({ x: 2, y: 2, color: 'black' });
  doc.moveTree.root.formation.stones.push({ x: 6, y: 6, color: 'white' });
  doc.moveTree.root.children.push({
    id: 'sgf-export-move-1',
    parentId: 'root',
    move: { color: 'black', x: 3, y: 3 },
    children: [], comment: '', annotations: [], rawProperties: {}, preferredChildId: null, formation: null,
  });
  doc.moveTree.root.preferredChildId = 'sgf-export-move-1';
  return doc;
}

async function testSgfExportHandler() {
  const doc = buildSgfExportSampleDocument();

  // ── formatSGF gerçek adapter'dan geliyor (mock değil) ──────────────────
  const { sgf: directSgf } = formatSGF(doc);
  assert.ok(directSgf.startsWith('(;GM[1]FF[4]CA[UTF-8]'), 'formatSGF gerçek sgfAdapter header üretiyor');

  // ── İptal edilen save dialog → canceled: true, dosya yazılmaz ───────────
  let writeCalled = false;
  const canceledResult = await exportSgfDocument({
    document: doc,
    formatSGF,
    showSaveDialog: async () => ({ canceled: true }),
    writeSgfFile: async () => { writeCalled = true; },
    defaultFileName: doc.slug,
  });
  assert.deepEqual(canceledResult, { canceled: true }, 'sgfExportHandler: iptal → { canceled: true }');
  assert.equal(writeCalled, false, 'sgfExportHandler: iptalde writeSgfFile çağrılmaz');

  // ── Başarılı yazım: gerçek dosya sistemine, gerçek writeSgfFile ile ─────
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'agstudio-sgf-export-'));
  const targetPath = path.join(base, 'sgf-export-check.sgf');
  const successResult = await exportSgfDocument({
    document: doc,
    formatSGF,
    showSaveDialog: async () => ({ canceled: false, filePath: targetPath }),
    writeSgfFile,
    defaultFileName: doc.slug,
  });
  assert.equal(successResult.canceled, false, 'sgfExportHandler: başarılı yazım canceled:false döner');
  assert.equal(successResult.filePath, targetPath, 'sgfExportHandler: filePath dialog sonucunu yansıtır');
  assert.ok(Array.isArray(successResult.warnings), 'sgfExportHandler: warnings result içinde bir dizi olarak döner');

  const written = await fs.readFile(targetPath, 'utf8');
  assert.ok(written.startsWith('(;GM[1]FF[4]CA[UTF-8]'), 'sgf: header (GM/FF/CA) mevcut');
  assert.ok(written.includes('AB[cc]'), 'sgf: AB (siyah kurulum taşı) mevcut');
  assert.ok(written.includes('AW[gg]'), 'sgf: AW (beyaz kurulum taşı) mevcut');
  assert.ok(written.includes(';B[dd]'), 'sgf: B (siyah hamle) örneği mevcut');
  assert.equal(written, directSgf, 'sgf: dosyaya yazılan metin formatSGF çıktısıyla birebir aynı');

  // ── .sgf uzantısı zorunlu ────────────────────────────────────────────
  await assert.rejects(
    () => exportSgfDocument({
      document: doc,
      formatSGF,
      showSaveDialog: async () => ({ canceled: false, filePath: path.join(base, 'no-extension') }),
      writeSgfFile,
      defaultFileName: doc.slug,
    }),
    /\.sgf/,
    'sgfExportHandler: .sgf uzantısı olmayan yol reddedilir',
  );

  // ── belge yoksa açık hata ────────────────────────────────────────────
  await assert.rejects(
    () => exportSgfDocument({ document: null, formatSGF, showSaveDialog: async () => ({ canceled: true }), writeSgfFile }),
    /Dışa aktarılacak belge yok/,
  );
}

async function testSgfExportDoesNotTouchAgstudioPath() {
  // main.cjs Electron'a bağımlı olduğu için doğrudan import edilemez (plain
  // node altında require('electron') gerçek modülü vermez) — bu yüzden diğer
  // Electron-bağımlı davranışlar gibi (bkz. testModeSelector) kaynak metni
  // üzerinden statik doğrulama yapılır.
  const mainSrc = await fs.readFile(path.join(root, 'desktop', 'main.cjs'), 'utf8');
  assert.ok(mainSrc.includes('exportSgfDocumentHandler'), 'main.cjs: exportSgfDocumentHandler tanımlı');
  assert.ok(mainSrc.includes('STUDIO_CHANNELS.EXPORT_SGF_DOCUMENT'), 'main.cjs: EXPORT_SGF_DOCUMENT kanalı bağlı');

  const handlerStart = mainSrc.indexOf('async function exportSgfDocumentHandler');
  const handlerEnd = mainSrc.indexOf('\nfunction validateDocument', handlerStart);
  assert.ok(handlerStart !== -1 && handlerEnd !== -1, 'exportSgfDocumentHandler gövdesi bulunamadı');
  const handlerBody = mainSrc.slice(handlerStart, handlerEnd);

  assert.ok(!handlerBody.includes('activeDocumentPath ='), 'exportSgfDocumentHandler: activeDocumentPath değiştirilmiyor');
  assert.ok(!handlerBody.includes('activeDocument ='), 'exportSgfDocumentHandler: activeDocument değiştirilmiyor');
  assert.ok(!handlerBody.includes('settings.lastOpenedDocument'), 'exportSgfDocumentHandler: lastOpenedDocument değiştirilmiyor');
  assert.ok(!handlerBody.includes('notifyDocumentOpened'), 'exportSgfDocumentHandler: DOCUMENT_OPENED tetiklenmiyor');
  assert.ok(!handlerBody.includes('persistSettings'), 'exportSgfDocumentHandler: settings kaydedilmiyor');
}

async function testSgfExportUiButton() {
  const html = await fs.readFile(path.join(root, 'desktop', 'index.html'), 'utf8');
  assert.ok(html.includes('data-action-export-sgf'), 'index.html: SGF dışa aktar butonu mevcut');

  const quickActionsStart = html.indexOf('Hızlı işlemler');
  const quickActionsEnd = html.indexOf('</section>', quickActionsStart);
  const quickActionsBlock = html.slice(quickActionsStart, quickActionsEnd > 0 ? quickActionsEnd : quickActionsStart + 1400);
  assert.ok(quickActionsBlock.includes('data-action-export-sgf'), 'SGF dışa aktar butonu Hızlı işlemler bloğunda');

  const appSrc = await fs.readFile(path.join(root, 'desktop', 'renderer', 'app.mjs'), 'utf8');
  assert.ok(appSrc.includes("actionExportSgf: document.querySelector('[data-action-export-sgf]')"), 'app.mjs: actionExportSgf elementi tanımlı');
  assert.ok(appSrc.includes('elements.actionExportSgf.addEventListener'), 'app.mjs: export butonu event listener\'ı mevcut');
  assert.ok(appSrc.includes('api.exportSgfDocument(state.activeDocument)'), 'app.mjs: exportSgfDocument çalışma belgesiyle çağrılıyor');
  assert.ok(appSrc.includes("'SGF dışa aktarıldı.'"), 'app.mjs: başarı mesajı mevcut');
  assert.ok(appSrc.includes('uyarı var'), 'app.mjs: warnings sayısı mesajda gösteriliyor');
  assert.ok(appSrc.includes("'SGF dışa aktarma iptal edildi.'"), 'app.mjs: iptal mesajı mevcut');

  // Aday önizlemesi salt-okunur olsa bile export serbest: syncCandidateEditability
  // disable listesinde actionExportSgf YER ALMAMALI.
  const editabilityStart = appSrc.indexOf('function syncCandidateEditability');
  const editabilityEnd = appSrc.indexOf('\nasync function openCandidatePreview', editabilityStart);
  const editabilityBlock = appSrc.slice(editabilityStart, editabilityEnd > 0 ? editabilityEnd : editabilityStart + 800);
  assert.ok(!editabilityBlock.includes('actionExportSgf'), 'syncCandidateEditability export butonunu devre dışı bırakmıyor (aday önizlemesinde de aktif kalmalı)');
}

async function testSgfExportCapability() {
  assert.equal(OUTPUT_CAPABILITIES.sgf.supported, true, 'capabilities.js: sgf.supported artık true (S10C ile aktif)');
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
  assert.ok(appSrc.includes("buildMoveTreeSvg(root, mainlineIds, activePathIds, size)"), 'üçüncü parametre geçiliyor');

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

async function testFileRoundTrip() {
  const { createDocument: cd, migrateDocument } = await import('../studio/model/studioDocument.js');
  const { addChildMove: acm, rebuildBoardState: rbs } = await import('../studio/model/moveTree.js');

  // Belge oluştur: kurulum taşı + hamle + marker
  const doc = cd({ id: 'rt', title: 'Round Trip', slug: 'rt' });
  doc.moveTree.root.formation.stones.push({ x: 1, y: 1, color: 'black' });
  const r1 = acm(doc.moveTree.root, 'root', { color: 'black', x: 4, y: 4 });
  assert.ok(r1.ok, 'hamle eklendi');
  doc.board.markers = [{ x: 3, y: 3, type: 'circle' }];
  doc.board.regions = [{ id: 'r1', type: 'region', points: [{ x: 5, y: 5 }] }];
  doc.board.viewport = { x: 0, y: 0, scale: 1.5 };
  doc.activeNodeId = r1.node.id;
  doc.moveTree.activeNodeId = r1.node.id;  // syncDocumentFromSelection eşdeğeri

  // Serialize → deserialize → migrate
  const json = JSON.stringify(doc);
  const loaded = migrateDocument(JSON.parse(json));

  // Formation taşı korunuyor
  assert.ok(
    loaded.moveTree.root.formation.stones.some(s => s.x === 1 && s.y === 1 && s.color === 'black'),
    'formation.stones round-trip',
  );

  // Hamle ağacı children korunuyor
  assert.equal(loaded.moveTree.root.children.length, 1, 'moveTree children round-trip');
  assert.equal(loaded.moveTree.root.children[0].move.x, 4, 'hamle koordinatı korundu');

  // Marker korunuyor
  assert.ok(
    Array.isArray(loaded.board.markers) && loaded.board.markers.some(m => m.x === 3 && m.y === 3),
    'board.markers round-trip',
  );

  // regions / viewport korunuyor
  assert.equal(loaded.board.regions[0].id, 'r1', 'regions round-trip');
  assert.equal(loaded.board.viewport?.scale, 1.5, 'viewport round-trip');

  // activeNodeId korunuyor
  assert.equal(loaded.activeNodeId, r1.node.id, 'activeNodeId round-trip');

  // rebuildBoardState yüklenen belgede doğru çalışıyor
  const bs = rbs(loaded.moveTree.root, loaded.activeNodeId);
  assert.ok(bs.stones.some(s => s.x === 1 && s.y === 1), 'formation taşı rebuild\'e yansıdı');
  assert.ok(bs.stones.some(s => s.x === 4 && s.y === 4), 'hamle rebuild\'e yansıdı');

  // Kaynak guard sözleşmeleri (app.mjs)
  const appSrc = await fs.readFile(path.join(root, 'desktop', 'renderer', 'app.mjs'), 'utf8');

  // activeMode review'a dönüyor (!keepSelection)
  const fnStart = appSrc.indexOf('function setActiveDocument');
  const fnEnd = appSrc.indexOf('\nfunction ', fnStart + 1);
  const fnBody = appSrc.slice(fnStart, fnEnd > 0 ? fnEnd : fnStart + 800);
  assert.ok(fnBody.includes("state.activeMode = 'review'"), 'setActiveDocument keepSelection=false activeMode sıfırlıyor');

  // UI feedback mesajları
  assert.ok(appSrc.includes("'Kaydedildi.'"), 'Kaydedildi mesajı mevcut');
  assert.ok(appSrc.includes("'Farklı kaydedildi.'"), 'Farklı kaydedildi mesajı mevcut');
  assert.ok(appSrc.includes("'Yeni belge oluşturuldu.'"), 'Yeni belge mesajı mevcut');
  assert.ok(appSrc.includes("'Kaydetme iptal edildi.'"), 'İptal mesajı mevcut');

  // boardSize fallback (workspace API belgelerinde boardSize alanı, in-memory'de board.size)
  assert.ok(appSrc.includes('item.board?.size ?? item.boardSize ?? 9'), 'boardSize fallback doğru');

  // main.cjs yeni belge boş başlıyor
  const mainSrc = await fs.readFile(path.join(root, 'desktop', 'main.cjs'), 'utf8');
  const newDocStart = mainSrc.indexOf('async function createNewDocument');
  const newDocEnd = mainSrc.indexOf('\nasync function ', newDocStart + 1);
  const newDocBody = mainSrc.slice(newDocStart, newDocEnd > 0 ? newDocEnd : newDocStart + 500);
  assert.ok(!newDocBody.includes("color:"), 'main.cjs createNewDocument hardcoded taş içermiyor');
  assert.ok(newDocBody.includes("'Yeni belge'"), 'main.cjs createNewDocument başlığı Yeni belge');
}

async function testStudioHeartbeatFlow() {
  const { createDocument: cd } = await import('../studio/model/studioDocument.js');
  const { addChildMove: acm, rebuildBoardState: rbs, serializeMainlineMoves } = await import('../studio/model/moveTree.js');

  // ── Adım 1: Yeni belge ──────────────────────────────────────────────────
  const doc = cd({ id: 'hb', title: 'Kalp Atışı', slug: 'hb' });

  // ── Adım 2: Tahta boş başlıyor ────────────────────────────────────────
  assert.equal(doc.board.stones.length, 0, 'hb: tahta boş başlıyor');
  assert.equal(doc.board.markers.length, 0, 'hb: markers boş başlıyor');
  assert.equal(doc.moveTree.root.children.length, 0, 'hb: moveTree children yok');
  assert.deepEqual(doc.moveTree.root.formation?.stones ?? [], [], 'hb: formation.stones boş');
  assert.equal(doc.activeNodeId, 'root', 'hb: activeNodeId root');

  // ── Adım 3: Setup mode — başlangıç taşları ──────────────────────────
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

  const formation = doc.moveTree.root.formation;

  // Döngü doğrulama: empty → black → white → empty
  cycleSetupStone(formation, 3, 3);
  assert.equal(formation.stones.length, 1, 'hb: döngü — siyah eklendi');
  assert.equal(formation.stones[0].color, 'black', 'hb: döngü — renk siyah');
  cycleSetupStone(formation, 3, 3);
  assert.equal(formation.stones[0].color, 'white', 'hb: döngü — beyaza döndü');
  cycleSetupStone(formation, 3, 3);
  assert.equal(formation.stones.length, 0, 'hb: döngü — kaldırıldı');

  // Gerçek setup taşları: (3,3) siyah, (5,5) beyaz
  cycleSetupStone(formation, 3, 3);          // siyah
  cycleSetupStone(formation, 5, 5);          // siyah
  cycleSetupStone(formation, 5, 5);          // beyaz
  assert.equal(formation.stones.length, 2, 'hb: 2 setup taşı');
  assert.ok(formation.stones.some(s => s.x === 3 && s.y === 3 && s.color === 'black'), 'hb: (3,3) siyah setup');
  assert.ok(formation.stones.some(s => s.x === 5 && s.y === 5 && s.color === 'white'), 'hb: (5,5) beyaz setup');

  // Setup taşları moveTree.children içinde görünmemeli
  assert.equal(doc.moveTree.root.children.length, 0, 'hb: setup taşları moveTree.children içinde değil');

  // rebuildBoardState kökte setup taşlarını yansıtıyor
  const bsRoot = rbs(doc.moveTree.root, 'root');
  assert.ok(bsRoot.stones.some(s => s.x === 3 && s.y === 3 && s.color === 'black'), 'hb: kök board (3,3) siyah içeriyor');
  assert.ok(bsRoot.stones.some(s => s.x === 5 && s.y === 5 && s.color === 'white'), 'hb: kök board (5,5) beyaz içeriyor');

  // ── Adım 4: Marker mode ───────────────────────────────────────────────
  function toggleBoardMarker(board, x, y) {
    if (!board) return;
    if (!Array.isArray(board.markers)) board.markers = [];
    const idx = board.markers.findIndex(m => m.x === x && m.y === y);
    if (idx === -1) board.markers.push({ x, y, type: 'circle' });
    else board.markers.splice(idx, 1);
  }

  toggleBoardMarker(doc.board, 2, 2);
  assert.equal(doc.board.markers.length, 1, 'hb: marker eklendi');
  assert.equal(doc.board.markers[0].type, 'circle', 'hb: marker tipi circle');

  // Marker moveTree/formation değiştirmemeli
  assert.equal(doc.moveTree.root.children.length, 0, 'hb: marker sonrası children değişmedi');
  assert.equal(formation.stones.length, 2, 'hb: marker sonrası formation.stones değişmedi');

  // ── Adım 5: Move mode — hamle ve varyasyon ──────────────────────────
  // Root'tan ilk hamle: siyah (4,4)
  const m1 = acm(doc.moveTree.root, 'root', { color: 'black', x: 4, y: 4 });
  assert.ok(m1.ok, `hb: ilk hamle eklendi (${m1.reason ?? 'ok'})`);
  assert.equal(doc.moveTree.root.children.length, 1, 'hb: root 1 child');
  assert.equal(doc.moveTree.root.preferredChildId, m1.node.id, 'hb: ilk hamle preferred');

  // Root'a geri dönüp ikinci hamle: siyah (6,6) → sibling/varyasyon
  const m2 = acm(doc.moveTree.root, 'root', { color: 'black', x: 6, y: 6 });
  assert.ok(m2.ok, `hb: varyasyon hamlesi eklendi (${m2.reason ?? 'ok'})`);
  assert.equal(doc.moveTree.root.children.length, 2, 'hb: root 2 child (varyasyon)');

  // preferredChildId hâlâ ilk hamlede kalmalı
  assert.equal(doc.moveTree.root.preferredChildId, m1.node.id, 'hb: preferredChildId ilk hamlede kaldı');
  assert.notEqual(m1.node.id, m2.node.id, 'hb: iki varyasyon farklı node ID');

  // ── Adım 6: Node seç — activeNodeId ve board rebuild ──────────────
  // İlk hamle nodunu seç (syncDocumentFromSelection simülasyonu)
  doc.activeNodeId = m1.node.id;
  doc.moveTree.activeNodeId = m1.node.id;

  const bsM1 = rbs(doc.moveTree.root, m1.node.id);
  assert.ok(bsM1.stones.some(s => s.x === 3 && s.y === 3), 'hb: m1 board — setup (3,3) mevcut');
  assert.ok(bsM1.stones.some(s => s.x === 4 && s.y === 4), 'hb: m1 board — hamle (4,4) mevcut');
  assert.ok(!bsM1.stones.some(s => s.x === 6 && s.y === 6), 'hb: m1 board — varyasyon (6,6) yok');

  const bsM2 = rbs(doc.moveTree.root, m2.node.id);
  assert.ok(bsM2.stones.some(s => s.x === 6 && s.y === 6), 'hb: m2 board — varyasyon (6,6) mevcut');
  assert.ok(!bsM2.stones.some(s => s.x === 4 && s.y === 4), 'hb: m2 board — (4,4) yok');

  // ── Adım 7-8: Kaydet → Aç ────────────────────────────────────────────
  doc.board.regions = [{ id: 'reg1', type: 'region', points: [{ x: 7, y: 7 }] }];
  doc.board.viewport = { x: 0, y: 0, scale: 1.25 };
  doc.board.customMeta = 'korunacak';

  const tmpPath = path.join(os.tmpdir(), `hb-heartbeat-${Date.now()}.agstudio`);
  await writeAgstudioDocument(tmpPath, doc);
  const loaded = await readAgstudioDocument(tmpPath);  // readAgstudioDocument zaten migrate ediyor

  // ── Adım 9: Tüm alanları doğrula ─────────────────────────────────────

  // root.formation.stones
  assert.ok(
    loaded.moveTree.root.formation.stones.some(s => s.x === 3 && s.y === 3 && s.color === 'black'),
    'hb rt: formation (3,3) siyah korundu',
  );
  assert.ok(
    loaded.moveTree.root.formation.stones.some(s => s.x === 5 && s.y === 5 && s.color === 'white'),
    'hb rt: formation (5,5) beyaz korundu',
  );

  // moveTree.children — 2 varyasyon
  assert.equal(loaded.moveTree.root.children.length, 2, 'hb rt: children.length === 2');
  assert.equal(loaded.moveTree.root.preferredChildId, m1.node.id, 'hb rt: preferredChildId korundu');

  // activeNodeId
  assert.equal(loaded.activeNodeId, m1.node.id, 'hb rt: activeNodeId korundu');
  assert.equal(loaded.moveTree.activeNodeId, m1.node.id, 'hb rt: moveTree.activeNodeId korundu');

  // doc.board.markers
  assert.ok(
    Array.isArray(loaded.board.markers) && loaded.board.markers.some(m => m.x === 2 && m.y === 2),
    'hb rt: board.markers korundu',
  );

  // doc.board.regions
  assert.equal(loaded.board.regions?.[0]?.id, 'reg1', 'hb rt: board.regions korundu');

  // doc.board.viewport
  assert.equal(loaded.board.viewport?.scale, 1.25, 'hb rt: board.viewport korundu');

  // unknown board metadata
  assert.equal(loaded.board.customMeta, 'korunacak', 'hb rt: board unknown metadata korundu');

  // rebuildBoardState açılan belgede doğru çalışıyor
  const bsLoaded = rbs(loaded.moveTree.root, loaded.activeNodeId);
  assert.ok(bsLoaded.stones.some(s => s.x === 3 && s.y === 3), 'hb rt: açılan belge rebuild — formation (3,3)');
  assert.ok(bsLoaded.stones.some(s => s.x === 4 && s.y === 4), 'hb rt: açılan belge rebuild — hamle (4,4)');
  assert.ok(!bsLoaded.stones.some(s => s.x === 6 && s.y === 6), 'hb rt: açılan belge rebuild — (6,6) yok (m1 nodunda)');

  // Setup taşı hamle gibi görünmüyor
  assert.ok(
    !loaded.moveTree.root.children.some(c => c.move?.x === 3 && c.move?.y === 3),
    'hb rt: setup (3,3) moveTree.children içinde değil',
  );

  // Marker hamle gibi görünmüyor
  assert.ok(
    !loaded.moveTree.root.children.some(c => c.move?.x === 2 && c.move?.y === 2),
    'hb rt: marker (2,2) moveTree.children içinde değil',
  );

  // serializeMainlineMoves ana hat: m1 (preferred)
  const mainline = serializeMainlineMoves(loaded.moveTree.root);
  assert.equal(mainline.length, 1, 'hb rt: ana hat 1 hamle');
  assert.equal(mainline[0].x, 4, 'hb rt: ana hat hamlesi x=4');
  assert.equal(mainline[0].y, 4, 'hb rt: ana hat hamlesi y=4');

  // Temp dosyasını temizle
  try { await fs.unlink(tmpPath); } catch {}
}

async function testHumanizeMoveCoordinateLabels() {
  // Saf yeniden uygulama: app.mjs humanizeMove ile birebir aynı mantık
  // (boardRenderer.js satır etiketleriyle uyumlu: row = size - move.y)
  function humanizeMove(move, size = 9) {
    if (!move) return 'hamle yok';
    const color = move.color === 'white' ? 'Beyaz' : 'Siyah';
    if (move.pass) return `${color} Pas`;
    const letters = 'ABCDEFGHJKLMNOPQRST';
    const column = letters[move.x] ?? String(move.x);
    const row = Number.isInteger(move.y) ? `${size - move.y}` : '?';
    return `${color} ${column}${row}`;
  }

  // 9x9
  assert.equal(humanizeMove({ color: 'black', x: 6, y: 6 }, 9), 'Siyah G3', '9x9 (6,6) → G3');
  assert.equal(humanizeMove({ color: 'black', x: 0, y: 0 }, 9), 'Siyah A9', '9x9 (0,0) → A9 (sol üst köşe)');
  assert.equal(humanizeMove({ color: 'white', x: 8, y: 8 }, 9), 'Beyaz J1', '9x9 (8,8) → J1 (I harfi atlanır)');

  // 19x19
  assert.equal(humanizeMove({ color: 'black', x: 3, y: 3 }, 19), 'Siyah D16', '19x19 (3,3) → D16');

  // Pas hamlesi satır hesaplamasından etkilenmez
  assert.equal(humanizeMove({ color: 'black', pass: true }, 9), 'Siyah Pas', 'pas hamlesi "Pas" kalır');
  assert.equal(humanizeMove({ color: 'white', pass: true }, 19), 'Beyaz Pas', '19x19 pas hamlesi de "Pas" kalır');

  // size verilmezse güvenli varsayılan (9) kullanılır
  assert.equal(humanizeMove({ color: 'black', x: 4, y: 4 }), 'Siyah E5', 'size parametresi verilmezse 9 varsayılan');

  // ── Kaynak guard: gerçek app.mjs boardRenderer ile aynı yönü kullanıyor ──
  const appSrc = await fs.readFile(path.join(root, 'desktop', 'renderer', 'app.mjs'), 'utf8');
  const boardRendererSrc = await fs.readFile(path.join(root, 'studio', 'boardRenderer.js'), 'utf8');
  assert.ok(boardRendererSrc.includes('String(size - i)'), 'boardRenderer satır etiketi formülü referans olarak sabit');

  const fnStart = appSrc.indexOf('function humanizeMove');
  const fnEnd = appSrc.indexOf('\nfunction ', fnStart + 1);
  const fnBody = appSrc.slice(fnStart, fnEnd > 0 ? fnEnd : fnStart + 500);
  assert.ok(fnBody.includes('size - move.y'), 'humanizeMove boardRenderer ile aynı satır formülünü kullanıyor');
  assert.ok(!fnBody.includes('move.y + 1'), 'humanizeMove eski ters formülü içermiyor');

  // ── Kaynak guard: tüm çağrı noktaları size parametresi geçiyor ──
  const callSites = [
    /humanizeMove\(node\.move, size\)/,
    /humanizeMove\(node\.move, doc\.board\?\.size \?\? 9\)/,
    /humanizeMove\(result\.node\.move, boardState\.size\)/,
    /humanizeMove\(result\.node\.move, doc\.board\?\.size \?\? 9\)/,
  ];
  for (const pattern of callSites) {
    assert.ok(pattern.test(appSrc), `humanizeMove çağrı noktası size geçiriyor: ${pattern}`);
  }
  // Her humanizeMove(...) çağrısı/tanımı iki argüman içermeli (virgül var) —
  // eski, size'sız tek argümanlı çağrı biçimi kalmamalı
  const invocations = appSrc.match(/humanizeMove\([^)]*\)/g) ?? [];
  assert.ok(invocations.length >= 6, `humanizeMove çağrı/tanım sayısı beklenenden az: ${invocations.length}`);
  for (const call of invocations) {
    assert.ok(call.includes(','), `humanizeMove çağrısı size argümanı içeriyor: ${call}`);
  }
  assert.ok(appSrc.includes('function formatPathLabel(node, index, total, size)'), 'formatPathLabel size parametresi alıyor');
  assert.ok(appSrc.includes('function renderPathNode(node, index, total, size)'), 'renderPathNode size parametresi alıyor');
  assert.ok(appSrc.includes('function buildMoveTreeSvg(root, mainlineIds, activePathIds, size = 9)'), 'buildMoveTreeSvg size parametresi alıyor');
  assert.ok(appSrc.includes('renderMoveTree(doc.moveTree, doc.board?.size ?? boardState.size ?? 9)'), 'renderMoveTree çağrısı doküman board boyutunu geçiriyor');
}

async function testInspectorOverflowFix() {
  const css = await fs.readFile(path.join(root, 'desktop', 'renderer', 'studio.css'), 'utf8');

  // .inspector artık kendi içinde scroll edilebilir
  // (not: dosyada ".rail,\n.inspector { display:flex... }" gibi birleşik bir
  // selector da var; burada özellikle max-height kuralını taşıyan bloğu hedefliyoruz)
  const inspectorRuleMatch = css.match(/\.inspector\s*\{\s*max-height:[^}]*\}/);
  assert.ok(inspectorRuleMatch, '.inspector max-height kuralı mevcut');
  assert.ok(/overflow-y:\s*auto/.test(inspectorRuleMatch[0]), '.inspector overflow-y: auto içeriyor');
  assert.ok(/max-height/.test(inspectorRuleMatch[0]), '.inspector hâlâ viewport yüksekliğiyle sınırlı (tüm sayfa taşmıyor)');

  // Panelleri flex-shrink ile ezip içeriği gizleyen eski kurallar kaldırıldı
  assert.ok(!/\.inspector\s+\.panel\s*\{[^}]*overflow:\s*hidden/.test(css), '.inspector .panel artık overflow:hidden ile kırpmıyor');
  assert.ok(!/\.move-tree-panel\s*\{[^}]*overflow:\s*hidden/.test(css), '.move-tree-panel artık overflow:hidden ile kırpmıyor');

  // Gerçekten kendi içinde taşması gereken alanlar (teknik JSON, ağaç canvas'ı)
  // kendi scroll'unu korumalı — bunlar bilinçli olarak dokunulmadı
  assert.ok(/\.technical-details pre\s*\{[^}]*overflow:\s*auto/.test(css), 'technical-details pre kendi içinde scroll ediyor (dokunulmadı)');
  assert.ok(/\.move-tree-viewport\s*\{[^}]*overflow:\s*auto/.test(css), 'move-tree-viewport kendi içinde scroll ediyor (dokunulmadı)');

  // Hamle ağacı üst kontrolleri hâlâ CSS'te ve HTML'de tanımlı — kaldırılmadı, sadece kırpılmıyor
  assert.ok(css.includes('.move-tree-panel__header'), 'move-tree-panel__header CSS kuralı hâlâ mevcut');
  assert.ok(css.includes('.move-tree-panel__zoom'), 'move-tree-panel__zoom CSS kuralı hâlâ mevcut');
  assert.ok(css.includes('.move-tree-path'), 'move-tree-path CSS kuralı hâlâ mevcut');
  assert.ok(css.includes('.move-tree-toolbar'), 'move-tree-toolbar CSS kuralı hâlâ mevcut');

  const html = await fs.readFile(path.join(root, 'desktop', 'index.html'), 'utf8');
  assert.ok(html.includes('data-move-tree-zoom-out'), 'zoom out butonu DOM\'da mevcut');
  assert.ok(html.includes('data-move-tree-zoom-in'), 'zoom in butonu DOM\'da mevcut');
  assert.ok(html.includes('data-move-tree-path'), 'path breadcrumb konteyneri DOM\'da mevcut');
  assert.ok(html.includes('data-move-tree-prev'), 'Önceki butonu DOM\'da mevcut');
  assert.ok(html.includes('data-move-tree-next'), 'Sonraki butonu DOM\'da mevcut');
  assert.ok(html.includes('data-move-tree-promote'), 'Ana dal yap butonu DOM\'da mevcut');
  assert.ok(html.includes('data-move-tree-delete'), 'Varyantı sil butonu DOM\'da mevcut');
}

async function testSaveFeedbackNearButtons() {
  // ── HTML: geri bildirim elemanı Hızlı işlemler panelinde, kaydet
  // butonlarına yakın (aynı panel__body içinde, field-grid'den hemen sonra) ──
  const html = await fs.readFile(path.join(root, 'desktop', 'index.html'), 'utf8');
  assert.ok(html.includes('data-save-feedback'), 'save-feedback elemanı DOM\'da mevcut');
  assert.ok(/aria-live="polite"[^>]*data-save-feedback|data-save-feedback[^>]*aria-live="polite"/.test(html), 'save-feedback aria-live="polite" taşıyor');

  const quickActionsStart = html.indexOf('Hızlı işlemler');
  const quickActionsEnd = html.indexOf('</section>', quickActionsStart);
  const quickActionsBlock = html.slice(quickActionsStart, quickActionsEnd > 0 ? quickActionsEnd : quickActionsStart + 1200);
  assert.ok(quickActionsBlock.includes('data-action-save'), 'Kaydet butonu Hızlı işlemler bloğunda');
  assert.ok(quickActionsBlock.includes('data-action-save-as'), 'Farklı kaydet butonu Hızlı işlemler bloğunda');
  assert.ok(quickActionsBlock.includes('data-save-feedback'), 'save-feedback aynı blokta — butonlara yakın');

  // ── JS: renderTreeStatus kaldırılmadı, sadece yakın feedback eklendi ──
  const appSrc = await fs.readFile(path.join(root, 'desktop', 'renderer', 'app.mjs'), 'utf8');
  assert.ok(appSrc.includes('function renderSaveFeedback(message, tone'), 'renderSaveFeedback fonksiyonu mevcut');
  assert.ok(appSrc.includes("elements.saveFeedback.textContent = message"), 'renderSaveFeedback mesajı yazıyor');
  assert.ok(appSrc.includes("elements.saveFeedback.dataset.tone = tone"), 'renderSaveFeedback tonu yazıyor');

  const saveHandlerStart = appSrc.indexOf("elements.actionSave.addEventListener");
  const saveAsHandlerStart = appSrc.indexOf("elements.actionSaveAs.addEventListener");
  const saveHandlerBlock = appSrc.slice(saveHandlerStart, saveAsHandlerStart);
  assert.ok(saveHandlerBlock.includes("renderTreeStatus('Kaydedildi.')"), 'mevcut Kaydedildi. renderTreeStatus mesajı korunuyor');
  assert.ok(saveHandlerBlock.includes("renderTreeStatus('Farklı kaydedildi.')"), 'mevcut Farklı kaydedildi. renderTreeStatus mesajı korunuyor');
  assert.ok(saveHandlerBlock.includes("renderTreeStatus('Kaydetme iptal edildi.')"), 'mevcut iptal renderTreeStatus mesajı korunuyor');
  assert.ok(saveHandlerBlock.includes("renderSaveFeedback('Kaydedildi.', 'success')"), 'Kaydet: yakın başarı feedback\'i eklendi');
  assert.ok(saveHandlerBlock.includes("renderSaveFeedback('Farklı kaydedildi.', 'success')"), 'Kaydet (ilk kayıt, save-as fallback): yakın başarı feedback\'i eklendi');
  assert.ok(saveHandlerBlock.includes("renderSaveFeedback('Kaydetme iptal edildi.', 'muted')"), 'Kaydet: yakın iptal feedback\'i eklendi');

  const saveAsHandlerEnd = appSrc.indexOf('\n  });', saveAsHandlerStart);
  const saveAsHandlerBlock = appSrc.slice(saveAsHandlerStart, saveAsHandlerEnd > 0 ? saveAsHandlerEnd : saveAsHandlerStart + 600);
  assert.ok(saveAsHandlerBlock.includes("renderSaveFeedback('Farklı kaydedildi.', 'success')"), 'Farklı kaydet: yakın başarı feedback\'i eklendi');
  assert.ok(saveAsHandlerBlock.includes("renderSaveFeedback('Kaydetme iptal edildi.', 'muted')"), 'Farklı kaydet: yakın iptal feedback\'i eklendi');

  // CSS: tonlar tanımlı
  const css = await fs.readFile(path.join(root, 'desktop', 'renderer', 'studio.css'), 'utf8');
  assert.ok(css.includes('.save-feedback'), 'save-feedback CSS kuralı mevcut');
  assert.ok(css.includes('[data-tone="success"]'), 'success tonu CSS\'te tanımlı');
}

async function testModeHintText() {
  // Saf yeniden uygulama: app.mjs'deki mod ipucu seçim mantığı
  const MODE_HINTS = {
    review: 'Hamle ağacında gezin.',
    move: 'Tahtaya tıklayarak seçili düğümden yeni hamle ekle.',
    setup: 'Tahtaya tıklayarak başlangıç taşı döngüsü yap.',
    marker: 'Tahtaya tıklayarak işaret ekle veya kaldır.',
  };
  function resolveHint(activeMode, readOnly) {
    return readOnly
      ? 'Aday önizlemesi salt-okunur; düzenleme modları (Hamle, Kurulum, İşaret) kilitli.'
      : (MODE_HINTS[activeMode] ?? MODE_HINTS.review);
  }

  assert.equal(resolveHint('review', false), 'Hamle ağacında gezin.', 'İncele ipucu');
  assert.equal(resolveHint('move', false), 'Tahtaya tıklayarak seçili düğümden yeni hamle ekle.', 'Hamle ipucu');
  assert.equal(resolveHint('setup', false), 'Tahtaya tıklayarak başlangıç taşı döngüsü yap.', 'Kurulum ipucu');
  assert.equal(resolveHint('marker', false), 'Tahtaya tıklayarak işaret ekle veya kaldır.', 'İşaret ipucu');
  // Candidate salt-okunur modda, aktif mod ne olursa olsun kilit mesajı gösterilir
  assert.equal(resolveHint('review', true), 'Aday önizlemesi salt-okunur; düzenleme modları (Hamle, Kurulum, İşaret) kilitli.', 'salt-okunur kilit mesajı');
  assert.equal(resolveHint('move', true), 'Aday önizlemesi salt-okunur; düzenleme modları (Hamle, Kurulum, İşaret) kilitli.', 'salt-okunur kilit mesajı mod fark etmeksizin');

  // ── Kaynak guard ──
  const html = await fs.readFile(path.join(root, 'desktop', 'index.html'), 'utf8');
  assert.ok(html.includes('data-mode-hint'), 'mode-hint elemanı DOM\'da mevcut');
  const modeToolbarIdx = html.indexOf('data-mode-toolbar');
  const modeHintIdx = html.indexOf('data-mode-hint');
  const boardShellIdx = html.indexOf('board-shell');
  assert.ok(modeToolbarIdx < modeHintIdx && modeHintIdx < boardShellIdx, 'mode-hint mode-toolbar ile board-shell arasında (mode toolbar yakınında)');

  const appSrc = await fs.readFile(path.join(root, 'desktop', 'renderer', 'app.mjs'), 'utf8');
  assert.ok(appSrc.includes('const MODE_HINTS = {'), 'MODE_HINTS sabiti mevcut');
  assert.ok(appSrc.includes("review: 'Hamle ağacında gezin.'"), 'review ipucu kaynak dosyada');
  assert.ok(appSrc.includes("move: 'Tahtaya tıklayarak seçili düğümden yeni hamle ekle.'"), 'move ipucu kaynak dosyada');
  assert.ok(appSrc.includes("setup: 'Tahtaya tıklayarak başlangıç taşı döngüsü yap.'"), 'setup ipucu kaynak dosyada');
  assert.ok(appSrc.includes("marker: 'Tahtaya tıklayarak işaret ekle veya kaldır.'"), 'marker ipucu kaynak dosyada');
  assert.ok(appSrc.includes('elements.modeHint.textContent'), 'renderModeSelector modeHint\'i güncelliyor');

  // Mevcut davranışlar (aria-pressed / disabled mantığı) değişmedi
  const fnStart = appSrc.indexOf('function renderModeSelector');
  const fnEnd = appSrc.indexOf('\nfunction ', fnStart + 1);
  const fnBody = appSrc.slice(fnStart, fnEnd > 0 ? fnEnd : fnStart + 700);
  assert.ok(fnBody.includes("btn.setAttribute('aria-pressed'"), 'aria-pressed mantığı korunuyor');
  assert.ok(fnBody.includes('btn.disabled = readOnly'), 'disabled mantığı korunuyor');
}

async function testCandidatePanelCompact() {
  // Saf yeniden uygulama: app.mjs'deki panel açık/kapalı karar mantığı
  function shouldBeOpen(itemCount, manuallyToggled) {
    if (manuallyToggled) return null; // dokunulmaz
    return itemCount > 0;
  }
  assert.equal(shouldBeOpen(0, false), false, '0 aday: panel kapalı/kompakt');
  assert.equal(shouldBeOpen(3, false), true, 'adaylar var: panel açık');
  assert.equal(shouldBeOpen(0, true), null, 'kullanıcı elle değiştirdiyse müdahale edilmez (0 aday)');
  assert.equal(shouldBeOpen(3, true), null, 'kullanıcı elle değiştirdiyse müdahale edilmez (adaylar var)');

  // ── Kaynak guard: HTML yapısı ──
  const html = await fs.readFile(path.join(root, 'desktop', 'index.html'), 'utf8');
  assert.ok(html.includes('data-candidate-details'), 'candidate-details <details> elemanı mevcut');
  assert.ok(html.includes('data-candidate-count'), 'candidate-count elemanı mevcut');
  assert.ok(html.includes('<details class="candidate-panel__details" data-candidate-details>'), 'details kapalı başlıyor (open attribute yok)');
  assert.ok(html.includes('data-candidate-list'), 'candidate-list hâlâ mevcut (Kütüphane/aday akışı bozulmadı)');
  assert.ok(html.includes('data-candidate-empty'), 'candidate-empty hâlâ mevcut');
  assert.ok(html.includes('data-candidate-preview-panel'), 'candidate-preview-panel hâlâ mevcut (preview akışı bozulmadı)');
  assert.ok(html.includes('data-candidate-work'), 'candidate-work butonu hâlâ mevcut (working document akışı bozulmadı)');
  assert.ok(html.includes('data-action-new') && html.includes('data-action-open'), 'Hızlı işlemler butonları bozulmadı');

  // ── Kaynak guard: JS mantığı ──
  const appSrc = await fs.readFile(path.join(root, 'desktop', 'renderer', 'app.mjs'), 'utf8');
  assert.ok(appSrc.includes('candidatePanelManuallyToggled'), 'manuel toggle takibi mevcut');
  assert.ok(appSrc.includes("elements.candidateDetails.addEventListener('toggle'"), 'toggle event listener bağlı');

  const fnStart = appSrc.indexOf('function renderCandidatePanel');
  const fnEnd = appSrc.indexOf('\nfunction ', fnStart + 1);
  const fnBody = appSrc.slice(fnStart, fnEnd > 0 ? fnEnd : fnStart + 800);
  assert.ok(fnBody.includes('elements.candidateDetails.open = items.length > 0'), 'açık/kapalı kararı aday sayısına göre');
  assert.ok(fnBody.includes('!state.candidatePanelManuallyToggled'), 'kullanıcı elle değiştirdiyse otomatik kapatma/açma atlanıyor');
  assert.ok(fnBody.includes('elements.candidateEmpty.hidden = items.length > 0'), 'mevcut empty-state mantığı korunuyor');
  assert.ok(fnBody.includes('elements.candidateList.replaceChildren'), 'mevcut liste render mantığı korunuyor');
  assert.ok(fnBody.includes('renderCandidateDetails()'), 'mevcut aday detay render çağrısı korunuyor');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
