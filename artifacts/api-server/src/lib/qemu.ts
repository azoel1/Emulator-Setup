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

export const VNC_PORT = 5900; // kept for API compat — VNC now uses Unix socket
export const VNC_SOCK = "/tmp/qemu-vnc.sock";
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

// PulseAudio server socket — always use the system-level socket path
const PULSE_SERVER = "unix:/run/pulse/native";

// Env for PA-aware processes: QEMU, parec, pactl
// XDG_RUNTIME_DIR must match where PulseAudio actually runs (/run/pulse/native)
const PA_ENV: Record<string, string> = {
  ...process.env as Record<string, string>,
  PULSE_SERVER,
  XDG_RUNTIME_DIR: "/run",
  // Route QEMU's output to our null sink (avoids unsupported out.sink= param)
  PULSE_SINK: "qemu_capture",
  HOME: process.env["HOME"] ?? "/root",
};

function paExec(cmd: string) {
  execSync(cmd, { stdio: "ignore", env: PA_ENV });
}

export function ensurePulseAudio(): boolean {
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Start PulseAudio daemon if not running
      paExec("pulseaudio --start --daemonize --exit-idle-time=-1 2>/dev/null || true");
      // Wait for daemon to be ready
      const waitMs = attempt === 1 ? 600 : 300;
      execSync(`sleep ${waitMs / 1000}`, { stdio: "ignore" });
      // Write the PID file libpulse looks for at $XDG_RUNTIME_DIR/pulse/pid
      try {
        const pid = execSync("pgrep -x pulseaudio | head -1", { encoding: "utf8", env: PA_ENV }).trim();
        if (pid) fs.writeFileSync("/run/pulse/pid", pid);
      } catch (_) {}
      // Create the null sink QEMU will output to
      paExec(
        'pactl list sinks short 2>/dev/null | grep -q qemu_capture || ' +
        'pactl load-module module-null-sink sink_name=qemu_capture ' +
        'sink_properties=device.description=QEMU_Audio 2>/dev/null'
      );
      // Verify it exists
      paExec('pactl list sinks short 2>/dev/null | grep -q qemu_capture');
      logger.info({ attempt }, "PulseAudio ready with qemu_capture sink");
      return true;
    } catch (e) {
      logger.warn({ attempt, maxAttempts, err: e }, "PulseAudio setup attempt failed, retrying...");
      if (attempt === maxAttempts) {
        logger.error("PulseAudio failed after all attempts — audio will not work");
        return false;
      }
    }
  }
  return false;
}

export async function runMacro(steps: Array<{ type: "key"; combo: string } | { type: "type"; text: string; enter?: boolean } | { type: "wait"; ms: number }>): Promise<void> {
  for (const step of steps) {
    if (step.type === "key") {
      await sendKeyCombo(step.combo);
    } else if (step.type === "type") {
      await typeString(step.text, step.enter ?? false);
    } else if (step.type === "wait") {
      await new Promise((r) => setTimeout(r, step.ms));
    }
  }
}

export async function startVm(config: VmConfig): Promise<void> {
  if (isRunning()) {
    await stopVm();
    await new Promise((r) => setTimeout(r, 1000));
  }

  // Kill any orphaned QEMU processes that may still be holding the VNC port
  try { execSync("pkill -9 qemu-system-x86_64 2>/dev/null || true", { stdio: "ignore" }); } catch (_) {}
  await new Promise((r) => setTimeout(r, 400));

  ensureDisksDir();

  const diskPath = path.isAbsolute(config.diskImage)
    ? config.diskImage
    : path.join(disksDir, config.diskImage);

  if (!fs.existsSync(diskPath)) {
    throw new Error(`Disk image not found: ${diskPath}`);
  }

  // Remove stale sockets so QEMU can create them fresh
  for (const sock of [monitorSocket, VNC_SOCK]) {
    if (fs.existsSync(sock)) { try { fs.unlinkSync(sock); } catch (_) {} }
  }

  // Prepare audio — retry hard before giving up
  const audioReady = config.audioEnabled ? ensurePulseAudio() : false;

  const args: string[] = [
    "-machine", config.pcMode === "q35" ? "q35" : "pc",
    "-m", String(config.ram),
    "-smp", String(config.cpus),
    "-drive", `file=${diskPath},if=ide,cache=writeback`,
    "-vga", config.vgaType,
    "-vnc", `unix:${VNC_SOCK}`,
    "-boot", `order=${config.bootOrder}`,
    "-monitor", `unix:${monitorSocket},server,nowait`,
    "-display", "none",
  ];

  if (audioReady) {
    // sb16 (ISA SoundBlaster 16) — Windows XP ships sb16.sys built-in, no driver install needed
    // AC97/intel-hda both need extra drivers not present in stock XP images
    args.push(
      "-audiodev", `pa,id=pa0`,
      "-device", "sb16,audiodev=pa0"
    );
  } else if (config.audioEnabled) {
    args.push("-audiodev", "none,id=pa0", "-device", "sb16,audiodev=pa0");
  }

  if (config.networkEnabled) {
    args.push("-net", "nic", "-net", "user");
  }

  logger.info({ args, audioReady }, "Starting QEMU");

  // Spawn with PulseAudio env vars so QEMU can connect to the PA socket
  const proc = spawn("qemu-system-x86_64", args, {
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
    env: PA_ENV,
  });

  vmProcess = proc;
  vmStartTime = Date.now();
  currentConfig = config;

  let stderrBuf = "";
  proc.stdout?.on("data", (d: Buffer) => {
    logger.info({ msg: d.toString().trim() }, "QEMU stdout");
  });
  proc.stderr?.on("data", (d: Buffer) => {
    const msg = d.toString().trim();
    stderrBuf += msg + "\n";
    logger.warn({ msg }, "QEMU stderr");
  });
  proc.on("exit", (code) => {
    logger.info({ code }, "QEMU process exited");
    vmProcess = null;
    vmStartTime = null;
    currentConfig = null;
  });

  // Wait briefly to catch immediate crashes
  await new Promise((r) => setTimeout(r, 800));
  if (proc.exitCode !== null) {
    const reason = stderrBuf.trim() || `exit code ${proc.exitCode}`;
    throw new Error(`QEMU failed to start: ${reason}`);
  }
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
  // Clean up stale socket so next start is clean
  if (fs.existsSync(monitorSocket)) {
    try { fs.unlinkSync(monitorSocket); } catch (_) {}
  }
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
