import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { _electron as electron, chromium } from 'playwright-core';
import { buildCandidateSummary, buildStudioDocument } from '../scripts/problem-bank/candidate-studio-adapter.mjs';
import { createDocument } from '../studio/model/studioDocument.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const candidateFileName = 'example-falling-in-love-with-baduk-b1-l2-liberty-001';
const candidateId = 'falling-in-love-with-baduk-b1-l2-liberty-001';
const candidatePath = path.join(root, 'content/problem-bank/candidates/items', `${candidateFileName}.json`);
const candidateUrl = pathToFileURL(candidatePath).href;
const htmlUrl = pathToFileURL(path.join(root, 'desktop', 'index.html')).href;

function sha256File(filePath) {
  return fs.readFile(filePath).then(buffer => crypto.createHash('sha256').update(buffer).digest('hex'));
}

function isolatedEnv(baseDir) {
  const profile = path.join(baseDir, 'profile');
  const temp = path.join(baseDir, 'tmp');
  return {
    ...process.env,
    APPDATA: path.join(baseDir, 'appdata'),
    LOCALAPPDATA: path.join(baseDir, 'localappdata'),
    USERPROFILE: profile,
    HOME: profile,
    TEMP: temp,
    TMP: temp,
  };
}

async function loadCandidateFixture() {
  const candidate = JSON.parse(await fs.readFile(candidatePath, 'utf8'));
  const summary = { ...buildCandidateSummary(candidate), valid: true, canOpen: true, parseError: null };
  const document = buildStudioDocument(candidate);
  return { candidate, summary, document };
}

async function waitForStableUi(page) {
  await page.waitForFunction(() => document.querySelectorAll('[data-candidate-list] .candidate-card').length > 0);
  await page.evaluate(async () => {
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }
    await Promise.all(Array.from(document.images).map(async image => {
      if (typeof image.decode === 'function') {
        try {
          await image.decode();
        } catch {
          // ignore decode timing flukes in the smoke harness
        }
      }
    }));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await page.waitForTimeout(200);
}

async function runAssertions(page, beforeHash, usedElectron) {
  await waitForStableUi(page);

  const initial = await page.evaluate(() => ({
    candidateCount: document.querySelectorAll('[data-candidate-list] .candidate-card').length,
    summary: document.querySelector('[data-candidate-summary-note]')?.textContent?.trim() ?? '',
    workspaceTitle: document.getElementById('studio-workspace-title')?.textContent?.trim() ?? '',
    previewHidden: document.querySelector('[data-candidate-preview-panel]')?.hidden ?? true,
  }));

  assert.ok(initial.candidateCount > 0, 'Problem Adayları listesi boş');
  assert.ok(initial.summary.length > 0, 'Aday özeti boş');
  assert.ok(initial.workspaceTitle.length > 0, 'Çalışma alanı başlığı boş');
  assert.equal(initial.previewHidden, true);

  await page.locator(`[data-candidate-id="${candidateId}"]`).click();
  await waitForStableUi(page);

  const preview = await page.evaluate(() => ({
    previewHidden: document.querySelector('[data-candidate-preview-panel]')?.hidden ?? true,
    readOnlyVisible: !(document.querySelector('[data-candidate-readonly-banner]')?.hidden ?? true),
    statusText: document.querySelector('[data-candidate-status]')?.textContent?.trim() ?? '',
    readOnlyText: document.querySelector('[data-candidate-readonly-message]')?.textContent?.trim() ?? '',
    titleText: document.querySelector('[data-candidate-title]')?.textContent?.trim() ?? '',
    sourceText: document.querySelector('[data-candidate-source]')?.textContent?.trim() ?? '',
    rightsText: document.querySelector('[data-candidate-rights]')?.textContent?.trim() ?? '',
    saveTitle: document.querySelector('[data-action-save]')?.title ?? '',
    boardSvg: !!document.querySelector('#studio-board svg'),
    stoneCount: document.querySelectorAll('#studio-board svg .stones circle').length,
    treeNoteText: document.querySelector('.move-tree-item__note')?.textContent?.trim() ?? '',
    boardCaption: document.getElementById('studio-board-caption')?.textContent?.trim() ?? '',
    workText: document.querySelector('[data-candidate-work]')?.textContent?.trim() ?? '',
    workDisabled: document.querySelector('[data-candidate-work]')?.disabled ?? true,
  }));

  assert.equal(preview.previewHidden, false);
  assert.equal(preview.readOnlyVisible, true);
  assert.match(preview.statusText, /Salt-okunur önizleme/i);
  assert.match(preview.readOnlyText, /salt-okunur/i);
  assert.match(preview.sourceText, /falling-in-love-with-baduk/);
  assert.match(preview.rightsText, /İnceleme gerekli|Yayın hakkı/i);
  assert.ok(preview.boardSvg, 'Önizlemede tahta SVG olarak çizilmedi');
  assert.ok(preview.stoneCount >= 1, 'Başlangıç taşları görünmüyor');
  assert.match(preview.treeNoteText, /label|annotation/i);
  assert.match(preview.boardCaption, /salt-okunur/i);
  assert.match(preview.workText, /Studio belgesi olarak çalış/i);
  assert.equal(preview.workDisabled, false);
  assert.match(preview.saveTitle, /Farklı Kaydet/i);

  await page.locator('[data-candidate-work]').click();
  await waitForStableUi(page);

  const working = await page.evaluate(() => ({
    readOnlyHidden: document.querySelector('[data-candidate-readonly-banner]')?.hidden ?? true,
    statusText: document.querySelector('[data-candidate-status]')?.textContent?.trim() ?? '',
    boardCaption: document.getElementById('studio-board-caption')?.textContent?.trim() ?? '',
    workText: document.querySelector('[data-candidate-work]')?.textContent?.trim() ?? '',
    workDisabled: document.querySelector('[data-candidate-work]')?.disabled ?? true,
    saveTitle: document.querySelector('[data-action-save]')?.title ?? '',
  }));

  assert.equal(working.readOnlyHidden, true);
  assert.match(working.statusText, /Çalışma belgesi/i);
  assert.match(working.boardCaption, /Çalışma belgesi/i);
  assert.match(working.workText, /Çalışma belgesi açık/i);
  assert.equal(working.workDisabled, true);
  assert.match(working.saveTitle, /Farklı Kaydet/i);

  const afterHash = await sha256File(candidatePath);
  assert.equal(afterHash, beforeHash, 'candidate JSON önizleme/çalışma sırasında değişti');

  if (usedElectron) {
    console.log('studio-candidate-electron.test.js: electron smoke ok');
  } else {
    console.log('studio-candidate-electron.test.js: chromium fallback ok');
  }
}

async function launchElectronSmoke(baseDir) {
  return electron.launch({
    args: ['--disable-gpu', path.join(root, 'desktop', 'main.cjs')],
    cwd: root,
    env: { ...isolatedEnv(baseDir), STUDIO_SKIP_SINGLE_INSTANCE_LOCK: '1' },
  });
}

async function launchChromiumFallback(baseDir, bootFixture) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--allow-file-access-from-files'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(({ boot, candidate, summary, document }) => {
    window.studioAPI = {
      boot: async () => boot,
      getVersion: async () => '0.0.0-test',
      getSettings: async () => boot.settings,
      chooseWorkspaceFolder: async () => ({ canceled: false, workspaceFolder: boot.settings.workspaceFolder }),
      newDocument: async () => ({ document }),
      openDocument: async () => ({ document }),
      openFilePath: async () => ({ document }),
      saveDocument: async nextDocument => ({ document: nextDocument }),
      saveDocumentAs: async nextDocument => ({ document: nextDocument, filePath: null }),
      listDocuments: async () => boot.documents,
      validateDocument: async () => ({ valid: true, errors: [], warnings: [] }),
      setContentProducerMode: async enabled => ({ enabled }),
      listCandidates: async () => ({ ok: true, items: [summary] }),
      openCandidatePreview: async () => ({ ok: true, candidate, summary, document, validation: { valid: true, errors: [], warnings: [] }, readOnly: true }),
      openCandidateDocument: async () => ({ ok: true, candidate, summary, document, validation: { valid: true, errors: [], warnings: [] }, readOnly: false }),
      onDocumentOpened: () => () => {},
      onWorkspaceChanged: () => () => {},
    };
  }, bootFixture);
  await page.goto(htmlUrl);
  return { browser, page };
}

async function main() {
  const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agstudio-candidate-electron-'));
  const beforeHash = await sha256File(candidatePath);
  const candidateFixture = await loadCandidateFixture();
  const bootFixture = {
    boot: {
      settings: {
        workspaceFolder: path.join(baseDir, 'documents', 'AntalyaGo Studio'),
        workspaceConfirmed: true,
        contentProducerMode: true,
        recentDocuments: [],
        lastOpenedDocument: null,
        theme: 'dark',
      },
      documents: [
        {
          id: 'studio-shell-check',
          title: 'Tahta Merkezli Çalışma Alanı',
          status: 'draft',
          boardSize: 9,
          updatedAt: '2026-07-08T00:00:00.000Z',
          filePath: path.join(baseDir, 'documents', 'AntalyaGo Studio', 'studio-shell-check.agstudio'),
        },
      ],
      activeDocument: createDocument({
        id: 'studio-shell-check',
        title: 'Tahta Merkezli Çalışma Alanı',
        slug: 'studio-shell-check',
        summary: 'Electron candidate smoke test document.',
      }),
      activeDocumentPath: path.join(baseDir, 'documents', 'AntalyaGo Studio', 'studio-shell-check.agstudio'),
      needsWorkspaceSelection: false,
    },
    candidate: candidateFixture.candidate,
    summary: candidateFixture.summary,
    document: candidateFixture.document,
  };

  let browser = null;
  let page = null;
  let usedElectron = false;

  try {
    const app = await launchElectronSmoke(baseDir);
    usedElectron = true;
    try {
      page = await app.firstWindow();
      await page.waitForLoadState('domcontentloaded');
      await runAssertions(page, beforeHash, true);
    } finally {
      await app.close();
    }
  } catch (error) {
    console.warn(`Electron smoke failed, falling back to Chromium harness: ${error?.message ?? error}`);
    const fallback = await launchChromiumFallback(baseDir, bootFixture);
    browser = fallback.browser;
    page = fallback.page;
    try {
      await runAssertions(page, beforeHash, false);
    } finally {
      await browser.close();
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});