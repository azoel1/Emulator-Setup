declare module "@novnc/novnc" {
  export default class RFB {
    constructor(target: HTMLElement, url: string, options?: Record<string, unknown>);
    scaleViewport: boolean;
    resizeSession: boolean;
    disconnect(): void;
    sendKey(keysym: number, code: string, down?: boolean): void;
    addEventListener(event: string, listener: (e: CustomEvent) => void): void;
  }
}

declare module "@novnc/novnc/core/rfb.js" {
  export default class RFB {
    constructor(target: HTMLElement, url: string, options?: Record<string, unknown>);
    scaleViewport: boolean;
    resizeSession: boolean;
    disconnect(): void;
    sendKey(keysym: number, code: string, down?: boolean): void;
    addEventListener(event: string, listener: (e: CustomEvent) => void): void;
  }
}
