import type { BrowserWindow } from 'electron';

import { AppEvent, eventManager } from './index';

type AppWindowClosePayload = Record<string, unknown> & {
  source?: string;
  windowKey: string;
};

function readWindowPayload(windowKey: string): Record<string, unknown> {
  const payload = (globalThis as any).__chobitsLastWindowPayload?.[windowKey];
  return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
}

export function rememberWindowPayload(windowKey: string, payload: unknown): void {
  if (!payload || typeof payload !== 'object') return;
  (globalThis as any).__chobitsLastWindowPayload = (globalThis as any).__chobitsLastWindowPayload || {};
  (globalThis as any).__chobitsLastWindowPayload[windowKey] = payload;
}

export function emitAppWindowOpened(windowKey: string, payload: unknown, source: string): void {
  const windowPayload = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  eventManager.emit(AppEvent.APP_WINDOW_OPENED, {
    ...windowPayload,
    windowKey,
    source
  });
}

export function attachAppWindowClosedReporter(targetWindow: BrowserWindow | null, windowKey: string, source: string): void {
  if (!targetWindow || targetWindow.isDestroyed()) return;
  const sources = ((targetWindow as any).__appWindowCloseSources ??= new Map<string, string>()) as Map<string, string>;
  sources.set(windowKey, source);
  const reporters = ((targetWindow as any).__appWindowCloseReporterKeys ??= new Set<string>()) as Set<string>;
  if (reporters.has(windowKey)) return;
  reporters.add(windowKey);

  const sourceWindowId = targetWindow.webContents.id;
  targetWindow.once('closed', () => {
    const closeSource = sources.get(windowKey) ?? source;
    const payload: AppWindowClosePayload = {
      ...readWindowPayload(windowKey),
      windowKey,
      source: closeSource
    };
    eventManager.emit(AppEvent.APP_WINDOW_CLOSED, payload, sourceWindowId);
  });
}
