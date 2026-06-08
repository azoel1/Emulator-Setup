---
name: QEMU Web Emulator architecture
description: Key architecture decisions for the QEMU web emulator project
---

## Audio streaming
- QEMU → PulseAudio null sink "qemu_capture" → `parec` captures raw PCM → WebSocket `/api/audio` → browser Web Audio API
- First WS message is JSON metadata (`{sampleRate, channels, format}`), subsequent messages are raw S16LE interleaved stereo PCM binary frames
- QEMU args: `-audiodev pa,id=pa0,out.sink=qemu_capture -device intel-hda -device hda-duplex,audiodev=pa0`
- Browser must create AudioContext on user gesture (or after enabling audio toggle)

## VNC display
- QEMU runs with `-vnc :1,websocket=5700`
- api-server proxies `/api/vnc` WebSocket → `localhost:5700` via `vnc-proxy.ts`
- Frontend uses `@novnc/novnc` RFB class connecting to `(wss|ws)://<host>/api/vnc`

## Disk / config storage
- Disk images at `artifacts/api-server/disks/`
- Config and snapshots JSON at `artifacts/api-server/data/`
- QMP monitor socket: `artifacts/api-server/data/qemu-monitor.sock`

## WebSocket URL pattern
Always detect protocol: `const wsProto = window.location.protocol === "https:" ? "wss" : "ws"` — the Replit proxy terminates TLS so production needs `wss://`.

## Windows XP download
- POST `/api/download/windows-xp` → background download from archive.org
- GET `/api/download/status` → progress tracking
