import fs from "fs";
import path from "path";
import { EventEmitter } from "events";

const ROOT = process.env.C2_DATA_DIR || path.resolve(__dirname, "../../data/c2");

function ensureRoot() {
  fs.mkdirSync(ROOT, { recursive: true });
}

export function c2DataPath(...segments: string[]) {
  ensureRoot();
  return path.join(ROOT, ...segments);
}

export function readJsonFile<T>(fileName: string, fallback: T): T {
  const fullPath = c2DataPath(fileName);
  if (!fs.existsSync(fullPath)) {
    writeJsonFile(fileName, fallback);
    return fallback;
  }

  try {
    return JSON.parse(fs.readFileSync(fullPath, "utf8")) as T;
  } catch {
    writeJsonFile(fileName, fallback);
    return fallback;
  }
}

export function writeJsonFile<T>(fileName: string, value: T): void {
  fs.writeFileSync(c2DataPath(fileName), JSON.stringify(value, null, 2));
}

export function appendJsonLine(fileName: string, value: unknown): void {
  fs.appendFileSync(c2DataPath(fileName), `${JSON.stringify(value)}\n`);
}

export function readJsonLines<T>(fileName: string): T[] {
  const fullPath = c2DataPath(fileName);
  if (!fs.existsSync(fullPath)) {
    return [];
  }

  return fs
    .readFileSync(fullPath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as T;
      } catch {
        return null;
      }
    })
    .filter((entry): entry is T => Boolean(entry));
}

export const c2Events = new EventEmitter();
