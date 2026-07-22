const { STUDIO_CHANNELS } = require('./ipcChannels.cjs');

function createStudioApi(ipcRenderer) {
  const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);
  const on = (channel, callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  };

  return {
    boot: () => invoke(STUDIO_CHANNELS.BOOT),
    getVersion: () => invoke(STUDIO_CHANNELS.GET_VERSION),
    getSettings: () => invoke(STUDIO_CHANNELS.GET_SETTINGS),
    chooseWorkspaceFolder: () => invoke(STUDIO_CHANNELS.CHOOSE_WORKSPACE_FOLDER),
    newDocument: payload => invoke(STUDIO_CHANNELS.NEW_DOCUMENT, payload),
    openDocument: () => invoke(STUDIO_CHANNELS.OPEN_DOCUMENT),
    openFilePath: filePath => invoke(STUDIO_CHANNELS.OPEN_FILE_PATH, filePath),
    saveDocument: document => invoke(STUDIO_CHANNELS.SAVE_DOCUMENT, document),
    saveDocumentAs: document => invoke(STUDIO_CHANNELS.SAVE_DOCUMENT_AS, document),
    exportSgfDocument: document => invoke(STUDIO_CHANNELS.EXPORT_SGF_DOCUMENT, document),
    listDocuments: () => invoke(STUDIO_CHANNELS.LIST_DOCUMENTS),
    validateDocument: document => invoke(STUDIO_CHANNELS.VALIDATE_DOCUMENT, document),
    setContentProducerMode: enabled => invoke(STUDIO_CHANNELS.SET_CONTENT_PRODUCER_MODE, !!enabled),
    listCandidates: () => invoke(STUDIO_CHANNELS.LIST_CANDIDATES),
    openCandidatePreview: candidateId => invoke(STUDIO_CHANNELS.OPEN_CANDIDATE_PREVIEW, candidateId),
    openCandidateDocument: candidateId => invoke(STUDIO_CHANNELS.OPEN_CANDIDATE_DOCUMENT, candidateId),
    onDocumentOpened: callback => on(STUDIO_CHANNELS.DOCUMENT_OPENED, callback),
    onWorkspaceChanged: callback => on(STUDIO_CHANNELS.WORKSPACE_CHANGED, callback),
  };
}

module.exports = { createStudioApi };