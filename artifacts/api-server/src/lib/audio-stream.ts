import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import { WebSocket } from "ws";
import type { IncomingMessage } from "http";
import { logger } from "./logger.js";
import { AUDIO_PULSE_SOURCE } from "./qemu.js";

const SAMPLE_RATE = 44100;
const CHANNELS = 2;
const FORMAT = "s16le";

export function attachAudioStream(
  _req: IncomingMessage,
  ws: WebSocket
) {
  logger.info("Audio WebSocket client connected — starting parec");

  const parec: ChildProcessWithoutNullStreams = spawn("parec", [
    "--source", AUDIO_PULSE_SOURCE,
    "--format", FORMAT,
    "--rate", String(SAMPLE_RATE),
    "--channels", String(CHANNELS),
    "--latency-msec=50",
    "--raw",
  ]);

  parec.stderr.on("data", (d: Buffer) => {
    logger.debug({ msg: d.toString() }, "parec stderr");
  });

  parec.on("error", (e) => {
    logger.warn({ err: e }, "parec error");
    ws.close(1011, "Audio capture unavailable");
  });

  parec.stdout.on("data", (chunk: Buffer) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(chunk, { binary: true });
    }
  });

  parec.on("close", () => {
    if (ws.readyState === WebSocket.OPEN) ws.close();
  });

  ws.on("close", () => {
    parec.kill("SIGTERM");
  });

  ws.on("error", () => {
    parec.kill("SIGTERM");
  });

  const meta = JSON.stringify({ sampleRate: SAMPLE_RATE, channels: CHANNELS, format: FORMAT });
  ws.send(meta);
}
