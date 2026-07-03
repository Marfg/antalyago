import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SAFE_ID_RE } from '../model/studioDocument.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const WRITE_ROOTS = {
  workspace: path.join(ROOT, 'studio', 'workspace'),
};

const STATIC_ALLOW = [
  path.join(ROOT, 'studio'),
  path.join(ROOT, 'styles', 'design-system.css'),
  path.join(ROOT, 'styles', 'theme-compat.css'),
  path.join(ROOT, 'core', 'theme.js'),
];

const STATIC_DENY = [
  path.join(ROOT, 'studio', 'workspace'),
  path.join(ROOT, 'studio', 'config.local.json'),
];

// SAFE_ID_RE aynı kural kümesini kullanmalı — studioDocument.js'ten içe aktarılıyor.
// Pattern: ^[a-z0-9](?:[a-z0-9]*(?:-[a-z0-9]+)*)?$
const SAFE_FILENAME_RE = /^[a-z0-9](?:[a-z0-9]*(?:-[a-z0-9]+)*)?\.studio\.json$/;

/**
 * path.relative() tabanlı dizin sınırı doğrulaması.
 * startsWith() yerine kullanılıyor çünkü:
 *   - '/workspace'  vs '/workspace-evil' — startsWith(root+sep) bunu zaten reddeder
 *     ama semantik olarak niyeti açıklamaz.
 *   - path.relative '../' ile başlıyorsa veya mutlak dönüyorsa kesinlikle dışarıdadır.
 *   - Gelecekte SAFE_ID_RE'nin gevşetilmesi durumunda son savunma katmanı olarak kalır.
 */
function isSafeRelative(base, target) {
  const rel = path.relative(base, target);
  // Boş → hedef = base (dizinin kendisi, dosya değil)
  // isAbsolute → farklı sürücü (Windows)
  // startsWith('..') → base dışına çıkıyor
  return rel.length > 0 && !path.isAbsolute(rel) && !rel.startsWith('..');
}

export function resolveDocumentPath(id, root = WRITE_ROOTS.workspace) {
  if (!id || typeof id !== 'string') return null;

  let decoded;
  try { decoded = decodeURIComponent(id); } catch { return null; }

  // Katman 1: null byte
  if (decoded.includes('\0')) return null;
  // Katman 2: yol ayracı (/ ve \)
  if (/[/\\]/.test(decoded)) return null;
  // Katman 3: allowlist — yalnızca küçük harf, rakam, tek tire
  if (!SAFE_ID_RE.test(decoded)) return null;

  const filename = `${decoded}.studio.json`;
  if (!SAFE_FILENAME_RE.test(filename)) return null;

  const rootNorm = path.resolve(root);
  const resolved = path.resolve(rootNorm, filename);

  // Katman 4: path.relative() sınır doğrulaması
  if (!isSafeRelative(rootNorm, resolved)) return null;

  return resolved;
}

export function resolveStaticPath(urlPath) {
  if (!urlPath || typeof urlPath !== 'string') return null;

  let decoded;
  try { decoded = decodeURIComponent(urlPath); } catch { return null; }

  if (decoded.includes('\0')) return null;

  const normalized = decoded.replace(/^\/+/, '').replace(/\\/g, '/');
  const resolved = path.resolve(ROOT, normalized);

  // Deny list — allow'dan önce kontrol edilmeli
  for (const denied of STATIC_DENY) {
    if (resolved === denied || resolved.startsWith(denied + path.sep)) return null;
  }

  for (const allowed of STATIC_ALLOW) {
    if (resolved === allowed || resolved.startsWith(allowed + path.sep)) return resolved;
  }

  return null;
}
