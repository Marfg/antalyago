const path = require('node:path');

/**
 * SGF dışa aktarma iş mantığı — Electron'dan bağımsız, test edilebilir.
 *
 * main.cjs bunu gerçek `dialog.showSaveDialog` ve `fileHandlers.writeSgfFile`
 * ile çağırır; testler sahte (fake) fonksiyonlar enjekte eder. .agstudio
 * kayıt akışından kasıtlı olarak ayrık tutulur: activeDocument/activeDocumentPath
 * gibi belge-yolu durumuna hiç erişimi yoktur, bu yüzden yapısal olarak
 * onları değiştiremez.
 *
 * @param {object} params
 * @param {object} params.document — dışa aktarılacak studioDocument
 * @param {(doc: object) => { sgf: string, warnings: string[] }} params.formatSGF
 * @param {(options: object) => Promise<{canceled: boolean, filePath?: string}>} params.showSaveDialog
 * @param {(filePath: string, text: string) => Promise<void>} params.writeSgfFile
 * @param {string} [params.defaultFileName]
 * @returns {Promise<{canceled: true} | {canceled: false, filePath: string, warnings: string[]}>}
 */
async function exportSgfDocument({ document, formatSGF, showSaveDialog, writeSgfFile, defaultFileName }) {
  if (!document) {
    throw new Error('Dışa aktarılacak belge yok.');
  }

  const { sgf, warnings } = formatSGF(document);

  const suggestedName = defaultFileName || document.slug || document.id || 'belge';
  const dialogResult = await showSaveDialog({
    title: 'SGF olarak dışa aktar',
    defaultPath: `${suggestedName}.sgf`,
    filters: [{ name: 'SGF dosyası', extensions: ['sgf'] }],
  });

  if (dialogResult.canceled || !dialogResult.filePath) {
    return { canceled: true };
  }

  const resolved = path.resolve(dialogResult.filePath);
  if (!resolved.toLowerCase().endsWith('.sgf')) {
    throw new Error('Dosya uzantısı .sgf olmalıdır.');
  }

  await writeSgfFile(resolved, sgf);

  return { canceled: false, filePath: resolved, warnings };
}

module.exports = { exportSgfDocument };
