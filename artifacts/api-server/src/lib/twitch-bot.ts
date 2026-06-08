import net from "net";
import { randomUUID } from "crypto";
import { logger } from "./logger.js";
import * as qemu from "./qemu.js";

export interface TwitchConfig {
  channel: string;
  enabled: boolean;
  commandPrefix: string;
  allowedUsers: string[];
}

export interface CommandEntry {
  id: string;
  username: string;
  rawCommand: string;
  parsedCommands: string[];
  executedAt: string;
  status: "executed" | "queued" | "error";
}

let config: TwitchConfig = {
  channel: "",
  enabled: false,
  commandPrefix: "!",
  allowedUsers: [],
};

const commandLog: CommandEntry[] = [];
const MAX_LOG = 100;

let twitchSocket: net.Socket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let commandQueue: Array<() => Promise<void>> = [];
let processing = false;

export function getConfig(): TwitchConfig {
  return { ...config };
}

export function setConfig(newConfig: TwitchConfig): TwitchConfig {
  const wasEnabled = config.enabled;
  config = { ...newConfig };
  if (config.enabled && config.channel && !wasEnabled) {
    connect();
  } else if (!config.enabled && wasEnabled) {
    disconnect();
  } else if (config.enabled && config.channel && twitchSocket === null) {
    connect();
  }
  return config;
}

export function getCommandLog(): CommandEntry[] {
  return [...commandLog].reverse();
}

function addLog(entry: CommandEntry) {
  commandLog.push(entry);
  if (commandLog.length > MAX_LOG) commandLog.shift();
}

function connect() {
  if (twitchSocket) {
    twitchSocket.destroy();
    twitchSocket = null;
  }

  const channel = config.channel.toLowerCase().replace(/^#/, "");
  logger.info({ channel }, "Connecting to Twitch IRC");

  twitchSocket = net.createConnection({ host: "irc.chat.twitch.tv", port: 6667 });

  twitchSocket.on("connect", () => {
    twitchSocket?.write(`PASS SCHMOOPIIE\r\nNICK justinfan${Math.floor(Math.random() * 99999)}\r\nJOIN #${channel}\r\n`);
    logger.info({ channel }, "Twitch IRC connected");
  });

  let buf = "";
  twitchSocket.on("data", (d) => {
    buf += d.toString();
    const lines = buf.split("\r\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      handleLine(line);
    }
  });

  twitchSocket.on("error", (e) => {
    logger.warn({ err: e }, "Twitch IRC error");
  });

  twitchSocket.on("close", () => {
    logger.info("Twitch IRC disconnected");
    twitchSocket = null;
    if (config.enabled && config.channel) {
      reconnectTimer = setTimeout(connect, 10000);
    }
  });
}

function disconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (twitchSocket) {
    twitchSocket.destroy();
    twitchSocket = null;
  }
}

function handleLine(line: string) {
  if (line.startsWith("PING")) {
    twitchSocket?.write("PONG :tmi.twitch.tv\r\n");
    return;
  }

  const privmsgMatch = line.match(/^:([^!]+)![^ ]+ PRIVMSG #[^ ]+ :(.+)$/);
  if (!privmsgMatch) return;

  const username = privmsgMatch[1];
  const message = privmsgMatch[2].trim();

  if (
    config.allowedUsers.length > 0 &&
    !config.allowedUsers.map((u) => u.toLowerCase()).includes(username.toLowerCase())
  ) {
    return;
  }

  const prefix = config.commandPrefix;
  if (!message.startsWith(prefix)) return;

  const parsed = parseCommands(message, prefix);
  if (parsed.length === 0) return;

  const entry: CommandEntry = {
    id: randomUUID(),
    username,
    rawCommand: message,
    parsedCommands: parsed,
    executedAt: new Date().toISOString(),
    status: "queued",
  };
  addLog(entry);

  queueCommands(entry, parsed);
}

function parseCommands(message: string, prefix: string): string[] {
  const regex = new RegExp(`${escapeRegex(prefix)}(\\w+)(?:\\s+([^${escapeRegex(prefix)}]*))?`, "g");
  const cmds: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(message)) !== null) {
    const cmd = match[1].toLowerCase();
    const arg = (match[2] ?? "").trim();
    cmds.push(arg ? `${cmd} ${arg}` : cmd);
  }
  return cmds;
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function queueCommands(entry: CommandEntry, cmds: string[]) {
  commandQueue.push(async () => {
    try {
      for (const cmd of cmds) {
        await executeCommand(cmd);
      }
      entry.status = "executed";
    } catch (e) {
      logger.warn({ err: e, cmd: cmds }, "Error executing Twitch command");
      entry.status = "error";
    }
  });
  if (!processing) drainQueue();
}

async function drainQueue() {
  processing = true;
  while (commandQueue.length > 0) {
    const fn = commandQueue.shift()!;
    await fn();
  }
  processing = false;
}

async function executeCommand(cmd: string): Promise<void> {
  const parts = cmd.split(/\s+/);
  const verb = parts[0].toLowerCase();
  const arg = parts.slice(1).join(" ");

  switch (verb) {
    case "combo":
    case "key":
      if (arg) await qemu.sendKeyCombo(arg);
      break;
    case "send":
      if (arg) await qemu.typeString(arg, true);
      break;
    case "type":
      if (arg) await qemu.typeString(arg, false);
      break;
    case "wait": {
      const ms = parseFloat(arg || "1") * 1000;
      await new Promise((r) => setTimeout(r, Math.min(ms, 10000)));
      break;
    }
    default:
      logger.debug({ verb, arg }, "Unknown Twitch command verb");
  }
}
