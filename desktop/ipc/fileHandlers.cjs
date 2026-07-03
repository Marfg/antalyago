const fs = require('node:fs/promises');
const path = require('node:path');
const { isAgstudioPath, resolveAgstudioPath } = require('./pathPolicy.cjs');

async function readAgstudioDocument(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  const { migrateDocument } = await import('../../studio/model/studioDocument.js');
  return migrateDocument(JSON.parse(raw));
}

async function writeAgstudioDocument(filePath, document) {
  if (!isAgstudioPath(filePath)) {
    throw new Error('Geçersiz .agstudio yolu.');
  }

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  const json = JSON.stringify(document, null, 2);
  await fs.writeFile(tempPath, json, 'utf8');
  try {
    await fs.rename(tempPath, filePath);
  } catch (error) {
    try {
      await fs.unlink(tempPath);
    } catch {
      // ignore cleanup failure
    }
    throw error;
  }
}

async function listAgstudioDocuments(workspaceFolder) {
  const entries = [];

  try {
    const names = await fs.readdir(workspaceFolder);
    for (const name of names) {
      if (!name.toLowerCase().endsWith('.agstudio')) {
        continue;
      }

      const filePath = path.join(workspaceFolder, name);
      try {
        const doc = await readAgstudioDocument(filePath);
        entries.push({
          id: doc.id,
          title: doc.title,
          status: doc.status,
          boardSize: doc.board?.size ?? null,
          updatedAt: doc.audit?.updatedAt ?? null,
          filePath,
        });
      } catch {
        // skip corrupt documents
      }
    }
  } catch {
    return [];
  }

  entries.sort((left, right) => (right.updatedAt ?? '').localeCompare(left.updatedAt ?? ''));
  return entries;
}

function resolveDocumentPath(workspaceFolder, slug) {
  return resolveAgstudioPath(workspaceFolder, slug);
}

module.exports = {
  listAgstudioDocuments,
  readAgstudioDocument,
  resolveDocumentPath,
  writeAgstudioDocument,
};
