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
