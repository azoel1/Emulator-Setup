import { Router, type IRouter } from "express";
import https from "https";
import http from "http";
import fs from "fs";
import path from "path";
import { logger } from "../lib/logger.js";

const workspaceRoot = process.cwd().endsWith(path.join("artifacts", "api-server"))
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();
const disksDir = path.resolve(workspaceRoot, "artifacts/api-server/disks");

const WINDOWS_XP_FILENAME = "windows-xp.qcow2";
const WINDOWS_XP_URL = "https://archive.org/download/windows-xp_202105/Windows%20XP.qcow2";
const PARALLEL_CHUNKS = 8;

interface DownloadProgress {
  filename: string;
  status: "idle" | "downloading" | "done" | "error";
  downloaded: number;
  total: number;
  speedBps: number;
  error?: string;
}

const progress: DownloadProgress = {
  filename: WINDOWS_XP_FILENAME,
  status: "idle",
  downloaded: 0,
  total: 0,
  speedBps: 0,
};

function resolveRedirects(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const parsedUrl = new URL(url);
    const req = lib.request(
      { hostname: parsedUrl.hostname, path: parsedUrl.pathname + parsedUrl.search, method: "HEAD" },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          resolveRedirects(res.headers.location).then(resolve).catch(reject);
          return;
        }
        resolve(url);
      }
    );
    req.on("error", reject);
    req.end();
  });
}

function getContentLength(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const parsedUrl = new URL(url);
    const req = lib.request(
      { hostname: parsedUrl.hostname, path: parsedUrl.pathname + parsedUrl.search, method: "HEAD" },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          getContentLength(res.headers.location).then(resolve).catch(reject);
          return;
        }
        const len = parseInt(res.headers["content-length"] ?? "0", 10);
        if (len > 0) resolve(len);
        else reject(new Error(`No content-length from HEAD (status ${res.statusCode})`));
      }
    );
    req.on("error", reject);
    req.end();
  });
}

function downloadChunk(
  url: string,
  dest: string,
  start: number,
  end: number,
  onData: (bytes: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const parsedUrl = new URL(url);
    const req = lib.request(
      {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        method: "GET",
        headers: { Range: `bytes=${start}-${end}` },
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          downloadChunk(res.headers.location, dest, start, end, onData).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 206 && res.statusCode !== 200) {
          reject(new Error(`Chunk HTTP ${res.statusCode} for bytes=${start}-${end}`));
          return;
        }
        const ws = fs.createWriteStream(dest, { flags: "w" });
        res.on("data", (chunk: Buffer) => onData(chunk.length));
        res.pipe(ws);
        ws.on("finish", resolve);
        ws.on("error", reject);
        res.on("error", reject);
      }
    );
    req.on("error", reject);
    req.end();
  });
}

function assembleChunks(chunkPaths: string[], dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ws = fs.createWriteStream(dest, { flags: "w" });
    let i = 0;
    function next() {
      if (i >= chunkPaths.length) {
        ws.end();
        ws.on("finish", resolve);
        ws.on("error", reject);
        return;
      }
      const rs = fs.createReadStream(chunkPaths[i++]);
      rs.pipe(ws, { end: false });
      rs.on("end", next);
      rs.on("error", reject);
    }
    next();
  });
}

let abortDownload = false;

async function parallelDownload(
  url: string,
  dest: string,
  totalSize: number,
  onData: (bytes: number) => void
): Promise<void> {
  const chunkSize = Math.ceil(totalSize / PARALLEL_CHUNKS);
  const chunkDir = dest + ".chunks";
  if (!fs.existsSync(chunkDir)) fs.mkdirSync(chunkDir, { recursive: true });

  const chunks: Array<{ start: number; end: number; path: string }> = [];
  for (let i = 0; i < PARALLEL_CHUNKS; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize - 1, totalSize - 1);
    chunks.push({ start, end, path: path.join(chunkDir, `chunk-${i}`) });
  }

  logger.info({ chunks: chunks.length, chunkSize }, "Starting parallel download");

  await Promise.all(
    chunks.map((c) => {
      if (abortDownload) return Promise.reject(new Error("Aborted"));
      return downloadChunk(url, c.path, c.start, c.end, onData);
    })
  );

  if (abortDownload) throw new Error("Download aborted");

  logger.info("All chunks downloaded, assembling...");
  await assembleChunks(chunks.map((c) => c.path), dest);

  for (const c of chunks) {
    try { fs.unlinkSync(c.path); } catch {}
  }
  try { fs.rmdirSync(chunkDir); } catch {}
}

const router: IRouter = Router();

router.get("/download/status", async (_req, res): Promise<void> => {
  if (!fs.existsSync(disksDir)) fs.mkdirSync(disksDir, { recursive: true });
  const diskPath = path.join(disksDir, WINDOWS_XP_FILENAME);

  if (progress.status === "idle" && fs.existsSync(diskPath)) {
    const size = fs.statSync(diskPath).size;
    progress.downloaded = size;
    progress.total = size;
    progress.status = "done";
  }

  res.json(progress);
});

router.post("/download/windows-xp", async (_req, res): Promise<void> => {
  if (!fs.existsSync(disksDir)) fs.mkdirSync(disksDir, { recursive: true });
  const diskPath = path.join(disksDir, WINDOWS_XP_FILENAME);
  const tempPath = diskPath + ".tmp";

  if (progress.status === "downloading") {
    res.json({ message: "Already downloading", progress });
    return;
  }

  if (fs.existsSync(diskPath) && fs.statSync(diskPath).size > 0) {
    const size = fs.statSync(diskPath).size;
    progress.status = "done";
    progress.downloaded = size;
    progress.total = size;
    res.json({ message: "Already downloaded", progress });
    return;
  }

  progress.status = "downloading";
  progress.downloaded = 0;
  progress.total = 0;
  progress.speedBps = 0;
  progress.error = undefined;
  abortDownload = false;

  res.json({ message: `Starting parallel download (${PARALLEL_CHUNKS} connections)`, progress });

  let speedInterval: ReturnType<typeof setInterval> | null = null;
  try {
    logger.info("Resolving final URL and getting file size...");
    const finalUrl = await resolveRedirects(WINDOWS_XP_URL);
    const totalSize = await getContentLength(finalUrl);
    progress.total = totalSize;
    logger.info({ totalSize, finalUrl }, "Starting parallel download");

    let lastDownloaded = 0;
    speedInterval = setInterval(() => {
      const delta = progress.downloaded - lastDownloaded;
      progress.speedBps = delta * 2;
      lastDownloaded = progress.downloaded;
    }, 500);

    await parallelDownload(
      finalUrl,
      tempPath,
      totalSize,
      (bytes) => { progress.downloaded += bytes; }
    );

    if (speedInterval) clearInterval(speedInterval);
    progress.speedBps = 0;

    fs.renameSync(tempPath, diskPath);
    progress.status = "done";
    progress.downloaded = fs.statSync(diskPath).size;
    progress.total = progress.downloaded;
    logger.info("Windows XP download complete");
  } catch (e: unknown) {
    if (speedInterval) clearInterval(speedInterval);
    progress.speedBps = 0;
    progress.status = "error";
    progress.error = (e instanceof Error ? e.message : String(e));
    logger.error({ err: e }, "Windows XP download failed");
  }
});

router.delete("/download/windows-xp", (_req, res): void => {
  abortDownload = true;
  const diskPath = path.join(disksDir, WINDOWS_XP_FILENAME);
  const tempPath = diskPath + ".tmp";
  const chunkDir = tempPath + ".chunks";
  [diskPath, tempPath].forEach(f => { try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {} });
  if (fs.existsSync(chunkDir)) {
    try { fs.rmSync(chunkDir, { recursive: true, force: true }); } catch {}
  }
  progress.status = "idle";
  progress.downloaded = 0;
  progress.total = 0;
  progress.speedBps = 0;
  progress.error = undefined;
  res.json({ message: "Deleted" });
});

export default router;
