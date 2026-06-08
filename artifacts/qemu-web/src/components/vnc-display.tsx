import React, { useEffect, useRef, useState, useCallback } from "react";
import RFB from "@novnc/novnc";
import { useGetVmStatus, useStartVm, getGetVmStatusQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Power, Loader2, MonitorOff, AlertTriangle, RefreshCw } from "lucide-react";

export function VncDisplay() {
  const containerRef = useRef<HTMLDivElement>(null);
  const rfbRef = useRef<RFB | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [startError, setStartError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const { data: vmStatus, isLoading: isLoadingStatus } = useGetVmStatus({
    query: { queryKey: getGetVmStatusQueryKey(), refetchInterval: 3000 },
  });

  const startVm = useStartVm();

  const connectVnc = useCallback(() => {
    if (!containerRef.current) return;

    if (rfbRef.current) {
      rfbRef.current.disconnect();
      rfbRef.current = null;
    }

    setStatus("connecting");

    const wsProto = window.location.protocol === "https:" ? "wss" : "ws";
    const wsUrl = `${wsProto}://${window.location.host}/api/vnc`;

    try {
      const rfb = new RFB(containerRef.current, wsUrl);
      rfb.scaleViewport = true;
      rfb.resizeSession = false;

      rfb.addEventListener("connect", () => {
        console.log("[VNC] connected");
        setStatus("connected");
        // Give the noVNC canvas focus so keyboard/mouse events are captured
        try { (rfb as any).focus(); } catch (_) {}
        containerRef.current?.focus();
        setRetryCount(0);
        if (retryTimerRef.current) {
          clearTimeout(retryTimerRef.current);
          retryTimerRef.current = null;
        }
      });

      rfb.addEventListener("disconnect", (e: any) => {
        console.log("[VNC] disconnected", e?.detail?.clean ? "clean" : "unclean", e?.detail);
        setStatus("disconnected");
        rfbRef.current = null;
      });

      rfbRef.current = rfb;
    } catch (err) {
      console.error("Failed to create RFB:", err);
      setStatus("disconnected");
    }
  }, []);

  useEffect(() => {
    if (!vmStatus?.running) {
      if (rfbRef.current) {
        rfbRef.current.disconnect();
        rfbRef.current = null;
      }
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      setStatus("disconnected");
      setRetryCount(0);
      return;
    }

    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
    }

    retryTimerRef.current = setTimeout(() => {
      connectVnc();
    }, 1500);

    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [vmStatus?.running, connectVnc]);

  useEffect(() => {
    if (!vmStatus?.running || status === "connected" || status === "connecting") return;

    const delay = Math.min(2000 + retryCount * 1000, 8000);
    retryTimerRef.current = setTimeout(() => {
      setRetryCount((c) => c + 1);
      connectVnc();
    }, delay);

    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [status, vmStatus?.running, retryCount, connectVnc]);

  const handleStartVm = () => {
    setStartError(null);
    startVm.mutate(
      {
        data: vmStatus?.config || {
          diskImage: "windows-xp.qcow2",
          ram: 512,
          cpus: 1,
          audioEnabled: false,
          audioDevice: "hda",
          pcMode: "pc",
          networkEnabled: true,
          vgaType: "std",
          bootOrder: "c",
        },
      },
      {
        onError: (e: unknown) => {
          const msg = e instanceof Error ? e.message : String(e);
          setStartError(msg);
        },
      }
    );
  };

  const isVmRunning = vmStatus?.running ?? false;
  const showOfflineOverlay = !isVmRunning && !isLoadingStatus;
  const showConnectingOverlay = isVmRunning && status !== "connected";

  const handleVncClick = useCallback(() => {
    if (rfbRef.current && status === "connected") {
      try { (rfbRef.current as any).focus(); } catch (_) {}
    }
    containerRef.current?.focus();
  }, [status]);

  return (
    <div
      className="relative w-full h-full bg-black border border-primary/20 overflow-hidden"
      onClick={handleVncClick}
      style={status === "connected" ? { cursor: "none" } : undefined}
    >
      <div ref={containerRef} className="absolute inset-0" tabIndex={0} />

      {/* Offline — VM not running */}
      {showOfflineOverlay && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm z-10">
          <MonitorOff className="w-16 h-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-bold mb-4 text-muted-foreground">VM OFFLINE</h2>

          {startError && (
            <div className="flex items-start gap-2 text-destructive mb-4 max-w-xs text-center px-4">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="text-xs font-mono break-words">{startError}</span>
            </div>
          )}

          <Button
            size="lg"
            onClick={handleStartVm}
            disabled={startVm.isPending}
            className="text-lg px-8 border-2 border-primary hover:bg-primary hover:text-black transition-all duration-200"
          >
            {startVm.isPending ? (
              <Loader2 className="w-6 h-6 animate-spin mr-2" />
            ) : (
              <Power className="w-6 h-6 mr-2" />
            )}
            INITIALIZE SYSTEM
          </Button>

          {startError && (
            <p className="text-xs text-muted-foreground mt-3 text-center px-4">
              Check the <span className="text-primary font-bold">SYS</span> panel on the right for
              disk image options.
            </p>
          )}
        </div>
      )}

      {/* VM running, VNC connecting/retrying */}
      {showConnectingOverlay && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm z-10">
          <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
          <p className="text-primary font-bold tracking-widest uppercase mb-1">
            {status === "connecting" ? "Connecting to VNC…" : "Waiting for display…"}
          </p>
          {retryCount > 0 && (
            <p className="text-xs text-muted-foreground">
              Attempt {retryCount + 1}
            </p>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={connectVnc}
            className="mt-4 text-xs border border-primary/30 hover:border-primary"
          >
            <RefreshCw className="w-3 h-3 mr-1" /> Retry now
          </Button>
        </div>
      )}

      {/* Status indicator */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-2 bg-black/60 px-3 py-1.5 border border-primary/30">
        <div
          className={`w-3 h-3 rounded-none ${
            status === "connected"
              ? "bg-primary shadow-[0_0_8px_hsl(var(--primary))]"
              : status === "connecting"
              ? "bg-primary/50 animate-pulse"
              : "bg-muted-foreground"
          }`}
        />
        <span className="text-sm font-bold uppercase tracking-widest">VNC: {status}</span>
      </div>
    </div>
  );
}
