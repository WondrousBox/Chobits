import { randomUUID } from 'node:crypto';

import { windowManager } from '@aim-packages/window-manager';
import { BrowserWindow, ipcMain, systemPreferences } from 'electron';

import { createSpriteMotionEffectRun, SPRITE_MOTION_EFFECT_COMPLETION_GRACE_MS, SPRITE_MOTION_EFFECT_READY_TIMEOUT_MS } from '../../../packages/sprite-core/sprite-motion-effect';
import type { SpriteMotionEffectCancelPayload, SpriteMotionEffectRun, SpriteMotionEffectType } from '../../../packages/sprite-core/types';
import { SPRITE_MOTION_EFFECT_IPC_CHANNELS } from '../../../packages/sprite-core/types';

const SPRITE_MOTION_EFFECT_WINDOW_KEY = 'spriteMotionEffect' as const;

interface ActiveMotionEffect {
  run: SpriteMotionEffectRun;
  jumped: boolean;
  jumpTimer: ReturnType<typeof setTimeout> | null;
  completionTimer: ReturnType<typeof setTimeout> | null;
  resolve: (played: boolean) => void;
}

let currentController: SpriteMotionEffectController | null = null;

export class SpriteMotionEffectController {
  private active: ActiveMotionEffect | null = null;
  private effectReadyWindowId: number | null = null;
  private observedEffectWindowId: number | null = null;
  private readonly readyWaiters = new Set<(windowId: number) => void>();
  private disposed = false;

  constructor(private readonly mainWindow: BrowserWindow) {
    this.registerIpc();
    this.mainWindow.once('closed', () => this.dispose());
    void this.ensureEffectWindow().catch(() => undefined);
  }

  async play(config: { type: SpriteMotionEffectType; targetX: number; targetY: number }): Promise<boolean> {
    if (this.disposed || this.mainWindow.isDestroyed() || config.type !== 'warp' || !Number.isFinite(config.targetX) || !Number.isFinite(config.targetY)) {
      return false;
    }

    this.finishActive('superseded');

    try {
      const effectWindow = await this.ensureEffectWindow();
      if (!effectWindow || effectWindow.isDestroyed() || !(await this.waitForEffectReady(effectWindow))) {
        return false;
      }

      const sourceBounds = this.mainWindow.getBounds();
      const destinationBounds = {
        x: Math.round(config.targetX),
        y: Math.round(config.targetY),
        width: sourceBounds.width,
        height: sourceBounds.height
      };
      const reducedMotion = this.prefersReducedMotion();
      const run = createSpriteMotionEffectRun(
        { type: config.type, sourceBounds, destinationBounds, reducedMotion },
        {
          runId: `sprite-motion-${randomUUID()}`,
          now: Date.now(),
          seed: Math.floor(Math.random() * 0x100000000)
        }
      );

      effectWindow.setBounds(run.overlayBounds, false);
      this.configureEffectWindow(effectWindow);
      const visibleWindow = await windowManager.show(SPRITE_MOTION_EFFECT_WINDOW_KEY);
      if (!visibleWindow || visibleWindow.isDestroyed()) return false;
      visibleWindow.setBounds(run.overlayBounds, false);
      this.configureEffectWindow(visibleWindow);

      return await new Promise<boolean>((resolve) => {
        const startDelay = Math.max(0, run.startsAt - Date.now());
        const jumpAtMs = (run.timeline.travelStartMs + run.timeline.travelEndMs) / 2;
        const active: ActiveMotionEffect = {
          run,
          jumped: false,
          jumpTimer: null,
          completionTimer: null,
          resolve
        };
        this.active = active;

        this.mainWindow.webContents.send(SPRITE_MOTION_EFFECT_IPC_CHANNELS.START, run);
        visibleWindow.webContents.send(SPRITE_MOTION_EFFECT_IPC_CHANNELS.START, run);

        active.jumpTimer = setTimeout(() => this.jumpToDestination(run.runId), startDelay + jumpAtMs);
        active.completionTimer = setTimeout(() => this.finishActive('timeout'), startDelay + run.durationMs + SPRITE_MOTION_EFFECT_COMPLETION_GRACE_MS);
        console.info('[sprite-motion-effect] started', {
          runId: run.runId,
          type: run.type,
          sourceBounds: run.sourceBounds,
          destinationBounds: run.destinationBounds,
          overlayBounds: run.overlayBounds,
          reducedMotion: run.reducedMotion
        });
      });
    } catch (error) {
      console.warn('[sprite-motion-effect] prepare failed:', error);
      this.finishActive('failed');
      return false;
    }
  }

  cancel(): void {
    this.finishActive('cancelled');
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.finishActive('disposed');
    this.readyWaiters.clear();
    ipcMain.removeHandler(SPRITE_MOTION_EFFECT_IPC_CHANNELS.READY);
    ipcMain.removeHandler(SPRITE_MOTION_EFFECT_IPC_CHANNELS.COMPLETE);
    if (currentController === this) currentController = null;
  }

  private registerIpc(): void {
    ipcMain.removeHandler(SPRITE_MOTION_EFFECT_IPC_CHANNELS.READY);
    ipcMain.handle(SPRITE_MOTION_EFFECT_IPC_CHANNELS.READY, (event) => {
      const senderWindow = BrowserWindow.fromWebContents(event.sender);
      const effectWindow = this.resolveEffectWindow();
      if (!senderWindow || !effectWindow || senderWindow.isDestroyed() || effectWindow.isDestroyed() || senderWindow.id !== effectWindow.id) return;
      this.effectReadyWindowId = effectWindow.id;
      for (const resolve of this.readyWaiters) resolve(effectWindow.id);
      this.readyWaiters.clear();
    });

    ipcMain.removeHandler(SPRITE_MOTION_EFFECT_IPC_CHANNELS.COMPLETE);
    ipcMain.handle(SPRITE_MOTION_EFFECT_IPC_CHANNELS.COMPLETE, (event, payload: { runId?: string }) => {
      if (!this.active || payload?.runId !== this.active.run.runId) return;
      const senderWindow = BrowserWindow.fromWebContents(event.sender);
      const effectWindow = this.resolveEffectWindow();
      const isMainSender = senderWindow && !senderWindow.isDestroyed() && senderWindow.id === this.mainWindow.id;
      const isEffectSender = senderWindow && effectWindow && !senderWindow.isDestroyed() && !effectWindow.isDestroyed() && senderWindow.id === effectWindow.id;
      if (isMainSender || isEffectSender) this.finishActive('completed');
    });
  }

  private resolveEffectWindow(): BrowserWindow | null {
    const effectWindow = windowManager.get(SPRITE_MOTION_EFFECT_WINDOW_KEY);
    return effectWindow && !effectWindow.isDestroyed() ? effectWindow : null;
  }

  private async ensureEffectWindow(): Promise<BrowserWindow | null> {
    const existing = this.resolveEffectWindow();
    if (existing) {
      this.observeEffectWindow(existing);
      return existing;
    }
    this.effectReadyWindowId = null;
    const created = await windowManager.create(SPRITE_MOTION_EFFECT_WINDOW_KEY);
    if (!created || created.isDestroyed()) return null;
    this.configureEffectWindow(created);
    this.observeEffectWindow(created);
    return created;
  }

  private observeEffectWindow(effectWindow: BrowserWindow): void {
    if (this.observedEffectWindowId === effectWindow.id) return;
    this.observedEffectWindowId = effectWindow.id;
    effectWindow.once('closed', () => {
      if (this.effectReadyWindowId === effectWindow.id) this.effectReadyWindowId = null;
      if (this.observedEffectWindowId === effectWindow.id) this.observedEffectWindowId = null;
      if (this.active) this.finishActive('failed');
    });
  }

  private configureEffectWindow(effectWindow: BrowserWindow): void {
    try {
      effectWindow.setIgnoreMouseEvents(true, { forward: true });
    } catch {
      // The effect remains non-focusable even if click-through is unavailable.
    }
  }

  private waitForEffectReady(effectWindow: BrowserWindow): Promise<boolean> {
    if (this.effectReadyWindowId === effectWindow.id) return Promise.resolve(true);

    return new Promise((resolve) => {
      let settled = false;
      const finish = (ready: boolean): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        this.readyWaiters.delete(handleReady);
        resolve(ready);
      };
      const handleReady = (windowId: number): void => {
        if (windowId === effectWindow.id) finish(true);
      };
      const timeoutId = setTimeout(() => finish(false), SPRITE_MOTION_EFFECT_READY_TIMEOUT_MS);
      this.readyWaiters.add(handleReady);
    });
  }

  private jumpToDestination(runId: string): void {
    const active = this.active;
    if (!active || active.run.runId !== runId || this.mainWindow.isDestroyed()) return;
    this.mainWindow.setBounds(active.run.destinationBounds, false);
    active.jumped = true;
    active.jumpTimer = null;
  }

  private finishActive(reason: SpriteMotionEffectCancelPayload['reason']): void {
    const active = this.active;
    if (!active) return;
    this.active = null;
    if (active.jumpTimer) clearTimeout(active.jumpTimer);
    if (active.completionTimer) clearTimeout(active.completionTimer);

    if ((reason === 'completed' || reason === 'failed' || reason === 'timeout') && !active.jumped && !this.mainWindow.isDestroyed()) {
      this.mainWindow.setBounds(active.run.destinationBounds, false);
    }

    const payload: SpriteMotionEffectCancelPayload = { runId: active.run.runId, reason };
    if (!this.mainWindow.isDestroyed()) this.mainWindow.webContents.send(SPRITE_MOTION_EFFECT_IPC_CHANNELS.CANCEL, payload);
    const effectWindow = this.resolveEffectWindow();
    if (effectWindow) effectWindow.webContents.send(SPRITE_MOTION_EFFECT_IPC_CHANNELS.CANCEL, payload);
    void windowManager.hide(SPRITE_MOTION_EFFECT_WINDOW_KEY).catch(() => undefined);
    active.resolve(true);
    console.info('[sprite-motion-effect] finished', { runId: active.run.runId, reason });
  }

  private prefersReducedMotion(): boolean {
    try {
      return systemPreferences.getAnimationSettings().prefersReducedMotion;
    } catch {
      return false;
    }
  }
}

export function initSpriteMotionEffectController(mainWindow: BrowserWindow): SpriteMotionEffectController {
  currentController?.dispose();
  currentController = new SpriteMotionEffectController(mainWindow);
  return currentController;
}
