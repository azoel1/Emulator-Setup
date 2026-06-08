import { Router, type IRouter } from "express";
import * as qemu from "../lib/qemu.js";

const router: IRouter = Router();

router.post("/input/key", async (req, res): Promise<void> => {
  const { combo } = req.body as { combo?: string };
  if (!combo) {
    res.status(400).json({ error: "combo is required" });
    return;
  }
  if (!qemu.isRunning()) {
    res.status(400).json({ error: "VM is not running" });
    return;
  }
  try {
    await qemu.sendKeyCombo(combo);
    res.json({ success: true, message: null });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to send key" });
  }
});

router.post("/input/type", async (req, res): Promise<void> => {
  const { text } = req.body as { text?: string };
  if (text == null || typeof text !== "string") {
    res.status(400).json({ error: "text is required" });
    return;
  }
  if (!qemu.isRunning()) {
    res.status(400).json({ error: "VM is not running" });
    return;
  }
  try {
    await qemu.typeString(text, false);
    res.json({ success: true, message: null });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to type text" });
  }
});

router.post("/input/send", async (req, res): Promise<void> => {
  const { text } = req.body as { text?: string };
  if (text == null || typeof text !== "string") {
    res.status(400).json({ error: "text is required" });
    return;
  }
  if (!qemu.isRunning()) {
    res.status(400).json({ error: "VM is not running" });
    return;
  }
  try {
    await qemu.typeString(text, true);
    res.json({ success: true, message: null });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to send text" });
  }
});

export default router;
