import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import type { Duplex } from "stream";
import app from "./app.js";
import { logger } from "./lib/logger.js";
import { attachVncProxy } from "./lib/vnc-proxy.js";
import { attachAudioStream } from "./lib/audio-stream.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = http.createServer(app);

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
  const url = req.url ?? "";

  if (url.startsWith("/api/vnc")) {
    wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
      attachVncProxy(wss, req, ws);
    });
  } else if (url.startsWith("/api/audio")) {
    wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
      attachAudioStream(req, ws);
    });
  } else {
    socket.destroy();
  }
});

server.listen(port, () => {
  logger.info({ port }, "Server listening (HTTP + WebSocket)");
});
