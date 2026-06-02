import { windowManager } from '@aim-packages/window-manager';
import { screen, type BrowserWindow } from 'electron';

import { SpriteManager } from '../../../packages/sprite-core/manager';
import { rememberWindowPayload } from '../handlers/window-events';
import { detectEnglishText } from './english-text-detector';
import { ProtectedClipboardSelectionReader } from './protected-clipboard-selection-reader';
import type { SelectedTextLearningConfig, SelectedTextLearningRunResult } from './types';

type ScreenPoint = {
  x: number;
  y: number;
};

type LearningServiceDeps = {
  getConfig: () => SelectedTextLearningConfig;
};

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

function positionSelectedTextExplainWindow(targetWindow: BrowserWindow, anchor: ScreenPoint): void {
  if (!targetWindow || targetWindow.isDestroyed()) return;

  const display = screen.getDisplayNearestPoint(anchor);
  const workArea = display.workArea;
  const bounds = targetWindow.getBounds();
  const width = bounds.width || 460;
  const height = bounds.height || 540;
  const gap = 12;

  let x = anchor.x + gap;
  let y = anchor.y + gap;

  if (x + width > workArea.x + workArea.width) {
    x = anchor.x - width - gap;
  }
  if (y + height > workArea.y + workArea.height) {
    y = anchor.y - height - gap;
  }

  x = clamp(x, workArea.x, workArea.x + workArea.width - width);
  y = clamp(y, workArea.y, workArea.y + workArea.height - height);

  targetWindow.setBounds({
    height,
    width,
    x: Math.round(x),
    y: Math.round(y)
  });
}

export class SelectedTextLearningService {
  private readonly reader = new ProtectedClipboardSelectionReader();
  private lastText = '';
  private lastTextAt = 0;
  private running = false;
  private latestText = '';

  constructor(private readonly deps: LearningServiceDeps) {}

  async testReadSelection(): Promise<SelectedTextLearningRunResult> {
    const config = this.deps.getConfig();
    const read = await this.reader.readSelection({ restoreClipboard: config.restoreClipboard });
    const detection = detectEnglishText(read.text, { maxLength: config.maxTextLength });
    return { detection, ok: Boolean(read.text), read, skipped: !detection.ok };
  }

  isRunning(): boolean {
    return this.running;
  }

  async runFromSelection(trigger: 'hotkey' | 'manual' = 'manual'): Promise<SelectedTextLearningRunResult> {
    if (this.running) return { error: 'busy', ok: false, skipped: true };
    this.running = true;

    try {
      const config = this.deps.getConfig();
      const read = await this.reader.readSelection({ restoreClipboard: config.restoreClipboard });
      if (!read.text) {
        if (trigger === 'manual') this.showNotice('No selected text was read.', 'warning');
        return { ok: false, read, skipped: true };
      }

      const detection = detectEnglishText(read.text, { maxLength: config.maxTextLength });
      if (!detection.ok || !detection.normalizedText) {
        if (trigger === 'manual') this.showNotice('The selected text does not look like English.', 'warning');
        return { detection, ok: false, read, skipped: true };
      }

      if (this.isDuplicate(detection.normalizedText, config.dedupeWindowMs)) {
        return { detection, ok: false, read, skipped: true };
      }

      this.lastText = detection.normalizedText;
      this.lastTextAt = Date.now();
      await this.handleEnglishText(detection.normalizedText, config, trigger);
      return { detection, ok: true, read };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.showNotice(`Selected text explain failed: ${message}`, 'error');
      return { error: message, ok: false };
    } finally {
      this.running = false;
    }
  }

  async openLatestOverlay(): Promise<boolean> {
    if (!this.latestText) return false;
    await this.openOverlay(this.latestText, 'manual');
    return true;
  }

  private async handleEnglishText(text: string, config: SelectedTextLearningConfig, trigger: 'hotkey' | 'manual'): Promise<void> {
    const sprite = SpriteManager.hasInstance() ? SpriteManager.getInstance() : null;
    if (config.autoSpeak) {
      void sprite?.speak(text, { bubbleDuration: Math.min(8000, Math.max(3000, text.length * 90)) }).catch((error) => {
        console.warn('[selected-text] speak failed:', error);
      });
    } else {
      this.showNotice(text, 'info');
    }

    this.latestText = text;
    if (config.showOverlay) {
      await this.openOverlay(text, trigger);
    }
  }

  private async openOverlay(text: string, trigger: 'hotkey' | 'manual'): Promise<void> {
    const anchor = screen.getCursorScreenPoint();
    const payload = {
      anchor,
      text,
      trigger
    };
    rememberWindowPayload('selectedTextExplain', payload);
    const opened = await windowManager.createOrShow('selectedTextExplain' as any, payload, {
      beforeShow: (targetWindow) => positionSelectedTextExplainWindow(targetWindow, anchor)
    });
    if (opened) {
      positionSelectedTextExplainWindow(opened, anchor);
    }
  }

  private isDuplicate(text: string, windowMs: number): boolean {
    return text === this.lastText && Date.now() - this.lastTextAt < windowMs;
  }

  private showNotice(content: string, level: 'error' | 'info' | 'success' | 'warning' = 'info'): void {
    const sprite = SpriteManager.hasInstance() ? SpriteManager.getInstance() : null;
    sprite?.showNotice(content, {
      duration: 3500,
      level,
      speak: false
    });
  }
}
