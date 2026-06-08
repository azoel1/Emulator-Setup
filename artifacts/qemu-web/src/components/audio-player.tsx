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
  const gotMetaRef = useRef(false);

  useEffect(() => {
    if (!vmStatus?.running) {
      wsRef.current?.close();
      wsRef.current = null;
      audioCtxRef.current?.close();
      audioCtxRef.current = null;
      setConnected(false);
      return;
    }

    if (wsRef.current) return;

    try {
      const wsProto = window.location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${wsProto}://${window.location.host}/api/audio`);
      ws.binaryType = "arraybuffer";
      gotMetaRef.current = false;
      nextTimeRef.current = 0;

      ws.onopen = () => setConnected(true);
      ws.onclose = () => setConnected(false);

      ws.onmessage = (e) => {
        if (!gotMetaRef.current) {
          gotMetaRef.current = true;
          audioCtxRef.current = new AudioContext({ sampleRate: 44100 });
          nextTimeRef.current = audioCtxRef.current.currentTime + 0.1;
          return;
        }
        if (!audioEnabled || !audioCtxRef.current) return;

        const pcm = new Int16Array(e.data);
        const buf = audioCtxRef.current.createBuffer(2, pcm.length / 2, 44100);
        const l = buf.getChannelData(0);
        const r = buf.getChannelData(1);
        for (let i = 0; i < pcm.length / 2; i++) {
          l[i] = pcm[i * 2] / 32768;
          r[i] = pcm[i * 2 + 1] / 32768;
        }
        const src = audioCtxRef.current.createBufferSource();
        src.buffer = buf;
        src.connect(audioCtxRef.current.destination);
        const t = Math.max(nextTimeRef.current, audioCtxRef.current.currentTime + 0.05);
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
  }, [vmStatus?.running, audioEnabled]);

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
        onClick={() => {
          if (!audioEnabled && audioCtxRef.current?.state === "suspended") {
            audioCtxRef.current.resume();
          }
          setAudioEnabled(!audioEnabled);
        }}
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
