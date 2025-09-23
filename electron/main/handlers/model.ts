import { BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { ModelStore } from '../model-store';
import { modelDownloader } from '../model-downloader';

// 临时支持模型静态列表（MVP）
const SUPPORTED_MODELS = [
  {
    name: 'mini-embed',
    displayName: 'Mini Embedding Model',
    version: '1.0.0',
    sizeBytes: 5_000_000,
    checksum: 'demo-checksum-embed',
    algo: 'sha256',
    sourceType: 'http',
    sourceUrl: 'https://example.com/models/mini-embed.bin', // 占位
  },
  {
    name: 'mini-llm',
    displayName: 'Mini LLM',
    version: '1.0.0',
    sizeBytes: 12_000_000,
    checksum: 'demo-checksum-llm',
    algo: 'sha256',
    sourceType: 'http',
    sourceUrl: 'https://example.com/models/mini-llm.bin',
  }
];

function ensureDir(p: string) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }

export function initModelHandlers(win: BrowserWindow) {
  modelDownloader.on('progress', (info: any) => {
    try { win.webContents.send('model:progress', info); } catch {}
  });
  ipcMain.handle('model:getConfig', async () => {
    return ModelStore.getConfig();
  });

  ipcMain.handle('model:setConfig', async (_e, payload: { rootDir?: string }) => {
    const patch: any = {};
    if (payload.rootDir) { ensureDir(path.resolve(payload.rootDir, 'models')); patch.rootDir = payload.rootDir; }
    const updated = ModelStore.setConfig(patch);
    return { ok: true, data: updated };
  });

  ipcMain.handle('model:listSupported', async () => {
    return SUPPORTED_MODELS;
  });

  ipcMain.handle('model:listInstalled', async () => {
    return ModelStore.list();
  });

  // MVP install: 仅写入记录并模拟下载（后续替换为真实 downloader）
  ipcMain.handle('model:install', async (_e, payload: { name: string; version: string }) => {
    const sup = SUPPORTED_MODELS.find(m => m.name === payload.name && m.version === payload.version);
    if (!sup) return { ok: false, error: 'NOT_SUPPORTED' };
    const cfg = ModelStore.getConfig();
    if (!cfg?.rootDir) return { ok: false, error: 'NO_ROOT_DIR' };
    const row = {
      id: crypto.randomUUID(),
      name: sup.name,
      displayName: sup.displayName,
      version: sup.version,
      sizeBytes: sup.sizeBytes,
      checksum: sup.checksum,
      algo: sup.algo,
      sourceType: sup.sourceType,
      sourceUrl: sup.sourceUrl,
      installPath: path.join(cfg.rootDir, `${sup.name}-${sup.version}.bin`),
      status: 'queued',
      progressBytes: 0,
    };
    ModelStore.upsert(row);
    // 模拟立即完成（后续用真实下载逻辑替换）
    // 进入下载队列
    modelDownloader.enqueue(row);
    return { ok: true, data: row };
  });

  ipcMain.handle('model:uninstall', async (_e, payload: { id: string }) => {
    const model = ModelStore.get(payload.id);
    if (!model) return { ok: false, error: 'NOT_FOUND' };
    try { if (model.installPath && fs.existsSync(model.installPath)) fs.rmSync(model.installPath, { force: true }); } catch {}
    ModelStore.patch(model.id, { status: 'removed' });
    return { ok: true };
  });

  ipcMain.handle('model:verify', async (_e, payload: { id: string }) => {
    const model = ModelStore.get(payload.id);
    if (!model) return { ok: false, error: 'NOT_FOUND' };
    return { ok: true, valid: true };
  });

  ipcMain.handle('model:retry', async (_e, _payload: { id: string }) => {
    const model = ModelStore.get(_payload.id);
    if (!model) return { ok: false, error: 'NOT_FOUND' };
    if (model.status === 'downloading') return { ok: false, error: 'ALREADY_DOWNLOADING' };
    ModelStore.patch(model.id, { status: 'queued', progressBytes: 0, lastError: undefined });
    modelDownloader.enqueue({ ...model, status: 'queued', progressBytes: 0 });
    return { ok: true };
  });

  ipcMain.handle('model:cancel', async (_e, _payload: { id: string }) => {
    const model = ModelStore.get(_payload.id);
    if (!model) return { ok: false, error: 'NOT_FOUND' };
    modelDownloader.cancel(model.id);
    return { ok: true };
  });
}
