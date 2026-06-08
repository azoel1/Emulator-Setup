import React, { useEffect, useRef, useState } from "react";
import { useGetVmStatus, getGetVmStatusQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Volume2, VolumeX } from "lucide-react";

export function AudioPlayer() {
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [connected, setConnected] = useState(false);

  const { data: vmStatus } = useGetVmStatus({ query: { queryKey: getGetVmStatusQueryKey(), refetchInterval: 3000 } });

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const nextTimeRef = useRef(0);
  const sampleRateRef = useRef(44100);
  const channelsRef = useRef(2);
  const audioEnabledRef = useRef(false);

  // Keep ref in sync with state so the WS message handler (closure) always sees current value
  audioEnabledRef.current = audioEnabled;

  // Create/destroy the WebSocket when VM starts/stops — NOT when audioEnabled changes
  useEffect(() => {
    if (!vmStatus?.running) {
      wsRef.current?.close();
      wsRef.current = null;
      audioCtxRef.current?.close();
      audioCtxRef.current = null;
      nextTimeRef.current = 0;
      setConnected(false);
      setAudioEnabled(false);
      return;
    }

    if (wsRef.current) return;

    try {
      const wsProto = window.location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${wsProto}://${window.location.host}/api/audio`);
      ws.binaryType = "arraybuffer";

      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
      };

      ws.onmessage = (e) => {
        // First message is JSON metadata
        if (typeof e.data === "string") {
          try {
            const meta = JSON.parse(e.data);
            sampleRateRef.current = meta.sampleRate ?? 44100;
            channelsRef.current = meta.channels ?? 2;
          } catch (_) {}
          return;
        }

        // Binary PCM — only decode/play when enabled and AudioContext is ready
        const ctx = audioCtxRef.current;
        if (!audioEnabledRef.current || !ctx || ctx.state === "closed") return;

        // Resume if suspended (shouldn't happen after user gesture, but safety net)
        if (ctx.state === "suspended") {
          ctx.resume().catch(() => {});
          return;
        }

        const pcm = new Int16Array(e.data);
        const ch = channelsRef.current;
        const frames = pcm.length / ch;
        const buf = ctx.createBuffer(ch, frames, sampleRateRef.current);
        for (let c = 0; c < ch; c++) {
          const channelData = buf.getChannelData(c);
          for (let i = 0; i < frames; i++) {
            channelData[i] = pcm[i * ch + c] / 32768;
          }
        }
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        const t = Math.max(nextTimeRef.current, ctx.currentTime + 0.05);
        src.start(t);
        nextTimeRef.current = t + buf.duration;
      };

      wsRef.current = ws;
    } catch (err) {
      console.error("Audio WS error", err);
    }

    return () => {
      wsRef.current?.close();
      wsRef.current = null;
      audioCtxRef.current?.close();
      audioCtxRef.current = null;
    };
  }, [vmStatus?.running]);

  const handleToggle = () => {
    if (!audioEnabled) {
      // Enabling — create or resume AudioContext inside user gesture
      if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
        audioCtxRef.current = new AudioContext({ sampleRate: sampleRateRef.current });
        nextTimeRef.current = 0;
      }
      audioCtxRef.current.resume().catch(() => {});
      setAudioEnabled(true);
    } else {
      // Muting — just disable, keep AudioContext alive
      setAudioEnabled(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="icon"
        className={`h-9 w-9 border touch-manipulation ${
          audioEnabled
            ? "border-primary bg-primary/10 text-primary hover:bg-primary/20"
            : "border-primary/30 text-muted-foreground hover:border-primary hover:text-primary"
        }`}
        onClick={handleToggle}
        title={audioEnabled ? "Mute audio" : "Enable audio"}
      >
        {audioEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
      </Button>
      <div className="hidden sm:flex flex-col leading-none">
        <span className="text-[10px] font-bold uppercase tracking-wider text-primary">PCM Audio</span>
        <span className={`text-[9px] font-mono ${connected ? "text-primary/70" : "text-muted-foreground/50"}`}>
          {connected ? "LINKED" : "NO SIGNAL"}
        </span>
      </div>
    </div>
  );
}
