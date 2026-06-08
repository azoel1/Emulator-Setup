import path from "path";
import fs from "fs";
import { logger } from "./logger.js";

const workspaceRoot = process.cwd().endsWith(path.join("artifacts", "api-server"))
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();

const dataDir = path.resolve(workspaceRoot, "artifacts/api-server/data");

function ensureDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

export interface VmConfig {
  diskImage: string;
  ram: number;
  cpus: number;
  audioEnabled: boolean;
  audioDevice: string;
  pcMode: string;
  networkEnabled: boolean;
  vgaType: string;
  bootOrder: string;
}

const DEFAULT_CONFIG: VmConfig = {
  diskImage: "windows-xp.qcow2",
  ram: 512,
  cpus: 2,
  audioEnabled: false,
  audioDevice: "hda",
  pcMode: "pc",
  networkEnabled: true,
  vgaType: "std",
  bootOrder: "c",
};

const CONFIG_FILE = path.join(dataDir, "vm-config.json");

export function loadConfig(): VmConfig {
  ensureDir();
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, "utf8");
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    }
  } catch (e) {
    logger.warn({ err: e }, "Failed to load config, using defaults");
  }
  return { ...DEFAULT_CONFIG };
}

export function saveConfig(config: VmConfig): VmConfig {
  ensureDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  return config;
}
