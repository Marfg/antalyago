const STUDIO_CHANNELS = Object.freeze({
  BOOT: 'studio:boot',
  GET_VERSION: 'studio:get-version',
  CHOOSE_WORKSPACE_FOLDER: 'studio:choose-workspace-folder',
  NEW_DOCUMENT: 'studio:new-document',
  OPEN_DOCUMENT: 'studio:open-document',
  OPEN_FILE_PATH: 'studio:open-file-path',
  SAVE_DOCUMENT: 'studio:save-document',
  SAVE_DOCUMENT_AS: 'studio:save-document-as',
  EXPORT_SGF_DOCUMENT: 'studio:export-sgf-document',
  LIST_DOCUMENTS: 'studio:list-documents',
  VALIDATE_DOCUMENT: 'studio:validate-document',
  SET_CONTENT_PRODUCER_MODE: 'studio:set-content-producer-mode',
  GET_SETTINGS: 'studio:get-settings',
  DOCUMENT_OPENED: 'studio:document-opened',
  WORKSPACE_CHANGED: 'studio:workspace-changed',
  LIST_CANDIDATES: 'studio:list-candidates',
  OPEN_CANDIDATE_PREVIEW: 'studio:open-candidate-preview',
  OPEN_CANDIDATE_DOCUMENT: 'studio:open-candidate-document',
});

module.exports = { STUDIO_CHANNELS };