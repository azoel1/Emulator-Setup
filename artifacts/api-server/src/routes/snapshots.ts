import { Router, type IRouter } from "express";
import * as snapshotStore from "../lib/snapshot-store.js";
import * as qemu from "../lib/qemu.js";

const router: IRouter = Router();

router.get("/snapshots", (_req, res): void => {
  const snaps = snapshotStore.listSnapshots();
  res.json(snaps.map((s) => ({ id: s.id, name: s.name, createdAt: s.createdAt, description: s.description ?? null })));
});

router.post("/snapshots", async (req, res): Promise<void> => {
  const { name, description } = req.body as { name?: string; description?: string };
  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const snap = snapshotStore.addSnapshot(name, description ?? null);

  if (qemu.isRunning()) {
    try {
      await qemu.saveSnapshot(snap.qemuTag);
    } catch (e) {
      snapshotStore.removeSnapshot(snap.id);
      res.status(500).json({ error: "Failed to save QEMU snapshot" });
      return;
    }
  }

  res.status(201).json({ id: snap.id, name: snap.name, createdAt: snap.createdAt, description: snap.description ?? null });
});

router.post("/snapshots/:id/restore", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const snap = snapshotStore.getSnapshot(rawId);
  if (!snap) {
    res.status(404).json({ error: "Snapshot not found" });
    return;
  }
  if (!qemu.isRunning()) {
    res.status(400).json({ error: "VM is not running" });
    return;
  }
  try {
    await qemu.restoreSnapshotByTag(snap.qemuTag);
    const state = qemu.getVmState();
    res.json({
      running: state.running,
      pid: state.pid ?? null,
      vncPort: state.running ? qemu.VNC_PORT : null,
      audioWsPort: null,
      uptime: state.uptime ?? null,
      config: state.config ?? null,
    });
  } catch (_) {
    res.status(500).json({ error: "Failed to restore snapshot" });
  }
});

router.delete("/snapshots/:id", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const snap = snapshotStore.getSnapshot(rawId);
  if (!snap) {
    res.status(404).json({ error: "Snapshot not found" });
    return;
  }

  if (qemu.isRunning()) {
    try {
      await qemu.deleteSnapshotByTag(snap.qemuTag);
    } catch (_) {}
  }

  snapshotStore.removeSnapshot(rawId);
  res.json({ success: true, message: null });
});

export default router;
