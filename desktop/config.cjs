const path = require('node:path');

function getDefaultDocumentsFolder(documentsPath) {
  return path.join(documentsPath, 'AntalyaGo Studio');
}

function getStudioSettingsPath(userDataPath) {
  return path.join(userDataPath, 'studio-settings.json');
}

function getDefaultWorkspaceState(documentsPath) {
  return {
    workspaceFolder: getDefaultDocumentsFolder(documentsPath),
    workspaceConfirmed: false,
    contentProducerMode: true,
    recentDocuments: [],
    lastOpenedDocument: null,
    theme: 'dark',
  };
}

module.exports = {
  getDefaultDocumentsFolder,
  getStudioSettingsPath,
  getDefaultWorkspaceState,
};
