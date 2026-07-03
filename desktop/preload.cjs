const { contextBridge, ipcRenderer } = require('electron');
const { createStudioApi } = require('./ipc/studioApi.cjs');

contextBridge.exposeInMainWorld('studioAPI', createStudioApi(ipcRenderer));
