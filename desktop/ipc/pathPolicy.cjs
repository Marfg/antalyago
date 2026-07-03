const path = require('node:path');
const { getDefaultDocumentsFolder } = require('../config.cjs');

const SAFE_ID_RE = /^[a-z0-9](?:[a-z0-9]*(?:-[a-z0-9]+)*)?$/;

function isInsideRoot(root, target) {
  const rel = path.relative(root, target);
  return rel.length > 0 && !path.isAbsolute(rel) && !rel.startsWith('..');
}

function resolveWorkspaceRoot(candidate) {
  if (!candidate || typeof candidate !== 'string') {
    return null;
  }

  return path.resolve(candidate);
}

function resolveAgstudioFileName(slug) {
  if (!slug || typeof slug !== 'string') {
    return null;
  }

  let decoded;
  try {
    decoded = decodeURIComponent(slug);
  } catch {
    return null;
  }

  if (!SAFE_ID_RE.test(decoded)) {
    return null;
  }

  return `${decoded}.agstudio`;
}

function resolveAgstudioPath(workspaceRoot, slug) {
  const root = resolveWorkspaceRoot(workspaceRoot);
  const fileName = resolveAgstudioFileName(slug);

  if (!root || !fileName) {
    return null;
  }

  const resolved = path.resolve(root, fileName);
  return isInsideRoot(root, resolved) ? resolved : null;
}

function isAgstudioPath(filePath, workspaceRoot = null) {
  if (!filePath || typeof filePath !== 'string') {
    return false;
  }

  if (!filePath.toLowerCase().endsWith('.agstudio')) {
    return false;
  }

  if (!workspaceRoot) {
    return true;
  }

  const root = resolveWorkspaceRoot(workspaceRoot);
  const resolved = path.resolve(filePath);
  return !!root && isInsideRoot(root, resolved);
}

function getSuggestedWorkspaceFolder(documentsPath) {
  return getDefaultDocumentsFolder(documentsPath);
}

module.exports = {
  getSuggestedWorkspaceFolder,
  isInsideRoot,
  isAgstudioPath,
  resolveAgstudioFileName,
  resolveAgstudioPath,
  resolveWorkspaceRoot,
};
