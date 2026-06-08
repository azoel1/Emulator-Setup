import { Router, type IRouter } from "express";
import * as qemu from "../lib/qemu.js";
import { loadConfig, saveConfig } from "../lib/config-store.js";
import path from "path";
import fs from "fs";

const workspaceRoot = process.cwd().endsWith(path.join("artifacts", "api-server"))
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();

const disksDir = path.resolve(workspaceRoot, "artifacts/api-server/disks");

const router: IRouter = Router();

router.get("/vm/status", async (_req, res): Promise<void> => {
  const state = qemu.getVmState();
  const config = loadConfig();
  res.json({
    running: state.running,
    pid: state.pid ?? null,
    vncPort: state.running ? qemu.VNC_PORT : null,
    audioWsPort: null,
    uptime: state.uptime ?? null,
    config: state.config ?? config,
  });
});

router.post("/vm/start", async (req, res): Promise<void> => {
  const body = req.body as {
    diskImage?: string;
    ram?: number;
    cpus?: number;
    audioEnabled?: boolean;
    audioDevice?: string;
    pcMode?: string;
    networkEnabled?: boolean;
    vgaType?: string;
    bootOrder?: string;
  };

  const rawDisk = body.diskImage ?? loadConfig().diskImage;
  const config = {
    diskImage: path.isAbsolute(rawDisk) ? path.basename(rawDisk) : rawDisk,
    ram: body.ram ?? 512,
    cpus: body.cpus ?? 2,
    audioEnabled: body.audioEnabled ?? true,
    audioDevice: body.audioDevice ?? "hda",
    pcMode: body.pcMode ?? "pc",
    networkEnabled: body.networkEnabled ?? true,
    vgaType: body.vgaType ?? "std",
    bootOrder: body.bootOrder ?? "c",
  };

  saveConfig(config);

  try {
    await qemu.startVm(config);
    const state = qemu.getVmState();
    res.json({
      running: state.running,
      pid: state.pid ?? null,
      vncPort: state.running ? qemu.VNC_PORT : null,
      audioWsPort: null,
      uptime: state.uptime ?? null,
      config,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(400).json({ error: msg });
  }
});

router.post("/vm/stop", async (_req, res): Promise<void> => {
  await qemu.stopVm();
  res.json({ running: false, pid: null, vncPort: null, audioWsPort: null, uptime: null, config: loadConfig() });
});

router.post("/vm/reset", async (_req, res): Promise<void> => {
  try {
    await qemu.resetVm();
    const state = qemu.getVmState();
    res.json({
      running: state.running,
      pid: state.pid ?? null,
      vncPort: state.running ? qemu.VNC_PORT : null,
      audioWsPort: null,
      uptime: state.uptime ?? null,
      config: loadConfig(),
    });
  } catch (_) {
    res.status(400).json({ error: "Could not reset VM" });
  }
});

router.get("/vm/config", (_req, res): void => {
  res.json(loadConfig());
});

router.put("/vm/config", (req, res): void => {
  const updated = saveConfig(req.body);
  res.json(updated);
});

router.get("/vm/disk-images", (_req, res): void => {
  qemu.ensureDisksDir();
  const images = qemu.listDiskImages();
  res.json(images);
});

router.post("/upload/disk", async (req, res): Promise<void> => {
  if (!fs.existsSync(disksDir)) fs.mkdirSync(disksDir, { recursive: true });

  const busboy = (await import("busboy")).default;
  const bb = busboy({ headers: req.headers as Record<string, string | string[]>, limits: { fileSize: 20 * 1024 * 1024 * 1024 } });

  let savedName = "";
  let savedPath = "";
  let fileSize = 0;

  bb.on("file", (_fieldname: string, file: NodeJS.ReadableStream, info: { filename: string }) => {
    const safeFilename = path.basename(info.filename).replace(/[^a-zA-Z0-9._-]/g, "_");
    savedName = safeFilename;
    savedPath = path.join(disksDir, safeFilename);
    const ws = fs.createWriteStream(savedPath);
    file.on("data", (d: Buffer) => { fileSize += d.length; });
    file.pipe(ws);
  });

  bb.on("finish", () => {
    res.json({ name: savedName, path: savedPath, sizeBytes: fileSize, isDefault: false });
  });

  bb.on("error", () => {
    res.status(500).json({ error: "Upload failed" });
  });

  req.pipe(bb);
});

export default router;
