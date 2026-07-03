const STUDIO_CHANNELS = Object.freeze({
  BOOT: 'studio:boot',
  GET_VERSION: 'studio:get-version',
  CHOOSE_WORKSPACE_FOLDER: 'studio:choose-workspace-folder',
  NEW_DOCUMENT: 'studio:new-document',
  OPEN_DOCUMENT: 'studio:open-document',
  OPEN_FILE_PATH: 'studio:open-file-path',
  SAVE_DOCUMENT: 'studio:save-document',
  SAVE_DOCUMENT_AS: 'studio:save-document-as',
  LIST_DOCUMENTS: 'studio:list-documents',
  VALIDATE_DOCUMENT: 'studio:validate-document',
  SET_CONTENT_PRODUCER_MODE: 'studio:set-content-producer-mode',
  GET_SETTINGS: 'studio:get-settings',
  DOCUMENT_OPENED: 'studio:document-opened',
  WORKSPACE_CHANGED: 'studio:workspace-changed',
});

module.exports = { STUDIO_CHANNELS };
