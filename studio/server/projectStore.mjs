import fsp from 'node:fs/promises';
import path from 'node:path';
import { resolveDocumentPath, WRITE_ROOTS } from './pathPolicy.mjs';

const MAX_BACKUPS = 5;

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

async function pruneBackups(filePath) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const pattern = `${base}.bak.`;
  let entries;
  try { entries = await fsp.readdir(dir); } catch { return; }

  const backups = entries
    .filter(e => e.startsWith(pattern))
    .sort()
    .map(e => path.join(dir, e));

  while (backups.length > MAX_BACKUPS) {
    try { await fsp.unlink(backups.shift()); } catch { /* ignore */ }
  }
}

export async function listDocuments(workspaceDir = WRITE_ROOTS.workspace) {
  await ensureDir(workspaceDir);
  let entries;
  try { entries = await fsp.readdir(workspaceDir); } catch { return []; }

  const docs = [];
  for (const entry of entries) {
    if (!entry.endsWith('.studio.json')) continue;
    try {
      const raw = await fsp.readFile(path.join(workspaceDir, entry), 'utf8');
      const doc = JSON.parse(raw);
      docs.push({
        id: doc.id,
        title: doc.title,
        status: doc.status,
        boardSize: doc.board?.size ?? null,
        updatedAt: doc.audit?.updatedAt ?? null,
      });
    } catch { /* corrupt file — skip */ }
  }
  docs.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  return docs;
}

export async function readDocument(id, workspaceDir = WRITE_ROOTS.workspace) {
  const filePath = resolveDocumentPath(id, workspaceDir);
  if (!filePath) return null;
  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch { return null; }
}

export async function documentExists(id, workspaceDir = WRITE_ROOTS.workspace) {
  const filePath = resolveDocumentPath(id, workspaceDir);
  if (!filePath) return false;
  try { await fsp.access(filePath); return true; } catch { return false; }
}

export async function writeDocument(id, doc, workspaceDir = WRITE_ROOTS.workspace) {
  await ensureDir(workspaceDir);
  const filePath = resolveDocumentPath(id, workspaceDir);
  if (!filePath) throw new Error('Geçersiz belge kimliği.');

  const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  const json = JSON.stringify(doc, null, 2);

  try {
    await fsp.writeFile(tmpPath, json, 'utf8');
    JSON.parse(await fsp.readFile(tmpPath, 'utf8')); // doğrulama

    let targetExists = false;
    try { await fsp.access(filePath); targetExists = true; } catch { /* yeni dosya */ }

    if (targetExists) {
      const bak = `${filePath}.bak.${Date.now()}`;
      await fsp.copyFile(filePath, bak);
      await pruneBackups(filePath);
    }

    await fsp.rename(tmpPath, filePath);
  } catch (err) {
    try { await fsp.unlink(tmpPath); } catch { /* ignore */ }
    throw err;
  }
}
