// Entry point to register workflow system
import path from 'node:path';

import { app, ipcMain } from 'electron';

import { createEngine } from './engine';
import { DocToMarkdownNode } from './nodes/doc-to-md';
import { EndNode } from './nodes/end';
import { LoadResourceNode } from './nodes/load-resource';
import { OCRNode } from './nodes/ocr';
import { StartNode } from './nodes/start';
import { TranscodeNode } from './nodes/transcode';
import { TranscribeWhisperNode } from './nodes/transcribe-whisper';
import { FfmpegPlugin } from './plugins/ffmpeg';
import { TesseractPlugin } from './plugins/tesseract';
import { WhisperPlugin } from './plugins/whisper';
import { listNodes, listPlugins, registerNode, registerPlugin } from './registry';
import { WorkflowStore } from './store';
import { WorkflowDefinition } from './types';

export function initWorkflowSystem(): void {
  // Register plugins first
  registerPlugin(FfmpegPlugin);
  registerPlugin(TesseractPlugin);
  registerPlugin(WhisperPlugin);
  // Register nodes
  [StartNode, EndNode, LoadResourceNode, TranscodeNode, OCRNode, TranscribeWhisperNode, DocToMarkdownNode].forEach(registerNode);

  const engine = createEngine({
    resourcesDir: path.join(process.env.APP_ROOT || process.cwd(), 'resources'),
    userDataDir: app.getPath('userData'),
    workspaceDir: undefined
  });
  // expose engine via closure only (no global)

  // Persist run updates
  engine.onTyped('run:status', async (rec) => {
    await WorkflowStore.updateRun(rec).catch(() => { });
    if (rec.status === 'completed' || rec.status === 'failed' || rec.status === 'canceled') {
      // final state maybe broadcast
    }
  });
  engine.onTyped('node:status', async (rec) => {
    await WorkflowStore.updateRun(rec).catch(() => { });
  });

  // IPC endpoints
  ipcMain.handle('wf:listNodes', () => listNodes().map((n) => n.spec));
  ipcMain.handle('wf:listPlugins', () => listPlugins().map((p) => ({ id: p.id, label: p.label, installed: false })));
  ipcMain.handle('wf:listDefinitions', async () => WorkflowStore.list());
  ipcMain.handle('wf:getDefinition', async (_e, payload: { id: string }) => WorkflowStore.get(payload.id));
  ipcMain.handle('wf:saveDefinition', async (_e, payload: { def: WorkflowDefinition }) => {
    await WorkflowStore.upsert(payload.def);
    return { ok: true };
  });
  ipcMain.handle('wf:deleteDefinition', async (_e, payload: { id: string }) => {
    await WorkflowStore.remove(payload.id);
    return { ok: true };
  });
  ipcMain.handle('wf:validate', async (_e, payload: { def: WorkflowDefinition }) => {
    return engine.validate(payload.def);
  });
  ipcMain.handle('wf:run', async (_e, payload: { defId: string; input?: Record<string, any> }) => {
    const def = await WorkflowStore.get(payload.defId);
    if (!def) return { ok: false, error: 'Workflow not found' };
    const validation = await engine.validate(def);
    if (!validation.ok) return { ok: false, validation };
    const rec = await engine.run(def, payload.input || {});
    await WorkflowStore.addRun(rec);
    return { ok: true, runId: rec.runId };
  });
  ipcMain.handle('wf:getRun', async (_e, payload: { runId: string }) => engine.getRun(payload.runId));
  ipcMain.handle('wf:listRuns', async (_e, payload?: { defId?: string; limit?: number }) => WorkflowStore.listRuns(payload?.defId, payload?.limit));
  ipcMain.handle('wf:cancelRun', async (_e, payload: { runId: string }) => {
    await engine.cancel(payload.runId);
    return { ok: true };
  });

  // Example built-in sample workflow definitions (idempotent)
  const sampleOcr: WorkflowDefinition = {
    id: 'sample:ocr',
    name: '图片 OCR 示例',
    description: '加载图片 -> OCR -> 结束',
    nodes: [
      { id: 'start', type: 'core/start' },
      { id: 'load', type: 'resource/load' },
      { id: 'ocr', type: 'image/ocr', config: { lang: 'chi_sim' } },
      { id: 'end', type: 'core/end' }
    ],
    edges: [
      { id: 'e1', from: { nodeId: 'start', port: 'payload' }, to: { nodeId: 'load', port: 'path' } },
      { id: 'e2', from: { nodeId: 'load', port: 'path' }, to: { nodeId: 'ocr', port: 'image' } },
      { id: 'e3', from: { nodeId: 'ocr', port: 'text' }, to: { nodeId: 'end', port: 'result' } }
    ],
    options: { concurrency: 1, errorStrategy: 'fail-fast' }
  };

  const sampleTranscribe: WorkflowDefinition = {
    id: 'sample:transcribe',
    name: '媒体转录 (Whisper) 示例',
    description: '加载媒体 -> Whisper 转录 -> 结束',
    nodes: [
      { id: 'start', type: 'core/start' },
      { id: 'load', type: 'resource/load' },
      { id: 'whisper', type: 'media/transcribe-whisper', config: { model: 'small', language: 'zh', outputFormats: ['txt', 'srt', 'json'] } },
      { id: 'end', type: 'core/end' }
    ],
    edges: [
      { id: 't1', from: { nodeId: 'start', port: 'payload' }, to: { nodeId: 'load', port: 'path' } },
      { id: 't2', from: { nodeId: 'load', port: 'path' }, to: { nodeId: 'whisper', port: 'media' } },
      { id: 't3', from: { nodeId: 'whisper', port: 'text' }, to: { nodeId: 'end', port: 'result' } }
    ],
    options: { concurrency: 1, errorStrategy: 'fail-fast' }
  };

  WorkflowStore.upsert(sampleOcr).catch(() => { });
  WorkflowStore.upsert(sampleTranscribe).catch(() => { });
}
