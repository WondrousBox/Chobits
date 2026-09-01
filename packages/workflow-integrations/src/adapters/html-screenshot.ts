import fsPromises from 'node:fs/promises';

import type { WorkflowHtmlScreenshotRenderer, WorkflowHtmlScreenshotRequest } from '@chobits/workflow';
import { BrowserWindow } from 'electron';

function abortError(): Error {
  const error = new Error('Workflow HTML rendering canceled');
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

function waitForCapture(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError());
  if (delayMs <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const finish = (): void => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    };
    const timeout = setTimeout(finish, delayMs);
    const onAbort = (): void => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
      reject(abortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function resizeForContent(window: BrowserWindow, request: WorkflowHtmlScreenshotRequest): Promise<void> {
  if (!request.contentHeightMode || request.contentHeightMode === 'fixed') return;
  const measuredHeight = Number(await window.webContents.executeJavaScript('document.body.scrollHeight'));
  if (!Number.isFinite(measuredHeight) || measuredHeight <= 0) return;
  const height = request.contentHeightMode === 'expand' ? Math.max(request.height, Math.ceil(measuredHeight)) : Math.ceil(measuredHeight);
  window.setContentSize(request.width, height);
}

export const renderWorkflowHtmlScreenshot: WorkflowHtmlScreenshotRenderer = async (request) => {
  throwIfAborted(request.signal);
  request.onProgress?.(30);

  const window = new BrowserWindow({
    width: request.width,
    height: request.height,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  const onAbort = (): void => {
    if (!window.isDestroyed()) window.destroy();
  };
  request.signal?.addEventListener('abort', onAbort, { once: true });

  try {
    request.onProgress?.(50);
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(request.html)}`);
    throwIfAborted(request.signal);
    request.onProgress?.(70);
    await resizeForContent(window, request).catch((error) => console.warn('Failed to resize workflow render window:', error));
    await waitForCapture(request.captureDelayMs ?? 500, request.signal);
    throwIfAborted(request.signal);
    request.onProgress?.(80);

    const image = await window.webContents.capturePage();
    const jpeg = /\.jpe?g$/i.test(request.outputPath);
    await fsPromises.writeFile(request.outputPath, jpeg ? image.toJPEG(request.jpegQuality ?? 90) : image.toPNG());
    request.onProgress?.(100);
    return request.outputPath;
  } catch (error) {
    if (request.signal?.aborted) throw abortError();
    throw error;
  } finally {
    request.signal?.removeEventListener('abort', onAbort);
    if (!window.isDestroyed()) window.close();
  }
};
