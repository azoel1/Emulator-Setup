---
name: noVNC + Vite import
description: How to correctly import noVNC RFB class in a Vite project
---

The `@novnc/novnc` v1.7.0 package has its `exports` field set to the bare string `"./core/rfb.js"` — this is the package root export, NOT a subpath export. 

**Rule:** Import as `import RFB from "@novnc/novnc"` — NOT `@novnc/novnc/core/rfb.js`.

**Why:** Vite enforces `exports` map resolution. Since the exports field has no subpath entries, importing `@novnc/novnc/core/rfb.js` as a subpath triggers "Package subpath 'undefined' is not defined by exports" (the `undefined` comes from the string exports value being used as the key lookup result).

**How to apply:** Any time noVNC is imported in a Vite/ESM project, use the root import form only.
