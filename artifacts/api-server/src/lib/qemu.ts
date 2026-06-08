import { spawn, type ChildProcess, execSync } from "child_process";
import path from "path";
import fs from "fs";
import net from "net";
import { logger } from "./logger.js";
import type { VmConfig } from "./config-store.js";

const workspaceRoot = process.cwd().endsWith(path.join("artifacts", "api-server"))
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();

const disksDir = path.resolve(workspaceRoot, "artifacts/api-server/disks");
const monitorSocket = path.resolve(workspaceRoot, "artifacts/api-server/data/qemu-monitor.sock");

export const VNC_PORT = 5900;
export const AUDIO_PULSE_SOURCE = "qemu_capture.monitor";

let vmProcess: ChildProcess | null = null;
let vmStartTime: number | null = null;
let currentConfig: VmConfig | null = null;

export function ensureDisksDir() {
  if (!fs.existsSync(disksDir)) {
    fs.mkdirSync(disksDir, { recursive: true });
  }
}

export function listDiskImages() {
  ensureDisksDir();
  const files = fs.readdirSync(disksDir).filter((f) =>
    f.endsWith(".qcow2") || f.endsWith(".img") || f.endsWith(".iso")
  );
  return files.map((f) => ({
    name: f,
    path: path.join(disksDir, f),
    sizeBytes: fs.statSync(path.join(disksDir, f)).size,
    isDefault: f === "windows-xp.qcow2",
  }));
}

export function isRunning(): boolean {
  return vmProcess !== null && vmProcess.exitCode === null;
}

export function getUptime(): number | null {
  if (!vmStartTime || !isRunning()) return null;
  return Math.floor((Date.now() - vmStartTime) / 1000);
}

function ensurePulseAudio() {
  try {
    execSync("pulseaudio --start --daemonize 2>/dev/null || true", { stdio: "ignore" });
    // Create virtual null sink for QEMU audio capture
    try {
      execSync(
        'pactl list sinks short 2>/dev/null | grep -q qemu_capture || ' +
        'pactl load-module module-null-sink sink_name=qemu_capture sink_properties=device.description=QEMU_Audio 2>/dev/null || true',
        { stdio: "ignore" }
      );
    } catch (_) {}
    logger.info("PulseAudio ensured");
  } catch (e) {
    logger.warn({ err: e }, "Could not start PulseAudio — audio may not work");
  }
}

export async function startVm(config: VmConfig): Promise<void> {
  if (isRunning()) {
    await stopVm();
    await new Promise((r) => setTimeout(r, 1000));
  }

  ensureDisksDir();

  const diskPath = path.isAbsolute(config.diskImage)
    ? config.diskImage
    : path.join(disksDir, config.diskImage);

  if (!fs.existsSync(diskPath)) {
    throw new Error(`Disk image not found: ${diskPath}`);
  }

  if (config.audioEnabled) {
    ensurePulseAudio();
  }

  const args: string[] = [
    "-machine", config.pcMode === "q35" ? "q35" : "pc",
    "-m", String(config.ram),
    "-smp", String(config.cpus),
    "-drive", `file=${diskPath},if=ide,cache=writeback`,
    "-vga", config.vgaType,
    "-vnc", `:0`,
    "-boot", `order=${config.bootOrder}`,
    "-monitor", `unix:${monitorSocket},server,nowait`,
    "-display", "none",
  ];

  if (config.audioEnabled) {
    args.push(
      "-audiodev", `pa,id=pa0,out.sink=qemu_capture`,
      "-device", "intel-hda",
      "-device", "hda-duplex,audiodev=pa0"
    );
  }

  if (config.networkEnabled) {
    args.push("-net", "nic", "-net", "user");
  }

  logger.info({ args }, "Starting QEMU");

  vmProcess = spawn("qemu-system-x86_64", args, {
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
  });

  vmStartTime = Date.now();
  currentConfig = config;

  const proc = vmProcess;
  proc.stdout?.on("data", (d: Buffer) => {
    logger.debug({ msg: d.toString() }, "QEMU stdout");
  });
  proc.stderr?.on("data", (d: Buffer) => {
    logger.debug({ msg: d.toString() }, "QEMU stderr");
  });
  proc.on("exit", (code) => {
    logger.info({ code }, "QEMU process exited");
    vmProcess = null;
    vmStartTime = null;
    currentConfig = null;
  });
}

export async function stopVm(): Promise<void> {
  if (!isRunning()) return;
  try {
    await sendMonitorCommand("quit");
    await new Promise((r) => setTimeout(r, 1500));
  } catch (_) {}
  if (isRunning()) {
    vmProcess?.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 1000));
    if (isRunning()) vmProcess?.kill("SIGKILL");
  }
  vmProcess = null;
  vmStartTime = null;
}

export async function resetVm(): Promise<void> {
  await sendMonitorCommand("system_reset");
}

export function sendMonitorCommand(cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(monitorSocket)) {
      reject(new Error("Monitor socket not available"));
      return;
    }
    const sock = net.createConnection(monitorSocket);
    let data = "";
    sock.on("data", (d) => { data += d.toString(); });
    sock.on("connect", () => {
      setTimeout(() => {
        sock.write(`${cmd}\n`);
        setTimeout(() => {
          sock.end();
          resolve(data);
        }, 200);
      }, 200);
    });
    sock.on("error", reject);
  });
}

export async function saveSnapshot(tag: string): Promise<void> {
  await sendMonitorCommand(`savevm ${tag}`);
  await new Promise((r) => setTimeout(r, 2000));
}

export async function restoreSnapshotByTag(tag: string): Promise<void> {
  await sendMonitorCommand(`loadvm ${tag}`);
  await new Promise((r) => setTimeout(r, 1000));
}

export async function deleteSnapshotByTag(tag: string): Promise<void> {
  await sendMonitorCommand(`delvm ${tag}`);
}

const QEMU_KEY_MAP: Record<string, string> = {
  "ctrl": "ctrl",
  "alt": "alt",
  "shift": "shift",
  "win": "meta_l",
  "super": "meta_l",
  "enter": "ret",
  "return": "ret",
  "space": "spc",
  "backspace": "backspace",
  "tab": "tab",
  "esc": "esc",
  "escape": "esc",
  "delete": "delete",
  "del": "delete",
  "insert": "insert",
  "ins": "insert",
  "home": "home",
  "end": "end",
  "pgup": "pgup",
  "pgdn": "pgdn",
  "up": "up",
  "down": "down",
  "left": "left",
  "right": "right",
  "f1": "f1", "f2": "f2", "f3": "f3", "f4": "f4",
  "f5": "f5", "f6": "f6", "f7": "f7", "f8": "f8",
  "f9": "f9", "f10": "f10", "f11": "f11", "f12": "f12",
  "minus": "minus",
  "plus": "equal",
  "equal": "equal",
  "dot": "dot",
  "comma": "comma",
  "slash": "slash",
};

function normalizeKey(key: string): string {
  const lower = key.toLowerCase().trim();
  return QEMU_KEY_MAP[lower] ?? lower;
}

export async function sendKeyCombo(combo: string): Promise<void> {
  const keys = combo.split(/[\+\-]/).map(normalizeKey);
  const keyStr = keys.join("-");
  await sendMonitorCommand(`sendkey ${keyStr}`);
}

export async function typeString(text: string, pressEnter: boolean): Promise<void> {
  for (const char of text) {
    await sendCharToQemu(char);
    await new Promise((r) => setTimeout(r, 30));
  }
  if (pressEnter) {
    await sendMonitorCommand("sendkey ret");
  }
}

async function sendCharToQemu(char: string): Promise<void> {
  if (char === " ") {
    await sendMonitorCommand("sendkey spc");
    return;
  }
  if (char === "\n") {
    await sendMonitorCommand("sendkey ret");
    return;
  }
  const needsShift = /[A-Z!@#$%^&*()_+{}|:"<>?~]/.test(char);
  const qemuChar = charToQemuKey(char);
  if (needsShift) {
    await sendMonitorCommand(`sendkey shift-${qemuChar}`);
  } else {
    await sendMonitorCommand(`sendkey ${qemuChar}`);
  }
}

function charToQemuKey(char: string): string {
  const lc = char.toLowerCase();
  if (/[a-z]/.test(lc)) return lc;
  const SPECIAL: Record<string, string> = {
    "0": "0", "1": "1", "2": "2", "3": "3", "4": "4",
    "5": "5", "6": "6", "7": "7", "8": "8", "9": "9",
    "!": "1", "@": "2", "#": "3", "$": "4", "%": "5",
    "^": "6", "&": "7", "*": "8", "(": "9", ")": "0",
    "-": "minus", "_": "minus", "=": "equal", "+": "equal",
    "[": "bracket_left", "]": "bracket_right",
    "{": "bracket_left", "}": "bracket_right",
    ";": "semicolon", ":": "semicolon",
    "'": "apostrophe", '"': "apostrophe",
    ",": "comma", "<": "comma",
    ".": "dot", ">": "dot",
    "/": "slash", "?": "slash",
    "\\": "backslash", "|": "backslash",
    "`": "grave_accent", "~": "grave_accent",
  };
  return SPECIAL[char] ?? char;
}

export function getVmState() {
  return {
    running: isRunning(),
    pid: vmProcess?.pid ?? null,
    vncPort: VNC_PORT,
    audioWsPort: null,
    uptime: getUptime(),
    config: currentConfig,
  };
}
