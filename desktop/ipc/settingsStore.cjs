const fs = require('node:fs/promises');
const path = require('node:path');
const { getStudioSettingsPath, getDefaultWorkspaceState } = require('../config.cjs');

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function readJsonFile(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJsonAtomic(filePath, value) {
  await ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  const json = JSON.stringify(value, null, 2);
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

async function loadStudioSettings(userDataPath, documentsPath) {
  const filePath = getStudioSettingsPath(userDataPath);
  const fallback = getDefaultWorkspaceState(documentsPath);
  const settings = await readJsonFile(filePath, fallback);
  return {
    ...fallback,
    ...settings,
  };
}

async function saveStudioSettings(userDataPath, documentsPath, nextSettings) {
  const filePath = getStudioSettingsPath(userDataPath);
  const fallback = getDefaultWorkspaceState(documentsPath);
  const merged = {
    ...fallback,
    ...(nextSettings ?? {}),
  };
  await writeJsonAtomic(filePath, merged);
  return merged;
}

module.exports = {
  ensureDir,
  loadStudioSettings,
  readJsonFile,
  saveStudioSettings,
  writeJsonAtomic,
};
