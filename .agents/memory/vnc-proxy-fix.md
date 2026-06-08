---
name: VNC proxy fix
description: Critical VNC connection bugs and how they were fixed in the QEMU Web Emulator
---

## Rules

1. **VNC port must be 5900 (raw RFB TCP), NOT 5700.**  
   QEMU `-vnc :1,websocket=5700` creates TWO servers: port 5901 (raw) and port 5700 (WebSocket). The Node.js proxy does WebSocket↔TCP, so it must connect TCP to the raw port (5900 with `-vnc :0`, or 5901 with `-vnc :1`). Connecting TCP to QEMU's own WebSocket port causes a double-WebSocket protocol mismatch — VNC seems to connect (handshake partly works) but immediately disconnects.

2. **`rfb.resizeSession = false` is required.**  
   With `resizeSession = true`, noVNC sends `SetDesktopSize` to QEMU, which rejects it. In the version used, this rejection causes noVNC to disconnect. Setting `resizeSession = false` prevents the request entirely.

3. **QEMU only allows one VNC client at a time.**  
   Any new connection kicks the existing one. The screenshot tool opening a fresh browser tab will disconnect the user's session. Retry logic (auto-retry on disconnect when VM is running) is essential UX.

4. **windows-xp.qcow2 is valid qcow2 sparse format.**  
   286 MiB of actual data in a 5 GiB virtual disk is normal — qcow2 only allocates space for written sectors. The 511 MB container file IS the complete disk image.

5. **Disk config must store filename only, not absolute path.**  
   Saving `/home/runner/workspace/.../windows-xp.qcow2` as the diskImage breaks portability. Normalize via `path.isAbsolute(d) ? path.basename(d) : d` when saving config.

**Why:** All of the above were confirmed bugs that caused "VNC connecting but never shows display" behavior.
