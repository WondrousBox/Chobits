import { createRequire } from 'node:module';

type UiohookKeyboardEvent = {
  altKey?: boolean;
  ctrlKey?: boolean;
  keycode: number;
  metaKey?: boolean;
  shiftKey?: boolean;
  time?: number;
  type?: number;
};

type UiohookMouseEvent = {
  altKey?: boolean;
  button?: unknown;
  clicks?: number;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  time?: number;
  type?: number;
  x: number;
  y: number;
};

type UiohookModule = {
  UiohookKey?: Record<string, number>;
  uIOhook?: UiohookInstance;
  on?: UiohookInstance['on'];
  off?: UiohookInstance['off'];
  removeListener?: UiohookInstance['removeListener'];
  removeAllListeners?: UiohookInstance['removeAllListeners'];
  start?: UiohookInstance['start'];
  stop?: UiohookInstance['stop'];
  keyTap?: UiohookInstance['keyTap'];
  keyToggle?: UiohookInstance['keyToggle'];
};

type UiohookInstance = {
  on(event: 'keydown', listener: (event: UiohookKeyboardEvent) => void): void;
  on(event: 'keyup', listener: (event: UiohookKeyboardEvent) => void): void;
  on(event: 'mousemove', listener: (event: UiohookMouseEvent) => void): void;
  on(event: 'mousedown', listener: (event: UiohookMouseEvent) => void): void;
  on(event: 'mouseup', listener: (event: UiohookMouseEvent) => void): void;
  on(event: string, listener: (event: any) => void): void;
  off?(event: string, listener: (event: any) => void): void;
  removeListener?(event: string, listener: (event: any) => void): void;
  removeAllListeners?(event?: string): void;
  start(): void;
  stop(): void;
  keyTap?(key: number, modifiers?: number[]): void;
  keyToggle?(key: number, toggle: 'down' | 'up'): void;
};

type GlobalInputEventMap = {
  keydown: UiohookKeyboardEvent;
  keyup: UiohookKeyboardEvent;
  mousedown: UiohookMouseEvent;
  mousemove: UiohookMouseEvent;
  mouseup: UiohookMouseEvent;
};

type Listener<K extends keyof GlobalInputEventMap> = (event: GlobalInputEventMap[K]) => void;

const require = createRequire(import.meta.url);

class GlobalInputMonitor {
  private loadAttempted = false;
  private hook: UiohookInstance | null = null;
  private keyMap: Record<string, number> | null = null;
  private active = false;
  private readonly listeners: { [K in keyof GlobalInputEventMap]: Set<Listener<K>> } = {
    keydown: new Set(),
    keyup: new Set(),
    mousedown: new Set(),
    mousemove: new Set(),
    mouseup: new Set()
  };
  private readonly nativeListeners: Partial<Record<keyof GlobalInputEventMap, (event: any) => void>> = {};

  get available(): boolean {
    return this.ensureLoaded();
  }

  get keys(): Record<string, number> | null {
    this.ensureLoaded();
    return this.keyMap;
  }

  get isRunning(): boolean {
    return this.active;
  }

  on<K extends keyof GlobalInputEventMap>(eventName: K, listener: Listener<K>): () => void {
    if (!this.ensureLoaded()) {
      throw new Error('uiohook-napi is not available');
    }
    this.listeners[eventName].add(listener as any);
    try {
      this.sync();
    } catch (error) {
      this.listeners[eventName].delete(listener as any);
      throw error;
    }
    return () => {
      this.listeners[eventName].delete(listener as any);
      this.sync();
    };
  }

  keyTap(key: number, modifiers?: number[]): boolean {
    if (!this.ensureLoaded() || !this.hook?.keyTap) return false;
    this.hook.keyTap(key, modifiers);
    return true;
  }

  keyToggle(key: number, toggle: 'down' | 'up'): boolean {
    if (!this.ensureLoaded() || !this.hook?.keyToggle) return false;
    this.hook.keyToggle(key, toggle);
    return true;
  }

  start(): boolean {
    if (!this.ensureLoaded() || !this.hook) return false;
    if (this.active) return true;
    try {
      this.hook.start();
      this.active = true;
      return true;
    } catch (error) {
      console.warn('[global-input] failed to start uiohook:', error);
      this.active = false;
      return false;
    }
  }

  stop(): void {
    if (!this.active || !this.hook) return;
    try {
      this.hook.stop();
    } catch (error) {
      console.warn('[global-input] failed to stop uiohook:', error);
    } finally {
      this.active = false;
    }
  }

  private ensureLoaded(): boolean {
    if (this.hook) return true;
    if (this.loadAttempted) return false;
    this.loadAttempted = true;
    try {
      const mod = require('uiohook-napi') as UiohookModule;
      const hook = (mod.uIOhook ?? mod) as UiohookInstance;
      if (!hook || typeof hook.on !== 'function' || typeof hook.start !== 'function') {
        throw new Error('uIOhook instance is not available');
      }
      this.hook = hook;
      this.keyMap = mod.UiohookKey ?? null;
      return true;
    } catch (error) {
      console.warn('[global-input] uiohook-napi unavailable:', error);
      return false;
    }
  }

  private sync(): void {
    if (!this.ensureLoaded() || !this.hook) return;

    for (const eventName of Object.keys(this.listeners) as Array<keyof GlobalInputEventMap>) {
      const hasListeners = this.listeners[eventName].size > 0;
      const existing = this.nativeListeners[eventName];
      if (hasListeners && !existing) {
        const nativeListener = (event: GlobalInputEventMap[typeof eventName]) => {
          for (const listener of [...this.listeners[eventName]]) {
            try {
              (listener as any)(event);
            } catch (error) {
              console.warn(`[global-input] ${eventName} listener failed:`, error);
            }
          }
        };
        this.nativeListeners[eventName] = nativeListener;
        this.hook.on(eventName, nativeListener);
      } else if (!hasListeners && existing) {
        this.removeNativeListener(eventName, existing);
        delete this.nativeListeners[eventName];
      }
    }

    const shouldRun = Object.values(this.listeners).some((set) => set.size > 0);
    if (shouldRun) {
      if (!this.start()) {
        throw new Error('failed to start uiohook-napi');
      }
    } else {
      this.stop();
    }
  }

  private removeNativeListener(eventName: keyof GlobalInputEventMap, listener: (event: any) => void): void {
    if (!this.hook) return;
    try {
      if (typeof this.hook.off === 'function') {
        this.hook.off(eventName, listener);
        return;
      }
      if (typeof this.hook.removeListener === 'function') {
        this.hook.removeListener(eventName, listener);
        return;
      }
      if (typeof this.hook.removeAllListeners === 'function') {
        this.hook.removeAllListeners(eventName);
      }
    } catch (error) {
      console.warn(`[global-input] failed to remove ${eventName} listener:`, error);
    }
  }
}

export const globalInputMonitor = new GlobalInputMonitor();
export type { UiohookKeyboardEvent, UiohookMouseEvent };
