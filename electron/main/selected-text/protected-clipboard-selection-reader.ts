import { clipboard, nativeImage } from 'electron';

import { globalInputMonitor } from '../global-input-monitor';
import type { SelectionReadResult } from './types';

type ClipboardSnapshot = {
  html?: string;
  imagePng?: Buffer;
  rtf?: string;
  text?: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readClipboardSnapshot(): ClipboardSnapshot {
  const image = clipboard.readImage();
  const imagePng = image && !image.isEmpty() ? image.toPNG() : undefined;
  return {
    html: clipboard.readHTML() || undefined,
    imagePng,
    rtf: clipboard.readRTF() || undefined,
    text: clipboard.readText() || undefined
  };
}

function restoreClipboardSnapshot(snapshot: ClipboardSnapshot): boolean {
  try {
    const data: Electron.Data = {};
    if (snapshot.text) data.text = snapshot.text;
    if (snapshot.html) data.html = snapshot.html;
    if (snapshot.rtf) data.rtf = snapshot.rtf;
    if (snapshot.imagePng?.length) data.image = nativeImage.createFromBuffer(snapshot.imagePng);
    if (Object.keys(data).length === 0) {
      clipboard.clear();
      return true;
    }
    clipboard.write(data);
    return true;
  } catch (error) {
    console.warn('[selected-text] failed to restore clipboard:', error);
    return false;
  }
}

export class ProtectedClipboardSelectionReader {
  private busy = false;

  async readSelection(options: { restoreClipboard?: boolean; timeoutMs?: number } = {}): Promise<SelectionReadResult> {
    if (this.busy) {
      return {
        elapsedMs: 0,
        error: 'busy',
        restored: false,
        source: 'clipboard-copy',
        text: ''
      };
    }

    this.busy = true;
    const startedAt = Date.now();
    const restoreClipboard = options.restoreClipboard !== false;
    const timeoutMs = Math.max(60, Math.min(500, options.timeoutMs ?? 120));
    const before = readClipboardSnapshot();
    let restored = false;

    try {
      const keys = globalInputMonitor.keys;
      const ctrl = keys?.Ctrl;
      const c = keys?.C;
      if (!ctrl || !c) {
        throw new Error('uiohook key map unavailable');
      }

      clipboard.clear();
      const tapped = globalInputMonitor.keyTap(c, [ctrl]);
      if (!tapped) {
        throw new Error('failed to send Ctrl+C');
      }

      await sleep(timeoutMs);
      let text = clipboard.readText().trim();
      if (!text) {
        await sleep(180);
        text = clipboard.readText().trim();
      }

      restored = restoreClipboard ? restoreClipboardSnapshot(before) : false;
      return {
        elapsedMs: Date.now() - startedAt,
        restored,
        source: 'clipboard-copy',
        text
      };
    } catch (error) {
      if (restoreClipboard) {
        restored = restoreClipboardSnapshot(before);
      }
      return {
        elapsedMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
        restored,
        source: 'clipboard-copy',
        text: ''
      };
    } finally {
      if (restoreClipboard && !restored) {
        // Successful reads restore inside the return object path; this covers late failures.
        try {
          restoreClipboardSnapshot(before);
        } catch {
          /* ignore */
        }
      }
      this.busy = false;
    }
  }
}
