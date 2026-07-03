const path = require('node:path');
const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const { STUDIO_CHANNELS } = require('./ipc/ipcChannels.cjs');
const { loadStudioSettings, saveStudioSettings } = require('./ipc/settingsStore.cjs');
const {
  listAgstudioDocuments,
  readAgstudioDocument,
  resolveDocumentPath,
  writeAgstudioDocument,
} = require('./ipc/fileHandlers.cjs');
const { getDefaultWorkspaceState } = require('./config.cjs');

let mainWindow = null;
let settings = null;
let activeDocument = null;
let activeDocumentPath = null;
let validateStudioDocument = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: '#15111f',
    title: 'AntalyaGo Studio',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  if (process.env.STUDIO_DEVTOOLS === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

async function ensureSettings() {
  const documentsPath = app.getPath('documents');
  const userDataPath = app.getPath('userData');
  const loaded = await loadStudioSettings(userDataPath, documentsPath);

  settings = {
    ...getDefaultWorkspaceState(documentsPath),
    ...loaded,
  };
  await saveStudioSettings(userDataPath, documentsPath, settings);
}

async function chooseWorkspaceFolder() {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'AntalyaGo proje klasörü seç',
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: settings.workspaceFolder ?? app.getPath('documents'),
  });

  if (canceled || !filePaths?.[0]) {
    return { canceled: true };
  }

  settings.workspaceFolder = path.resolve(filePaths[0]);
  settings.workspaceConfirmed = true;
  await persistSettings();
  notifyWorkspaceChanged();
  return { canceled: false, workspaceFolder: settings.workspaceFolder };
}

async function persistSettings() {
  const userDataPath = app.getPath('userData');
  const documentsPath = app.getPath('documents');
  settings = await saveStudioSettings(userDataPath, documentsPath, settings);
}

function currentBootState() {
  return {
    settings: {
      workspaceFolder: settings.workspaceFolder,
      workspaceConfirmed: settings.workspaceConfirmed,
      contentProducerMode: settings.contentProducerMode,
      theme: settings.theme,
      recentDocuments: settings.recentDocuments ?? [],
      lastOpenedDocument: settings.lastOpenedDocument ?? null,
    },
    documents: [],
    activeDocument,
    activeDocumentPath,
    needsWorkspaceSelection: !settings.workspaceConfirmed,
  };
}

async function loadWorkspaceDocuments() {
  if (!settings.workspaceFolder) {
    return [];
  }

  return listAgstudioDocuments(settings.workspaceFolder);
}

async function openDocumentFile(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return { canceled: true };
  }

  const resolved = path.resolve(filePath);
  if (!resolved.toLowerCase().endsWith('.agstudio')) {
    throw new Error('Yalnız .agstudio dosyaları açılabilir.');
  }

  const document = await readAgstudioDocument(resolved);
  activeDocument = document;
  activeDocumentPath = resolved;
  settings.lastOpenedDocument = resolved;
  settings.recentDocuments = [resolved, ...(settings.recentDocuments ?? []).filter(item => item !== resolved)].slice(0, 10);
  await persistSettings();
  notifyDocumentOpened();
  return { canceled: false, document, filePath: resolved };
}

async function createNewDocument() {
  const { createDocument } = await import('../studio/model/studioDocument.js');
  const stamp = Date.now().toString(36);
  const document = createDocument({
    id: `studio-${stamp}`,
    title: 'Yeni içerik belgesi',
    slug: `studio-${stamp}`,
    summary: 'Tahta-merkezli içerik üretimi için başlangıç taslağı.',
  });
  activeDocument = document;
  activeDocumentPath = null;
  notifyDocumentOpened();
  return { canceled: false, document, filePath: null };
}

async function saveDocument(document) {
  const doc = document ?? activeDocument;
  if (!doc) {
    throw new Error('Kaydedilecek belge yok.');
  }

  const targetPath = activeDocumentPath ?? resolveDocumentPath(settings.workspaceFolder, doc.slug ?? doc.id);
  if (!targetPath) {
    return saveDocumentAs(doc);
  }

  await writeAgstudioDocument(targetPath, doc);
  activeDocument = doc;
  activeDocumentPath = targetPath;
  settings.lastOpenedDocument = targetPath;
  settings.recentDocuments = [targetPath, ...(settings.recentDocuments ?? []).filter(item => item !== targetPath)].slice(0, 10);
  await persistSettings();
  notifyDocumentOpened();
  return { canceled: false, document: doc, filePath: targetPath };
}

async function saveDocumentAs(document) {
  const doc = document ?? activeDocument;
  if (!doc) {
    throw new Error('Kaydedilecek belge yok.');
  }

  const result = await dialog.showSaveDialog({
    title: 'Belgeyi kaydet',
    defaultPath: settings.workspaceFolder ? path.join(settings.workspaceFolder, `${doc.slug ?? doc.id}.agstudio`) : `${doc.slug ?? doc.id}.agstudio`,
    filters: [{ name: 'AntalyaGo Studio belge', extensions: ['agstudio'] }],
  });

  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }

  const resolved = path.resolve(result.filePath);
  if (!resolved.toLowerCase().endsWith('.agstudio')) {
    throw new Error('Belge uzantısı .agstudio olmalıdır.');
  }

  await writeAgstudioDocument(resolved, doc);
  activeDocument = doc;
  activeDocumentPath = resolved;
  settings.lastOpenedDocument = resolved;
  settings.recentDocuments = [resolved, ...(settings.recentDocuments ?? []).filter(item => item !== resolved)].slice(0, 10);
  await persistSettings();
  notifyDocumentOpened();
  return { canceled: false, document: doc, filePath: resolved };
}

function validateDocument(document) {
  if (typeof validateStudioDocument !== 'function') {
    throw new Error('Doğrulama motoru başlatılamadı.');
  }
  return validateStudioDocument(document);
}

function notifyDocumentOpened() {
  if (mainWindow?.webContents) {
    mainWindow.webContents.send(STUDIO_CHANNELS.DOCUMENT_OPENED, currentBootState());
  }
}

function notifyWorkspaceChanged() {
  if (mainWindow?.webContents) {
    mainWindow.webContents.send(STUDIO_CHANNELS.WORKSPACE_CHANGED, currentBootState());
  }
}

async function registerIpcHandlers() {
  ipcMain.handle(STUDIO_CHANNELS.BOOT, async () => {
    const documents = await loadWorkspaceDocuments();
    if (!activeDocument && documents[0]) {
      activeDocument = await readAgstudioDocument(documents[0].filePath);
      activeDocumentPath = documents[0].filePath;
    }
    return {
      ...currentBootState(),
      documents,
      activeDocument,
      activeDocumentPath,
    };
  });

  ipcMain.handle(STUDIO_CHANNELS.GET_SETTINGS, async () => currentBootState().settings);
  ipcMain.handle(STUDIO_CHANNELS.GET_VERSION, async () => app.getVersion());
  ipcMain.handle(STUDIO_CHANNELS.CHOOSE_WORKSPACE_FOLDER, async () => chooseWorkspaceFolder());
  ipcMain.handle(STUDIO_CHANNELS.NEW_DOCUMENT, async () => createNewDocument());
  ipcMain.handle(STUDIO_CHANNELS.OPEN_DOCUMENT, async () => {
    const result = await dialog.showOpenDialog({
      title: 'AntalyaGo Studio belgesi aç',
      properties: ['openFile'],
      filters: [{ name: 'AntalyaGo Studio belge', extensions: ['agstudio'] }],
      defaultPath: settings.workspaceFolder ?? app.getPath('documents'),
    });
    if (result.canceled || !result.filePaths?.[0]) {
      return { canceled: true };
    }
    return openDocumentFile(result.filePaths[0]);
  });
  ipcMain.handle(STUDIO_CHANNELS.OPEN_FILE_PATH, async (_event, filePath) => openDocumentFile(filePath));
  ipcMain.handle(STUDIO_CHANNELS.SAVE_DOCUMENT, async (_event, document) => saveDocument(document));
  ipcMain.handle(STUDIO_CHANNELS.SAVE_DOCUMENT_AS, async (_event, document) => saveDocumentAs(document));
  ipcMain.handle(STUDIO_CHANNELS.LIST_DOCUMENTS, async () => loadWorkspaceDocuments());
  ipcMain.handle(STUDIO_CHANNELS.VALIDATE_DOCUMENT, async (_event, document) => validateDocument(document));
  ipcMain.handle(STUDIO_CHANNELS.SET_CONTENT_PRODUCER_MODE, async (_event, enabled) => {
    settings.contentProducerMode = !!enabled;
    await persistSettings();
    return { enabled: settings.contentProducerMode };
  });
}

async function bootstrap() {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }

  await app.whenReady();
  const validationModule = await import('../studio/model/validation.js');
  validateStudioDocument = validationModule.validateDocument;
  await ensureSettings();
  await registerIpcHandlers();
  createWindow();

  app.on('second-instance', async (_event, argv) => {
    const candidate = argv.find(argument => argument.toLowerCase().endsWith('.agstudio'));
    if (candidate) {
      await openDocumentFile(candidate);
    }
    if (mainWindow) {
      mainWindow.focus();
    }
  });

  app.on('open-file', async (_event, filePath) => {
    if (filePath) {
      await openDocumentFile(filePath);
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}

bootstrap().catch(error => {
  console.error(error);
  app.exit(1);
});
