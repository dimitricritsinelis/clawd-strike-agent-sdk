import path from "node:path";
import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, writeFile, rename, unlink } from "node:fs/promises";
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
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

export async function readJsonIfExists(filePath, fallback = null) {
  const text = await readTextIfExists(filePath, null);
  if (text === null) return fallback;

  return JSON.parse(text);
}

export async function writeText(filePath, text) {
  await ensureDir(path.dirname(filePath));
  const normalized = text.endsWith("\n") ? text : `${text}\n`;
  await writeFile(filePath, normalized, "utf8");
}

export async function writeTextExclusive(filePath, text) {
  await ensureDir(path.dirname(filePath));
  const normalized = text.endsWith("\n") ? text : `${text}\n`;
  await writeFile(filePath, normalized, { encoding: "utf8", flag: "wx" });
}

export async function writeJson(filePath, payload) {
  await ensureDir(path.dirname(filePath));
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, { flag: "wx" });
    await rename(temporaryPath, filePath);
  } finally {
    await unlink(temporaryPath).catch((error) => { if (error.code !== "ENOENT") throw error; });
  }
}

export async function writeJsonExclusive(filePath, payload) {
  await writeTextExclusive(filePath, JSON.stringify(payload, null, 2));
}

export async function appendJsonl(filePath, payload) {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, `${JSON.stringify(payload)}\n`, { flag: "a" });
}
