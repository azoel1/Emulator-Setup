import React, { useEffect, useState } from "react";
import {
  useGetVmStatus,
  useStartVm,
  useStopVm,
  useResetVm,
  getGetVmStatusQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Power,
  Square,
  RotateCcw,
  Clock,
  Cpu,
  HardDrive,
  Loader2,
  Download,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface DownloadProgress {
  status: "idle" | "downloading" | "done" | "error";
  downloaded: number;
  total: number;
  speedBps: number;
  error?: string;
}

function useDownloadStatus() {
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [poll, setPoll] = useState(true);
  useEffect(() => {
    if (!poll) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await fetch(`${BASE}/api/download/status`);
        const data: DownloadProgress = await r.json();
        if (!cancelled) {
          setProgress(data);
          if (data.status !== "downloading") setPoll(false);
        }
      } catch {}
    };
    tick();
    const id = setInterval(tick, 1500);
    return () => { cancelled = true; clearInterval(id); };
  }, [poll]);
  return { progress, startPolling: () => setPoll(true) };
}

function fmtBytes(b: number) {
  if (b === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return `${(b / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function fmtSpeed(bps: number) {
  if (bps <= 0) return null;
  if (bps >= 1024 * 1024) return `${(bps / 1024 / 1024).toFixed(1)} MB/s`;
  if (bps >= 1024) return `${(bps / 1024).toFixed(0)} KB/s`;
  return `${bps} B/s`;
}

function fmtEta(downloaded: number, total: number, bps: number) {
  if (bps <= 0 || total <= 0) return null;
  const remaining = total - downloaded;
  const secs = Math.round(remaining / bps);
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m < 60) return `${m}m ${s}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function VmControls() {
  const { data: vmStatus, refetch: refetchStatus } = useGetVmStatus({
    query: { queryKey: getGetVmStatusQueryKey(), refetchInterval: 3000 },
  });
  const startVm = useStartVm();
  const stopVm = useStopVm();
  const resetVm = useResetVm();

  const [startError, setStartError] = useState<string | null>(null);

  const isRunning = vmStatus?.running;

  // Always poll — auto-shows progress if download is in progress on mount
  const { progress: dlProgress, startPolling } = useDownloadStatus();

  // Refresh VM status when download finishes
  useEffect(() => {
    if (dlProgress?.status === "done") refetchStatus();
  }, [dlProgress?.status]);

  const formatUptime = (seconds?: number | null) => {
    if (!seconds) return "00:00:00";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const handleStart = () => {
    setStartError(null);
    const cfg = vmStatus?.config ?? { diskImage: "windows-xp.qcow2", ram: 512, cpus: 1 };
    startVm.mutate(
      { data: cfg },
      {
        onError: (e: unknown) => {
          const msg = (e instanceof Error ? e.message : String(e));
          setStartError(msg);
        },
      }
    );
  };

  const handleDownloadXp = async () => {
    setStartError(null);
    try {
      await fetch(`${BASE}/api/download/windows-xp`, { method: "POST" });
      startPolling();
    } catch {
      setStartError("Failed to start download");
    }
  };

  const dlPct =
    dlProgress && dlProgress.total > 0
      ? Math.round((dlProgress.downloaded / dlProgress.total) * 100)
      : null;

  const isDownloading = dlProgress?.status === "downloading";
  const diskMissing =
    startError?.toLowerCase().includes("disk image not found") ||
    startError?.toLowerCase().includes("not found");

  return (
    <div className="flex flex-col gap-4">
      {/* Status bar */}
      <div className="flex items-center justify-between p-3 border border-primary/20 bg-black/40">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">
            System Status
          </span>
          <div className="flex items-center gap-2">
            <div
              className={`w-2.5 h-2.5 ${
                isRunning
                  ? "bg-primary shadow-[0_0_8px_hsl(var(--primary))]"
                  : "bg-destructive shadow-[0_0_8px_hsl(var(--destructive))]"
              }`}
            />
            <span
              className={`font-bold tracking-widest text-sm ${
                isRunning ? "text-primary text-glow" : "text-destructive"
              }`}
            >
              {isRunning ? "ONLINE" : "OFFLINE"}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">
            Uptime
          </span>
          <span className="font-mono text-primary font-bold tracking-wider text-sm flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatUptime(vmStatus?.uptime)}
          </span>
        </div>
      </div>

      {/* Control buttons */}
      <div className="grid grid-cols-3 gap-2">
        <Button
          variant="outline"
          className="flex-col h-16 sm:h-14 border-primary/50 hover:bg-primary hover:text-black active:bg-primary active:text-black touch-manipulation"
          onClick={handleStart}
          disabled={isRunning || startVm.isPending}
        >
          {startVm.isPending ? (
            <Loader2 className="w-5 h-5 mb-1 animate-spin" />
          ) : (
            <Power className="w-5 h-5 mb-1" />
          )}
          <span className="text-[11px] font-bold uppercase tracking-wider">
            Start
          </span>
        </Button>
        <Button
          variant="outline"
          className="flex-col h-16 sm:h-14 border-destructive/50 hover:bg-destructive hover:text-white active:bg-destructive active:text-white touch-manipulation"
          onClick={() => { setStartError(null); stopVm.mutate(); }}
          disabled={!isRunning || stopVm.isPending}
        >
          {stopVm.isPending ? (
            <Loader2 className="w-5 h-5 mb-1 animate-spin" />
          ) : (
            <Square className="w-5 h-5 mb-1" />
          )}
          <span className="text-[11px] font-bold uppercase tracking-wider">
            Stop
          </span>
        </Button>
        <Button
          variant="outline"
          className="flex-col h-16 sm:h-14 border-primary/50 hover:bg-primary hover:text-black active:bg-primary active:text-black touch-manipulation"
          onClick={() => resetVm.mutate()}
          disabled={!isRunning || resetVm.isPending}
        >
          {resetVm.isPending ? (
            <Loader2 className="w-5 h-5 mb-1 animate-spin" />
          ) : (
            <RotateCcw className="w-5 h-5 mb-1" />
          )}
          <span className="text-[11px] font-bold uppercase tracking-wider">
            Reset
          </span>
        </Button>
      </div>

      {/* Error / download area */}
      {(startError || isDownloading || dlProgress?.status === "done") && (
        <div className="border border-primary/20 bg-black/40 p-3 flex flex-col gap-3">
          {/* Error message */}
          {startError && !diskMissing && (
            <div className="flex items-start gap-2 text-destructive">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="text-xs font-mono break-all">{startError}</span>
            </div>
          )}

          {/* Disk missing — offer download */}
          {diskMissing && !isDownloading && dlProgress?.status !== "done" && (
            <div className="flex flex-col gap-2">
              <div className="flex items-start gap-2 text-primary/80">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-primary" />
                <span className="text-xs font-mono">
                  No disk image found. Download Windows XP from archive.org to get started.
                </span>
              </div>
              <Button
                className="h-11 w-full rounded-none bg-primary text-black font-bold uppercase tracking-wider hover:bg-primary/80 touch-manipulation"
                onClick={handleDownloadXp}
              >
                <Download className="w-4 h-4 mr-2" />
                Download Windows XP (~700 MB)
              </Button>
            </div>
          )}

          {/* Download in progress */}
          {isDownloading && dlProgress && dlProgress.status === "downloading" && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-primary font-bold uppercase tracking-wider flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Downloading…
                </span>
                <span className="text-muted-foreground">
                  {dlPct !== null ? `${dlPct}%` : "…"}
                </span>
              </div>
              <div className="h-2 w-full bg-secondary overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${dlPct ?? 0}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                <span>
                  {fmtBytes(dlProgress.downloaded)}
                  {dlProgress.total > 0 && ` / ${fmtBytes(dlProgress.total)}`}
                </span>
                <span className="flex items-center gap-2">
                  {fmtSpeed(dlProgress.speedBps) && (
                    <span className="text-primary font-bold">{fmtSpeed(dlProgress.speedBps)}</span>
                  )}
                  {fmtEta(dlProgress.downloaded, dlProgress.total, dlProgress.speedBps) && (
                    <span>ETA {fmtEta(dlProgress.downloaded, dlProgress.total, dlProgress.speedBps)}</span>
                  )}
                </span>
              </div>
            </div>
          )}

          {/* Done */}
          {dlProgress?.status === "done" && !isDownloading && (
            <div className="flex items-center gap-2 text-primary">
              <CheckCircle2 className="w-4 h-4" />
              <span className="text-xs font-mono font-bold">
                Windows XP ready — click Start!
              </span>
            </div>
          )}

          {/* Download error */}
          {dlProgress?.status === "error" && (
            <div className="flex flex-col gap-2">
              <div className="flex items-start gap-2 text-destructive">
                <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="text-xs font-mono break-all">
                  Download failed: {dlProgress.error}
                </span>
              </div>
              <Button
                variant="outline"
                className="h-10 w-full rounded-none border-primary/50 text-xs font-bold uppercase tracking-wider touch-manipulation"
                onClick={handleDownloadXp}
              >
                Retry Download
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Active config readout */}
      {vmStatus?.config && (
        <div className="p-3 border border-primary/20 bg-black/40">
          <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block mb-2">
            Active Configuration
          </span>
          <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Cpu className="w-4 h-4 text-primary shrink-0" />
              <span>{vmStatus.config.cpus} vCPU</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <HardDrive className="w-4 h-4 text-primary shrink-0" />
              <span>{vmStatus.config.ram} MB</span>
            </div>
            <div className="col-span-2 flex items-center gap-2 text-muted-foreground">
              <span className="text-primary font-bold shrink-0">DISK:</span>
              <span className="truncate text-xs">
                {vmStatus.config.diskImage || "None selected"}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
