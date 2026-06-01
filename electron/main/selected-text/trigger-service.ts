import { globalInputMonitor, type UiohookKeyboardEvent } from '../global-input-monitor';
import type { SelectedTextLearningConfig } from './types';

type TriggerServiceDeps = {
  getConfig: () => SelectedTextLearningConfig;
  onTrigger: () => void | Promise<void>;
};

function isCtrlKey(event: UiohookKeyboardEvent): boolean {
  const keys = globalInputMonitor.keys;
  return Boolean(keys && (event.keycode === keys.Ctrl || event.keycode === keys.CtrlRight));
}

export class SelectedTextTriggerService {
  private ctrlDown = false;
  private timer: NodeJS.Timeout | null = null;
  private triggeredThisHold = false;
  private unsubscribers: Array<() => void> = [];
  private active = false;

  constructor(private readonly deps: TriggerServiceDeps) {}

  isActive(): boolean {
    return this.active;
  }

  start(): boolean {
    if (this.active) return true;
    try {
      this.unsubscribers = [
        globalInputMonitor.on('keydown', (event) => this.handleKeyDown(event)),
        globalInputMonitor.on('keyup', (event) => this.handleKeyUp(event)),
        globalInputMonitor.on('mousedown', () => this.cancelHold())
      ];
      this.active = true;
      return true;
    } catch (error) {
      console.warn('[selected-text] failed to start trigger service:', error);
      this.stop();
      return false;
    }
  }

  stop(): void {
    this.cancelHold();
    for (const unsubscribe of this.unsubscribers.splice(0)) {
      try {
        unsubscribe();
      } catch {
        /* ignore */
      }
    }
    this.active = false;
  }

  private handleKeyDown(event: UiohookKeyboardEvent): void {
    if (!this.deps.getConfig().enabled) {
      this.cancelHold();
      return;
    }

    if (!isCtrlKey(event)) {
      this.cancelHold();
      return;
    }

    if (this.ctrlDown || this.triggeredThisHold) return;
    this.ctrlDown = true;
    this.scheduleTrigger();
  }

  private handleKeyUp(event: UiohookKeyboardEvent): void {
    if (!isCtrlKey(event)) return;
    this.cancelHold();
  }

  private scheduleTrigger(): void {
    this.clearTimer();
    const holdMs = this.deps.getConfig().holdMs;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.ctrlDown || this.triggeredThisHold || !this.deps.getConfig().enabled) return;
      this.triggeredThisHold = true;
      void Promise.resolve(this.deps.onTrigger()).catch((error) => {
        console.warn('[selected-text] trigger failed:', error);
      });
    }, holdMs);
  }

  private cancelHold(): void {
    this.ctrlDown = false;
    this.triggeredThisHold = false;
    this.clearTimer();
  }

  private clearTimer(): void {
    if (!this.timer) return;
    clearTimeout(this.timer);
    this.timer = null;
  }
}
