import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { chromium } from 'playwright-core';
import { BoardState } from '../core/boardState.js';
import { createStudioBoardAdapter } from '../desktop/ipc/studioBoardAdapter.js';
import { createDocument } from '../studio/model/studioDocument.js';
import { addChildMove, rebuildBoardState } from '../studio/model/moveTree.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const htmlPath = path.join(root, 'desktop', 'index.html');
const htmlUrl = pathToFileURL(htmlPath).href;
const boardAdapter = createStudioBoardAdapter(BoardState);
const documentsFolder = path.join(os.homedir(), 'Documents', 'AntalyaGo Studio');

const sampleDocument = createDocument({
  id: 'studio-shell-check',
  title: 'Tahta Merkezli Çalışma Alanı',
  slug: 'studio-shell-check',
  summary: 'Electron masaüstü kabuğu için örnek belge.',
  board: {
    size: 9,
    turn: 'black',
    ko: null,
    stones: [],
    markers: [],
    regions: [],
    viewport: null,
  },
});

const rootNode = sampleDocument.moveTree.root;
const first = addChildMove(rootNode, 'root', { color: 'black', x: 4, y: 4 }, { comment: 'Ana dal' });
const variant = addChildMove(rootNode, 'root', { color: 'black', x: 3, y: 3 }, { comment: 'Varyant' });
const reply = addChildMove(rootNode, first.node.id, { color: 'white', x: 4, y: 5 }, { comment: 'Devam' });

assert.ok(first.ok && variant.ok && reply.ok, 'Örnek hamle ağacı kurulamadı');
sampleDocument.moveTree.activeNodeId = reply.node.id;
sampleDocument.activeNodeId = reply.node.id;
sampleDocument.board = boardAdapter.toDocumentBoard(rebuildBoardState(rootNode, reply.node.id));
sampleDocument.moves = [first.node.move, reply.node.move];

const bootState = {
  settings: {
    workspaceFolder: documentsFolder,
    workspaceConfirmed: false,
    contentProducerMode: true,
    recentDocuments: [],
    lastOpenedDocument: null,
    theme: 'dark',
  },
  documents: [
    {
      id: 'studio-shell-check',
      title: sampleDocument.title,
      status: sampleDocument.status,
      boardSize: sampleDocument.board.size,
      updatedAt: sampleDocument.audit.updatedAt,
      filePath: path.join(documentsFolder, 'studio-shell-check.agstudio'),
    },
    {
      id: 'lesson-outline',
      title: 'Ders iskeleti',
      status: 'review',
      boardSize: 9,
      updatedAt: '2026-07-03T09:00:00.000Z',
      filePath: path.join(documentsFolder, 'lesson-outline.agstudio'),
    },
  ],
  activeDocument: sampleDocument,
  activeDocumentPath: path.join(documentsFolder, 'studio-shell-check.agstudio'),
  needsWorkspaceSelection: true,
};

async function launchBrowser() {
  const launchOptions = { headless: true, args: ['--disable-gpu', '--allow-file-access-from-files'] };
  const envPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

  if (envPath) {
    return chromium.launch({ ...launchOptions, executablePath: envPath });
  }

  try {
    return await chromium.launch(launchOptions);
  } catch (error) {
    const pathExecutable = await resolveBrowserFromPath();
    if (pathExecutable) {
      return chromium.launch({ ...launchOptions, executablePath: pathExecutable });
    }
    throw error;
  }
}

async function resolveBrowserFromPath() {
  const candidates = ['chrome.exe', 'msedge.exe', 'chromium.exe'];
  for (const candidate of candidates) {
    const found = whereExecutable(candidate);
    if (found) return found;
  }
  return null;
}

function whereExecutable(name) {
  const result = spawnSync('where', [name], { encoding: 'utf8' });
  if (result.status !== 0 || !result.stdout) return null;
  return result.stdout.split(/\r?\n/).map(line => line.trim()).find(Boolean) || null;
}

async function waitForStablePaint(page) {
  await page.evaluate(async () => {
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }
    await Promise.all(Array.from(document.images).map(async image => {
      if (typeof image.decode === 'function') {
        try {
          await image.decode();
        } catch {
          // ignore decode flukes in the test harness
        }
      }
    }));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await page.waitForTimeout(250);
}

async function main() {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const calls = [];
    const consoleMessages = [];
    const pageErrors = [];

    page.on('console', message => {
      if (message.type() === 'error') {
        consoleMessages.push(message.text());
      }
    });
    page.on('pageerror', error => {
      pageErrors.push(error?.message ?? String(error));
    });

    await page.addInitScript(boot => {
      try {
        window.localStorage.setItem('antalyago-theme', 'dark');
      } catch {
        // ignore storage failures in the test harness
      }
      window.studioAPI = {
        boot: async () => boot,
        getVersion: async () => '0.0.0-test',
        getSettings: async () => boot.settings,
        chooseWorkspaceFolder: async () => ({ canceled: false, workspaceFolder: boot.settings.workspaceFolder }),
        newDocument: async () => ({ document: boot.activeDocument }),
        openDocument: async () => ({ document: boot.activeDocument }),
        openFilePath: async () => ({ document: boot.activeDocument }),
        saveDocument: async document => ({ document }),
        saveDocumentAs: async document => ({ document }),
        listDocuments: async () => boot.documents,
        validateDocument: async () => ({ valid: true, errors: [], warnings: [] }),
        setContentProducerMode: async enabled => ({ enabled }),
        onDocumentOpened: callback => {
          window.__studioCallbacks = window.__studioCallbacks || [];
          window.__studioCallbacks.push(callback);
          return () => {};
        },
        onWorkspaceChanged: callback => {
          window.__studioWorkspaceCallbacks = window.__studioWorkspaceCallbacks || [];
          window.__studioWorkspaceCallbacks.push(callback);
          return () => {};
        },
      };
      window.__testCalls = [];
    }, bootState);

    await page.goto(htmlUrl);
    await waitForStablePaint(page);

    const shellInfo = await page.evaluate(() => {
      const board = document.getElementById('studio-board');
      const rail = document.querySelector('.rail');
      const inspector = document.querySelector('.inspector');
      const banner = document.querySelector('[data-workspace-banner]');
      const technical = document.querySelector('[data-technical-details]');
      const themeToggle = document.querySelector('[data-theme-toggle]');
      const newButton = document.querySelector('[data-action-new]');
      const treeSummary = document.querySelector('[data-move-tree-summary]');
      const treePath = document.querySelector('[data-move-tree-path]');
      const treeStatus = document.querySelector('[data-move-tree-status]');
      const root = document.documentElement;
      const boardRect = board.getBoundingClientRect();
      const railRect = rail.getBoundingClientRect();
      const inspectorRect = inspector.getBoundingClientRect();
      return {
        theme: root.dataset.theme,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        boardRect: { x: boardRect.x, y: boardRect.y, width: boardRect.width, height: boardRect.height },
        railRect: { x: railRect.x, y: railRect.y, width: railRect.width, height: railRect.height },
        inspectorRect: { x: inspectorRect.x, y: inspectorRect.y, width: inspectorRect.width, height: inspectorRect.height },
        bannerHidden: banner?.hidden ?? true,
        bannerText: banner?.textContent?.trim() ?? '',
        technicalOpen: !!technical?.open,
        themePressed: themeToggle?.getAttribute('aria-pressed'),
        themeLabel: themeToggle?.getAttribute('aria-label'),
        docTitle: document.querySelector('[data-doc-title]')?.value ?? '',
        docStatus: document.querySelector('[data-doc-status]')?.value ?? '',
        libraryCount: document.querySelectorAll('[data-library-list] li').length,
        newButtonText: newButton?.textContent?.trim() ?? '',
        treeSummary: treeSummary?.textContent?.trim() ?? '',
        treePathCount: treePath?.querySelectorAll('button').length ?? 0,
        treeStatus: treeStatus?.textContent?.trim() ?? '',
      };
    });

    assert.equal(shellInfo.theme, 'dark');
    assert.ok(shellInfo.themePressed === 'true' || shellInfo.themePressed === 'false');
    assert.ok(shellInfo.themeLabel.length > 0);
    assert.ok(shellInfo.libraryCount >= 2);
    assert.equal(shellInfo.docTitle, sampleDocument.title);
    assert.equal(shellInfo.docStatus, sampleDocument.status);
    assert.ok(shellInfo.boardRect.width > 500, 'board should dominate the center column');
    assert.ok(shellInfo.boardRect.width > shellInfo.railRect.width, 'board column should be wider than library rail');
    assert.ok(shellInfo.boardRect.width > shellInfo.inspectorRect.width, 'board column should be wider than inspector');
    assert.ok(shellInfo.scrollWidth <= shellInfo.clientWidth, 'no horizontal overflow');
    assert.ok(shellInfo.treeSummary.includes('Hamle ağacı'), 'tree summary missing');
    assert.ok(shellInfo.treePathCount >= 3, 'path trail should show current route');
    assert.ok(shellInfo.treeStatus.includes('seçili'), 'tree status should mention selection');

    await page.click('[data-node-id="root"]');
    await waitForStablePaint(page);
    const afterRootSelect = await page.locator('[data-move-tree-status]').textContent();
    assert.match(afterRootSelect ?? '', /Kök|seçili/i);

    await page.fill('[data-move-tree-x]', '2');
    await page.fill('[data-move-tree-y]', '6');
    await page.selectOption('[data-move-tree-color]', 'black');
    await page.click('[data-move-tree-add]');
    await waitForStablePaint(page);
    const afterAdd = await page.evaluate(() => ({
      title: document.querySelector('[data-doc-title]')?.value ?? '',
      pathCount: document.querySelector('[data-move-tree-path]')?.querySelectorAll('button').length ?? 0,
      nodeCount: document.querySelectorAll('[data-node-id]').length,
      activeText: document.querySelector('[data-move-tree-status]')?.textContent?.trim() ?? '',
    }));
    assert.ok(afterAdd.pathCount >= 2, 'new path should be visible after add');
    assert.ok(afterAdd.nodeCount >= 4, 'tree should gain a node');
    assert.match(afterAdd.activeText, /Hamle eklendi/i);

    await page.locator('[data-move-tree-viewport]').focus();
    await page.keyboard.press('ArrowLeft');
    await waitForStablePaint(page);
    const keyboardSelection = await page.locator('[data-move-tree-status]').textContent();
    assert.match(keyboardSelection ?? '', /Kök|seçili/i);

    await page.keyboard.press('ArrowRight');
    await waitForStablePaint(page);
    const restoredSelection = await page.locator('[data-move-tree-status]').textContent();
    assert.match(restoredSelection ?? '', /hamle|seçili/i);

    await page.on('dialog', dialog => dialog.accept());
    await page.click('[data-move-tree-delete]');
    await waitForStablePaint(page);
    const afterDelete = await page.evaluate(() => ({
      nodeCount: document.querySelectorAll('[data-node-id]').length,
      status: document.querySelector('[data-move-tree-status]')?.textContent?.trim() ?? '',
    }));
    assert.ok(afterDelete.nodeCount >= 3, 'root and main path should remain after delete');
    assert.match(afterDelete.status, /silindi|seçili/i);

    const screenshotPath = path.join(root, 'tests', 'studio-tree-dark.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });

    assert.equal(calls.length, 0);
    assert.equal(consoleMessages.length, 0, `Browser console error(s): ${consoleMessages.join(' | ')}`);
    assert.equal(pageErrors.length, 0, `Browser page error(s): ${pageErrors.join(' | ')}`);
    console.log('verify-studio-desktop.mjs: ok');
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
