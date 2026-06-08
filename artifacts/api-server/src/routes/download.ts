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

interface DownloadProgress {
  filename: string;
  status: "idle" | "downloading" | "done" | "error";
  downloaded: number;
  total: number;
  error?: string;
}

const progress: DownloadProgress = {
  filename: WINDOWS_XP_FILENAME,
  status: "idle",
  downloaded: 0,
  total: 0,
};

function getFileSize(url: string): Promise<number> {
  return new Promise((resolve) => {
    const lib = url.startsWith("https") ? https : http;
    const parsedUrl = new URL(url);
    const req = lib.request(
      { hostname: parsedUrl.hostname, path: parsedUrl.pathname + parsedUrl.search, method: "HEAD" },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          getFileSize(res.headers.location).then(resolve).catch(() => resolve(0));
          return;
        }
        const len = parseInt(res.headers["content-length"] ?? "0", 10);
        resolve(len || 0);
      }
    );
    req.on("error", () => resolve(0));
    req.end();
  });
}

function downloadFile(
  url: string,
  dest: string,
  resumeFrom: number,
  onData: (bytes: number) => void,
  onTotal: (total: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {};
    if (resumeFrom > 0) {
      headers["Range"] = `bytes=${resumeFrom}-`;
    }

    const lib = url.startsWith("https") ? https : http;
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: "GET",
      headers,
    };

    const req = lib.request(options, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadFile(res.headers.location, dest, resumeFrom, onData, onTotal).then(resolve).catch(reject);
        return;
      }
      if (!res.statusCode || (res.statusCode !== 200 && res.statusCode !== 206)) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }

      const contentLength = parseInt(res.headers["content-length"] ?? "0", 10);
      if (contentLength > 0) {
        onTotal(resumeFrom + contentLength);
      }

      const flags = resumeFrom > 0 ? "a" : "w";
      const ws = fs.createWriteStream(dest, { flags });
      res.on("data", (chunk: Buffer) => onData(chunk.length));
      res.pipe(ws);
      ws.on("finish", resolve);
      ws.on("error", reject);
      res.on("error", reject);
    });
    req.on("error", reject);
    req.end();
  });
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

  const resumeFrom = fs.existsSync(tempPath) ? fs.statSync(tempPath).size : 0;

  progress.status = "downloading";
  progress.downloaded = resumeFrom;
  progress.total = 0;
  progress.error = undefined;

  res.json({ message: resumeFrom > 0 ? `Resuming from ${Math.round(resumeFrom / 1024 / 1024)}MB` : "Download started", progress });

  try {
    if (progress.total === 0) {
      logger.info("Getting file size from archive.org...");
      const size = await getFileSize(WINDOWS_XP_URL);
      if (size > 0) {
        progress.total = size;
        logger.info({ size }, "Got file size");
      }
    }

    logger.info({ resumeFrom, url: WINDOWS_XP_URL }, "Starting direct download from archive.org");

    await downloadFile(
      WINDOWS_XP_URL,
      tempPath,
      resumeFrom,
      (bytes) => { progress.downloaded += bytes; },
      (total) => { progress.total = total; }
    );

    fs.renameSync(tempPath, diskPath);
    progress.status = "done";
    progress.downloaded = fs.statSync(diskPath).size;
    progress.total = progress.downloaded;
    logger.info("Windows XP download complete");
  } catch (e: unknown) {
    progress.status = "error";
    progress.error = (e instanceof Error ? e.message : String(e));
    logger.error({ err: e }, "Windows XP download failed");
  }
});

router.delete("/download/windows-xp", (_req, res): void => {
  const diskPath = path.join(disksDir, WINDOWS_XP_FILENAME);
  const tempPath = diskPath + ".tmp";
  [diskPath, tempPath].forEach(f => { try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {} });
  progress.status = "idle";
  progress.downloaded = 0;
  progress.total = 0;
  progress.error = undefined;
  res.json({ message: "Deleted" });
});

export default router;
