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

const LFS_OID = "94a292c46deea26d0d8f69b68833f5ccdbc3b42adaa2fbe1b1ea31c3c4da1548";
const LFS_SIZE = 509214720;
const LFS_BATCH_URL = "https://github.com/azoel1/Emulator-Setup.git/info/lfs/objects/batch";

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
  total: LFS_SIZE,
};

function httpGet(url: string, headers: Record<string, string> = {}): Promise<{ statusCode: number; body: string; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: "GET",
      headers,
    };
    lib.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (d: Buffer) => chunks.push(d));
      res.on("end", () => resolve({
        statusCode: res.statusCode ?? 0,
        body: Buffer.concat(chunks).toString("utf8"),
        headers: res.headers as Record<string, string>,
      }));
      res.on("error", reject);
    }).on("error", reject).end();
  });
}

function httpPost(url: string, body: string, headers: Record<string, string> = {}): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const parsedUrl = new URL(url);
    const buf = Buffer.from(body, "utf8");
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: "POST",
      headers: { ...headers, "Content-Length": buf.length },
    };
    const req = lib.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (d: Buffer) => chunks.push(d));
      res.on("end", () => resolve({ statusCode: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.write(buf);
    req.end();
  });
}

async function getLfsDownloadUrl(): Promise<string> {
  const batchBody = JSON.stringify({
    operation: "download",
    transfers: ["basic"],
    objects: [{ oid: LFS_OID, size: LFS_SIZE }],
  });
  const res = await httpPost(LFS_BATCH_URL, batchBody, {
    "Accept": "application/vnd.git-lfs+json",
    "Content-Type": "application/vnd.git-lfs+json",
  });
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(`LFS batch API returned ${res.statusCode}: ${res.body.slice(0, 200)}`);
  }
  const data = JSON.parse(res.body);
  const obj = data.objects?.[0];
  if (!obj) throw new Error("No objects in LFS response");
  if (obj.error) throw new Error(`LFS error: ${obj.error.message}`);
  const href = obj.actions?.download?.href;
  if (!href) throw new Error("No download href in LFS response");
  return href;
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

router.get("/download/status", (_req, res): void => {
  if (!fs.existsSync(disksDir)) fs.mkdirSync(disksDir, { recursive: true });
  const diskPath = path.join(disksDir, WINDOWS_XP_FILENAME);
  if (progress.status === "idle" && fs.existsSync(diskPath)) {
    const size = fs.statSync(diskPath).size;
    if (size >= LFS_SIZE) {
      progress.status = "done";
      progress.downloaded = size;
      progress.total = size;
    } else {
      progress.downloaded = size;
      progress.total = LFS_SIZE;
    }
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

  if (fs.existsSync(diskPath) && fs.statSync(diskPath).size >= LFS_SIZE) {
    progress.status = "done";
    progress.downloaded = fs.statSync(diskPath).size;
    progress.total = progress.downloaded;
    res.json({ message: "Already downloaded", progress });
    return;
  }

  const resumeFrom = fs.existsSync(tempPath) ? fs.statSync(tempPath).size : 0;

  progress.status = "downloading";
  progress.downloaded = resumeFrom;
  progress.total = LFS_SIZE;
  progress.error = undefined;

  res.json({ message: resumeFrom > 0 ? `Resuming from ${Math.round(resumeFrom / 1024 / 1024)}MB` : "Download started", progress });

  try {
    logger.info({ resumeFrom }, "Fetching GitHub LFS download URL");
    const downloadUrl = await getLfsDownloadUrl();
    logger.info("Got LFS URL, starting download");

    await downloadFile(
      downloadUrl,
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
  progress.total = LFS_SIZE;
  progress.error = undefined;
  res.json({ message: "Deleted" });
});

export default router;
