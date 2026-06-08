import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import { logger } from "./logger.js";

const workspaceRoot = process.cwd().endsWith(path.join("artifacts", "api-server"))
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();

const dataDir = path.resolve(workspaceRoot, "artifacts/api-server/data");
const SNAPSHOTS_FILE = path.join(dataDir, "snapshots.json");

export interface Snapshot {
  id: string;
  name: string;
  createdAt: string;
  description: string | null;
  qemuTag: string;
}

function ensureDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

export function listSnapshots(): Snapshot[] {
  ensureDir();
  try {
    if (fs.existsSync(SNAPSHOTS_FILE)) {
      return JSON.parse(fs.readFileSync(SNAPSHOTS_FILE, "utf8"));
    }
  } catch (e) {
    logger.warn({ err: e }, "Failed to load snapshots");
  }
  return [];
}

function saveSnapshots(snaps: Snapshot[]): void {
  ensureDir();
  fs.writeFileSync(SNAPSHOTS_FILE, JSON.stringify(snaps, null, 2));
}

export function addSnapshot(name: string, description: string | null): Snapshot {
  const snaps = listSnapshots();
  const id = randomUUID();
  const qemuTag = `snap_${id.replace(/-/g, "").slice(0, 12)}`;
  const snap: Snapshot = { id, name, description, createdAt: new Date().toISOString(), qemuTag };
  snaps.push(snap);
  saveSnapshots(snaps);
  return snap;
}

export function removeSnapshot(id: string): boolean {
  const snaps = listSnapshots();
  const idx = snaps.findIndex((s) => s.id === id);
  if (idx === -1) return false;
  snaps.splice(idx, 1);
  saveSnapshots(snaps);
  return true;
}

export function getSnapshot(id: string): Snapshot | undefined {
  return listSnapshots().find((s) => s.id === id);
}
