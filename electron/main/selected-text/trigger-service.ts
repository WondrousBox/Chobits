import { globalInputMonitor, type UiohookKeyboardEvent } from '../global-input-monitor';
import type { SelectedTextLearningConfig, SelectedTextLearningPreparedSelection } from './types';

type TriggerServiceDeps = {
  getConfig: () => SelectedTextLearningConfig;
  prepareSelection: (options?: { usePhysicalCtrlShortcut?: boolean }) => Promise<SelectedTextLearningPreparedSelection | null>;
  onTrigger: (selection: SelectedTextLearningPreparedSelection) => void | Promise<void>;
  showProgress?: (progress: number, message?: string) => void;
  clearProgress?: () => void;
};

const HOLD_PROGRESS_INTERVAL_MS = 100;
const POST_TRIGGER_RELEASE_GRACE_MS = 700;
const PROGRESS_MESSAGE = '长按划词翻译';

function isCtrlKey(event: UiohookKeyboardEvent): boolean {
  const keys = globalInputMonitor.keys;
  return Boolean(keys && (event.keycode === keys.Ctrl || event.keycode === keys.CtrlRight));
}

function isSelectionReadSyntheticKey(event: UiohookKeyboardEvent): boolean {
  const keys = globalInputMonitor.keys;
  return Boolean(keys && (event.keycode === keys.C || event.keycode === keys.Ctrl || event.keycode === keys.CtrlRight || event.keycode === keys.Meta || event.keycode === keys.MetaRight));
}

export class SelectedTextTriggerService {
  private ctrlDown = false;
  private timer: NodeJS.Timeout | null = null;
  private progressTimer: NodeJS.Timeout | null = null;
  private releaseRecoveryTimer: NodeJS.Timeout | null = null;
  private holdStartedAt = 0;
  private holdSessionId = 0;
  private selectionReadInFlight = false;
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
        globalInputMonitor.on('mousedown', () => this.handleMouseDown())
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

    if (this.triggeredThisHold) {
      if (isCtrlKey(event)) {
        this.ctrlDown = true;
        this.clearReleaseRecoveryTimer();
      }
      return;
    }

    if (this.selectionReadInFlight && isSelectionReadSyntheticKey(event)) return;

    if (!isCtrlKey(event)) {
      this.cancelHold();
      return;
    }

    if (this.ctrlDown || this.triggeredThisHold) return;
    this.ctrlDown = true;
    this.holdStartedAt = Date.now();
    const sessionId = ++this.holdSessionId;
    this.clearActiveTimers();
    this.startProgress(sessionId);
    this.scheduleTrigger(sessionId);
  }

  private scheduleTrigger(sessionId: number): void {
    this.clearTimer();
    this.clearReleaseRecoveryTimer();
    const holdMs = this.deps.getConfig().holdMs;
    const elapsed = Date.now() - this.holdStartedAt;
    const remainingMs = Math.max(0, holdMs - elapsed);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.triggerPreparedSelection(sessionId);
    }, remainingMs);
  }

  private startProgress(sessionId: number): void {
    this.clearProgressTimer();
    this.updateProgress(sessionId);
    this.progressTimer = setInterval(() => this.updateProgress(sessionId), HOLD_PROGRESS_INTERVAL_MS);
  }

  private updateProgress(sessionId: number): void {
    if (sessionId !== this.holdSessionId || !this.ctrlDown || this.triggeredThisHold) return;
    const holdMs = this.deps.getConfig().holdMs;
    const progress = holdMs > 0 ? Math.min(100, Math.max(0, ((Date.now() - this.holdStartedAt) / holdMs) * 100)) : 100;
    this.deps.showProgress?.(progress, PROGRESS_MESSAGE);
    if (progress >= 100) {
      this.triggerPreparedSelection(sessionId);
    }
  }

  private triggerPreparedSelection(sessionId: number): void {
    if (sessionId !== this.holdSessionId || !this.ctrlDown || this.triggeredThisHold || !this.deps.getConfig().enabled) return;

    this.triggeredThisHold = true;
    this.selectionReadInFlight = true;
    this.clearActiveTimers();
    this.deps.showProgress?.(100, PROGRESS_MESSAGE);
    void this.deps
      .prepareSelection({ usePhysicalCtrlShortcut: true })
      .then((selection) => {
        if (sessionId !== this.holdSessionId) return;
        this.selectionReadInFlight = false;
        if (!this.ctrlDown || !this.deps.getConfig().enabled || !selection) return;
        return this.deps.onTrigger(selection);
      })
      .catch((error) => {
        console.warn('[selected-text] trigger failed:', error);
      })
      .finally(() => {
        if (sessionId === this.holdSessionId) {
          this.selectionReadInFlight = false;
          this.deps.clearProgress?.();
        }
      });
  }

  private handleKeyUp(event: UiohookKeyboardEvent): void {
    if (!isCtrlKey(event)) return;
    if (this.triggeredThisHold) {
      this.scheduleReleaseRecovery();
      return;
    }
    this.cancelHold();
  }

  private handleMouseDown(): void {
    if (this.triggeredThisHold) {
      this.clearActiveTimers();
      return;
    }
    this.cancelHold();
  }

  private scheduleReleaseRecovery(): void {
    this.clearTimer();
    this.clearReleaseRecoveryTimer();
    this.releaseRecoveryTimer = setTimeout(() => {
      this.releaseRecoveryTimer = null;
      this.cancelHold();
    }, POST_TRIGGER_RELEASE_GRACE_MS);
  }

  private cancelHold(): void {
    this.holdSessionId++;
    this.ctrlDown = false;
    this.selectionReadInFlight = false;
    this.triggeredThisHold = false;
    this.holdStartedAt = 0;
    this.clearActiveTimers();
    this.clearReleaseRecoveryTimer();
    this.deps.clearProgress?.();
  }

  private clearActiveTimers(): void {
    this.clearTimer();
    this.clearProgressTimer();
  }

  private clearTimer(): void {
    if (!this.timer) return;
    clearTimeout(this.timer);
    this.timer = null;
  }

  private clearProgressTimer(): void {
    if (!this.progressTimer) return;
    clearInterval(this.progressTimer);
    this.progressTimer = null;
  }

  private clearReleaseRecoveryTimer(): void {
    if (!this.releaseRecoveryTimer) return;
    clearTimeout(this.releaseRecoveryTimer);
    this.releaseRecoveryTimer = null;
  }
}
