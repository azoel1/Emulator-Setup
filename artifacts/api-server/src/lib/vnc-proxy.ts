import { WebSocketServer, WebSocket } from "ws";
import net from "net";
import type { IncomingMessage } from "http";
import { logger } from "./logger.js";
import { VNC_SOCK } from "./qemu.js";

export function attachVncProxy(
  wss: WebSocketServer,
  req: IncomingMessage,
  ws: WebSocket
) {
  logger.info("VNC WebSocket client connected — proxying to QEMU Unix socket");

  const target = net.createConnection({ path: VNC_SOCK });

  target.on("error", (e) => {
    logger.warn({ err: e }, "VNC proxy: could not connect to QEMU VNC socket");
    ws.close(1011, "QEMU VNC not available");
  });

  target.on("data", (data: Buffer) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data, { binary: true });
    }
  });

  target.on("close", () => {
    if (ws.readyState === WebSocket.OPEN) ws.close();
  });

  ws.on("message", (data: Buffer | string) => {
    if (target.writable) {
      target.write(typeof data === "string" ? Buffer.from(data) : data);
    }
  });

  ws.on("close", () => {
    target.destroy();
  });

  ws.on("error", () => {
    target.destroy();
  });
}
