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

const MACROS: Record<string, Array<{ type: "key"; combo: string } | { type: "type"; text: string; enter?: boolean } | { type: "wait"; ms: number }>> = {
  "install-python": [
    { type: "key", combo: "meta-r" },
    { type: "wait", ms: 900 },
    { type: "type", text: "iexplore http://www.python.org/ftp/python/2.7.18/python-2.7.18.msi", enter: true },
  ],
  "open-cmd": [
    { type: "key", combo: "meta-r" },
    { type: "wait", ms: 900 },
    { type: "type", text: "cmd", enter: true },
  ],
  "open-notepad": [
    { type: "key", combo: "meta-r" },
    { type: "wait", ms: 900 },
    { type: "type", text: "notepad", enter: true },
  ],
  "open-ie": [
    { type: "key", combo: "meta-r" },
    { type: "wait", ms: 900 },
    { type: "type", text: "iexplore", enter: true },
  ],
};

router.post("/input/macro/:name", async (req, res): Promise<void> => {
  const { name } = req.params;
  const steps = MACROS[name];
  if (!steps) {
    res.status(404).json({ error: `Unknown macro: ${name}` });
    return;
  }
  if (!qemu.isRunning()) {
    res.status(400).json({ error: "VM is not running" });
    return;
  }
  try {
    await qemu.runMacro(steps);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Macro failed" });
  }
});

export default router;
