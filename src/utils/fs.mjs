import path from "node:path";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";

export async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

export async function fileExists(filePath) {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function readTextIfExists(filePath, fallback = null) {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return fallback;
  }
}

export async function readJsonIfExists(filePath, fallback = null) {
  const text = await readTextIfExists(filePath, null);
  if (text === null) return fallback;

  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

export async function writeText(filePath, text) {
  await ensureDir(path.dirname(filePath));
  const normalized = text.endsWith("\n") ? text : `${text}\n`;
  await writeFile(filePath, normalized, "utf8");
}

export async function writeJson(filePath, payload) {
  await writeText(filePath, JSON.stringify(payload, null, 2));
}

export async function appendJsonl(filePath, payload) {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, `${JSON.stringify(payload)}\n`, { flag: "a" });
}
